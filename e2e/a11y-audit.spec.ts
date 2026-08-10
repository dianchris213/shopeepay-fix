import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import {
  AXE_TAGS,
  baselineExceptionCount,
  classifyViolations,
  collectForBaseline,
  formatBlocking,
  strictStaleCheck,
  updateBaseline,
  writeCollectedBaseline,
  type AxeViolation,
} from "./a11y";
import {
  hasCredentials,
  login,
  missingCredentialsMessage,
  stabilizeForScreenshot,
} from "./helpers";

/**
 * Automated accessibility audits (axe-core).
 *
 * Every key screen is scanned against WCAG 2.1 A/AA. Blocking findings
 * ("serious"/"critical") fail the run — and therefore CI — unless a documented
 * entry in `e2e/a11y-baseline.json` explicitly allowlists that exact rule and
 * node on that exact screen. Any *new* violation introduced by incoming code
 * is therefore an automatic build failure, while known debt stays quiet.
 *
 * Lower-impact findings are attached to the report for triage without
 * blocking. See e2e/a11y.ts for the allowlist semantics.
 */
async function audit(page: Page, name: string, include?: string) {
  await stabilizeForScreenshot(page);

  let builder = new AxeBuilder({ page }).withTags(AXE_TAGS);
  if (include) builder = builder.include(include);

  const results = await builder.analyze();
  const violations = results.violations as unknown as AxeViolation[];

  // Regeneration mode: record instead of assert.
  if (updateBaseline) {
    collectForBaseline(name, violations);
    return;
  }

  const report = classifyViolations(name, violations);

  if (report.advisory.length) {
    await test.info().attach(`axe-advisory-${name}.json`, {
      body: JSON.stringify(report.advisory, null, 2),
      contentType: "application/json",
    });
  }
  if (report.allowlisted.length) {
    await test.info().attach(`axe-allowlisted-${name}.json`, {
      body: JSON.stringify(report.allowlisted, null, 2),
      contentType: "application/json",
    });
  }

  // Regression gate: anything not covered by the managed allowlist fails.
  expect(report.blocking, formatBlocking(report)).toEqual([]);

  // Expired allowlist entries stop suppressing and must be re-triaged.
  expect(
    report.expired,
    `Expired accessibility allowlist entries for "${name}" — fix the issue or re-document it.`,
  ).toEqual([]);

  // Housekeeping: an entry that no longer matches anything should be deleted
  // so the allowlist shrinks as the app improves.
  if (report.stale.length) {
    const message = `Stale accessibility allowlist entries for "${name}": ${report.stale
      .map((e) => e.rule)
      .join(", ")} — remove them from e2e/a11y-baseline.json.`;
    if (strictStaleCheck) expect(report.stale, message).toEqual([]);
    else await test.info().attach(`axe-stale-${name}.txt`, { body: message });
  }
}

test.describe("accessibility audits", () => {
  test.skip(!hasCredentials, missingCredentialsMessage);

  test.afterAll(() => {
    // No-op unless A11Y_UPDATE_BASELINE=1.
    writeCollectedBaseline();
  });

  test("the managed allowlist is loadable and documented", async () => {
    // Guards the harness itself: a malformed/unreadable baseline must not
    // silently degrade into "everything is allowed".
    expect(Number.isInteger(baselineExceptionCount)).toBe(true);
    expect(AXE_TAGS).toContain("wcag2aa");
  });

  test("home screen has no serious or critical violations", async ({ page }) => {
    await login(page);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await audit(page, "home");
  });

  test("wallets screen has no serious or critical violations", async ({ page }) => {
    await login(page);
    await page.getByRole("link", { name: /wallets/i }).click();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await audit(page, "wallets");
  });

  test("analytics screen has no serious or critical violations", async ({ page }) => {
    await login(page);
    await page.getByRole("link", { name: /analytics/i }).click();
    await expect(page.getByTestId("an-total-spent")).toBeVisible();
    await audit(page, "analytics");
  });

  test("settings screen has no serious or critical violations", async ({ page }) => {
    await login(page);
    await page.getByRole("link", { name: /settings/i }).click();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await audit(page, "settings");
  });

  test("bills management has no serious or critical violations", async ({ page }) => {
    await login(page);
    await page.getByRole("link", { name: /settings/i }).click();
    await page
      .getByText(/manage bills & installments/i)
      .first()
      .click();
    await expect(page.getByText(/manage bills/i).first()).toBeVisible();
    await audit(page, "bills");
  });

  test("bottom navigation has no serious or critical violations", async ({ page }) => {
    await login(page);
    await expect(page.getByRole("navigation").first()).toBeVisible();
    await audit(page, "navigation", "nav");
  });
});
