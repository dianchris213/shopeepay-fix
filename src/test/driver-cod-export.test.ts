import { beforeEach, describe, expect, it } from "vitest";

import {
  addTransaction,
  ensureShopeePayAccount,
  hydrateState,
  initialState,
  setShopeePayBalance,
  shopeePayAccount,
  totalBalance,
  type Account,
} from "@/lib/finance-store";
import { buildWhatsAppSummary } from "@/lib/wa-export";

const cash: Account = {
  id: "a1",
  name: "Cash",
  type: "Cash",
  amount: 100_000,
  color: "#22c55e",
  icon: "Banknote",
  sub: "Cash",
};

function reset() {
  hydrateState({ ...initialState, accounts: [cash], transactions: [], bills: [] });
  ensureShopeePayAccount();
}

describe("Driver COD math", () => {
  beforeEach(reset);

  it("subtracts from a positive Shopee Pay balance", () => {
    setShopeePayBalance(100_000);
    const result = addTransaction({
      name: "COD order",
      via: "Cash",
      category: "Driver COD",
      date: new Date().toISOString(),
      amount: 150_000,
      icon: "transport",
    });
    expect(result.ok).toBe(true);
    expect(shopeePayAccount()?.amount).toBe(-50_000);
  });

  it("subtracts further from a negative balance", () => {
    setShopeePayBalance(-100_000);
    addTransaction({
      name: "COD order",
      via: "Cash",
      category: "Driver COD",
      date: new Date().toISOString(),
      amount: 150_000,
      icon: "transport",
    });
    expect(shopeePayAccount()?.amount).toBe(-250_000);
  });
});

describe("Total balance isolation", () => {
  beforeEach(reset);

  it("excludes a non-positive Shopee Pay balance", () => {
    setShopeePayBalance(-50_000);
    expect(totalBalance()).toBe(100_000);
    setShopeePayBalance(0);
    expect(totalBalance()).toBe(100_000);
  });

  it("includes a positive Shopee Pay balance", () => {
    setShopeePayBalance(25_000);
    expect(totalBalance()).toBe(125_000);
  });
});

describe("WhatsApp export", () => {
  beforeEach(reset);

  it("lists total, categories, recent transactions and remaining balance", () => {
    addTransaction({
      name: "Lunch",
      via: "Cash",
      category: "Food & Dining",
      date: new Date().toISOString(),
      amount: -20_000,
      icon: "food",
    });
    const text = buildWhatsAppSummary({
      ...initialState,
      accounts: [{ ...cash, amount: 80_000 }],
      transactions: [
        {
          id: "t1",
          name: "Lunch",
          via: "Cash",
          walletId: "a1",
          category: "Food & Dining",
          date: new Date().toISOString(),
          amount: -20_000,
          icon: "food",
        },
      ],
      bills: [],
    });
    expect(text).toContain("Food & Dining");
    expect(text).toContain("Lunch");
    expect(text.split("\n").length).toBeGreaterThan(6);
  });
});
