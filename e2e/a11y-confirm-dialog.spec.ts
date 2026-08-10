import { expect, test } from "@playwright/test";

import { hasCredentials, login, missingCredentialsMessage } from "./helpers";
import { SEEDED_WALLET } from "./seed";

/**
 * Accessibility contract for the reusable destructive-action confirmation:
 * correct ARIA semantics, focus trapping, keyboard operation and focus restore.
 */
test.describe("ConfirmDeleteDialog accessibility", () => {
  test.skip(!hasCredentials, missingCredentialsMessage);

  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.getByRole("link", { name: /settings/i }).click();
    await page
      .getByText(/manage wallets & accounts/i)
      .first()
      .click();
    await expect(page.getByRole("button", { name: `Delete ${SEEDED_WALLET}` })).toBeVisible({
      timeout: 20_000,
    });
  });

  test("exposes alertdialog semantics and traps focus", async ({ page }) => {
    const trigger = page.getByRole("button", { name: `Delete ${SEEDED_WALLET}` });
    await trigger.click();

    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute("aria-modal", "true");
    await expect(dialog).toHaveAttribute("aria-label", /.+/);
    await expect(dialog).toHaveAttribute("aria-describedby", /.+/);

    // The description referenced by aria-describedby must exist and be readable.
    const describedBy = await dialog.getAttribute("aria-describedby");
    await expect(page.locator(`#${describedBy}`)).toHaveText(/.{10,}/);

    // Focus lands on the safe (Cancel) action when the dialog opens.
    const cancel = dialog.getByRole("button", { name: /^cancel$/i });
    const confirm = dialog.getByRole("button", { name: /delete account/i });
    await expect(cancel).toBeFocused();

    // Tab cycles between the two dialog actions and never escapes the panel.
    await page.keyboard.press("Tab");
    await expect(confirm).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(cancel).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(confirm).toBeFocused();

    // Every focusable element while open lives inside the dialog.
    const inside = await page.evaluate(() => {
      const panel = document.querySelector('[role="alertdialog"]');
      return panel?.contains(document.activeElement) ?? false;
    });
    expect(inside).toBe(true);
  });

  test("closes with Escape without deleting and restores focus", async ({ page }) => {
    const trigger = page.getByRole("button", { name: `Delete ${SEEDED_WALLET}` });
    await trigger.click();
    await expect(page.getByRole("alertdialog")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByRole("alertdialog")).toHaveCount(0);

    // Nothing was deleted and focus returned to the triggering control.
    await expect(trigger).toBeVisible();
    await expect(trigger).toBeFocused();
  });

  test("cancel via keyboard leaves the record intact", async ({ page }) => {
    const trigger = page.getByRole("button", { name: `Delete ${SEEDED_WALLET}` });
    await trigger.click();

    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText(/cannot be undone/i);
    await page.keyboard.press("Enter"); // Cancel is focused by default.

    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await expect(trigger).toBeVisible();
  });
});
