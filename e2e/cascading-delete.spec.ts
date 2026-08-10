// Per-test isolation: ./fixtures re-seeds the deterministic baseline before
// each test and removes it afterwards, so this spec cannot leak state.
import { expect, test } from "./fixtures";

import {
  gotoAnalytics,
  hasCredentials,
  login,
  missingCredentialsMessage,
  openManageBills,
  openManageWallets,
  readAnalyticsTotals,
  waitForTotalsChange,
} from "./helpers";
import { SEEDED_BILL, SEEDED_WALLET, cleanupTestData, seedTestData } from "./seed";

/**
 * Cascading-deletion contract.
 *
 * Deleting a wallet or a bill must never leave the app in an inconsistent
 * state: related transactions are removed or explicitly preserved, and the
 * analytics aggregates (income / expenses / net cash flow) recompute
 * immediately so the dashboard never shows stale money.
 */
test.describe("cascading deletion and analytics aggregates", () => {
  test.skip(!hasCredentials, missingCredentialsMessage);

  test.beforeAll(async () => {
    await seedTestData();
  });
  test.afterEach(async () => {
    // Each case mutates fixtures, so re-provision a clean set.
    await seedTestData();
  });
  test.afterAll(async () => {
    await cleanupTestData();
  });

  test("deleting a wallet resolves its transactions and updates the totals", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));

    await login(page);
    await gotoAnalytics(page);
    await page
      .getByTestId("range-toggle")
      .getByRole("button", { name: /this month/i })
      .click();

    const before = await readAnalyticsTotals(page);
    // The seeded fixture guarantees both an income and an expense this month.
    expect(before.income).toBeGreaterThan(0);
    expect(before.expenses).toBeGreaterThan(0);
    expect(before.netFlow).toBe(before.income - before.expenses);

    // Capture the transactions attached to the wallet before it disappears.
    await page.getByRole("link", { name: /home/i }).click();
    await page
      .getByText(/all transactions|view all/i)
      .first()
      .click();
    const list = page.getByRole("dialog", { name: /all transactions/i });
    await expect(list).toBeVisible();
    const relatedBefore = await list.getByText(SEEDED_WALLET, { exact: false }).count();
    expect(relatedBefore).toBeGreaterThan(0);
    await list
      .getByRole("button", { name: /close|back to home/i })
      .first()
      .click();

    // Delete the wallet through the shared confirmation dialog.
    await openManageWallets(page);
    const trigger = page.getByRole("button", { name: `Delete ${SEEDED_WALLET}` });
    await expect(trigger).toBeVisible({ timeout: 20_000 });
    await trigger.click();

    const dialog = page.getByTestId("confirm-delete");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(/cannot be undone/i);
    await dialog.getByRole("button", { name: /delete account/i }).click();

    // The wallet is gone from the management list.
    await expect(page.getByRole("button", { name: `Delete ${SEEDED_WALLET}` })).toHaveCount(0, {
      timeout: 20_000,
    });

    // Related transactions are either cascaded away or kept as orphan history —
    // both are acceptable, but they must never point at a live wallet again and
    // the balance breakdown must not resurrect the deleted account.
    await page.getByRole("link", { name: /home/i }).click();
    await page
      .getByText(/all transactions|view all/i)
      .first()
      .click();
    const listAfter = page.getByRole("dialog", { name: /all transactions/i });
    await expect(listAfter).toBeVisible();
    const relatedAfter = await listAfter.getByText(SEEDED_WALLET, { exact: false }).count();
    expect(relatedAfter).toBeLessThanOrEqual(relatedBefore);
    await listAfter
      .getByRole("button", { name: /close|back to home/i })
      .first()
      .click();

    await page.getByRole("link", { name: /wallets/i }).click();
    await expect(page.getByText(SEEDED_WALLET, { exact: false })).toHaveCount(0);

    // Aggregates stay internally consistent: net flow always equals income minus
    // expenses, and neither total can grow after a deletion.
    await gotoAnalytics(page);
    await page
      .getByTestId("range-toggle")
      .getByRole("button", { name: /this month/i })
      .click();
    const after = await readAnalyticsTotals(page);
    expect(after.netFlow).toBe(after.income - after.expenses);
    expect(after.income).toBeLessThanOrEqual(before.income);
    expect(after.expenses).toBeLessThanOrEqual(before.expenses);

    expect(errors).toEqual([]);
  });

  test("deleting a transaction immediately recomputes income, expenses and net flow", async ({
    page,
  }) => {
    await login(page);
    await gotoAnalytics(page);
    await page
      .getByTestId("range-toggle")
      .getByRole("button", { name: /this month/i })
      .click();
    const before = await readAnalyticsTotals(page);

    // Remove the seeded income transaction from the all-transactions sheet.
    await page.getByRole("link", { name: /home/i }).click();
    await page
      .getByText(/all transactions|view all/i)
      .first()
      .click();
    const list = page.getByRole("dialog", { name: /all transactions/i });
    await expect(list).toBeVisible();

    const deleteIncome = list.getByRole("button", { name: /Delete .*income this month/i }).first();
    await expect(deleteIncome).toBeVisible({ timeout: 20_000 });
    await deleteIncome.click();

    const confirm = page.getByTestId("confirm-delete");
    if (await confirm.isVisible().catch(() => false)) {
      await confirm
        .getByRole("button", { name: /delete/i })
        .last()
        .click();
    }
    await expect(list.getByText(/income this month/i)).toHaveCount(0, { timeout: 20_000 });
    await list
      .getByRole("button", { name: /close|back to home/i })
      .first()
      .click();

    await gotoAnalytics(page);
    await page
      .getByTestId("range-toggle")
      .getByRole("button", { name: /this month/i })
      .click();
    const after = await waitForTotalsChange(page, before);

    // Only the income side moved, and net cash flow followed it exactly.
    expect(after.income).toBeLessThan(before.income);
    expect(after.expenses).toBe(before.expenses);
    expect(after.netFlow).toBe(after.income - after.expenses);
    expect(before.income - after.income).toBe(before.netFlow - after.netFlow);
  });

  test("deleting a bill removes it everywhere without disturbing the aggregates", async ({
    page,
  }) => {
    await login(page);
    await gotoAnalytics(page);
    await page
      .getByTestId("range-toggle")
      .getByRole("button", { name: /this month/i })
      .click();
    const before = await readAnalyticsTotals(page);

    await openManageBills(page);
    const trigger = page.getByRole("button", { name: `Delete ${SEEDED_BILL}` });
    await expect(trigger).toBeVisible({ timeout: 20_000 });
    await trigger.click();

    const dialog = page.getByTestId("confirm-delete");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: /delete bill/i }).click();
    await expect(page.getByRole("button", { name: `Delete ${SEEDED_BILL}` })).toHaveCount(0, {
      timeout: 20_000,
    });

    // The bill is gone from the upcoming/due surfaces too.
    await page.getByRole("link", { name: /home/i }).click();
    await expect(page.getByText(SEEDED_BILL, { exact: false })).toHaveCount(0);

    // Bills are forecasts, not booked transactions: analytics money is untouched.
    await gotoAnalytics(page);
    await page
      .getByTestId("range-toggle")
      .getByRole("button", { name: /this month/i })
      .click();
    const after = await readAnalyticsTotals(page);
    expect(after).toEqual(before);
    expect(after.netFlow).toBe(after.income - after.expenses);
  });
});
