import { describe, expect, it } from "vitest";

import type { FinanceState, Transaction } from "@/lib/finance-store";
import { customBalance, dailyTotals, driverBalance, streamsCsv } from "@/lib/streams";

const NOW = new Date(2026, 4, 20, 14, 0, 0);

function iso(d: Date) {
  return d.toISOString();
}

function tx(partial: Partial<Transaction> & { id: string; amount: number }): Transaction {
  return {
    name: "Entry",
    category: "Food",
    via: "Cash",
    icon: "wallet",
    date: iso(NOW),
    ...partial,
  } as Transaction;
}

function makeState(transactions: Transaction[]): FinanceState {
  return {
    accounts: [
      { id: "a1", name: "Cash", type: "Cash", amount: 100_000 },
      { id: "a2", name: "Uang Ibuk", type: "Custom", amount: 250_000 },
    ],
    transactions,
    bills: [],
  } as unknown as FinanceState;
}

describe("daily reset rules", () => {
  const yesterday = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - 1, 20, 0, 0);

  const state = makeState([
    tx({ id: "1", amount: 50_000, category: "Salary" }),
    tx({ id: "2", amount: -20_000 }),
    tx({ id: "3", amount: 30_000, category: "Driver Shopee" }),
    tx({ id: "4", amount: -5_000, category: "Driver Shopee" }),
    tx({ id: "5", amount: -70_000, via: "Uang Ibuk" }),
    tx({ id: "6", amount: 999_000, category: "Salary", date: iso(yesterday) }),
    tx({ id: "7", amount: 111_000, category: "Driver Shopee", date: iso(yesterday) }),
  ]);

  it("counts every non-custom transaction from today, including DriverShopee", () => {
    expect(dailyTotals(state, NOW)).toEqual({ income: 80_000, expense: 25_000 });
  });

  it("excludes transactions booked against Custom wallets", () => {
    const income = dailyTotals(state, NOW);
    expect(income.expense).not.toContain?.(70_000);
    expect(income.expense).toBe(25_000);
  });

  it("resets DriverShopee to today's entries only", () => {
    expect(driverBalance(state, NOW)).toBe(25_000);
  });

  it("keeps the custom wallet balance cumulative", () => {
    expect(customBalance(state)).toBe(250_000);
  });

  it("exports the streams in the window as CSV", () => {
    const start = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate()).getTime();
    const csv = streamsCsv(state, start, start + 86_399_999);
    const lines = csv.trim().split("\n");
    expect(lines[0]).toContain("Stream,Date,Description");
    // 2 driver + 1 custom entry from today.
    expect(lines).toHaveLength(4);
  });
});
