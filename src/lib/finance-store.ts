import { useSyncExternalStore } from "react";

export type AccountType = "Bank Account" | "E-Wallet" | "Cash" | "Custom" | "Driver";

export type Account = {
  id: string;
  name: string;
  type: AccountType;
  amount: number;
  sub: string;
  icon: string;
  color: string;
};

export type Transaction = {
  id: string;
  name: string;
  /**
   * Foreign key to the wallet that owns this transaction — the source of
   * truth. `via` is only a denormalised display label kept in sync with it.
   */
  walletId?: string;
  via: string;
  category: string;
  date: string; // ISO datetime
  amount: number; // negative = expense
  icon: string;
  /**
   * Links the rows written by a single Driver COD booking (the Shopee Pay
   * deduction and, when the balance crosses zero, the Cash overflow income),
   * so undoing one always rolls back the whole booking atomically.
   */
  codGroupId?: string;
};

export type Notification = {
  id: string;
  title: string;
  body: string;
  date: string;
  read: boolean;
  tone: "info" | "income" | "expense";
};

export type Bill = {
  id: string;
  name: string;
  amount: number;
  due?: string;
  /** ISO date (yyyy-mm-dd) of the next due date */
  dueDate?: string;
  icon: string;
  paid: boolean;
  /** When true, marking the bill paid rolls the due date to the next month. */
  isRecurring?: boolean;
};

export type Currency = "IDR" | "USD";
export type Language = "en" | "id";
export type Theme = "dark" | "light";

export type FinanceState = {
  profile: { name: string; avatar: string };
  settings: {
    currency: Currency;
    language: Language;
    theme: Theme;
    pushNotifications: boolean;
    biometricLock: boolean;
    pinSet: boolean;
    reduceMotion: boolean;
    lastSync: string | null;
  };
  reserve: number;
  accounts: Account[];
  transactions: Transaction[];
  notifications: Notification[];
  bills: Bill[];
};

const STORAGE_KEY = "c2h.finance.v1";

const nowMinus = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

export function toISODate(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Whole days from today until an ISO date. 0 = today, 1 = tomorrow, negative = overdue. */
export function daysUntil(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return Number.NaN;
  const due = new Date(y, m - 1, d).setHours(0, 0, 0, 0);
  const today = new Date().setHours(0, 0, 0, 0);
  return Math.round((due - today) / 86_400_000);
}

export function dueLabel(iso?: string) {
  if (!iso) return null;
  const n = daysUntil(iso);
  if (Number.isNaN(n)) return null;
  if (n < 0) return `Overdue by ${Math.abs(n)} day${Math.abs(n) === 1 ? "" : "s"}`;
  if (n === 0) return "Due today";
  if (n === 1) return "Due tomorrow";
  return `Due in ${n} days`;
}

/** Same day-of-month in the following month, clamped to the month length. */
export function nextMonthOf(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const lastDay = new Date(y, m + 1, 0).getDate();
  return toISODate(new Date(y, m, Math.min(d, lastDay)));
}

/** New users start completely blank — no mock wallets, bills or transactions. */
export const initialState: FinanceState = {
  profile: { name: "User", avatar: "C2" },
  settings: {
    currency: "IDR",
    language: "en",
    theme: "dark",
    pushNotifications: true,
    biometricLock: false,
    pinSet: false,
    reduceMotion: false,
    lastSync: null,
  },
  reserve: 0,
  accounts: [],
  transactions: [],
  notifications: [],
  bills: [],
};

const normalizeName = (value: string) => value.trim().toLowerCase();

/** The wallet a transaction belongs to, preferring the FK over the label. */
export function walletOf(s: FinanceState, tx: Pick<Transaction, "walletId" | "via">) {
  if (tx.walletId) {
    const byId = s.accounts.find((a) => a.id === tx.walletId);
    if (byId) return byId;
  }
  return s.accounts.find((a) => normalizeName(a.name) === normalizeName(tx.via));
}

/** Display name for a transaction's wallet (falls back to the stored label). */
export function walletNameOf(s: FinanceState, tx: Pick<Transaction, "walletId" | "via">) {
  return walletOf(s, tx)?.name ?? tx.via;
}

/**
 * Backfills `walletId` on legacy transactions that only carry a wallet name,
 * and refreshes stale `via` labels from the wallet they point at, so renaming
 * a wallet can never orphan its history.
 */
export function migrateTransactionWallets(s: FinanceState): {
  state: FinanceState;
  migrated: number;
} {
  let migrated = 0;
  const transactions = s.transactions.map((t) => {
    const wallet = walletOf(s, t);
    if (!wallet) return t;
    if (t.walletId === wallet.id && t.via === wallet.name) return t;
    migrated += 1;
    return { ...t, walletId: wallet.id, via: wallet.name };
  });
  return { state: migrated ? { ...s, transactions } : s, migrated };
}

/**
 * Lets the app surface a subtle toast when legacy rows were repaired.
 * Kept as a hook so the store never imports UI code directly.
 */
let onBackfill: ((migrated: number) => void) | null = null;
export function setBackfillReporter(fn: ((migrated: number) => void) | null) {
  onBackfill = fn;
}

function migrateAndReport(s: FinanceState): FinanceState {
  const { state: next, migrated } = migrateTransactionWallets(s);
  if (migrated > 0) onBackfill?.(migrated);
  return next;
}

function load(): FinanceState {
  if (typeof window === "undefined") return initialState;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialState;
    const parsed = JSON.parse(raw) as Partial<FinanceState>;
    return migrateAndReport({
      ...initialState,
      ...parsed,
      profile: { ...initialState.profile, ...parsed.profile },
      settings: { ...initialState.settings, ...parsed.settings },
    });
  } catch {
    return initialState;
  }
}

