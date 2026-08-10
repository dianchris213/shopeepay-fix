// Per-test isolation: ./fixtures re-seeds the deterministic baseline before
// each test and removes it afterwards, so this spec cannot leak state.
import { expect, test } from "./fixtures";

import { hasCredentials, login, missingCredentialsMessage, openManageCategories } from "./helpers";
import { SEED_PREFIX, cleanupTestData, seedTestData } from "./seed";

/**
 * Custom-wallet category isolation.
 *
 * A category created while a custom wallet scope is selected belongs to that
 * wallet alone. It must never appear in the "System (all wallets)" list — the
 * regression this spec locks down — and it must survive a reload with its
 * scope intact (the cloud round-trip used to drop the association).
 */
const stamp = Date.now();
const created = `${SEED_PREFIX} Kategori ${stamp}`;
const renamed = `${created} Edit`;

test.beforeAll(async () => {
  if (hasCredentials) await seedTestData();
});
test.afterAll(async () => {
  if (hasCredentials) await cleanupTestData();
});

test("categories created in a custom wallet never leak into the system list", async ({ page }) => {
  test.skip(!hasCredentials, missingCredentialsMessage);
  await login(page);
  await openManageCategories(page);

  const scope = page.getByRole("group", { name: /category list/i });
  await expect(scope).toBeVisible({ timeout: 20_000 });

  const systemChip = scope.getByRole("button", { name: /system \(all wallets\)/i });
  const customChip = scope.getByRole("button").nth(1);
  const customName = ((await customChip.textContent()) ?? "").trim();
  expect(customName.length).toBeGreaterThan(0);

  // 1. Create inside the custom wallet scope.
  await customChip.click();
  await expect(page.getByText(/belong to this custom wallet only/i)).toBeVisible();
  await page.getByRole("button", { name: /add new category/i }).click();
  await page.getByRole("textbox", { name: /new category name/i }).fill(created);
  await page.getByRole("button", { name: /save new category/i }).click();
  await expect(page.getByText(created, { exact: true })).toBeVisible({ timeout: 20_000 });

  // 2. The system scope must stay clean.
  await systemChip.click();
  await expect(page.getByText(created, { exact: true })).toHaveCount(0);

  // 3. Back in its own scope it is still there, and it survives a reload.
  await customChip.click();
  await expect(page.getByText(created, { exact: true })).toBeVisible();

  await page.reload();
  await openManageCategories(page);
  await page
    .getByRole("group", { name: /category list/i })
    .getByRole("button")
    .nth(1)
    .click();
  await expect(page.getByText(created, { exact: true })).toBeVisible({ timeout: 30_000 });
  await page
    .getByRole("group", { name: /category list/i })
    .getByRole("button", { name: /system \(all wallets\)/i })
    .click();
  await expect(page.getByText(created, { exact: true })).toHaveCount(0);

  // 4. Editing keeps the scope.
  await page
    .getByRole("group", { name: /category list/i })
    .getByRole("button")
    .nth(1)
    .click();
  await page.getByRole("button", { name: `Edit ${created}` }).click();
  await page.getByRole("textbox", { name: /^category name$/i }).fill(renamed);
  await page.getByRole("button", { name: /save category/i }).click();
  await expect(page.getByText(renamed, { exact: true })).toBeVisible({ timeout: 20_000 });
  await page
    .getByRole("group", { name: /category list/i })
    .getByRole("button", { name: /system \(all wallets\)/i })
    .click();
  await expect(page.getByText(renamed, { exact: true })).toHaveCount(0);

  // 5. Deleting removes it from its own scope only.
  await page
    .getByRole("group", { name: /category list/i })
    .getByRole("button")
    .nth(1)
    .click();
  await page.getByRole("button", { name: `Delete ${renamed}` }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: /delete/i })
    .click();
  await expect(page.getByText(renamed, { exact: true })).toHaveCount(0, { timeout: 20_000 });
});
