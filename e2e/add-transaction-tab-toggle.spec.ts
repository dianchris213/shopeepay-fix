// Per-test isolation: ./fixtures re-seeds the deterministic baseline before
// each test and removes it afterwards, so this spec cannot leak state.
import { expect, test } from "./fixtures";

import { hasCredentials, login, missingCredentialsMessage } from "./helpers";
import { cleanupTestData, seedTestData } from "./seed";

/**
 * Expense <-> Income tab toggling inside the Add Transaction modal.
 *
 * The form must adapt cleanly on every switch:
 *  - Expense always reopens with an empty category plus the interactive
 *    "Pengaturan / Settings" shortcut,
 *  - Income on the Shopeepay driver wallet also opens with an empty category,
 * and neither the realtime sync badge nor the dark theme may be disturbed by
 * the modal interaction.
 */

test.beforeAll(async () => {
  if (hasCredentials) await seedTestData();
});
test.afterAll(async () => {
  if (hasCredentials) await cleanupTestData();
});

/** Realtime status persisted by the sync store, plus the resolved theme. */
async function readShellState(page: import("@playwright/test").Page) {
  return page.evaluate(() => ({
    status: (() => {
      try {
        const raw = window.localStorage.getItem("c2h.sync-status");
        return raw ? (JSON.parse(raw) as { status?: string }).status : undefined;
      } catch {
        return undefined;
      }
    })(),
    dark: document.documentElement.classList.contains("dark"),
    background: getComputedStyle(document.body).backgroundColor,
    // "Fit to screen": the Telegram Mini App shell must never scroll the page.
    overflowing: document.documentElement.scrollHeight > window.innerHeight + 2,
  }));
}

test("toggling expense/income keeps defaults, sync and dark mode intact", async ({ page }) => {
  test.skip(!hasCredentials, missingCredentialsMessage);
  await login(page);

  const before = await readShellState(page);

  await page.getByRole("button", { name: /add transaction/i }).click();
  const categoryGroup = page.getByRole("group", { name: /category/i });
  const walletGroup = page.getByRole("group", { name: /wallet source/i });

  for (let round = 0; round < 3; round += 1) {
    // --- Expense: empty category + clickable Settings shortcut ------------
    await page.getByRole("button", { name: /^expense$/i }).click();
    await expect(categoryGroup.getByRole("button", { pressed: true })).toHaveCount(0);
    await expect(page.getByTestId("tx-create-category-hint")).toBeVisible();
    await expect(page.getByTestId("tx-create-category-link")).toBeVisible();
    // Driver COD is income-only and must disappear from the expense options.
    await expect(categoryGroup.getByRole("button", { name: /^driver cod$/i })).toHaveCount(0);

    // --- Income on Shopeepay: category stays empty too --------------------
    await page.getByRole("button", { name: /^income$/i }).click();
    await walletGroup.getByRole("button", { name: /^shopeepay$/i }).click();
    await expect(categoryGroup.getByRole("button", { pressed: true })).toHaveCount(0);
    await expect(page.getByTestId("tx-create-category-hint")).toBeVisible();
  }

  // Saving is blocked on an empty expense category, with an inline error.
  await page.getByRole("button", { name: /^expense$/i }).click();
  await page.getByRole("textbox", { name: /amount in rupiah/i }).fill("25000");
  await page.getByRole("button", { name: /save transaction/i }).click({ force: true });
  await expect(page.getByTestId("tx-category-required")).toBeVisible();

  // The Settings shortcut opens category management without losing context.
  await page.getByTestId("tx-create-category-link").click();
  await expect(
    page
      .getByRole("dialog")
      .filter({ hasText: /categor/i })
      .first(),
  ).toBeVisible();
  await page.keyboard.press("Escape");

  await page.keyboard.press("Escape");
  await expect(page.getByTestId("tx-create-category-hint")).toHaveCount(0);

  const after = await readShellState(page);
  expect(after.dark).toBe(before.dark);
  expect(after.background).toBe(before.background);
  expect(after.overflowing).toBe(false);
  expect(after.status ?? "synced").not.toBe("error");

  // The realtime badge is still mounted and reporting a live state.
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: /sync|offline|unsaved/i })
      .first(),
  ).toBeVisible();
});
