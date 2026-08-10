import { expect, test, type Page } from "@playwright/test";

import { hasCredentials, login, missingCredentialsMessage, openManageCategories } from "./helpers";

/**
 * Modal focus contract for sheets.
 *
 * Every sheet is a modal: focus moves into the panel on open, Tab cycles only
 * inside it, Escape closes the topmost layer (a nested alertdialog first), and
 * focus returns to the control that opened it.
 */
async function focusedInsideDialog(page: Page) {
  return page.evaluate(() =>
    Boolean(
      (document.activeElement as HTMLElement | null)?.closest(
        '[role="dialog"], [role="alertdialog"]',
      ),
    ),
  );
}

test.describe("sheet focus trap", () => {
  test.skip(!hasCredentials, missingCredentialsMessage);

  test("traps Tab inside an open sheet and restores focus on Escape", async ({ page }) => {
    await login(page);
    await page.getByRole("link", { name: /settings/i }).click();

    const trigger = page.getByText(/manage wallets & accounts/i).first();
    await trigger.click();
    await expect(page.getByRole("button", { name: /^Edit wallet: /i }).first()).toBeVisible({
      timeout: 20_000,
    });

    // Focus enters the panel and stays there across a full Tab cycle.
    for (let i = 0; i < 25; i += 1) {
      await page.keyboard.press("Tab");
      expect(await focusedInsideDialog(page)).toBe(true);
    }
    // Shift+Tab wraps backwards inside the panel too.
    for (let i = 0; i < 5; i += 1) {
      await page.keyboard.press("Shift+Tab");
      expect(await focusedInsideDialog(page)).toBe(true);
    }

    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: /^Edit wallet: /i })).toHaveCount(0, {
      timeout: 20_000,
    });
    await expect(trigger).toBeFocused();
  });

  test("a nested confirmation owns Escape before the sheet behind it", async ({ page }) => {
    await login(page);
    await openManageCategories(page);

    const addNew = page.getByRole("button", { name: /add new category/i });
    const deleteButton = page.getByRole("button", { name: /^Delete / }).first();
    await expect(deleteButton).toBeVisible({ timeout: 20_000 });
    await deleteButton.click();

    const confirm = page.getByRole("alertdialog");
    await expect(confirm).toBeVisible();
    expect(await focusedInsideDialog(page)).toBe(true);

    // Escape dismisses only the alertdialog; the sheet behind it stays open.
    await page.keyboard.press("Escape");
    await expect(confirm).toHaveCount(0);
    await expect(addNew).toBeVisible();

    // A second Escape closes the sheet itself.
    await page.keyboard.press("Escape");
    await expect(addNew).toHaveCount(0, { timeout: 20_000 });
  });
});
