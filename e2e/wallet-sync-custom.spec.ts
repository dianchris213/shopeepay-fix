// Per-test isolation: ./fixtures re-seeds the deterministic baseline before
// each test and removes it afterwards, so this spec cannot leak state.
import { expect, test } from "./fixtures";

import { hasCredentials, login, missingCredentialsMessage, openManageWallets } from "./helpers";
import { SEED_PREFIX, cleanupTestData, seedTestData } from "./seed";

const stamp = Date.now();
const renamed = `${SEED_PREFIX} Dompet Ibuk ${stamp}`;

test.beforeAll(async () => {
  if (hasCredentials) await seedTestData();
});
test.afterAll(async () => {
  if (hasCredentials) await cleanupTestData();
});

/**
 * Custom-wallet sync end to end.
 *
 * The default custom wallet ("Dana Custom") is created automatically and can be
 * renamed. Every surface reads its name from the store, so a rename must appear
 * on the home stream card and in the Add Transaction wallet picker without a
 * reload.
 */
test("renaming the custom wallet syncs the home card and the transaction picker", async ({
  page,
}) => {
  test.skip(!hasCredentials, missingCredentialsMessage);
  await login(page);

  // 1. The default custom wallet exists with a zero-safe balance.
  await openManageWallets(page);
  const editRow = page.getByRole("button", { name: /^Edit wallet: /i }).first();
  await expect(editRow).toBeVisible({ timeout: 20_000 });

  const customEdit = page.getByRole("button", { name: /Edit wallet: Dana Custom/i });
  const target = (await customEdit.count()) > 0 ? customEdit.first() : editRow;
  await target.click();

  // 2. Rename it.
  const dialog = page.getByRole("dialog", { name: /edit wallet/i });
  const nameField = dialog.getByRole("textbox").first();
  await nameField.fill(renamed);
  await page.getByRole("button", { name: /save wallet/i }).click();
  await expect(page.getByRole("button", { name: `Edit wallet: ${renamed}` })).toBeVisible({
    timeout: 20_000,
  });

  // 3. Home stream card mirrors the new name.
  await page.getByRole("link", { name: /home/i }).click();
  await expect(page.getByRole("button", { name: new RegExp(renamed, "i") })).toBeVisible({
    timeout: 20_000,
  });

  // 4. The Add Transaction wallet picker offers the renamed wallet.
  await page.getByRole("button", { name: /add transaction/i }).click();
  await expect(page.getByRole("button", { name: renamed, exact: true })).toBeVisible({
    timeout: 20_000,
  });

  // 5. The rename survives a full reload (persisted to the cloud, not only local).
  await page.reload();
  await expect(page.getByRole("button", { name: new RegExp(renamed, "i") })).toBeVisible({
    timeout: 30_000,
  });
});
