import { beforeEach, describe, expect, it } from "vitest";

import {
  addTransaction,
  deleteTransaction,
  ensureShopeePayAccount,
  getState,
  hydrateState,
  initialState,
  isDriverCodCategory,
  setShopeePayBalance,
  shopeePayAccount,
} from "@/lib/finance-store";

/**
 * Driver COD is destructive: it books a deduction on the persistent Shopee Pay
 * wallet. Deleting the booked transaction must restore the balance exactly.
 */
describe("Driver COD undo safety", () => {
  beforeEach(() => {
    hydrateState({ ...initialState, accounts: [], transactions: [] });
    ensureShopeePayAccount();
    setShopeePayBalance(50_000);
  });

  const bookCod = (amount: number) =>
    addTransaction({
      name: "COD order",
      walletId: "",
      via: "",
      category: "Driver COD",
      date: new Date().toISOString(),
      amount: -amount,
      icon: "wallet",
    });

  it("recognises the Driver COD category case-insensitively", () => {
    expect(isDriverCodCategory("driver cod")).toBe(true);
    expect(isDriverCodCategory(" Driver COD ")).toBe(true);
    expect(isDriverCodCategory("Driver Bonus")).toBe(false);
  });

  it("routes the deduction to the Shopee Pay wallet", () => {
    expect(bookCod(20_000).ok).toBe(true);
    expect(shopeePayAccount()?.amount).toBe(30_000);
    expect(getState().transactions[0]?.via).toBe(shopeePayAccount()?.name);
  });

  it("restores the exact balance when the booked transaction is undone", () => {
    const before = shopeePayAccount()!.amount;
    bookCod(15_000);
    const booked = getState().transactions[0]!;
    deleteTransaction(booked.id);
    expect(shopeePayAccount()?.amount).toBe(before);
    expect(getState().transactions.find((t) => t.id === booked.id)).toBeUndefined();
  });

  it("is idempotent: undoing twice does not double-refund", () => {
    bookCod(10_000);
    const booked = getState().transactions[0]!;
    deleteTransaction(booked.id);
    deleteTransaction(booked.id);
    expect(shopeePayAccount()?.amount).toBe(50_000);
  });

  it("undoes only the targeted COD entry", () => {
    bookCod(10_000);
    bookCod(5_000);
    const newest = getState().transactions[0]!;
    deleteTransaction(newest.id);
    expect(getState().transactions).toHaveLength(1);
    expect(shopeePayAccount()?.amount).toBe(40_000);
  });
});
