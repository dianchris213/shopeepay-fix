import { type Page } from "@playwright/test";
// Per-test isolation: ./fixtures re-seeds the deterministic baseline before
// each test and removes it afterwards, so this spec cannot leak state.
import { expect, test } from "./fixtures";

import { hasCredentials, login, missingCredentialsMessage, openManageWallets } from "./helpers";
import { SEED_PREFIX, cleanupTestData, seedTestData } from "./seed";

const stamp = Date.now();
const renamed = `${SEED_PREFIX} Kas Harian ${stamp}`;

test.beforeAll(async () => {
  if (hasCredentials) await seedTestData();
});
test.afterAll(async () => {
  if (hasCredentials) await cleanupTestData();
});

/** Assert the custom-wallet name on all three surfaces that read it. */
async function assertNameEverywhere(page: Page, name: string) {
  // 1. Home stream card.
  await page.getByRole("link", { name: /home/i }).click();
  await expect(page.getByRole("button", { name: new RegExp(name, "i") })).toBeVisible({
    timeout: 30_000,
  });

  // 2. Wallet Source selector inside Add Transaction.
  await page.getByRole("button", { name: /add transaction/i }).click();
  await expect(page.getByRole("button", { name, exact: true })).toBeVisible({ timeout: 20_000 });
  await page.keyboard.press("Escape");

  // 3. Manage Wallets list.
  await openManageWallets(page);
  await expect(page.getByRole("button", { name: `Edit wallet: ${name}` })).toBeVisible({
    timeout: 20_000,
  });
}

/**
 * Custom-wallet persistence across a hard reload.
 *
 * A rename is written to the backend, not just to local state, so rehydrating
 * the app from scratch must show the new name on every surface: the Home stream
 * card, the Manage Wallets list, and the Add Transaction wallet picker.
 */
test("custom wallet rename survives a full reload and stays synced everywhere", async ({
  page,
}) => {
  test.skip(!hasCredentials, missingCredentialsMessage);
  await login(page);

  // Rename the default custom wallet ("Dana Custom").
  await openManageWallets(page);
  const customEdit = page.getByRole("button", { name: /Edit wallet: Dana Custom/i });
  const anyEdit = page.getByRole("button", { name: /^Edit wallet: /i }).first();
  await expect(anyEdit).toBeVisible({ timeout: 20_000 });
  const target = (await customEdit.count()) > 0 ? customEdit.first() : anyEdit;
  await target.click();

  const dialog = page.getByRole("dialog", { name: /edit wallet/i });
  await dialog.getByRole("textbox").first().fill(renamed);
  await page.getByRole("button", { name: /save wallet/i }).click();
  await expect(page.getByRole("button", { name: `Edit wallet: ${renamed}` })).toBeVisible({
    timeout: 20_000,
  });

  // Synced before the reload…
  await assertNameEverywhere(page, renamed);

  // …and after a full browser reload (state hydrated from the backend).
  await page.reload();
  await expect(page.getByRole("link", { name: /analytics/i })).toBeVisible({ timeout: 30_000 });
  await assertNameEverywhere(page, renamed);

  // The old default label is gone from every surface.
  await page.getByRole("link", { name: /home/i }).click();
  await expect(page.getByText("Dana Custom", { exact: true })).toHaveCount(0);
});
