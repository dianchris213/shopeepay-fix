// Per-test isolation: ./fixtures re-seeds the deterministic baseline before
// each test and removes it afterwards, so this spec cannot leak state.
import { expect, test } from "./fixtures";

import { hasCredentials, login, missingCredentialsMessage } from "./helpers";
import { cleanupTestData, seedTestData } from "./seed";

/**
 * WhatsApp export preview contract.
 *
 * The preview is the last stop before a summary leaves the app, so it must:
 *  - open from the home header and render the exact text that will be sent,
 *  - expose that text as a labelled, focusable live region for screen readers,
 *  - copy on demand, and
 *  - increment the device-local `wa_export_preview_opened` usage counter.
 */

const USAGE_KEY = "c2h.usage.v1";

async function readUsage(page: import("@playwright/test").Page, event: string) {
  return page.evaluate(
    ([key, name]) => {
      const raw = window.localStorage.getItem(key);
      if (!raw) return 0;
      try {
        const parsed = JSON.parse(raw) as Record<string, { count?: number }>;
        return parsed[name]?.count ?? 0;
      } catch {
        return 0;
      }
    },
    [USAGE_KEY, event] as const,
  );
}

test.beforeAll(async () => {
  if (hasCredentials) await seedTestData();
});
test.afterAll(async () => {
  if (hasCredentials) await cleanupTestData();
});

test("previews the WhatsApp summary, is accessible, and is counted", async ({ page, context }) => {
  test.skip(!hasCredentials, missingCredentialsMessage);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await login(page);

  const before = await readUsage(page, "wa_export_preview_opened");

  await page.getByRole("button", { name: /export to wa/i }).click();

  const preview = page.getByTestId("wa-export-preview");
  await expect(preview).toBeVisible();

  // A11y: the summary is a labelled live region and reachable by keyboard.
  await expect(preview).toHaveAttribute("aria-live", "polite");
  await expect(preview).toHaveAttribute("aria-label", /export preview/i);
  await expect(preview).toHaveAttribute("tabindex", "0");

  // The preview must not be an empty shell — it renders the real summary.
  const summary = (await preview.innerText()).trim();
  expect(summary.length).toBeGreaterThan(0);

  // Opening the preview is the tracked event.
  await expect.poll(() => readUsage(page, "wa_export_preview_opened")).toBe(before + 1);

  // Copy hands over exactly the previewed text.
  await page.getByRole("button", { name: /copy text/i }).click();
  await expect(page.getByText(/summary copied/i).first()).toBeVisible();
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard.trim()).toBe(summary);
});
