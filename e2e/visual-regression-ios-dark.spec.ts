import { expect, test, type Page } from "@playwright/test";

import {
  gotoAnalytics,
  hasCredentials,
  login,
  missingCredentialsMessage,
  stabilizeForScreenshot,
} from "./helpers";

/**
 * iOS dark-mode visual regression (mobile-safari project, iPhone 14 Pro).
 *
 * Telegram iOS renders the Mini App in WebKit with dark mode forced, so this
 * suite pins the pixels of the surfaces users actually see there: home,
 * analytics and the Add Transaction sheet.
 *
 * Baselines live in e2e/__screenshots__/mobile-safari/ and are engine specific.
 * Regenerate deliberately:
 *   bunx playwright test --project=mobile-safari --update-snapshots
 */
test.use({ colorScheme: "dark" });

async function forceDarkTheme(page: Page) {
  await page.evaluate(() => {
    document.documentElement.classList.remove("light");
    document.documentElement.style.colorScheme = "dark";
  });
}

test.describe("iOS dark mode visual regression", () => {
  test.skip(!hasCredentials, missingCredentialsMessage);

  test("home screen matches the iOS dark baseline", async ({ page }) => {
    await login(page);
    await forceDarkTheme(page);
    await expect(page.getByTestId("stream-strip")).toBeVisible({ timeout: 20_000 });
    await stabilizeForScreenshot(page);

    // The safe-area aware shell must never produce horizontal overflow on iOS.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);

    await expect(page).toHaveScreenshot("ios-dark-home.png", {
      fullPage: true,
      mask: [page.locator(".tabular-nums")],
      maxDiffPixelRatio: 0.02,
    });
  });

  test("analytics matches the iOS dark baseline", async ({ page }) => {
    await login(page);
    await forceDarkTheme(page);
    await gotoAnalytics(page);
    await stabilizeForScreenshot(page);

    await expect(page).toHaveScreenshot("ios-dark-analytics.png", {
      fullPage: true,
      mask: [page.locator(".tabular-nums"), page.locator("svg")],
      maxDiffPixelRatio: 0.03,
    });
  });

  test("add transaction sheet matches the iOS dark baseline", async ({ page }) => {
    await login(page);
    await forceDarkTheme(page);
    await page.getByRole("button", { name: /add transaction/i }).click();
    const sheet = page.getByRole("dialog", { name: /add transaction|tambah transaksi/i });
    await expect(sheet).toBeVisible();
    await stabilizeForScreenshot(page);

    await expect(sheet).toHaveScreenshot("ios-dark-add-transaction.png", {
      maxDiffPixelRatio: 0.02,
    });
  });

  test("bottom navigation clears the iOS home indicator", async ({ page }) => {
    await login(page);
    await forceDarkTheme(page);
    const nav = page.getByRole("navigation").first();
    await expect(nav).toBeVisible();
    await stabilizeForScreenshot(page);

    const box = (await nav.boundingBox())!;
    const viewport = page.viewportSize()!;
    // The nav must sit fully inside the viewport, never under the notch strip.
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);

    await expect(nav).toHaveScreenshot("ios-dark-bottom-nav.png", {
      maxDiffPixelRatio: 0.02,
    });
  });
});
