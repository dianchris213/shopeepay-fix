// Per-test isolation: ./fixtures re-seeds the deterministic baseline before
// each test and removes it afterwards, so this spec cannot leak state.
import { expect, test } from "./fixtures";

import { hasCredentials, login, missingCredentialsMessage } from "./helpers";

/**
 * Category filter + validation rules, end to end.
 *
 * Scenarios covered:
 *  - first open of Add Transaction shows no category until a wallet is picked,
 *  - Income + ShopeePay exposes exactly one chip ("Driver COD"), preselected,
 *  - Expense + ShopeePay exposes no chip and offers the Settings quick create,
 *  - submitting without a category is rejected with a toast + focused picker,
 *  - other wallets keep their normal category lists (rule is ShopeePay-only).
 */
async function openSheet(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: /add transaction/i }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
}

test("category filter and validation behave per wallet and per tab", async ({ page }) => {
  test.skip(!hasCredentials, missingCredentialsMessage);
  await login(page);
  await openSheet(page);

  const categoryGroup = page.getByRole("group", { name: /category|kategori/i });
  const walletGroup = page.getByRole("group", { name: /wallet source/i });
  const shopeepay = walletGroup.getByRole("button", { name: /^shopeepay$/i });

  // 1) No wallet picked yet → no chips at all, with an explicit prompt.
  await expect(categoryGroup.getByRole("button")).toHaveCount(0);
  await expect(page.getByTestId("tx-empty-categories")).toContainText(/pilih wallet source/i);

  // 2) Expense + ShopeePay → empty list + quick create link.
  await shopeepay.click();
  await expect(categoryGroup.getByRole("button")).toHaveCount(0);
  await expect(page.getByTestId("tx-empty-categories")).toContainText(
    /belum ada kategori untuk expense \+ shopeepay/i,
  );

  // 3) Submitting without a category is refused: inline error + toast.
  await page.getByRole("textbox", { name: /amount in rupiah/i }).fill("25000");
  await page.getByRole("button", { name: /save transaction|simpan/i }).click({ force: true });
  await expect(page.getByTestId("tx-category-required")).toBeVisible();
  await expect(page.getByRole("status").first()).toContainText(/kategori/i);

  // 4) Quick create opens the category manager on a fresh draft row.
  await page.getByTestId("tx-empty-categories-link").click();
  await expect(page.getByRole("textbox", { name: /new category name/i })).toBeVisible();
  await page.getByRole("button", { name: /cancel new category/i }).click();
  await page.getByRole("button", { name: /close/i }).first().click();

  // 5) Income + ShopeePay → only Driver COD, preselected.
  await openSheet(page);
  await page.getByRole("button", { name: /^income$|^pemasukan$/i }).click();
  await shopeepay.click();
  await expect(categoryGroup.getByRole("button")).toHaveCount(1);
  await expect(categoryGroup.getByRole("button", { pressed: true })).toContainText(/driver cod/i);
  await expect(page.getByTestId("tx-driver-cod-default-hint")).toBeVisible();

  // 6) Another wallet is untouched by the ShopeePay rule.
  const otherWallet = walletGroup.getByRole("button", { name: /^(?!shopeepay$).+/i }).first();
  await otherWallet.click();
  await expect(categoryGroup.getByRole("button").first()).toBeVisible();
  await page.getByRole("button", { name: /^expense$|^pengeluaran$/i }).click();
  await expect(categoryGroup.getByRole("button").first()).toBeVisible();
  await expect(categoryGroup.getByRole("button", { pressed: true })).toHaveCount(0);

  await page.keyboard.press("Escape");
});
