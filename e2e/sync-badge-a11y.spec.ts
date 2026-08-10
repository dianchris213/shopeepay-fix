import { expect, test } from "@playwright/test";

import { hasCredentials, login, missingCredentialsMessage } from "./helpers";

/**
 * Rendered accessibility of the cloud sync badge in a real browser.
 *
 * jsdom cannot evaluate `:focus-visible`, so the visible ring is asserted here
 * by reading the computed box-shadow before and after keyboard focus. The
 * per-state announcements are covered exhaustively by the RTL suite
 * (src/test/sync-indicator-a11y.test.tsx).
 */

/** Force a sync state through the store so all four badges can be inspected. */
async function setState(
  page: import("@playwright/test").Page,
  status: "syncing" | "synced" | "offline" | "error",
  pending: number,
) {
  await page.evaluate(
    ({ status, pending }) => {
      window.localStorage.setItem("c2h.sync-status", JSON.stringify({ status, pending }));
      window.dispatchEvent(new Event("storage"));
    },
    { status, pending },
  );
}

test.describe("sync badge accessibility", () => {
  test.skip(!hasCredentials, missingCredentialsMessage);

  test("badge is a polite live region and shows a focus-visible ring", async ({ page }) => {
    await login(page);

    const badge = page
      .getByRole("status")
      .filter({ hasText: /sync|offline|unsaved/i })
      .first();
    await expect(badge).toBeVisible({ timeout: 30_000 });
    await expect(badge).toHaveAttribute("aria-live", "polite");
    await expect(badge).toHaveAttribute("aria-atomic", "true");
    await expect(badge).toHaveAttribute("tabindex", "0");

    const shadowBefore = await badge.evaluate((el) => getComputedStyle(el).boxShadow);

    // Keyboard focus (not a click) is what must paint the ring.
    await badge.evaluate((el) => (el as HTMLElement).focus());
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    await expect(badge).toBeFocused();

    const shadowAfter = await badge.evaluate((el) => getComputedStyle(el).boxShadow);
    expect(shadowAfter).not.toBe(shadowBefore);
    expect(shadowAfter).not.toBe("none");

    // The ring must not be replaced by a removed default outline.
    const outline = await badge.evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(["none", "solid", "auto"]).toContain(outline);
  });

  test("announces each sync state with the right text", async ({ page }) => {
    await login(page);
    const badge = page
      .getByRole("status")
      .filter({ hasText: /sync|offline|unsaved/i })
      .first();
    await expect(badge).toBeVisible({ timeout: 30_000 });

    const cases: Array<[Parameters<typeof setState>[1], RegExp]> = [
      ["syncing", /syncing/i],
      ["synced", /synced/i],
      ["offline", /offline/i],
      ["error", /unsaved changes/i],
    ];

    for (const [status, pattern] of cases) {
      await setState(page, status, status === "synced" ? 0 : 2);
      await page.reload();
      const live = page
        .getByRole("status")
        .filter({ hasText: /sync|offline|unsaved/i })
        .first();
      await expect(live).toBeVisible({ timeout: 30_000 });
      await expect(live).toHaveAttribute("aria-label", pattern);
    }
  });
});
