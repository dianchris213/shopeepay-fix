import { beforeEach, describe, expect, it } from "vitest";

import {
  addTransaction,
  cashAccount,
  codOverflowFor,
  deleteTransaction,
  ensureShopeePayAccount,
  getState,
  hydrateState,
  initialState,
  setShopeePayBalance,
  shopeePayAccount,
  type Account,
} from "@/lib/finance-store";

const cash: Account = {
  id: "cash1",
  name: "Dompet Tunai",
  type: "Cash",
  amount: 0,
  color: "#22c55e",
  icon: "Banknote",
  sub: "Cash",
};

function reset(withCash = true) {
  hydrateState({
    ...initialState,
    accounts: withCash ? [cash] : [],
    transactions: [],
    bills: [],
  });
  ensureShopeePayAccount();
}

const bookCod = (amount: number) =>
  addTransaction({
    name: "COD order",
    via: "",
    category: "Driver COD",
    date: new Date().toISOString(),
    amount,
    icon: "transport",
  });

describe("Driver COD overflow math", () => {
  it("computes the surplus only when the balance crosses zero", () => {
    expect(codOverflowFor(100_000, 150_000)).toBe(50_000);
    expect(codOverflowFor(100_000, 100_000)).toBe(0);
    expect(codOverflowFor(100_000, 40_000)).toBe(0);
    expect(codOverflowFor(-100_000, 150_000)).toBe(0);
    expect(codOverflowFor(0, 50_000)).toBe(0);
  });
});

describe("Driver COD booking", () => {
  beforeEach(() => reset());

  it("subtracts an Income COD from Shopee Pay", () => {
    setShopeePayBalance(10_000);
    expect(bookCod(100_000).ok).toBe(true);
    expect(shopeePayAccount()?.amount).toBe(-90_000);
  });

  it("routes the crossing surplus into the Cash wallet as income", () => {
    setShopeePayBalance(100_000);
    expect(bookCod(150_000).ok).toBe(true);
    expect(shopeePayAccount()?.amount).toBe(-50_000);
    expect(cashAccount()?.amount).toBe(50_000);
    const overflow = getState().transactions.find((t) => t.walletId === cash.id);
    expect(overflow?.amount).toBe(50_000);
  });

  it("writes no overflow row when the balance stays positive", () => {
    setShopeePayBalance(200_000);
    bookCod(150_000);
    expect(shopeePayAccount()?.amount).toBe(50_000);
    expect(cashAccount()?.amount).toBe(0);
    expect(getState().transactions).toHaveLength(1);
  });

  it("writes no overflow row when the balance is already negative", () => {
    setShopeePayBalance(-100_000);
    bookCod(150_000);
    expect(shopeePayAccount()?.amount).toBe(-250_000);
    expect(cashAccount()?.amount).toBe(0);
  });

  it("blocks the whole save when no Cash wallet exists", () => {
    reset(false);
    setShopeePayBalance(100_000);
    const result = bookCod(150_000);
    expect(result).toEqual({ ok: false, reason: "missing-cash-wallet" });
    // Nothing was written: the booking is all-or-nothing.
    expect(shopeePayAccount()?.amount).toBe(100_000);
    expect(getState().transactions).toHaveLength(0);
  });
});

describe("Driver COD undo", () => {
  beforeEach(() => reset());

  it("rolls back both the Shopee Pay deduction and the Cash overflow", () => {
    setShopeePayBalance(100_000);
    bookCod(150_000);
    const booked = getState().transactions[0]!;
    deleteTransaction(booked.id);
    expect(shopeePayAccount()?.amount).toBe(100_000);
    expect(cashAccount()?.amount).toBe(0);
    expect(getState().transactions).toHaveLength(0);
  });

  it("rolls back from the overflow row too", () => {
    setShopeePayBalance(100_000);
    bookCod(150_000);
    const overflow = getState().transactions.find((t) => t.walletId === cash.id)!;
    deleteTransaction(overflow.id);
    expect(shopeePayAccount()?.amount).toBe(100_000);
    expect(cashAccount()?.amount).toBe(0);
  });

  it("is idempotent", () => {
    setShopeePayBalance(100_000);
    bookCod(150_000);
    const booked = getState().transactions[0]!;
    deleteTransaction(booked.id);
    deleteTransaction(booked.id);
    expect(shopeePayAccount()?.amount).toBe(100_000);
    expect(cashAccount()?.amount).toBe(0);
  });

  it("leaves other COD bookings untouched", () => {
    setShopeePayBalance(100_000);
    bookCod(150_000); // crosses: -50k shopee, +50k cash
    bookCod(20_000); // already negative: no overflow
    const newest = getState().transactions[0]!;
    deleteTransaction(newest.id);
    expect(shopeePayAccount()?.amount).toBe(-50_000);
    expect(cashAccount()?.amount).toBe(50_000);
  });
});
