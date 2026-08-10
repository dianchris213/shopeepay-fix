import { describe, expect, it } from "vitest";

import { nextMonthOf } from "@/lib/finance-store";

/**
 * "Repeat Monthly" rolls a bill's due date forward one calendar month.
 * The tricky part is months that are shorter than the anchor day.
 */
describe("Repeat Monthly due-date logic", () => {
  it("advances a mid-month date by exactly one month", () => {
    expect(nextMonthOf("2026-03-15")).toBe("2026-04-15");
  });

  it("clamps the 31st into a 30-day month", () => {
    expect(nextMonthOf("2026-01-31")).toBe("2026-02-28");
    expect(nextMonthOf("2026-03-31")).toBe("2026-04-30");
  });

  it("clamps into February on a non-leap year", () => {
    expect(nextMonthOf("2026-01-30")).toBe("2026-02-28");
    expect(nextMonthOf("2026-01-29")).toBe("2026-02-28");
  });

  it("uses February 29 on a leap year", () => {
    expect(nextMonthOf("2024-01-31")).toBe("2024-02-29");
    expect(nextMonthOf("2024-01-29")).toBe("2024-02-29");
  });

  it("rolls December over into the next year", () => {
    expect(nextMonthOf("2026-12-31")).toBe("2027-01-31");
    expect(nextMonthOf("2026-12-01")).toBe("2027-01-01");
  });

  it("never regresses and never skips more than one month", () => {
    let cursor = "2026-01-31";
    const seen: string[] = [];
    for (let i = 0; i < 14; i++) {
      const next = nextMonthOf(cursor);
      expect(next > cursor).toBe(true);
      seen.push(next);
      cursor = next;
    }
    // 14 rolls from January 2026 must land in March 2027 — no drifting.
    expect(seen.at(-1)?.slice(0, 7)).toBe("2027-03");
  });

  it("returns the input unchanged for malformed dates", () => {
    expect(nextMonthOf("")).toBe("");
    expect(nextMonthOf("not-a-date")).toBe("not-a-date");
  });
});