let state: FinanceState = initialState;
let hydrated = false;
const listeners = new Set<() => void>();

function persist() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore quota errors */
  }
}

/**
 * Remote sync hook. The Supabase layer registers itself here so every local
 * (optimistic) mutation is mirrored to the database in the background.
 */
type SyncHandler = (prev: FinanceState, next: FinanceState) => void;
let syncHandler: SyncHandler | null = null;

export function setFinanceSyncHandler(handler: SyncHandler | null) {
  syncHandler = handler;
}

function set(next: FinanceState, save = true) {
  const prev = state;
  state = next;
  if (save) {
    persist();
    syncHandler?.(prev, next);
  }
  listeners.forEach((l) => l());
}

/** Replace the whole store with server data without echoing it back to the server. */
export function hydrateState(next: FinanceState) {
  hydrated = true;
  set(migrateAndReport(next), false);
  persist();
}

/**
 * Reads the persisted device state exactly once, lazily. Both `subscribe` and
 * `getState` go through it so a cloud hydrate (or any non-React reader) that
 * runs before the first component mounts cannot lose stored preferences such
 * as the UI language.
 */
function ensureLocalState() {
  if (hydrated) return;
  hydrated = true;
  const loaded = load();
  if (loaded !== state) state = loaded;
}

function subscribe(listener: () => void) {
  ensureLocalState();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const id = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

function notify(title: string, body: string, tone: Notification["tone"] = "info"): Notification {
  return { id: id(), title, body, date: new Date().toISOString(), read: false, tone };
}

/* ---------------- validation ---------------- */

/** Result returned by every create/update action that can fail validation. */
export type MutationResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "duplicate"
        | "invalid-name"
        | "invalid-amount"
        | "not-found"
        | "insufficient-funds"
        | "missing-cash-wallet";
    };

const normalize = (value: string) => value.trim().toLowerCase();

/** True when another wallet (other than `exceptId`) already uses this name. */
export function walletNameTaken(name: string, exceptId?: string) {
  const key = normalize(name);
  return state.accounts.some((a) => a.id !== exceptId && normalize(a.name) === key);
}

/** True when another bill (other than `exceptId`) already uses this name. */
export function billNameTaken(name: string, exceptId?: string) {
  const key = normalize(name);
  return state.bills.some((b) => b.id !== exceptId && normalize(b.name) === key);
}

/* ---------------- actions ---------------- */

