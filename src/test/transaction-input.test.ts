import { describe, expect, it } from "vitest";

import {
  MAX_AMOUNT,
  MAX_NOTE_LENGTH,
  sanitizeAmountDigits,
  validateTransactionInput,
} from "@/lib/transaction-input";

const base = {
  kind: "expense" as const,
  amount: 25_000,
  categoryId: "cat-1",
  wallet: "Cash",
  note: "Lunch",
  date: new Date().toISOString().slice(0, 10),
};

describe("transaction input guardrails", () => {
  it("accepts a well-formed transaction", () => {
    const result = validateTransactionInput(base);
    expect(result.ok).toBe(true);
  });

  it("rejects a zero or negative amount", () => {
    expect(validateTransactionInput({ ...base, amount: 0 })).toEqual({
      ok: false,
      fields: ["amount"],
    });
    expect(validateTransactionInput({ ...base, amount: -5 })).toEqual({
      ok: false,
      fields: ["amount"],
    });
  });

  it("rejects NaN amounts coming from a cleared input", () => {
    const result = validateTransactionInput({ ...base, amount: Number.NaN });
    expect(result.ok).toBe(false);
  });

  it("rejects amounts above the rupiah ceiling", () => {
    const result = validateTransactionInput({ ...base, amount: MAX_AMOUNT + 1 });
    expect(result).toEqual({ ok: false, fields: ["amount"] });
  });

  it("requires a category and a wallet", () => {
    const result = validateTransactionInput({ ...base, categoryId: null, wallet: null });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fields.sort()).toEqual(["category", "wallet"]);
  });

  it("rejects malformed and far-future dates", () => {
    expect(validateTransactionInput({ ...base, date: "" }).ok).toBe(false);
    expect(validateTransactionInput({ ...base, date: "2024-13-45" }).ok).toBe(false);
    expect(validateTransactionInput({ ...base, date: "2999-01-01" })).toEqual({
      ok: false,
      fields: ["date"],
    });
  });

  it("rejects an over-long note", () => {
    const result = validateTransactionInput({ ...base, note: "x".repeat(MAX_NOTE_LENGTH + 1) });
    expect(result).toEqual({ ok: false, fields: ["note"] });
  });

  it("trims the note before saving", () => {
    const result = validateTransactionInput({ ...base, note: "  Kopi  " });
    expect(result.ok && result.value.note).toBe("Kopi");
  });

  it("collects every offending field at once", () => {
    const result = validateTransactionInput({
      ...base,
      amount: 0,
      categoryId: null,
      wallet: null,
      date: "nope",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fields.sort()).toEqual(["amount", "category", "date", "wallet"]);
  });
});

describe("sanitizeAmountDigits", () => {
  it("strips everything that is not a digit", () => {
    expect(sanitizeAmountDigits("Rp 12.500abc")).toBe("12500");
  });

  it("drops leading zeroes but keeps a single zero-less empty value", () => {
    expect(sanitizeAmountDigits("000123")).toBe("123");
    expect(sanitizeAmountDigits("")).toBe("");
    expect(sanitizeAmountDigits("---")).toBe("");
  });

  it("clamps to the maximum amount", () => {
    expect(sanitizeAmountDigits("9".repeat(20))).toBe(String(MAX_AMOUNT));
  });
});
