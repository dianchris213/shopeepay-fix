import { expect, test } from "@playwright/test";

import {
  gotoAnalytics,
  hasCredentials,
  login,
  missingCredentialsMessage,
  openManageWallets,
  stabilizeForScreenshot,
} from "./helpers";
import { SEEDED_WALLET } from "./seed";

/**
 * Lightweight visual-regression baseline.
 *
 * Baselines live in `e2e/__screenshots__/` and are committed to the repo.
 * Regenerate them deliberately with:  bun run test:e2e:update
 *
 * Volatile pixels (currency figures, chart geometry) are masked so the check
 * catches layout/styling breakage rather than data churn.
 */
test.describe("visual regression", () => {
  test.skip(!hasCredentials, missingCredentialsMessage);

  test("analytics dashboard matches its baseline", async ({ page }) => {
    await login(page);
    await gotoAnalytics(page);

    // Pin the window so the rendered range label is deterministic.
    const toggle = page.getByTestId("range-toggle");
    await toggle.getByRole("button", { name: /this month/i }).click();
    await expect(toggle.getByRole("button", { name: /this month/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await stabilizeForScreenshot(page);

    const mask = [
      page.getByTestId("an-total-spent"),
      page.getByTestId("an-delta"),
      page.getByTestId("an-income"),
      page.getByTestId("an-expenses"),
      page.getByTestId("an-netflow"),
      page.locator(".recharts-responsive-container"),
    ];

    await expect(page).toHaveScreenshot("analytics-dashboard.png", {
      fullPage: true,
      mask,
      maxDiffPixelRatio: 0.02,
    });
  });

  test("analytics summary card matches its baseline", async ({ page }) => {
    await login(page);
    await gotoAnalytics(page);
    await stabilizeForScreenshot(page);

    const hero = page.getByTestId("an-total-spent").locator("xpath=ancestor::section[1]");

    await expect(hero).toHaveScreenshot("analytics-summary-card.png", {
      mask: [
        page.getByTestId("an-total-spent"),
        page.getByTestId("an-delta"),
        page.getByTestId("an-income"),
        page.getByTestId("an-expenses"),
        page.getByTestId("an-netflow"),
      ],
      maxDiffPixelRatio: 0.02,
    });
  });

  test("ConfirmDeleteDialog matches its baseline", async ({ page }) => {
    await login(page);
    await openManageWallets(page);

    const trigger = page.getByRole("button", { name: `Delete ${SEEDED_WALLET}` });
    await expect(trigger).toBeVisible({ timeout: 20_000 });
    await trigger.click();

    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();
    await stabilizeForScreenshot(page);

    await expect(dialog).toHaveScreenshot("confirm-delete-dialog.png", {
      maxDiffPixelRatio: 0.02,
    });

    // Full-viewport variant captures the scrim/backdrop treatment too.
    await expect(page).toHaveScreenshot("confirm-delete-dialog-overlay.png", {
      maxDiffPixelRatio: 0.02,
    });

    // Leave the fixture untouched for the rest of the suite.
    await page.keyboard.press("Escape");
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
  });
});
