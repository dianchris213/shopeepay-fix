// Per-test isolation: ./fixtures re-seeds the deterministic baseline before
// each test and removes it afterwards, so this spec cannot leak state.
import { expect, test } from "./fixtures";

import {
  gotoAnalytics,
  hasCredentials,
  login,
  missingCredentialsMessage,
  openManageWallets,
  readAnalyticsTotals,
} from "./helpers";
import { SEED_PREFIX, cleanupTestData, seedTestData } from "./seed";

const stamp = Date.now();
const originalName = `${SEED_PREFIX} Cycle ${stamp}`;
const renamedName = `${SEED_PREFIX} Cycle Renamed ${stamp}`;
const note = `full-cycle-${stamp}`;
const AMOUNT = 37_500;

test.beforeAll(async () => {
  if (hasCredentials) await seedTestData();
});
test.afterAll(async () => {
  if (hasCredentials) await cleanupTestData();
});

/**
 * Full transaction workflow, exactly as a user experiences it:
 *
 *   create wallet -> rename it -> hard reload -> add a transaction from the
 *   renamed wallet -> verify the amount, the wallet label and the analytics
 *   totals -> reload again and verify everything persisted to the cloud.
 *
 * This is the regression net for "renamed wallet loses its link" and for
 * "the balance is right on screen but wrong after a refresh".
 */
test("rename a wallet, reload, spend from it and verify balances everywhere", async ({ page }) => {
  test.skip(!hasCredentials, missingCredentialsMessage);
  test.slow();
  await login(page);

  // 1. Create the wallet with a known starting balance.
  await page.getByRole("link", { name: /wallets/i }).click();
  await page.getByRole("button", { name: /add account/i }).click();
  await page.getByPlaceholder(/Mandiri, GoPay/i).fill(originalName);
  await page.getByRole("button", { name: /^create account$/i }).click();
  await expect(page.getByText(originalName).first()).toBeVisible({ timeout: 20_000 });

  // 2. Rename it from Settings → Manage Wallets.
  await openManageWallets(page);
  await page.getByRole("button", { name: `Edit wallet: ${originalName}` }).click();
  const dialog = page.getByRole("dialog", { name: /edit wallet/i });
  await dialog.getByRole("textbox").first().fill(renamedName);
  await page.getByRole("button", { name: /save wallet/i }).click();
  await expect(page.getByRole("button", { name: `Edit wallet: ${renamedName}` })).toBeVisible({
    timeout: 20_000,
  });

  // 3. Hard reload: the rename must come back from the cloud, not local state.
  await page.reload();
  await expect(page.getByRole("link", { name: /analytics/i })).toBeVisible({ timeout: 30_000 });

  // 4. Baseline analytics totals before spending.
  await gotoAnalytics(page);
  const before = await readAnalyticsTotals(page);

  // 5. Add an expense from the renamed wallet.
  await page.getByRole("link", { name: /home/i }).click();
  await page.getByRole("button", { name: /add transaction/i }).click();
  await page.getByLabel(/amount in rupiah/i).fill(String(AMOUNT));
  await page
    .getByRole("button", { name: /food|makan/i })
    .first()
    .click();
  await page.getByRole("button", { name: renamedName, exact: true }).click();
  await page.getByPlaceholder(/optional|opsional/i).fill(note);
  await page.getByRole("button", { name: /save transaction/i }).click();

  // 6. The transaction is listed under the renamed wallet.
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
  const list = await openList();
  const row = list.getByText(note, { exact: false }).first();
  await expect(row).toBeVisible({ timeout: 20_000 });
  await expect(list.getByText(renamedName, { exact: false }).first()).toBeVisible();
  await expect(list.getByText(originalName, { exact: false })).toHaveCount(0);
  await list
    .getByRole("button", { name: /close|back to home/i })
    .first()
    .click();

  // 7. Analytics reflects exactly the amount that was spent.
  await gotoAnalytics(page);
  await expect
    .poll(async () => (await readAnalyticsTotals(page)).expenses, { timeout: 20_000 })
    .toBe(before.expenses + AMOUNT);
  const after = await readAnalyticsTotals(page);
  expect(after.netFlow).toBe(before.netFlow - AMOUNT);
  expect(after.income).toBe(before.income);

  // 8. Everything survives a second full reload (persisted, not cached in memory).
  await page.reload();
  await expect(page.getByTestId("an-total-spent")).toBeVisible({ timeout: 30_000 });
  const reloaded = await readAnalyticsTotals(page);
  expect(reloaded).toEqual(after);

  const listAgain = await openList();
  await expect(listAgain.getByText(note, { exact: false }).first()).toBeVisible({
    timeout: 20_000,
  });
  await expect(listAgain.getByText(renamedName, { exact: false }).first()).toBeVisible();
});

/**
 * The Save button is a one-shot: a double tap must never create two rows.
 */
test("double-tapping save creates exactly one transaction", async ({ page }) => {
  test.skip(!hasCredentials, missingCredentialsMessage);
  await login(page);

  const dupeNote = `double-tap-${Date.now()}`;
  await page.getByRole("button", { name: /add transaction/i }).click();
  await page.getByLabel(/amount in rupiah/i).fill("12000");
  await page
    .getByRole("button", { name: /food|makan/i })
    .first()
    .click();
  await page
    .getByRole("button", { name: /^Cash$|dana|wallet/i })
    .first()
    .click();
  await page.getByPlaceholder(/optional|opsional/i).fill(dupeNote);

  const save = page.getByRole("button", { name: /save transaction/i });
  await save.click({ clickCount: 2, delay: 10 });

  await page.getByRole("link", { name: /home/i }).click();
  await page
    .getByText(/all transactions|view all/i)
    .first()
    .click();
  const list = page.getByRole("dialog", { name: /all transactions/i });
  await expect(list.getByText(dupeNote, { exact: false }).first()).toBeVisible({ timeout: 20_000 });
  await expect(list.getByText(dupeNote, { exact: false })).toHaveCount(1);
});
