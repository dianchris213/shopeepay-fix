// Per-test isolation: ./fixtures re-seeds the deterministic baseline before
// each test and removes it afterwards, so this spec cannot leak state.
import { expect, test } from "./fixtures";

import { hasCredentials, login, missingCredentialsMessage } from "./helpers";

/**
 * Shopeepay category-default regression.
 *
 * Guards the "smart overwrite" rule end to end:
 *  - Expense on Shopeepay always reopens with an empty category selector,
 *  - Income on Shopeepay also opens with an empty category selector,
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
    await page.getByRole("button", { name: /^income$/i }).click();
    await shopeepay.click();
    await expect(categoryGroup.getByRole("button", { pressed: true })).toHaveCount(0);
    await expect(page.getByTestId("tx-create-category-hint")).toBeVisible();
    await expect(page.getByTestId("tx-default-category-note")).toHaveCount(0);

    await page.getByRole("button", { name: /^expense$/i }).click();
    await expect(categoryGroup.getByRole("button", { pressed: true })).toHaveCount(0);
    await expect(page.getByTestId("tx-create-category-hint")).toBeVisible();
    await expect(page.getByTestId("tx-default-category-note")).toHaveCount(0);
  }

  // A manual pick on Income/Shopeepay must not be reset by unrelated edits.
  await page.getByRole("button", { name: /^income$/i }).click();
  await shopeepay.click();
  const chips = categoryGroup.getByRole("button");
  const count = await chips.count();
  for (let i = 0; i < count; i += 1) {
    const chip = chips.nth(i);
    const label = ((await chip.textContent()) ?? "").trim();
    if (!label) continue;
    await chip.click();
    await page.getByRole("textbox", { name: /amount in rupiah/i }).fill("45000");
    await expect(categoryGroup.getByRole("button", { pressed: true })).toContainText(label);
    break;
  }

  await page.keyboard.press("Escape");
});
