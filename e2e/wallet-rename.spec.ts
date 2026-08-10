// Per-test isolation: ./fixtures re-seeds the deterministic baseline before
// each test and removes it afterwards, so this spec cannot leak state.
import { expect, test } from "./fixtures";

import { hasCredentials, login, missingCredentialsMessage, openManageWallets } from "./helpers";
import { SEED_PREFIX, cleanupTestData, seedTestData } from "./seed";

const stamp = Date.now();
const originalName = `${SEED_PREFIX} Rename ${stamp}`;
const renamedName = `${SEED_PREFIX} Renamed ${stamp}`;
const note = `rename-check-${stamp}`;

test.beforeAll(async () => {
  if (hasCredentials) await seedTestData();
});
test.afterAll(async () => {
  if (hasCredentials) await cleanupTestData();
});

/**
 * Renaming a wallet must not orphan its transactions: the rows are linked by
 * wallet id, so the list keeps showing them under the new label.
 */
test("keeps past transactions linked after a wallet rename", async ({ page }) => {
  test.skip(!hasCredentials, missingCredentialsMessage);
  await login(page);

  // 1. Create the wallet.
  await page.getByRole("link", { name: /wallets/i }).click();
  await page.getByRole("button", { name: /add account/i }).click();
  await page.getByPlaceholder(/Mandiri, GoPay/i).fill(originalName);
  await page.getByRole("button", { name: /^create account$/i }).click();
  await expect(page.getByText(originalName).first()).toBeVisible({ timeout: 20_000 });

  // 2. Add an expense paid from that wallet.
  await page.getByRole("button", { name: /add transaction/i }).click();
  await page.getByLabel(/amount in rupiah/i).fill("25000");
  await page
    .getByRole("button", { name: /food|makan/i })
    .first()
    .click();
  await page.getByRole("button", { name: originalName, exact: true }).click();
  await page.getByPlaceholder(/optional|opsional/i).fill(note);
  await page.getByRole("button", { name: /save transaction/i }).click();

  const openList = async () => {
    await page.getByRole("link", { name: /home/i }).click();
    await page
      .getByText(/all transactions|view all/i)
      .first()
      .click();
    const list = page.getByRole("dialog", { name: /all transactions/i });
    await expect(list).toBeVisible();
    return list;
  };
  const closeList = async () =>
    page
      .getByRole("dialog", { name: /all transactions/i })
      .getByRole("button", { name: /close|back to home/i })
      .first()
      .click();

  const listBefore = await openList();
  await expect(listBefore.getByText(originalName, { exact: false }).first()).toBeVisible({
    timeout: 20_000,
  });
  const countBefore = await listBefore.getByText(originalName, { exact: false }).count();
  expect(countBefore).toBeGreaterThan(0);
  await closeList();

  // 3. Rename the wallet.
  await openManageWallets(page);
  await page.getByRole("button", { name: `Edit wallet: ${originalName}` }).click();
  const nameField = page
    .getByRole("dialog", { name: /edit wallet/i })
    .getByRole("textbox")
    .first();
  await nameField.fill(renamedName);
  await page.getByRole("button", { name: /save wallet/i }).click();
  await expect(page.getByRole("button", { name: `Edit wallet: ${renamedName}` })).toBeVisible({
    timeout: 20_000,
  });

  // 4. The transaction survives and now shows the new wallet label.
  const listAfter = await openList();
  await expect(listAfter.getByText(note, { exact: false }).first()).toBeVisible({
    timeout: 20_000,
  });
  const relabelled = await listAfter.getByText(renamedName, { exact: false }).count();
  expect(relabelled).toBe(countBefore);
  await expect(listAfter.getByText(originalName, { exact: false })).toHaveCount(0);
  await closeList();

  // 5. The link is by id, so filtering by the renamed wallet still finds it.
  await page.getByRole("link", { name: /wallets/i }).click();
  await expect(page.getByText(renamedName).first()).toBeVisible();
});
