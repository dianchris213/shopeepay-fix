import { devices, expect, test } from "@playwright/test";

import {
  hasCredentials,
  login,
  missingCredentialsMessage,
  stabilizeForScreenshot,
} from "./helpers";

/**
 * iOS Telegram Mini App regression.
 *
 * TMA on iOS renders inside a notched viewport where the bottom inset is real
 * (`safe-area-inset-bottom`) and any vertical overflow on the root document
 * produces the "rubber band" drag that collapses the mini app. The main views
 * must therefore fit exactly: scrollHeight === clientHeight.
 */
const IPHONE = devices["iPhone 14 Pro"]!;

test.use({
  ...IPHONE,
  // Telegram's iOS WebView identifies itself through the TMA bridge, not the UA,
  // so the safe-area insets are simulated below via CSS env() fallbacks.
});

/** Force non-zero notch insets so the layout is measured like a real device. */
async function simulateSafeAreas(page: import("@playwright/test").Page) {
  await page.addStyleTag({
    content: `
      :root {
        --tg-safe-area-inset-bottom: 34px;
        --tg-safe-area-inset-top: 59px;
      }
      html, body { padding-bottom: 34px; }
    `,
  });
}

const SCREENS: { name: string; open: (page: import("@playwright/test").Page) => Promise<void> }[] =
  [
    { name: "home", open: async () => {} },
    {
      name: "analytics",
      open: async (page) => {
        await page.getByRole("link", { name: /analytics/i }).click();
        await expect(page.getByTestId("an-total-spent")).toBeVisible();
      },
    },
    {
      name: "wallets",
      open: async (page) => {
        await page.getByRole("link", { name: /wallets/i }).click();
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      },
    },
    {
      name: "settings",
      open: async (page) => {
        await page.getByRole("link", { name: /settings/i }).click();
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      },
    },
  ];

test.describe("TMA iOS — main view never scrolls vertically", () => {
  test.skip(!hasCredentials, missingCredentialsMessage);

  for (const screen of SCREENS) {
    test(`${screen.name} fits the notched iOS viewport exactly`, async ({ page }) => {
      await login(page);
      await simulateSafeAreas(page);
      await screen.open(page);
      await stabilizeForScreenshot(page);

      const metrics = await page.evaluate(() => ({
        scrollHeight: document.documentElement.scrollHeight,
        clientHeight: document.documentElement.clientHeight,
        bodyScrollHeight: document.body.scrollHeight,
      }));

      // Strict equality: any overflow at all enables the iOS bounce gesture.
      expect(
        metrics.scrollHeight,
        `${screen.name}: root document overflows by ${
          metrics.scrollHeight - metrics.clientHeight
        }px (body ${metrics.bodyScrollHeight}px)`,
      ).toBe(metrics.clientHeight);

      await expect(page).toHaveScreenshot(`tma-ios-${screen.name}.png`, {
        mask: [page.locator(".tabular-nums")],
        maxDiffPixelRatio: 0.02,
      });
    });
  }
});
