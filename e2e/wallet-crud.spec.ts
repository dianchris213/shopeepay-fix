// Per-test isolation: ./fixtures re-seeds the deterministic baseline before
// each test and removes it afterwards, so this spec cannot leak state.
import { expect, test } from "./fixtures";

import { hasCredentials, login, missingCredentialsMessage } from "./helpers";
import { SEED_PREFIX, cleanupTestData, seedTestData } from "./seed";

const walletName = `${SEED_PREFIX} Ad-hoc ${Date.now()}`;

// Keep this spec isolated: re-provision fixtures before and clean up after.
test.beforeAll(async () => {
  if (hasCredentials) await seedTestData();
});
test.afterAll(async () => {
  if (hasCredentials) await cleanupTestData();
});

test("creates and deletes a wallet with a confirmation modal", async ({ page }) => {
  test.skip(!hasCredentials, missingCredentialsMessage);
  await login(page);

  // Create
  await page.getByRole("link", { name: /wallets/i }).click();
  await page.getByRole("button", { name: /add account/i }).click();
  await page.getByPlaceholder(/Mandiri, GoPay/i).fill(walletName);
  await page.getByRole("button", { name: /^create account$/i }).click();
  await expect(page.getByText(walletName).first()).toBeVisible({ timeout: 20_000 });

  // Delete through the reusable confirmation dialog
  await page.getByRole("link", { name: /settings/i }).click();
  await page
    .getByText(/manage wallets & accounts/i)
    .first()
    .click();
  await page.getByRole("button", { name: `Delete ${walletName}` }).click();

  const dialog = page.getByTestId("confirm-delete");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(/cannot be undone/i);

  // Cancel keeps the wallet.
  await dialog.getByRole("button", { name: /^cancel$/i }).click();
  await expect(dialog).toHaveCount(0);

  await page.getByRole("button", { name: `Delete ${walletName}` }).click();
  await page
    .getByTestId("confirm-delete")
    .getByRole("button", { name: /delete account/i })
    .click();
  await expect(page.getByRole("button", { name: `Delete ${walletName}` })).toHaveCount(0, {
    timeout: 20_000,
  });
});
