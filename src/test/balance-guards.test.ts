import { beforeEach, describe, expect, it } from "vitest";

import {
  addTransaction,
  getState,
  hydrateState,
  initialState,
  moveToReserve,
  transferBetweenAccounts,
  updateTransaction,
  walletOf,
  type FinanceState,
} from "@/lib/finance-store";

const wallet = (id: string, name: string, amount: number) => ({
  id,
  name,
  type: "Cash" as const,
  amount,
  sub: "",
  icon: "wallet",
  color: "var(--primary)",
});

function seed(overrides: Partial<FinanceState> = {}) {
  hydrateState({
    ...initialState,
    accounts: [wallet("w1", "Cash", 100_000), wallet("w2", "Bank", 50_000)],
    transactions: [],
    reserve: 20_000,
    ...overrides,
  });
}

describe("store-level balance guards", () => {
  beforeEach(() => seed());

  describe("addTransaction", () => {
    it("rejects an expense larger than the wallet balance", () => {
      const result = addTransaction({
        name: "Too big",
        walletId: "w1",
        via: "Cash",
        category: "Food",
        date: new Date().toISOString(),
        amount: -150_000,
        icon: "food",
      });
      expect(result).toEqual({ ok: false, reason: "insufficient-funds" });
      expect(getState().transactions).toHaveLength(0);
      expect(getState().accounts[0]!.amount).toBe(100_000);
    });

    it("accepts an expense that lands exactly on zero", () => {
      const result = addTransaction({
        name: "Exact",
        walletId: "w1",
        via: "Cash",
        category: "Food",
        date: new Date().toISOString(),
        amount: -100_000,
        icon: "food",
      });
      expect(result).toEqual({ ok: true });
      expect(getState().accounts[0]!.amount).toBe(0);
    });

    it("rejects a zero amount and an unknown wallet", () => {
      const base = {
        name: "x",
        category: "Food",
        date: new Date().toISOString(),
        icon: "food",
      };
      expect(addTransaction({ ...base, walletId: "w1", via: "Cash", amount: 0 })).toEqual({
        ok: false,
        reason: "invalid-amount",
      });
      expect(addTransaction({ ...base, via: "Ghost", amount: -1 })).toEqual({
        ok: false,
        reason: "not-found",
      });
    });

    it("stamps the wallet id even when only a name was supplied", () => {
      addTransaction({
        name: "Legacy caller",
        via: "cash",
        category: "Food",
        date: new Date().toISOString(),
        amount: -1_000,
        icon: "food",
      });
      const tx = getState().transactions[0]!;
      expect(tx.walletId).toBe("w1");
      expect(walletOf(getState(), tx)?.id).toBe("w1");
    });
  });

  describe("transferBetweenAccounts", () => {
    it("rejects a transfer larger than the source balance", () => {
      expect(transferBetweenAccounts("w1", "w2", 200_000)).toEqual({
        ok: false,
        reason: "insufficient-funds",
      });
      expect(getState().accounts.map((a) => a.amount)).toEqual([100_000, 50_000]);
      expect(getState().transactions).toHaveLength(0);
    });

    it("rejects same-wallet and unknown-wallet transfers", () => {
      expect(transferBetweenAccounts("w1", "w1", 10)).toEqual({ ok: false, reason: "not-found" });
      expect(transferBetweenAccounts("w1", "nope", 10)).toEqual({ ok: false, reason: "not-found" });
    });

    it("moves funds and records both legs against wallet ids", () => {
      expect(transferBetweenAccounts("w1", "w2", 40_000)).toEqual({ ok: true });
      expect(getState().accounts.map((a) => a.amount)).toEqual([60_000, 90_000]);
      expect(
        getState()
          .transactions.map((t) => t.walletId)
          .sort(),
      ).toEqual(["w1", "w2"]);
    });
  });

  describe("moveToReserve", () => {
    it("rejects stashing more than the wallet holds", () => {
      expect(moveToReserve("w1", 500_000, "in")).toEqual({
        ok: false,
        reason: "insufficient-funds",
      });
      expect(getState().reserve).toBe(20_000);
    });

    it("rejects releasing more than the reserve holds", () => {
      expect(moveToReserve("w1", 30_000, "out")).toEqual({
        ok: false,
        reason: "insufficient-funds",
      });
      expect(getState().reserve).toBe(20_000);
    });

    it("moves funds in both directions when sufficient", () => {
      expect(moveToReserve("w1", 10_000, "in")).toEqual({ ok: true });
      expect(getState().reserve).toBe(30_000);
      expect(getState().accounts[0]!.amount).toBe(90_000);

      expect(moveToReserve("w1", 30_000, "out")).toEqual({ ok: true });
      expect(getState().reserve).toBe(0);
      expect(getState().accounts[0]!.amount).toBe(120_000);
    });
  });

  describe("updateTransaction", () => {
    it("rejects an edit that would overdraw the wallet", () => {
      addTransaction({
        name: "Lunch",
        walletId: "w1",
        via: "Cash",
        category: "Food",
        date: new Date().toISOString(),
        amount: -10_000,
        icon: "food",
      });
      const txId = getState().transactions[0]!.id;
      expect(updateTransaction(txId, { amount: -900_000 })).toEqual({
        ok: false,
        reason: "insufficient-funds",
      });
      expect(getState().accounts[0]!.amount).toBe(90_000);
    });
  });
});