export function addTransaction(input: {
  name: string;
  /** Preferred: the wallet's id. `via` stays supported for older callers. */
  walletId?: string;
  via: string;
  category: string;
  date: string;
  amount: number;
  icon: string;
}): MutationResult {
  // "Driver COD" is never a plain row: it is a debt booked against the
  // persistent Shopee Pay balance, with any overflow landing in Cash.
  if (isDriverCodCategory(input.category)) return bookDriverCod(input);

  const wallet = walletOf(state, {
    via: input.via,
    ...(input.walletId ? { walletId: input.walletId } : {}),
  });
  if (!wallet) return { ok: false, reason: "not-found" };
  if (!input.amount || Number.isNaN(input.amount)) return { ok: false, reason: "invalid-amount" };
  // Store-level guard: an expense can never push a wallet below zero.
  // The ShopeeFood driver wallet is the one exception — its balance is a debt
  // tracker with the dealer and is allowed to go negative.
  if (wallet.type !== "Driver" && wallet.amount + input.amount < 0)
    return { ok: false, reason: "insufficient-funds" };

  const tx: Transaction = { ...input, walletId: wallet.id, via: wallet.name, id: id() };
  set({
    ...state,
    transactions: [tx, ...state.transactions],
    accounts: state.accounts.map((a) =>
      a.id === wallet.id ? { ...a, amount: a.amount + input.amount } : a,
    ),
    notifications: [
      notify(
        input.amount < 0 ? "Expense recorded" : "Income recorded",
        `${input.name} · ${formatAmount(Math.abs(input.amount), state.settings.currency)} via ${wallet.name}`,
        input.amount < 0 ? "expense" : "income",
      ),
      ...state.notifications,
    ],
  });
  return { ok: true };
}

export function transferBetweenAccounts(
  fromId: string,
  toId: string,
  amount: number,
): MutationResult {
  const from = state.accounts.find((a) => a.id === fromId);
  const to = state.accounts.find((a) => a.id === toId);
  if (!from || !to || fromId === toId) return { ok: false, reason: "not-found" };
  if (!(amount > 0)) return { ok: false, reason: "invalid-amount" };
  if (from.amount < amount) return { ok: false, reason: "insufficient-funds" };
  set({
    ...state,
    accounts: state.accounts.map((a) =>
      a.id === fromId
        ? { ...a, amount: a.amount - amount }
        : a.id === toId
          ? { ...a, amount: a.amount + amount }
          : a,
    ),
    transactions: [
      {
        id: id(),
        name: `Transfer to ${to.name}`,
        walletId: from.id,
        via: from.name,
        category: "Transfer",
        date: new Date().toISOString(),
        amount: -amount,
        icon: "transfer",
      },
      {
        id: id(),
        name: `Transfer from ${from.name}`,
        walletId: to.id,
        via: to.name,
        category: "Transfer",
        date: new Date().toISOString(),
        amount: amount,
        icon: "transfer",
      },
      ...state.transactions,
    ],
    notifications: [
      notify(
        "Transfer successful",
        `${formatAmount(amount, state.settings.currency)} moved from ${from.name} to ${to.name}.`,
        "info",
      ),
      ...state.notifications,
    ],
  });
  return { ok: true };
}

export function topUpAccount(accountId: string, amount: number, source: string): MutationResult {
  const account = state.accounts.find((a) => a.id === accountId);
  if (!account) return { ok: false, reason: "not-found" };
  if (!(amount > 0)) return { ok: false, reason: "invalid-amount" };
  set({
    ...state,
    accounts: state.accounts.map((a) =>
      a.id === accountId ? { ...a, amount: a.amount + amount } : a,
    ),
    transactions: [
      {
        id: id(),
        name: `Top Up · ${source}`,
        walletId: account.id,
        via: account.name,
        category: "Top Up",
        date: new Date().toISOString(),
        amount,
        icon: "topup",
      },
      ...state.transactions,
    ],
    notifications: [
      notify(
        "Top up complete",
        `${formatAmount(amount, state.settings.currency)} added to ${account.name}.`,
        "income",
      ),
      ...state.notifications,
    ],
  });
  return { ok: true };
}

const palette = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

