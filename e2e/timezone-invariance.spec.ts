import { expect, test } from "@playwright/test";

import {
  gotoAnalytics,
  hasCredentials,
  login,
  missingCredentialsMessage,
  readAnalyticsTotals,
  type AnalyticsTotals,
} from "./helpers";
import { FIXED_DATES, FROZEN_NOW, FROZEN_NOW_ISO, installFrozenClock } from "./time";

/**
 * Cross-timezone CI verification.
 *
 * The suite is only trustworthy if it produces identical results on a runner
 * in UTC, a laptop in Jakarta, and a machine just west of the date line. Two
 * independent variables can break that:
 *
 *   - the *runner* timezone (`TZ`), which the CI matrix varies; and
 *   - the *browser* timezone, which these specs vary directly.
 *
 * Every case below runs the same analytics window under a different browser
 * timezone (including one on each side of the date line) and asserts the
 * rendered figures are byte-identical. A drift here means a date boundary is
 * being computed in local time somewhere it should be computed against the
 * frozen clock.
 */

const TIMEZONES = [
  "UTC",
  "America/Los_Angeles", // UTC-7/8 — previous day for much of the UTC day
  "Asia/Jakarta", // UTC+7 — the app's primary audience
  "Pacific/Kiritimati", // UTC+14 — the far side of the date line
] as const;

/** Shared across cases so every timezone is compared to the same reference. */
const observed = new Map<string, { totals: AnalyticsTotals; windowLabel: string }>();

test.describe("cross-timezone determinism", () => {
  test.skip(!hasCredentials, missingCredentialsMessage);
  test.describe.configure({ mode: "serial" });

  test("the CI runner timezone is reported for the record", async () => {
    // The matrix sets TZ per job; surfacing it makes a red build self-explaining.
    const runnerTz =
      process.env["TZ"] ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "unknown";
    await test.info().attach("runner-timezone.txt", {
      body: `TZ=${runnerTz}\nfrozen now=${FROZEN_NOW_ISO}`,
    });
    expect(runnerTz).toBeTruthy();
  });

  for (const timezoneId of TIMEZONES) {
    test.describe(`browser timezone ${timezoneId}`, () => {
      test.use({ timezoneId });

      test(`clock is frozen and analytics are stable in ${timezoneId}`, async ({ page }) => {
        await installFrozenClock(page);
        await login(page);

        // 1. The browser really is in the timezone under test…
        const resolved = await page.evaluate(
          () => Intl.DateTimeFormat().resolvedOptions().timeZone,
        );
        expect(resolved).toBe(timezoneId);

        // 2. …and the frozen clock survives it. `Date.now()` is an absolute
        //    instant, so it must be identical in every zone.
        const now = await page.evaluate(() => Date.now());
        expect(now).toBe(FROZEN_NOW.getTime());

        // 3. Local-time rendering of the frozen instant differs per zone (that
        //    is expected), but the UTC calendar day must not.
        const utcDay = await page.evaluate(() => new Date().toISOString().slice(0, 10));
        expect(utcDay).toBe(FROZEN_NOW_ISO.slice(0, 10));

        // 4. The analytics window is pinned to explicit dates, removing any
        //    dependence on how the host resolves "start of month".
        await gotoAnalytics(page);
        const toggle = page.getByTestId("range-toggle");
        await toggle.getByRole("button", { name: /custom range/i }).click();
        await page.getByLabel(/start date/i).fill(FIXED_DATES.monthStart);
        await page.getByLabel(/end date/i).fill(FIXED_DATES.monthEnd);
        await expect(page.getByLabel(/start date/i)).toHaveValue(FIXED_DATES.monthStart);
        await expect(page.getByLabel(/end date/i)).toHaveValue(FIXED_DATES.monthEnd);

        const totals = await readAnalyticsTotals(page);
        const windowLabel = (await page.getByTestId("an-total-spent").innerText()).trim();
        observed.set(timezoneId, { totals, windowLabel });

        // 5. Figures must be real numbers — an off-by-one-day boundary bug
        //    typically surfaces as NaN or an empty window here first.
        for (const [key, value] of Object.entries(totals)) {
          expect(Number.isFinite(value), `${key} is not finite in ${timezoneId}`).toBe(true);
        }

        // 6. Compare against the first timezone that ran.
        const reference = observed.get(TIMEZONES[0]);
        if (reference && timezoneId !== TIMEZONES[0]) {
          expect(
            totals,
            `Analytics totals differ between ${TIMEZONES[0]} and ${timezoneId} — a date boundary is being computed in local time.`,
          ).toEqual(reference.totals);
          expect(windowLabel).toBe(reference.windowLabel);
        }
      });
    });
  }

  test("every timezone produced the same result", async () => {
    test.skip(observed.size < 2, "Not enough timezone runs to compare.");
    const [first, ...rest] = Array.from(observed.entries());
    for (const [timezoneId, result] of rest) {
      expect(result.totals, `${timezoneId} diverged from ${first![0]}`).toEqual(first![1].totals);
    }
    await test.info().attach("timezone-matrix.json", {
      body: JSON.stringify(Object.fromEntries(observed), null, 2),
      contentType: "application/json",
    });
  });
});
