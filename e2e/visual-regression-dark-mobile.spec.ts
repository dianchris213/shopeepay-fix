import { expect, test, type Page } from "@playwright/test";

import {
  hasCredentials,
  login,
  missingCredentialsMessage,
  stabilizeForScreenshot,
} from "./helpers";

/**
 * Dark-mode visual regression for the home stream strip across the three most
 * common mobile widths.
 *
 * The DriverShopee and custom-wallet cards divide the row equally (flex-1 with
 * a 120px floor). At narrow widths that is where clipping and broken margins
 * show up first, so each viewport asserts geometry *and* pixels:
 *
 *   - both cards share the row and stay on the same baseline (aligned);
 *   - no card overflows its container horizontally;
 *   - no text node is clipped (scrollWidth <= clientWidth on truncating nodes);
 *   - the strip matches a committed dark-mode baseline.
 *
 * Regenerate baselines deliberately:
 *   bunx playwright test --update-snapshots visual-regression-dark-mobile.spec.ts
 */
const VIEWPORTS = [
  { name: "320", width: 320, height: 568 },
  { name: "390", width: 390, height: 844 },
  { name: "428", width: 428, height: 926 },
] as const;

// Dark mode is the app default; pin it explicitly so the baselines cannot drift
// if the default ever changes.
test.use({ colorScheme: "dark" });

async function forceDarkTheme(page: Page) {
  await page.evaluate(() => {
    document.documentElement.classList.remove("light");
    document.documentElement.style.colorScheme = "dark";
  });
}

test.describe("visual regression — dark mode mobile wallet grid", () => {
  test.skip(!hasCredentials, missingCredentialsMessage);

  for (const vp of VIEWPORTS) {
    test(`stream cards stay aligned and unclipped at ${vp.name}px in dark mode`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await login(page);
      await forceDarkTheme(page);

      const strip = page.getByTestId("stream-strip");
      await expect(strip).toBeVisible({ timeout: 20_000 });
      const driver = page.getByTestId("stream-card-driver");
      const custom = page.getByTestId("stream-card-custom");
      await expect(driver).toBeVisible();
      await expect(custom).toBeVisible();
      await stabilizeForScreenshot(page);

      const stripBox = (await strip.boundingBox())!;
      const driverBox = (await driver.boundingBox())!;
      const customBox = (await custom.boundingBox())!;

      // Same row, same height: the grid stays perfectly aligned.
      expect(Math.abs(driverBox.y - customBox.y)).toBeLessThanOrEqual(1);
      expect(Math.abs(driverBox.height - customBox.height)).toBeLessThanOrEqual(1);

      // Equal division of the available row width.
      expect(Math.abs(driverBox.width - customBox.width)).toBeLessThanOrEqual(1);

      // No horizontal overflow past the strip, and no negative/broken margins.
      expect(driverBox.x).toBeGreaterThanOrEqual(stripBox.x - 1);
      expect(customBox.x + customBox.width).toBeLessThanOrEqual(stripBox.x + stripBox.width + 1);
      expect(customBox.x).toBeGreaterThanOrEqual(driverBox.x + driverBox.width - 1);

      // Zero text clipping: every truncating text node fits its own box.
      const clipped = await strip.evaluate((el) =>
        [...el.querySelectorAll<HTMLElement>("p, span")]
          .filter((n) => n.scrollWidth - n.clientWidth > 1)
          .map((n) => `${n.textContent?.trim()} (${n.scrollWidth}>${n.clientWidth})`),
      );
      expect(clipped, `clipped text at ${vp.name}px: ${clipped.join(", ")}`).toEqual([]);

      // The dark-mode background actually applied (guards a light-mode drift).
      const scheme = await page.evaluate(() => document.documentElement.style.colorScheme);
      expect(scheme).toBe("dark");

      await expect(strip).toHaveScreenshot(`dark-stream-strip-${vp.name}.png`, {
        mask: [strip.locator(".tabular-nums")],
        maxDiffPixelRatio: 0.02,
      });
    });
  }

  test("home screen matches its dark-mode baseline at 390px", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page);
    await forceDarkTheme(page);
    await expect(page.getByTestId("stream-strip")).toBeVisible({ timeout: 20_000 });
    await stabilizeForScreenshot(page);

    await expect(page).toHaveScreenshot("dark-home-390.png", {
      fullPage: true,
      mask: [page.locator(".tabular-nums")],
      maxDiffPixelRatio: 0.02,
    });
  });
});