export function addAccount(input: {
  name: string;
  type: AccountType;
  amount: number;
  sub: string;
  icon: string;
}): MutationResult {
  const name = input.name.trim();
  if (!name) return { ok: false, reason: "invalid-name" };
  if (walletNameTaken(name)) return { ok: false, reason: "duplicate" };
  const account: Account = {
    ...input,
    name,
    id: id(),
    color: palette[state.accounts.length % palette.length]!,
  };
  set({
    ...state,
    accounts: [...state.accounts, account],
    notifications: [
      notify("Account added", `${name} is now part of your wallets.`, "info"),
      ...state.notifications,
    ],
  });
  return { ok: true };
}

/** Default name for the always-available custom wallet. Renameable by the user. */
export const DEFAULT_CUSTOM_WALLET_NAME = "Dana Custom";

/**
 * Guarantee exactly one starter "Custom" wallet exists (nominal 0) so the home
 * card, the Add Transaction source list and Manage Wallets always have an
 * editable custom account. Never touches an existing custom wallet, so a user
 * rename is preserved and this stays a no-op after the first run.
 */
export function ensureDefaultCustomAccount(): MutationResult {
  if (state.accounts.some((a) => a.type === "Custom")) return { ok: true };
  return addAccount({
    name: walletNameTaken(DEFAULT_CUSTOM_WALLET_NAME)
      ? `${DEFAULT_CUSTOM_WALLET_NAME} 2`
      : DEFAULT_CUSTOM_WALLET_NAME,
    type: "Custom",
    amount: 0,
    sub: "Custom",
    icon: "Wallet",
  });
}

/** Reserved name of the persistent ShopeeFood driver balance wallet. */
export const SHOPEE_WALLET_NAME = "Shopeepay";
/** Older installs stored the driver wallet under this misspelled name. */
export const LEGACY_SHOPEE_WALLET_NAMES = ["ShoopeePay", "ShopeePay", "Shopee Pay"] as const;
/** Category used by every ShopeeFood driver movement. */
export const DRIVER_CATEGORY = "Driver Shopee";
/** Category always subtracted from the Shopee Pay balance (platform debt). */
export const DRIVER_COD_CATEGORY = "Driver COD";

export function isDriverCodCategory(name: string) {
  return name.trim().toLowerCase() === DRIVER_COD_CATEGORY.toLowerCase();
}

/** Cash wallet ("Dompet Tunai") that receives Driver COD overflow, if any. */
export function cashAccount(s: FinanceState = state): Account | null {
  return (
    s.accounts.find((a) => a.type === "Cash") ??
    s.accounts.find((a) => /tunai/i.test(a.name)) ??
    null
  );
}

/**
 * Overflow that a Driver COD booking of `gross` pushes into the Cash wallet.
 *
 * Driver COD is entered as Income but *subtracts* from Shopee Pay. While the
 * balance is still positive the deduction is absorbed there; the part that
 * would cross below zero is real cash the driver collected, so it is booked as
 * Cash income instead of deepening the platform debt beyond the crossing.
 */
export function codOverflowFor(balance: number, gross: number) {
  const after = balance - Math.abs(gross);
  return balance > 0 && after < 0 ? -after : 0;
}

/**
 * Book a Driver COD entry: deduct the full amount from Shopee Pay and, when
 * the balance crosses from positive to negative, mirror the surplus as Cash
 * income. Both rows share a `codGroupId` so a single undo reverts everything.
 */
