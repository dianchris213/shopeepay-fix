import { expect, test } from "@playwright/test";

import { aggregate, apiSession, canCallApi, missingApiConfigMessage, type TxRow } from "./api";
import { SEED_PREFIX, SEEDED_BILL, SEEDED_WALLET } from "./seed";
import { FIXED_AMOUNTS, FIXED_DATES } from "./time";

import { allowTransientRetries } from "./flaky";

allowTransientRetries("hits the live backend directly; DNS/TLS jitter is expected");

/**
 * API-level verification.
 *
 * These specs talk to the backend directly (no browser, no UI) so a rendering
 * change can never mask a broken calculation, and a broken calculation can
 * never hide behind a passing UI snapshot. They assert:
 *   - analytics aggregation totals over explicit date ranges
 *   - wallet/bill deletion constraints, including what happens to the rows
 *     that referenced the deleted record
 */
test.describe("API: analytics aggregation", () => {
  test.skip(!canCallApi, missingApiConfigMessage);
  test.describe.configure({ mode: "serial" });

  test("current-month totals match the deterministic seed", async () => {
    const api = await apiSession();
    try {
      const { data, error } = await api.db
        .from("transactions")
        .select("id,type,amount,date,wallet_id,wallet_name,note")
        .eq("user_id", api.userId)
        .like("note", `${SEED_PREFIX}%`)
        .gte("date", `${FIXED_DATES.monthStart}T00:00:00.000Z`)
        .lte("date", `${FIXED_DATES.monthEnd}T23:59:59.999Z`);
      expect(error).toBeNull();

      const totals = aggregate((data ?? []) as TxRow[]);
      expect(totals.income).toBe(FIXED_AMOUNTS.incomeThisMonth);
      expect(totals.expenses).toBe(FIXED_AMOUNTS.expenseThisMonth);
      // The invariant the dashboard renders.
      expect(totals.netFlow).toBe(totals.income - totals.expenses);
    } finally {
      await api.signOut();
    }
  });

  test("previous-month totals isolate the older transaction", async () => {
    const api = await apiSession();
    try {
      const { data, error } = await api.db
        .from("transactions")
        .select("id,type,amount,date,wallet_id,wallet_name,note")
        .eq("user_id", api.userId)
        .like("note", `${SEED_PREFIX}%`)
        .gte("date", `${FIXED_DATES.previousMonthStart}T00:00:00.000Z`)
        .lte("date", `${FIXED_DATES.previousMonthEnd}T23:59:59.999Z`);
      expect(error).toBeNull();

      const totals = aggregate((data ?? []) as TxRow[]);
      expect(totals.income).toBe(0);
      expect(totals.expenses).toBe(FIXED_AMOUNTS.expenseLastMonth);
      expect(totals.netFlow).toBe(-FIXED_AMOUNTS.expenseLastMonth);
    } finally {
      await api.signOut();
    }
  });

  test("an empty range aggregates to zero, an inverted range returns nothing", async () => {
    const api = await apiSession();
    try {
      const select = () =>
        api.db
          .from("transactions")
          .select("id,type,amount,date,wallet_id,wallet_name,note")
          .eq("user_id", api.userId)
          .like("note", `${SEED_PREFIX}%`);

      // A window with no seeded activity.
      const empty = await select()
        .gte("date", "2026-01-01T00:00:00.000Z")
        .lte("date", "2026-01-31T23:59:59.999Z");
      expect(empty.error).toBeNull();
      expect(aggregate((empty.data ?? []) as TxRow[])).toEqual({
        income: 0,
        expenses: 0,
        netFlow: 0,
      });

      // start > end must never produce rows (and must not error).
      const inverted = await select()
        .gte("date", `${FIXED_DATES.monthEnd}T00:00:00.000Z`)
        .lte("date", `${FIXED_DATES.monthStart}T00:00:00.000Z`);
      expect(inverted.error).toBeNull();
      expect(inverted.data ?? []).toHaveLength(0);
    } finally {
      await api.signOut();
    }
  });

  test("raw PostgREST responses agree with the client aggregation", async ({ request }) => {
    const api = await apiSession();
    try {
      const response = await request.get(`${api.restUrl}/transactions`, {
        headers: api.headers,
        params: {
          select: "id,type,amount,date,wallet_id,wallet_name,note",
          user_id: `eq.${api.userId}`,
          note: `like.${SEED_PREFIX}%`,
          date: `gte.${FIXED_DATES.monthStart}T00:00:00.000Z`,
        },
      });
      expect(response.ok()).toBe(true);

      const rows = (await response.json()) as TxRow[];
      const inMonth = rows.filter((r) => r.date <= `${FIXED_DATES.monthEnd}T23:59:59.999Z`);
      const totals = aggregate(inMonth);
      expect(totals.income).toBe(FIXED_AMOUNTS.incomeThisMonth);
      expect(totals.expenses).toBe(FIXED_AMOUNTS.expenseThisMonth);
    } finally {
      await api.signOut();
    }
  });

  test("rows are scoped to the authenticated user", async () => {
    const api = await apiSession();
    try {
      const { data, error } = await api.db.from("transactions").select("user_id").limit(200);
      expect(error).toBeNull();
      for (const row of data ?? []) {
        expect((row as { user_id: string }).user_id).toBe(api.userId);
      }
    } finally {
      await api.signOut();
    }
  });
});

