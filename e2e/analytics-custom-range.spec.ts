import { expect, test } from "@playwright/test";

import { hasCredentials, login, missingCredentialsMessage } from "./helpers";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

const now = new Date();
const monthStart = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
const monthMid = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-15`;

test.describe("analytics custom date range", () => {
  test.skip(!hasCredentials, missingCredentialsMessage);

  test("recalculates metrics and deltas for a custom window", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));

    await login(page);
    await page.getByRole("link", { name: /analytics/i }).click();

    const toggle = page.getByTestId("range-toggle");
    const spent = page.getByTestId("an-total-spent");
    const income = page.getByTestId("an-income");
    const netFlow = page.getByTestId("an-netflow");
    const delta = page.getByTestId("an-delta");

    await expect(toggle).toBeVisible();
    await expect(spent).toBeVisible();

    // Baseline: full current month.
    await toggle.getByRole("button", { name: /this month/i }).click();
    const monthSpent = (await spent.innerText()).trim();
    const monthIncome = (await income.innerText()).trim();

    // Custom range covering only the first half of the month.
    await toggle.getByRole("button", { name: /custom range/i }).click();
    const start = page.getByLabel(/start date/i);
    const end = page.getByLabel(/end date/i);
    await expect(start).toBeVisible();
    await expect(end).toBeVisible();

    await start.fill(monthStart);
    await end.fill(monthMid);
    await expect(start).toHaveValue(monthStart);
    await expect(end).toHaveValue(monthMid);

    // Summary cards, net flow and the period-over-period delta all stay rendered
    // and formatted (never NaN/Infinity/undefined) for the narrowed window.
    for (const metric of [spent, income, netFlow]) {
      await expect(metric).toBeVisible();
      await expect(metric).not.toHaveText(/NaN|Infinity|undefined/);
    }
    await expect(delta).toHaveText(/\d+% /);
    await expect(delta).not.toHaveText(/NaN|Infinity/);

    // Narrowing the window can never report more spend than the whole month.
    const numeric = (value: string) => Number(value.replace(/[^\d]/g, "") || "0");
    expect(numeric((await spent.innerText()).trim())).toBeLessThanOrEqual(numeric(monthSpent));
    expect(numeric((await income.innerText()).trim())).toBeLessThanOrEqual(numeric(monthIncome));

    // A single-day window is still valid and does not blow up the charts.
    await end.fill(monthStart);
    await expect(spent).toBeVisible();
    await expect(spent).not.toHaveText(/NaN/);

    // An inverted range must degrade gracefully rather than crash.
    await start.fill(monthMid);
    await end.fill(monthStart);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // Switching back to a preset restores the wider totals.
    await toggle.getByRole("button", { name: /this month/i }).click();
    await expect(spent).toHaveText(monthSpent);

    expect(errors).toEqual([]);
  });
});
