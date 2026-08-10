import { expect, test } from "@playwright/test";

import {
  hasCredentials,
  login,
  missingCredentialsMessage,
  stabilizeForScreenshot,
} from "./helpers";
import { SEEDED_WALLET } from "./seed";

/**
 * Visual-regression baselines for the core shell (outside Analytics and the
 * ConfirmDeleteDialog, which live in visual-regression.spec.ts).
 *
 * Currency figures are masked: these snapshots guard layout, spacing and
 * styling, not data. Regenerate deliberately with `bun run test:e2e:update`.
 */
test.describe("visual regression — core screens", () => {
  test.skip(!hasCredentials, missingCredentialsMessage);

  test("wallets list matches its baseline", async ({ page }) => {
    await login(page);
    await page.getByRole("link", { name: /wallets/i }).click();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText(SEEDED_WALLET).first()).toBeVisible({ timeout: 20_000 });
    await stabilizeForScreenshot(page);

    // The account list section only (stable, independent of page scroll).
    const list = page.getByRole("list").first();
    await expect(list).toHaveScreenshot("wallets-list.png", {
      mask: [page.locator(".tabular-nums")],
      maxDiffPixelRatio: 0.02,
    });

    await expect(page).toHaveScreenshot("wallets-screen.png", {
      fullPage: true,
      mask: [page.locator(".tabular-nums")],
      maxDiffPixelRatio: 0.02,
    });
  });

  test("bills list matches its baseline", async ({ page }) => {
    await login(page);
    await page.getByRole("link", { name: /settings/i }).click();
    await page
      .getByText(/manage bills & installments/i)
      .first()
      .click();
    await expect(page.getByRole("button", { name: /^delete /i }).first()).toBeVisible({
      timeout: 20_000,
    });
    await stabilizeForScreenshot(page);

    await expect(page).toHaveScreenshot("bills-list.png", {
      mask: [page.locator(".tabular-nums")],
      maxDiffPixelRatio: 0.02,
    });
  });

  test("main navigation matches its baseline in every active state", async ({ page }) => {
    await login(page);

    const nav = page.getByRole("navigation").first();
    await expect(nav).toBeVisible();
    await stabilizeForScreenshot(page);
    await expect(nav).toHaveScreenshot("nav-home.png", { maxDiffPixelRatio: 0.02 });

    await page.getByRole("link", { name: /analytics/i }).click();
    await expect(page.getByTestId("an-total-spent")).toBeVisible();
    await stabilizeForScreenshot(page);
    await expect(nav).toHaveScreenshot("nav-analytics.png", { maxDiffPixelRatio: 0.02 });

    await page.getByRole("link", { name: /wallets/i }).click();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await stabilizeForScreenshot(page);
    await expect(nav).toHaveScreenshot("nav-wallets.png", { maxDiffPixelRatio: 0.02 });

    await page.getByRole("link", { name: /settings/i }).click();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await stabilizeForScreenshot(page);
    await expect(nav).toHaveScreenshot("nav-settings.png", { maxDiffPixelRatio: 0.02 });
  });
});
