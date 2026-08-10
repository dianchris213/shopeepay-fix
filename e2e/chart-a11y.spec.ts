import { expect, test } from "@playwright/test";

import { gotoAnalytics, hasCredentials, login, missingCredentialsMessage } from "./helpers";

/**
 * Analytics trend chart — keyboard and screen-reader behaviour.
 *
 * Recharts draws the trend as SVG, which is invisible to assistive tech, so the
 * chart ships a parallel focusable readout: one button per data point that
 * announces the same three facts as the visual tooltip (exact total, number of
 * transactions, date scope), plus a polite live region that mirrors them.
 */
test.describe("analytics trend chart accessibility", () => {
  test.skip(!hasCredentials, missingCredentialsMessage);

  test("data points are reachable with Tab and announce total, count and scope", async ({
    page,
  }) => {
    await login(page);
    await gotoAnalytics(page);

    const points = page.getByTestId("trend-point");
    const count = await points.count();
    expect(count).toBeGreaterThan(0);

    // The readout group is labelled so screen readers can announce its purpose.
    const group = page.getByRole("group", { name: /trend/i });
    await expect(group).toBeVisible();

    // Tab from the point before the group until focus lands on a data point.
    const first = points.first();
    await first.focus();
    await expect(first).toBeFocused();

    // Focus alone must expose the point (no pointer required).
    await expect(first).toHaveAttribute("aria-pressed", "true");

    const label = (await first.getAttribute("aria-label")) ?? "";
    // "<scope>: <formatted amount> spent, <n> transaction(s)"
    expect(label).toMatch(/.+:\s*-?Rp\s?[\d.,]+/);
    expect(label).toMatch(/\d+\s+transactions?/i);

    // The live region mirrors the focused point with the same figures.
    const readout = page.getByTestId("trend-readout");
    await expect(readout).toHaveAttribute("aria-live", "polite");
    const scope = label.split(":")[0]!.trim();
    const amount = label.match(/-?Rp\s?[\d.,]+/)![0];
    const txCount = label.match(/(\d+)\s+transactions?/i)![1]!;
    await expect(readout).toContainText(scope);
    await expect(readout).toContainText(amount);
    await expect(readout).toContainText(txCount);

    // Tab moves to the next data point and updates the announcement.
    if (count > 1) {
      await page.keyboard.press("Tab");
      const second = points.nth(1);
      await expect(second).toBeFocused();
      await expect(second).toHaveAttribute("aria-pressed", "true");
      await expect(first).toHaveAttribute("aria-pressed", "false");
      const secondLabel = (await second.getAttribute("aria-label")) ?? "";
      await expect(readout).toContainText(secondLabel.split(":")[0]!.trim());
    }

    // Hover exposes the same facts through the visual tooltip.
    await points.last().hover();
    await expect(page.getByTestId("trend-readout")).not.toHaveText("");
  });

  test("every data point has a tap target large enough and a unique label", async ({ page }) => {
    await login(page);
    await gotoAnalytics(page);

    const points = page.getByTestId("trend-point");
    const total = await points.count();
    const labels = new Set<string>();

    for (let i = 0; i < total; i += 1) {
      const point = points.nth(i);
      const label = (await point.getAttribute("aria-label")) ?? "";
      expect(label.length).toBeGreaterThan(0);
      labels.add(label);
      const box = (await point.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(40);
    }

    expect(labels.size).toBe(total);
  });
});
