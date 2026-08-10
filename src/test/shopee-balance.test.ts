import { beforeEach, describe, expect, it } from "vitest";

import {
  adjustShopeePay,
  ensureShopeePayAccount,
  hydrateState,
  initialState,
  setShopeePayBalance,
  shopeePayAccount,
} from "@/lib/finance-store";

/**
 * Persistent driver balance: `current + income - expense = new balance`,
 * including while the balance is negative, and never reset by a new day.
 */
describe("ShoopeePay", () => {
  beforeEach(() => {
    hydrateState({ ...initialState, accounts: [], transactions: [] });
    ensureShopeePayAccount();
  });

  it("creates exactly one reserved driver wallet", () => {
    ensureShopeePayAccount();
    expect(shopeePayAccount()?.type).toBe("Driver");
  });

  it("adds income and subtracts expense from a negative balance", () => {
    setShopeePayBalance(-10_000);
    adjustShopeePay(6_000);
    expect(shopeePayAccount()?.amount).toBe(-4_000);
    adjustShopeePay(-1_000);
    expect(shopeePayAccount()?.amount).toBe(-5_000);
  });

  it("adds income and subtracts expense from a positive balance", () => {
    setShopeePayBalance(10_000);
    adjustShopeePay(6_000);
    expect(shopeePayAccount()?.amount).toBe(16_000);
    adjustShopeePay(-1_000);
    expect(shopeePayAccount()?.amount).toBe(15_000);
  });

  it("accepts a manual override at any time", () => {
    setShopeePayBalance(-2_500);
    expect(shopeePayAccount()?.amount).toBe(-2_500);
    setShopeePayBalance(42_000);
    expect(shopeePayAccount()?.amount).toBe(42_000);
  });
});
