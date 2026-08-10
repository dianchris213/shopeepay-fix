/**
 * Specialised financial "streams" layered on top of the existing store.
 *
 * These are pure selectors only — they never mutate state, never touch the
 * database schema and never change how the core totals are computed. They
 * simply provide alternative views over the same transactions/accounts.
 */
import type { Account, FinanceState, Transaction } from "@/lib/finance-store";
import { shopeePayAccount, walletOf } from "@/lib/finance-store";

/** Categories containing this keyword belong to the DriverShopee stream. */
export const DRIVER_KEYWORD = "driver";
/** Fallback label when no custom wallet exists yet. */
export const CUSTOM_FALLBACK_LABEL = "Dana Custom";

export function isDriverTx(tx: Pick<Transaction, "category">) {
  return tx.category.toLowerCase().includes(DRIVER_KEYWORD);
}

/** Wallets registered with the specialised "Custom" type. */
export function customAccounts(s: FinanceState): Account[] {
  return s.accounts.filter((a) => a.type === "Custom");
}

/** True for transactions booked against the persistent Shopee Pay wallet. */
export function isShopeeWalletTx(s: FinanceState, tx: Transaction) {
  return walletOf(s, tx)?.type === "Driver";
}

/**
 * Persistent Shopee Pay balance — CUMULATIVE, never resets at midnight.
 * `current + income - expense` is applied by the wallet balance itself.
 */
export function shopeePayBalance(s: FinanceState) {
  return shopeePayAccount(s)?.amount ?? 0;
}

export function isCustomTx(s: FinanceState, tx: Transaction) {
  const wallet = walletOf(s, tx);
  return wallet?.type === "Custom";
}

/** Label shown on the home card — mirrors the custom wallet's own name. */
export function customLabel(s: FinanceState) {
  const list = customAccounts(s);
  if (list.length === 0) return CUSTOM_FALLBACK_LABEL;
  if (list.length === 1) return list[0]!.name;
  return `${list[0]!.name} +${list.length - 1}`;
}

/**
 * Inclusive [start, end] timestamps for a local calendar day.
 *
 * Everything that "resets daily" derives its window from here so the rule is
 * evaluated against the user's own calendar date (device timezone), never UTC.
 * Comparing timestamps — rather than formatted strings — keeps the check
 * correct across DST transitions, where a local day is 23 or 25 hours long.
 */
export function localDayWindow(now: Date = new Date()): { start: number; end: number } {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0).getTime();
  return { start, end: end - 1 };
}

function isToday(iso: string, now: Date) {
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return false;
  const { start, end } = localDayWindow(now);
  return time >= start && time <= end;
}

/**
 * DriverShopee nominal — TODAY ONLY.
 *
 * Resets at local midnight by construction: the window is recomputed from the
 * current local calendar date on every render.
 */
export function driverBalance(s: FinanceState, now: Date = new Date()) {
  return s.transactions
    .filter((t) => isDriverTx(t) && isToday(t.date, now))
    .reduce((sum, t) => sum + t.amount, 0);
}

/**
 * Combined balance held in custom ("Uang Ibuk") wallets.
 *
 * Deliberately CUMULATIVE / all-time: it reads the wallet balances directly and
 * must never be filtered by date.
 */
export function customBalance(s: FinanceState) {
  return customAccounts(s).reduce((sum, a) => sum + a.amount, 0);
}

/**
 * Home Income/Expense boxes — TODAY ONLY.
 *
 * Counts ALL of today's transactions EXCEPT those booked against a "Custom"
 * wallet type (e.g. Uang Mama / Uang Ibuk), which is tracked separately and
 * never resets. DriverShopee entries ARE included here.
 */
export function dailyTotals(s: FinanceState, now: Date = new Date()) {
  let income = 0;
  let expense = 0;
  for (const tx of s.transactions) {
    if (!isToday(tx.date, now)) continue;
    if (isCustomTx(s, tx)) continue;
    // Shopee Pay movements live in their own persistent tracker.
    if (isShopeeWalletTx(s, tx)) continue;
    if (tx.amount > 0) income += tx.amount;
    else expense += Math.abs(tx.amount);
  }
  return { income, expense };
}

export type StreamKey = "driver" | "custom";

/** Transactions belonging to one specialised stream. */
export function streamTransactions(s: FinanceState, stream: StreamKey) {
  return s.transactions.filter((t) =>
    stream === "driver" ? isDriverTx(t) || isShopeeWalletTx(s, t) : isCustomTx(s, t),
  );
}

/** Income / expense / net for a stream inside an inclusive time window. */
export function streamSummary(
  s: FinanceState,
  stream: StreamKey,
  start: number,
  end: number,
): { income: number; expense: number; net: number; count: number } {
  let income = 0;
  let expense = 0;
  let count = 0;
  for (const tx of streamTransactions(s, stream)) {
    const time = new Date(tx.date).getTime();
    if (Number.isNaN(time) || time < start || time > end) continue;
    count += 1;
    if (tx.amount > 0) income += tx.amount;
    else expense += Math.abs(tx.amount);
  }
  return { income, expense, net: income - expense, count };
}

/** Rows of a stream inside an inclusive window, newest first. */
export function streamRangeTransactions(
  s: FinanceState,
  stream: StreamKey,
  start: number,
  end: number,
) {
  return streamTransactions(s, stream)
    .filter((tx) => {
      const time = new Date(tx.date).getTime();
      return !Number.isNaN(time) && time >= start && time <= end;
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

function csvCell(value: string | number) {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Spreadsheet-friendly CSV for the specialised streams in a window. */
export function streamsCsv(s: FinanceState, start: number, end: number) {
  const header = ["Stream", "Date", "Description", "Category", "Wallet", "Type", "Amount"];
  const rows: string[][] = [];
  (["driver", "custom"] as StreamKey[]).forEach((stream) => {
    for (const tx of streamRangeTransactions(s, stream, start, end)) {
      rows.push([
        stream === "driver" ? "DriverShopee" : "Custom",
        new Date(tx.date).toISOString(),
        tx.name,
        tx.category,
        tx.via,
        tx.amount > 0 ? "Income" : "Expense",
        String(tx.amount),
      ]);
    }
  });
  return [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
}
