// Per-test isolation: ./fixtures re-seeds the deterministic baseline before
// each test and removes it afterwards, so this spec cannot leak state.
import { expect, test } from "./fixtures";

import { hasCredentials, login, missingCredentialsMessage, openManageWallets } from "./helpers";
import { cleanupTestData, seedTestData } from "./seed";

/**
 * Driver COD overflow without a Cash wallet.
 *
 * A COD booking larger than the remaining Shopeepay balance pushes the
 * surplus into the Cash wallet. When the user has no Cash wallet the surplus
 * has nowhere to land, so the app must refuse the booking up front and tell
 * the user to create one — never silently swallow the overflow.
 */
test.beforeAll(async () => {
  if (hasCredentials) await seedTestData();
});
test.afterAll(async () => {
  if (hasCredentials) await cleanupTestData();
});

test("refuses a COD overflow when no Cash wallet exists", async ({ page }) => {
  test.skip(!hasCredentials, missingCredentialsMessage);
  await login(page);

  // 1. Guarantee there is no Cash wallet to absorb the overflow.
  await openManageWallets(page);
  const cashDelete = page.getByRole("button", { name: /^Delete (Cash|Dompet Tunai)$/i });
  if ((await cashDelete.count()) > 0) {
    await cashDelete.first().click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: /delete/i })
      .click();
    await expect(cashDelete).toHaveCount(0, { timeout: 20_000 });
  }

  // 2. Give Shopeepay a small positive balance so the booking crosses zero.
  await page.getByRole("link", { name: /settings/i }).click();
  await page.getByText("Shopeepay", { exact: true }).first().click();
  const manual = page.getByRole("textbox", { name: /set balance manually/i });
  await expect(manual).toBeVisible({ timeout: 20_000 });
  await manual.fill("20000");
  await page.getByRole("button", { name: /save balance/i }).click();
  await expect(page.getByText(/balance updated/i).first()).toBeVisible({ timeout: 20_000 });
  await page.keyboard.press("Escape");

  // 3. A COD larger than that balance is blocked before any confirmation.
  await page.getByRole("link", { name: /home/i }).click();
  await page.getByRole("button", { name: /add transaction/i }).click();
  await page.getByRole("button", { name: /^income$/i }).click();
  await page
    .getByRole("button", { name: /^driver cod$/i })
    .first()
    .click();
  await page.getByRole("textbox", { name: /amount in rupiah/i }).fill("50000");
  await page.getByRole("button", { name: /save transaction/i }).click();

  const cashRequired = page.getByTestId("cod-cash-required");
  await expect(cashRequired).toBeVisible();
  await expect(cashRequired).toHaveAttribute("aria-modal", "true");
  await expect(cashRequired).toContainText(/cash wallet/i);
  // The deduction confirmation must never appear for a blocked booking.
  await expect(page.getByTestId("cod-confirm")).toHaveCount(0);

  await cashRequired.getByRole("button", { name: /got it/i }).click();
  await expect(cashRequired).toHaveCount(0);

  // 4. Nothing was booked.
  await page.keyboard.press("Escape");
  await page.getByRole("link", { name: /transactions/i }).click();
  await expect(page.getByText(/^driver cod$/i)).toHaveCount(0, { timeout: 20_000 });
});
