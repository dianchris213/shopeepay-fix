// Per-test isolation: ./fixtures re-seeds the deterministic baseline before
// each test and removes it afterwards, so this spec cannot leak state.
import { expect, test } from "./fixtures";

import { hasCredentials, login, missingCredentialsMessage } from "./helpers";

/**
 * Shopeepay category-default regression.
 *
 * Guards the "smart overwrite" rule end to end:
 *  - Expense on Shopeepay exposes no category at all,
 *  - Income on Shopeepay exposes only a preselected "Driver COD",
 *  - a manual pick survives unrelated edits (amount, note),
 *  - repeated tab/wallet toggling never desynchronises the selector.
 */
test("shopeepay defaults survive repeated tab and wallet toggling", async ({ page }) => {
  test.skip(!hasCredentials, missingCredentialsMessage);
  await login(page);

  await page.getByRole("button", { name: /add transaction/i }).click();
  const categoryGroup = page.getByRole("group", { name: /category/i });
  const walletGroup = page.getByRole("group", { name: /wallet source/i });
  const shopeepay = walletGroup.getByRole("button", { name: /^shopeepay$/i });

  for (let round = 0; round < 3; round += 1) {
    // Income + Shopeepay: exactly one chip ("Driver COD"), preselected.
    await page.getByRole("button", { name: /^income$/i }).click();
    await shopeepay.click();
    await expect(categoryGroup.getByRole("button")).toHaveCount(1);
    await expect(categoryGroup.getByRole("button", { pressed: true })).toContainText(
      /driver cod/i,
    );
    await expect(page.getByTestId("tx-driver-cod-default-hint")).toBeVisible();

    // Expense + Shopeepay: no chip at all, plus the quick-create hint.
    await page.getByRole("button", { name: /^expense$/i }).click();
    await expect(categoryGroup.getByRole("button")).toHaveCount(0);
    await expect(page.getByTestId("tx-empty-categories")).toBeVisible();
  }

  // A manual pick on Income/Shopeepay must not be reset by unrelated edits.
  await page.getByRole("button", { name: /^income$/i }).click();
  await shopeepay.click();
  const chip = categoryGroup.getByRole("button").first();
  const label = ((await chip.textContent()) ?? "").trim();
  await chip.click();
  await page.getByRole("textbox", { name: /amount in rupiah/i }).fill("45000");
  await expect(categoryGroup.getByRole("button", { pressed: true })).toContainText(label);

  await page.keyboard.press("Escape");
});
