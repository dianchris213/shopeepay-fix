import { z } from "zod";

/** Rupiah ceiling for a single transaction (12 digits ≈ Rp 999.999.999.999). */
export const MAX_AMOUNT = 999_999_999_999;
export const MAX_NOTE_LENGTH = 120;
/** Days a transaction may be dated in the future. */
export const MAX_FUTURE_DAYS = 1;

const isoDay = /^\d{4}-\d{2}-\d{2}$/;

export const transactionInputSchema = z.object({
  kind: z.enum(["expense", "income"]),
  amount: z
    .number({ invalid_type_error: "amount" })
    .finite()
    .positive("amount")
    .max(MAX_AMOUNT, "amount"),
  categoryId: z.string().min(1, "category"),
  wallet: z.string().min(1, "wallet"),
  note: z.string().trim().max(MAX_NOTE_LENGTH, "note"),
  date: z
    .string()
    .regex(isoDay, "date")
    .refine((value) => !Number.isNaN(new Date(`${value}T00:00:00`).getTime()), "date")
    .refine((value) => {
      const picked = new Date(`${value}T00:00:00`).getTime();
      const limit = Date.now() + MAX_FUTURE_DAYS * 86_400_000;
      return picked <= limit;
    }, "date"),
});

export type TransactionInput = z.infer<typeof transactionInputSchema>;
export type TransactionField = "amount" | "category" | "wallet" | "note" | "date";

export type ValidationResult =
  { ok: true; value: TransactionInput } | { ok: false; fields: TransactionField[] };

/**
 * Validates raw sheet state. Returns the offending field names so the UI can
 * both highlight inputs and build its "please enter …" banner.
 */
export function validateTransactionInput(raw: {
  kind: "expense" | "income";
  amount: number;
  categoryId: string | null;
  wallet: string | null;
  note: string;
  date: string;
}): ValidationResult {
  const parsed = transactionInputSchema.safeParse({
    kind: raw.kind,
    amount: raw.amount,
    categoryId: raw.categoryId ?? "",
    wallet: raw.wallet ?? "",
    note: raw.note,
    date: raw.date,
  });
  if (parsed.success) return { ok: true, value: parsed.data };

  const fields = new Set<TransactionField>();
  for (const issue of parsed.error.issues) {
    const key = issue.path[0];
    if (key === "amount") fields.add("amount");
    else if (key === "categoryId") fields.add("category");
    else if (key === "wallet") fields.add("wallet");
    else if (key === "note") fields.add("note");
    else if (key === "date") fields.add("date");
  }
  return { ok: false, fields: [...fields] };
}

/** Keeps only digits and clamps to the maximum accepted amount. */
export function sanitizeAmountDigits(input: string): string {
  const digits = input
    .replace(/\D/g, "")
    .replace(/^0+(?=\d)/, "")
    .slice(0, 12);
  if (digits === "") return "";
  return Number(digits) > MAX_AMOUNT ? String(MAX_AMOUNT) : digits;
}
