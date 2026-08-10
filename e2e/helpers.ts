import { expect, type Locator, type Page } from "@playwright/test";

import { readCredentials } from "./env";
import { installFrozenClock } from "./time";

const credentials = readCredentials();
const email = credentials?.email;
const password = credentials?.password;

/** True when a confirmed test account is configured for the authenticated specs. */
export const hasCredentials = Boolean(email && password);

export const missingCredentialsMessage =
  "Set E2E_TEST_EMAIL / E2E_TEST_PASSWORD to a confirmed account (email confirmation is enabled) to run authenticated smoke tests.";

/** Sign in with the configured test account and wait for the authenticated shell. */
export async function login(page: Page) {
  // Freeze the clock before the first navigation so the app never reads the
  // real wall clock when it computes date ranges or analytics windows.
  await installFrozenClock(page);
  await page.goto("/");
  await expect(page.getByPlaceholder("you@email.com")).toBeVisible();

  await page.getByPlaceholder("you@email.com").fill(email!);
  await page.getByPlaceholder("••••••••").fill(password!);
  await page.getByRole("button", { name: /^sign in$/i }).click();

  // Bottom navigation only renders once the user is authenticated.
  await expect(page.getByRole("link", { name: /analytics/i })).toBeVisible({ timeout: 30_000 });
}

/** Navigate to the analytics dashboard and wait for the summary card. */
export async function gotoAnalytics(page: Page) {
  await page.getByRole("link", { name: /analytics/i }).click();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByTestId("an-total-spent")).toBeVisible();
}

/** Open Settings → Manage Wallets & Accounts. */
export async function openManageWallets(page: Page) {
  await page.getByRole("link", { name: /settings/i }).click();
  await page
    .getByText(/manage wallets & accounts/i)
    .first()
    .click();
}

/** Open Settings → Manage Bills & Installments. */
export async function openManageBills(page: Page) {
  await page.getByRole("link", { name: /settings/i }).click();
  await page
    .getByText(/manage bills & installments/i)
    .first()
    .click();
}

/** Open Settings → Manage Categories. */
export async function openManageCategories(page: Page) {
  await page.getByRole("link", { name: /settings/i }).click();
  await page
    .getByText(/manage categories/i)
    .first()
    .click();
  await expect(page.getByRole("button", { name: /add new category/i })).toBeVisible({
    timeout: 20_000,
  });
}

/**
 * Currency strings are locale formatted ("Rp 1.200.000", "-Rp 900.000").
 * Reduce them to a signed number so totals can be compared arithmetically.
 */
export function parseMoney(value: string): number {
  const trimmed = value.trim();
  const digits = trimmed.replace(/[^\d]/g, "");
  const amount = Number(digits || "0");
  return /^-|^\(.*\)$/.test(trimmed) ? -amount : amount;
}

export type AnalyticsTotals = {
  income: number;
  expenses: number;
  netFlow: number;
};

/** Read the three aggregate figures rendered by the analytics summary card. */
export async function readAnalyticsTotals(page: Page): Promise<AnalyticsTotals> {
  const read = async (locator: Locator) => parseMoney((await locator.innerText()).trim());
  return {
    income: await read(page.getByTestId("an-income")),
    expenses: await read(page.getByTestId("an-expenses")),
    netFlow: await read(page.getByTestId("an-netflow")),
  };
}

/**
 * Wait until the analytics totals differ from a previously captured snapshot.
 * Used after a deletion so assertions never race the store update.
 */
export async function waitForTotalsChange(page: Page, previous: AnalyticsTotals) {
  await expect
    .poll(async () => JSON.stringify(await readAnalyticsTotals(page)), { timeout: 20_000 })
    .not.toBe(JSON.stringify(previous));
  return readAnalyticsTotals(page);
}

/**
 * Freeze motion and blinking carets so visual-regression snapshots are
 * deterministic across machines and runs.
 */
export async function stabilizeForScreenshot(page: Page) {
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation: none !important;
        transition: none !important;
        caret-color: transparent !important;
      }
      html { scroll-behavior: auto !important; }
    `,
  });
  await page.waitForTimeout(300);
}