function bookDriverCod(input: {
  name: string;
  category: string;
  date: string;
  amount: number;
  icon: string;
}): MutationResult {
  const gross = Math.abs(input.amount);
  if (!gross || Number.isNaN(gross)) return { ok: false, reason: "invalid-amount" };

  ensureShopeePayAccount();
  const driver = shopeePayAccount();
  if (!driver) return { ok: false, reason: "not-found" };

  const overflow = codOverflowFor(driver.amount, gross);
  const cash = overflow > 0 ? cashAccount() : null;
  // Interrupt the save rather than silently dropping the surplus.
  if (overflow > 0 && !cash) return { ok: false, reason: "missing-cash-wallet" };

  const groupId = id();
  const codTx: Transaction = {
    id: id(),
    name: input.name,
    walletId: driver.id,
    via: driver.name,
    category: input.category,
    date: input.date,
    amount: -gross,
    icon: input.icon,
    codGroupId: groupId,
  };
  const overflowTx: Transaction | null =
    overflow > 0 && cash
      ? {
          id: id(),
          name: `${input.name} · overflow`,
          walletId: cash.id,
          via: cash.name,
          category: input.category,
          date: input.date,
          amount: overflow,
          icon: input.icon,
          codGroupId: groupId,
        }
      : null;

  set({
    ...state,
    transactions: [codTx, ...(overflowTx ? [overflowTx] : []), ...state.transactions],
    accounts: state.accounts.map((a) =>
      a.id === driver.id
        ? { ...a, amount: a.amount - gross }
        : overflowTx && a.id === overflowTx.walletId
          ? { ...a, amount: a.amount + overflow }
          : a,
    ),
    notifications: [
      ...(overflowTx
        ? [
            notify(
              "COD overflow to Cash",
              `${formatAmount(overflow, state.settings.currency)} added to ${overflowTx.via}.`,
              "income",
            ),
          ]
        : []),
      notify(
        "Driver COD recorded",
        `${input.name} · ${formatAmount(gross, state.settings.currency)} deducted from ${driver.name}.`,
        "expense",
      ),
      ...state.notifications,
    ],
  });
  return { ok: true };
}

/**
 * Global total balance.
 *
 * The persistent Shopee Pay (driver) wallet is isolated by default: it is a
 * debt tracker, so it only joins the total when its balance is positive.
 */
export function totalBalance(s: FinanceState = state) {
  return s.accounts.reduce(
    (sum, a) => (a.type === "Driver" && a.amount <= 0 ? sum : sum + a.amount),
    0,
  );
}

/** The single wallet holding the persistent Shopee Pay balance (if any). */
export function shopeePayAccount(s: FinanceState = state): Account | null {
  return s.accounts.find((a) => a.type === "Driver") ?? null;
}

/**
 * Guarantee the persistent "Shopeepay" wallet exists. Unlike the daily
 * driver figure, this balance is cumulative and never resets at midnight.
 */
export function ensureShopeePayAccount(): MutationResult {
  const existing = shopeePayAccount();
  if (existing) {
    // Standardise legacy spellings onto the single display name "Shopeepay".
    if (
      existing.name !== SHOPEE_WALLET_NAME &&
      (LEGACY_SHOPEE_WALLET_NAMES as readonly string[]).includes(existing.name) &&
      !walletNameTaken(SHOPEE_WALLET_NAME, existing.id)
    ) {
      return updateAccount(existing.id, { name: SHOPEE_WALLET_NAME });
    }
    return { ok: true };
  }
  return addAccount({
    name: walletNameTaken(SHOPEE_WALLET_NAME) ? `${SHOPEE_WALLET_NAME} 2` : SHOPEE_WALLET_NAME,
    type: "Driver",
    amount: 0,
    sub: "ShopeeFood",
    icon: "wallet",
  });
}

/** Manual override of the base Shopee Pay balance (may be negative). */
export function setShopeePayBalance(amount: number): MutationResult {
  const wallet = shopeePayAccount();
  if (!wallet) return { ok: false, reason: "not-found" };
  if (!Number.isFinite(amount)) return { ok: false, reason: "invalid-amount" };
  if (amount === wallet.amount) return { ok: true };
  set({
    ...state,
    accounts: state.accounts.map((a) => (a.id === wallet.id ? { ...a, amount } : a)),
    notifications: [
      notify(
        "Shopee Pay balance updated",
        `Base balance set to ${formatAmount(amount, state.settings.currency)}.`,
        "info",
      ),
      ...state.notifications,
    ],
  });
  return { ok: true };
}

/**
 * Record a Shopee Pay movement: `current + income - expense = new balance`.
 * `amount` is signed (positive = income, negative = expense) and the balance
 * is free to stay negative.
 */
export function adjustShopeePay(amount: number, note?: string): MutationResult {
  const wallet = shopeePayAccount();
  if (!wallet) return { ok: false, reason: "not-found" };
  if (!amount || Number.isNaN(amount)) return { ok: false, reason: "invalid-amount" };
  return addTransaction({
    name: note?.trim() || (amount > 0 ? "Shopee Pay income" : "Shopee Pay expense"),
    walletId: wallet.id,
    via: wallet.name,
    category: DRIVER_CATEGORY,
    date: new Date().toISOString(),
    amount,
    icon: amount > 0 ? "topup" : "transfer",
  });
}

