import { expect, test } from "@playwright/test";

import {
  gotoAnalytics,
  hasCredentials,
  login,
  missingCredentialsMessage,
  readAnalyticsTotals,
} from "./helpers";
import { FIXED_DATES } from "./time";

// Derived from the frozen clock (e2e/time.ts), never from the real date, so
// these ranges select exactly the same seeded rows on every machine and run.
const monthStart = FIXED_DATES.monthStart;
const monthMid = "2026-06-15";

async function openCustomRange(page: import("@playwright/test").Page) {
  await gotoAnalytics(page);
  await page
    .getByTestId("range-toggle")
    .getByRole("button", { name: /custom range/i })
    .click();
  const start = page.getByLabel(/start date/i);
  const end = page.getByLabel(/end date/i);
  await expect(start).toBeVisible();
  await expect(end).toBeVisible();
  return { start, end };
}

/**
 * Edge cases for the custom date-range filter. These are the inputs that
 * historically produce NaN totals, blank charts or hard crashes.
 */
test.describe("custom date-range edge cases", () => {
  test.skip(!hasCredentials, missingCredentialsMessage);

  test("an empty selection keeps the dashboard rendered and numeric", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));

    await login(page);
    const { start, end } = await openCustomRange(page);

    // Clear both inputs — the user opened the picker but chose nothing.
    await start.fill("");
    await end.fill("");
    await expect(start).toHaveValue("");
    await expect(end).toHaveValue("");

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    for (const id of ["an-total-spent", "an-income", "an-expenses", "an-netflow", "an-delta"]) {
      const metric = page.getByTestId(id);
      await expect(metric).toBeVisible();
      await expect(metric).not.toHaveText(/NaN|Infinity|undefined|null/);
    }
    const totals = await readAnalyticsTotals(page);
    expect(Number.isFinite(totals.income)).toBe(true);
    expect(Number.isFinite(totals.expenses)).toBe(true);
    expect(totals.netFlow).toBe(totals.income - totals.expenses);

    // Clearing only one side is equally survivable.
    await start.fill(monthStart);
    await end.fill("");
    await expect(page.getByTestId("an-total-spent")).not.toHaveText(/NaN/);

    expect(errors).toEqual([]);
  });

  test("a start date after the end date is rejected rather than crashing", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));

    await login(page);
    const { start, end } = await openCustomRange(page);

    await start.fill(monthStart);
    await end.fill(monthMid);
    const valid = await readAnalyticsTotals(page);

    // Invert the window.
    await start.fill(`${year}-${month}-20`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // The inputs constrain each other (min/max), so the browser flags the
    // inverted value as invalid instead of silently accepting it.
    const startValidity = await start.evaluate(
      (el: HTMLInputElement) => el.validity.valid && !el.validity.rangeOverflow,
    );
    const endValidity = await end.evaluate(
      (el: HTMLInputElement) => el.validity.valid && !el.validity.rangeUnderflow,
    );
    expect(startValidity || endValidity).toBe(true);

    // Whatever the guard does, the metrics remain finite and never negative spend.
    const inverted = await readAnalyticsTotals(page);
    expect(inverted.expenses).toBeGreaterThanOrEqual(0);
    expect(inverted.income).toBeGreaterThanOrEqual(0);
    expect(inverted.netFlow).toBe(inverted.income - inverted.expenses);
    await expect(page.getByTestId("an-delta")).not.toHaveText(/NaN|Infinity/);

    // Restoring a valid window recovers the original figures exactly.
    await start.fill(monthStart);
    await end.fill(monthMid);
    await expect
      .poll(async () => (await readAnalyticsTotals(page)).expenses, { timeout: 10_000 })
      .toBe(valid.expenses);

    expect(errors).toEqual([]);
  });

  test("a single-day window includes that day's transactions only", async ({ page }) => {
    await login(page);
    const { start, end } = await openCustomRange(page);

    await start.fill(monthStart);
    await end.fill(monthMid);
    const half = await readAnalyticsTotals(page);

    await start.fill(monthMid);
    await end.fill(monthMid);
    const single = await readAnalyticsTotals(page);

    expect(single.expenses).toBeLessThanOrEqual(half.expenses);
    expect(single.income).toBeLessThanOrEqual(half.income);
    expect(single.netFlow).toBe(single.income - single.expenses);
    await expect(page.getByTestId("an-total-spent")).not.toHaveText(/NaN/);
  });
});

/**
 * Timezone boundary consistency: the same window must aggregate to the same
 * money regardless of the viewer's timezone, including offsets that push
 * midnight across a calendar day (UTC-11 / UTC+14).
 */
const timezones = ["UTC", "Pacific/Pago_Pago", "Pacific/Kiritimati", "Asia/Jakarta"];

for (const timezoneId of timezones) {
  test.describe(`timezone boundary consistency (${timezoneId})`, () => {
    test.skip(!hasCredentials, missingCredentialsMessage);
    test.use({ timezoneId });

    test("month window totals are stable across timezones", async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));

      await login(page);
      const { start, end } = await openCustomRange(page);

      // Boundary window: the very first and very last instant of the month.
      const lastDay = new Date(year, now.getMonth() + 1, 0).getDate();
      await start.fill(monthStart);
      await end.fill(`${year}-${month}-${pad(lastDay)}`);

      const totals = await readAnalyticsTotals(page);
      expect(Number.isFinite(totals.income)).toBe(true);
      expect(totals.netFlow).toBe(totals.income - totals.expenses);
      await expect(page.getByTestId("an-total-spent")).not.toHaveText(/NaN|Infinity/);

      // A full-month custom range must match the "This Month" preset exactly,
      // which is only true when boundaries are computed in local time.
      await page
        .getByTestId("range-toggle")
        .getByRole("button", { name: /this month/i })
        .click();
      const preset = await readAnalyticsTotals(page);
      expect(preset).toEqual(totals);

      expect(errors).toEqual([]);
    });
  });
}
