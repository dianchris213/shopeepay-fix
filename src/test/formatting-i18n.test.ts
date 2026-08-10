import { afterEach, describe, expect, it, vi } from "vitest";

import { formatAmount, localeFor, relativeDate } from "@/lib/finance-store";

/** Strip locale-specific spaces (NBSP / narrow NBSP) so assertions stay stable. */
const norm = (value: string) => value.replace(/[\u00a0\u202f]/g, " ");

describe("formatAmount", () => {
  it("formats IDR with the Indonesian grouping and no decimals", () => {
    const out = norm(formatAmount(1_200_000, "IDR"));
    expect(out).toContain("Rp");
    expect(out).toContain("1.200.000");
    expect(out).not.toContain(",00");
  });

  it("formats USD without any hardcoded conversion", () => {
    // 16000 must stay 16000 — the old code divided by 16,000 and printed $1.
    expect(norm(formatAmount(16_000, "USD"))).toBe("$16,000.00");
    expect(norm(formatAmount(12.5, "USD"))).toBe("$12.50");
  });

  it("matches native Intl.NumberFormat output exactly", () => {
    const expected = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2,
    }).format(9_876.54);
    expect(formatAmount(9_876.54, "USD", "en")).toBe(expected);
  });

  it("renders USD in the selected UI language", () => {
    expect(norm(formatAmount(1_234.5, "USD", "en"))).toBe("$1,234.50");
    expect(norm(formatAmount(1_234.5, "USD", "id"))).toContain("1.234,50");
  });

  it("maps languages to BCP-47 locales", () => {
    expect(localeFor("en")).toBe("en-US");
    expect(localeFor("id")).toBe("id-ID");
  });
});

describe("relativeDate", () => {
  const base = new Date("2026-03-10T14:30:00");

  afterEach(() => vi.useRealTimers());

  function freeze() {
    vi.useFakeTimers();
    vi.setSystemTime(base);
  }

  it("labels today and yesterday in English", () => {
    freeze();
    expect(relativeDate(base.toISOString(), "en")).toMatch(/^Today · 14:30$/);
    const yesterday = new Date(base.getTime() - 86_400_000);
    expect(relativeDate(yesterday.toISOString(), "en")).toMatch(/^Yesterday · 14:30$/);
  });

  it("labels today and yesterday in Bahasa Indonesia", () => {
    freeze();
    expect(relativeDate(base.toISOString(), "id")).toMatch(
      /^Hari ini · 14\.30$|^Hari ini · 14:30$/,
    );
    const yesterday = new Date(base.getTime() - 86_400_000);
    expect(relativeDate(yesterday.toISOString(), "id")).toContain("Kemarin");
  });

  it("formats older dates with the locale's month names", () => {
    freeze();
    const older = new Date("2026-01-05T09:05:00");
    expect(relativeDate(older.toISOString(), "en")).toContain("Jan 5");
    expect(relativeDate(older.toISOString(), "id")).toContain("Jan");
    expect(relativeDate(older.toISOString(), "id")).not.toContain("Today");
  });

  it("never falls back to a hardcoded English label for Indonesian", () => {
    freeze();
    expect(relativeDate(base.toISOString(), "id")).not.toContain("Today");
  });
});