/** Rename / retype / re-icon a wallet. Balances are edited via transactions. */
export function updateAccount(
  accountId: string,
  patch: { name?: string; type?: AccountType; sub?: string; icon?: string },
): MutationResult {
  const account = state.accounts.find((a) => a.id === accountId);
  if (!account) return { ok: false, reason: "not-found" };

  const name = patch.name?.trim() ?? account.name;
  if (!name) return { ok: false, reason: "invalid-name" };
  if (walletNameTaken(name, accountId)) return { ok: false, reason: "duplicate" };

  const renamed = name !== account.name;
  set({
    ...state,
    accounts: state.accounts.map((a) => (a.id === accountId ? { ...a, ...patch, name } : a)),
    // The wallet id is the source of truth; `via` is only a display label,
    // so refresh it for every transaction that belongs to this wallet.
    transactions: renamed
      ? state.transactions.map((t) =>
          t.walletId === accountId || (!t.walletId && t.via === account.name)
            ? { ...t, walletId: accountId, via: name }
            : t,
        )
      : state.transactions,
  });
  return { ok: true };
}

export function deleteAccount(accountId: string) {
  const account = state.accounts.find((a) => a.id === accountId);
  if (!account) return;
  set({
    ...state,
    accounts: state.accounts.filter((a) => a.id !== accountId),
    notifications: [
      notify("Account removed", `${account.name} was deleted from your wallets.`, "info"),
      ...state.notifications,
    ],
  });
}

export function moveToReserve(
  accountId: string,
  amount: number,
  direction: "in" | "out",
): MutationResult {
  const account = state.accounts.find((a) => a.id === accountId);
  if (!account) return { ok: false, reason: "not-found" };
  if (!(amount > 0)) return { ok: false, reason: "invalid-amount" };
  // Stashing can't overdraw the wallet; releasing can't overdraw the reserve.
  if (direction === "in" && account.amount < amount)
    return { ok: false, reason: "insufficient-funds" };
  if (direction === "out" && state.reserve < amount)
    return { ok: false, reason: "insufficient-funds" };
  const signed = direction === "in" ? -amount : amount;
  set({
    ...state,
    reserve: state.reserve + (direction === "in" ? amount : -amount),
    accounts: state.accounts.map((a) =>
      a.id === accountId ? { ...a, amount: a.amount + signed } : a,
    ),
    transactions: [
      {
        id: id(),
        name: direction === "in" ? "Stash to Reserve Fund" : "Withdraw from Reserve Fund",
        walletId: account.id,
        via: account.name,
        category: "Reserve",
        date: new Date().toISOString(),
        amount: signed,
        icon: "shield",
      },
      ...state.transactions,
    ],
    notifications: [
      notify(
        "Reserve fund updated",
        `${formatAmount(amount, state.settings.currency)} ${
          direction === "in" ? "stashed into" : "released from"
        } your reserve.`,
        "info",
      ),
      ...state.notifications,
    ],
  });
  return { ok: true };
}

export function updateTransaction(
  txId: string,
  patch: { amount?: number; category?: string; name?: string; icon?: string },
): MutationResult {
  const tx = state.transactions.find((t) => t.id === txId);
  if (!tx) return { ok: false, reason: "not-found" };
  const nextAmount = patch.amount ?? tx.amount;
  const delta = nextAmount - tx.amount;
  const wallet = walletOf(state, tx);
  if (delta && wallet && wallet.type !== "Driver" && wallet.amount + delta < 0)
    return { ok: false, reason: "insufficient-funds" };
  set({
    ...state,
    transactions: state.transactions.map((t) =>
      t.id === txId ? { ...t, ...patch, amount: nextAmount } : t,
    ),
    accounts:
      delta && wallet
        ? state.accounts.map((a) => (a.id === wallet.id ? { ...a, amount: a.amount + delta } : a))
        : state.accounts,
  });
  return { ok: true };
}

