import { devices, expect, test } from "@playwright/test";

import {
  hasCredentials,
  login,
  missingCredentialsMessage,
  stabilizeForScreenshot,
} from "./helpers";

/**
 * Android Telegram Mini App regression.
 *
 * Android TMA runs in a Chrome WebView whose viewport shrinks when the Telegram
 * header collapses; any vertical overflow on the root document turns into a
 * swipe-to-dismiss gesture. The main views must fit exactly:
 * scrollHeight === clientHeight.
 */
const PIXEL = devices["Pixel 7"]!;

test.use({
  ...PIXEL,
});

/** Telegram's Android shell reserves a top inset for its own header. */
async function simulateSafeAreas(page: import("@playwright/test").Page) {
  await page.addStyleTag({
    content: `
      :root {
        --tg-safe-area-inset-bottom: 0px;
        --tg-safe-area-inset-top: 24px;
      }
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

test.describe("TMA Android — main view never scrolls vertically", () => {
  test.skip(!hasCredentials, missingCredentialsMessage);

  for (const screen of SCREENS) {
    test(`${screen.name} fits the Android TMA viewport exactly`, async ({ page }) => {
      await login(page);
      await simulateSafeAreas(page);
      await screen.open(page);
      await stabilizeForScreenshot(page);

      const metrics = await page.evaluate(() => ({
        scrollHeight: document.documentElement.scrollHeight,
        clientHeight: document.documentElement.clientHeight,
        bodyScrollHeight: document.body.scrollHeight,
      }));

      // Strict equality: any overflow enables Telegram's swipe-to-dismiss drag.
      expect(
        metrics.scrollHeight,
        `${screen.name}: root document overflows by ${
          metrics.scrollHeight - metrics.clientHeight
        }px (body ${metrics.bodyScrollHeight}px)`,
      ).toBe(metrics.clientHeight);

      await expect(page).toHaveScreenshot(`tma-android-${screen.name}.png`, {
        mask: [page.locator(".tabular-nums")],
        maxDiffPixelRatio: 0.02,
      });
    });
  }
});
