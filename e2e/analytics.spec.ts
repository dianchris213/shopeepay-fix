import { expect, test } from "@playwright/test";

import { hasCredentials, login, missingCredentialsMessage } from "./helpers";

const ranges = [/this month/i, /last month/i, /last 3 months/i, /custom range/i];

test("analytics renders and survives every date-range switch", async ({ page }) => {
  test.skip(!hasCredentials, missingCredentialsMessage);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await login(page);
  await page.getByRole("link", { name: /analytics/i }).click();

  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const toggle = page.getByTestId("range-toggle");
  await expect(toggle).toBeVisible();

  for (const range of ranges) {
    await toggle.getByRole("button", { name: range }).click();
    await expect(toggle.getByRole("button", { name: range })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }

  // Custom range exposes both date inputs and recalculates without crashing.
  await expect(page.getByLabel(/start date/i)).toBeVisible();
  await page.getByLabel(/start date/i).fill("2026-01-01");
  await page.getByLabel(/end date/i).fill("2026-12-31");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  expect(errors).toEqual([]);
});