export function deleteTransaction(txId: string) {
  const tx = state.transactions.find((t) => t.id === txId);
  if (!tx) return;
  // A Driver COD booking can span two wallets (Shopee Pay + Cash overflow);
  // undoing it must roll back every row it wrote, never just the one tapped.
  const group = tx.codGroupId
    ? state.transactions.filter((t) => t.codGroupId === tx.codGroupId)
    : [tx];
  const removed = new Set(group.map((t) => t.id));
  const deltas = new Map<string, number>();
  for (const entry of group) {
    const wallet = walletOf(state, entry);
    if (!wallet) continue;
    deltas.set(wallet.id, (deltas.get(wallet.id) ?? 0) - entry.amount);
  }
  set({
    ...state,
    transactions: state.transactions.filter((t) => !removed.has(t.id)),
    accounts: state.accounts.map((a) =>
      deltas.has(a.id) ? { ...a, amount: a.amount + deltas.get(a.id)! } : a,
    ),
  });
}

export function renameCategoryEverywhere(oldName: string, newName: string) {
  if (oldName === newName) return;
  set({
    ...state,
    transactions: state.transactions.map((t) =>
      t.category === oldName ? { ...t, category: newName } : t,
    ),
  });
}

export function updateProfile(patch: Partial<FinanceState["profile"]>) {
  set({ ...state, profile: { ...state.profile, ...patch } });
}

export function updateSettings(patch: Partial<FinanceState["settings"]>) {
  set({ ...state, settings: { ...state.settings, ...patch } });
}

export function markNotificationsRead() {
  if (state.notifications.every((n) => n.read)) return;
  set({
    ...state,
    notifications: state.notifications.map((n) => ({ ...n, read: true })),
  });
}

export function clearNotifications() {
  set({ ...state, notifications: [] });
}

export function toggleBillPaid(billId: string) {
  set({
    ...state,
    bills: state.bills.map((b) => {
      if (b.id !== billId) return b;
      // Recurring bills roll forward one month instead of staying "paid".
      if (!b.paid && b.isRecurring && b.dueDate) {
        // Roll forward until the next due date is in the future, so bills stay
        // correct across months of different lengths and skipped months.
        let next = nextMonthOf(b.dueDate);
        const today = toISODate(new Date());
        let guard = 0;
        while (next < today && guard < 120) {
          next = nextMonthOf(next);
          guard += 1;
        }
        return { ...b, paid: false, dueDate: next };
      }
      return { ...b, paid: !b.paid };
    }),
  });
}

export function addBill(input: {
  name: string;
  amount: number;
  dueDate?: string | undefined;
  icon?: string | undefined;
  isRecurring?: boolean | undefined;
}): MutationResult {
  const name = input.name.trim();
  if (!name) return { ok: false, reason: "invalid-name" };
  if (!(input.amount > 0)) return { ok: false, reason: "invalid-amount" };
  if (billNameTaken(name)) return { ok: false, reason: "duplicate" };
  const bill: Bill = {
    id: id(),
    name,
    amount: input.amount,
    ...(input.dueDate ? { dueDate: input.dueDate } : {}),
    icon: input.icon ?? "bills",
    paid: false,
    isRecurring: input.isRecurring ?? false,
  };
  set({
    ...state,
    bills: [...state.bills, bill],
    notifications: [
      notify("Bill added", `${bill.name} is now tracked in your monthly bills.`, "info"),
      ...state.notifications,
    ],
  });
  return { ok: true };
}

export function updateBill(billId: string, patch: Partial<Omit<Bill, "id">>): MutationResult {
  const bill = state.bills.find((b) => b.id === billId);
  if (!bill) return { ok: false, reason: "not-found" };

  const name = patch.name?.trim() ?? bill.name;
  if (!name) return { ok: false, reason: "invalid-name" };
  if (patch.amount !== undefined && !(patch.amount > 0))
    return { ok: false, reason: "invalid-amount" };
  if (billNameTaken(name, billId)) return { ok: false, reason: "duplicate" };

  set({
    ...state,
    bills: state.bills.map((b) => (b.id === billId ? { ...b, ...patch, name } : b)),
  });
  return { ok: true };
}