test.describe("API: deletion constraints", () => {
  test.skip(!canCallApi, missingApiConfigMessage);
  test.describe.configure({ mode: "serial" });

  test("deleting a wallet does not leave dangling transaction references", async () => {
    const api = await apiSession();
    const scope = `${SEED_PREFIX} api-wallet-${Date.now()}`;
    try {
      const { data: wallet, error: walletError } = await api.db
        .from("wallets")
        .insert({
          user_id: api.userId,
          name: scope,
          type: "Bank Account",
          balance: 1_000_000,
          sub: "API fixture",
          icon: "wallet",
        })
        .select("id")
        .single();
      expect(walletError).toBeNull();

      const { error: txError } = await api.db.from("transactions").insert({
        user_id: api.userId,
        wallet_id: wallet!.id,
        wallet_name: scope,
        category_name: "Food",
        type: "expense",
        amount: 75_000,
        note: `${scope} tx`,
        date: FIXED_DATES.thisMonth,
      });
      expect(txError).toBeNull();

      const { error: deleteError } = await api.db
        .from("wallets")
        .delete()
        .eq("user_id", api.userId)
        .eq("id", wallet!.id);
      expect(deleteError).toBeNull();

      // The wallet is gone…
      const { data: remaining } = await api.db.from("wallets").select("id").eq("id", wallet!.id);
      expect(remaining ?? []).toHaveLength(0);

      // …and no transaction still points at a wallet that no longer exists.
      const { data: orphans } = await api.db
        .from("transactions")
        .select("id,wallet_id")
        .eq("user_id", api.userId)
        .eq("wallet_id", wallet!.id);
      expect(orphans ?? []).toHaveLength(0);
    } finally {
      await api.db
        .from("transactions")
        .delete()
        .eq("user_id", api.userId)
        .like("note", `${scope}%`);
      await api.db.from("wallets").delete().eq("user_id", api.userId).like("name", `${scope}%`);
      await api.signOut();
    }
  });

  test("deleting a bill removes only that bill", async () => {
    const api = await apiSession();
    const scope = `${SEED_PREFIX} api-bill-${Date.now()}`;
    try {
      const { data: bill, error } = await api.db
        .from("bills")
        .insert({
          user_id: api.userId,
          name: scope,
          amount: 99_000,
          due_date: FIXED_DATES.billDue,
          icon: "bills",
        })
        .select("id")
        .single();
      expect(error).toBeNull();

      const { error: deleteError } = await api.db
        .from("bills")
        .delete()
        .eq("user_id", api.userId)
        .eq("id", bill!.id);
      expect(deleteError).toBeNull();

      const { data: gone } = await api.db.from("bills").select("id").eq("id", bill!.id);
      expect(gone ?? []).toHaveLength(0);

      // The seeded fixture bill is untouched.
      const { data: seeded } = await api.db
        .from("bills")
        .select("id,name,amount")
        .eq("user_id", api.userId)
        .eq("name", SEEDED_BILL);
      expect(seeded ?? []).toHaveLength(1);
      expect(Number(seeded![0]!.amount)).toBe(FIXED_AMOUNTS.billAmount);
    } finally {
      await api.db.from("bills").delete().eq("user_id", api.userId).like("name", `${scope}%`);
      await api.signOut();
    }
  });

  test("another user's rows cannot be deleted", async () => {
    const api = await apiSession();
    try {
      const { data, error } = await api.db
        .from("wallets")
        .delete()
        .neq("user_id", api.userId)
        .select("id");
      // RLS makes this a no-op rather than a destructive cross-tenant delete.
      expect(error).toBeNull();
      expect(data ?? []).toHaveLength(0);

      // The suite's own fixture wallet is still there.
      const { data: fixture } = await api.db
        .from("wallets")
        .select("id")
        .eq("user_id", api.userId)
        .eq("name", SEEDED_WALLET);
      expect(fixture ?? []).toHaveLength(1);
    } finally {
      await api.signOut();
    }
  });
});
