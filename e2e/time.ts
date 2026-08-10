import type { Page } from "@playwright/test";

/**
 * Single source of truth for "now" across the whole E2E suite.
 *
 * Every seeded row and every date-range assertion is derived from this
 * constant, and the browser clock is frozen to it, so analytics results are
 * byte-for-byte identical on a laptop in Jakarta and on a CI runner in UTC.
 */
export const FROZEN_NOW_ISO = "2026-06-15T12:00:00.000Z";
export const FROZEN_NOW = new Date(FROZEN_NOW_ISO);

/** Deterministic dates used by the seeder and by range assertions. */
export const FIXED_DATES = {
  /** Inside the frozen "this month" window. */
  thisMonth: "2026-06-05T12:00:00.000Z",
  /** Inside the frozen "last month" window. */
  lastMonth: "2026-05-12T12:00:00.000Z",
  /** Bill due date, same month as the frozen now. */
  billDue: "2026-06-25",
  /** First/last day of the frozen current month (YYYY-MM-DD). */
  monthStart: "2026-06-01",
  monthEnd: "2026-06-30",
  previousMonthStart: "2026-05-01",
  previousMonthEnd: "2026-05-31",
} as const;

/** Deterministic seeded amounts, asserted by both the UI and API specs. */
export const FIXED_AMOUNTS = {
  walletBalance: 5_000_000,
  billAmount: 250_000,
  expenseThisMonth: 120_000,
  incomeThisMonth: 900_000,
  expenseLastMonth: 400_000,
} as const;

/**
 * Freeze the page clock at {@link FROZEN_NOW}.
 *
 * Must be called before the first navigation so the app never observes the
 * real wall clock. `setFixedTime` keeps `Date.now()` pinned (rather than
 * ticking), which is what makes "this month" / "last 30 days" style ranges
 * stable even for a slow test run that crosses a month boundary.
 */
export async function installFrozenClock(page: Page) {
  await page.clock.install({ time: FROZEN_NOW });
  await page.clock.setFixedTime(FROZEN_NOW);
}