export function deleteBill(billId: string) {
  const bill = state.bills.find((b) => b.id === billId);
  if (!bill) return;
  set({
    ...state,
    bills: state.bills.filter((b) => b.id !== billId),
    notifications: [
      notify("Bill removed", `${bill.name} was deleted from your bills.`, "info"),
      ...state.notifications,
    ],
  });
}

/** Move a bill up (-1) or down (1) in the priority order. */
export function moveBill(billId: string, direction: -1 | 1) {
  const index = state.bills.findIndex((b) => b.id === billId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= state.bills.length) return;
  const bills = [...state.bills];
  const [moved] = bills.splice(index, 1);
  bills.splice(target, 0, moved!);
  set({ ...state, bills });
}

/* ---------------- selectors / helpers ---------------- */

/** BCP-47 locale for a UI language. */
export const localeFor = (lang: Language) => (lang === "id" ? "id-ID" : "en-US");

/** Locale that natively formats each supported currency. */
const currencyLocale: Record<Currency, string> = { IDR: "id-ID", USD: "en-US" };

/**
 * Formats a stored amount with `Intl.NumberFormat`. Amounts are always kept in
 * the currency they were recorded in — no conversion happens here.
 */
export function formatAmount(value: number, currency: Currency, lang?: Language) {
  const locale =
    currency === "IDR" ? currencyLocale.IDR : lang ? localeFor(lang) : currencyLocale[currency];
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "IDR" ? 0 : 2,
  }).format(value);
}

export function getState() {
  ensureLocalState();
  return state;
}

export function useFinance() {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => initialState,
  );
}

export function useMoney() {
  const { settings } = useFinance();
  return (value: number) => formatAmount(value, settings.currency, settings.language);
}

export function totals(s: FinanceState) {
  const balance = totalBalance(s);
  const income = s.transactions.filter((t) => t.amount > 0).reduce((sum, t) => sum + t.amount, 0);
  const expense = s.transactions
    .filter((t) => t.amount < 0)
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);
  return { balance, income, expense };
}

/** Localised "Today"/"Yesterday" labels (kept here to avoid an i18n cycle). */
const relativeDayLabels: Record<Language, { today: string; yesterday: string }> = {
  en: { today: "Today", yesterday: "Yesterday" },
  id: { today: "Hari ini", yesterday: "Kemarin" },
};

/** Relative date label in the user's language (defaults to the stored one). */
export function relativeDate(iso: string, lang: Language = getState().settings.language) {
  const locale = localeFor(lang);
  const labels = relativeDayLabels[lang] ?? relativeDayLabels.en;
  const d = new Date(iso);
  const today = new Date();
  const time = d.toLocaleTimeString(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  if (d.toDateString() === today.toDateString()) return `${labels.today} · ${time}`;
  const yesterday = new Date(today.getTime() - 86_400_000);
  if (d.toDateString() === yesterday.toDateString()) return `${labels.yesterday} · ${time}`;
  return `${d.toLocaleDateString(locale, { month: "short", day: "numeric" })} · ${time}`;
}

export function exportData(format: "csv" | "json") {
  const s = state;
  let content: string;
  let mime: string;
  if (format === "csv") {
    const rows = [
      ["Date", "Name", "Category", "Wallet", "Amount"],
      ...s.transactions.map((t) => [
        new Date(t.date).toISOString(),
        t.name,
        t.category,
        walletNameOf(s, t),
        String(t.amount),
      ]),
    ];
    content = rows
      .map((r) => r.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","))
      .join("\n");
    mime = "text/csv";
  } else {
    content = JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        profile: s.profile,
        reserve: s.reserve,
        accounts: s.accounts,
        transactions: s.transactions,
      },
      null,
      2,
    );
    mime = "application/json";
  }
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `c2h-keuangan-export.${format}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoking synchronously can cancel the download in some browsers.
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function markSynced() {
  set({
    ...state,
    settings: { ...state.settings, lastSync: new Date().toISOString() },
  });
}

/** Total balance across wallets minus every unpaid monthly bill. */
export function useSafeToSpend() {
  const s = useFinance();
  const balance = totalBalance(s);
  const unpaid = s.bills.reduce((sum, b) => (b.paid ? sum : sum + b.amount), 0);
  return { balance, unpaid, safeToSpend: balance - unpaid };
}
