// Per-test isolation: ./fixtures re-seeds the deterministic baseline before
// each test and removes it afterwards, so this spec cannot leak state.
import { expect, test } from "./fixtures";

import { hasCredentials, login, missingCredentialsMessage } from "./helpers";
import { cleanupTestData, seedTestData } from "./seed";

/**
 * Driver COD booking + undo contract.
 *
 * A Driver COD entry is income for the driver but a deduction on the Shopee
 * Pay debt wallet, so the flow must:
 *  - only offer the category on the income tab,
 *  - always ask for confirmation before touching the balance,
 *  - offer an Undo action that fully rolls the booking back (including the
 *    Cash overflow row when the balance crosses zero), and
 *  - count each undo in the device-local `driver_cod_undo` counter.
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

test("books a Driver COD deduction and rolls it back through Undo", async ({ page }) => {
  test.skip(!hasCredentials, missingCredentialsMessage);
  await login(page);

  const before = await readUsage(page, "driver_cod_undo");

  await page.getByRole("button", { name: /add transaction/i }).click();

  // Driver COD is income-only: it must be absent on the expense tab.
  await expect(page.getByRole("button", { name: /^driver cod$/i })).toHaveCount(0);

  await page.getByRole("button", { name: /^income$/i }).click();
  const codCategory = page.getByRole("button", { name: /^driver cod$/i }).first();
  await expect(codCategory).toBeVisible();
  await codCategory.click();

  // Picking the category pins the booking to the Shopeepay wallet.
  await expect(
    page.getByRole("group", { name: /wallet source/i }).getByRole("button", { pressed: true }),
  ).toContainText(/shopeepay/i);

  await page.getByRole("textbox", { name: /amount in rupiah/i }).fill("50000");
  await page.getByRole("button", { name: /save transaction/i }).click();

  // Confirmation is mandatory; cancelling must leave the balance untouched.
  const confirm = page.getByTestId("cod-confirm");
  await expect(confirm).toBeVisible();
  await expect(confirm).toHaveAttribute("aria-modal", "true");
  await confirm.getByRole("button", { name: /^cancel$/i }).click();
  await expect(confirm).toHaveCount(0);

  await page.getByRole("button", { name: /save transaction/i }).click();
  await page
    .getByTestId("cod-confirm")
    .getByRole("button", { name: /yes, deduct/i })
    .click();

  // The undo toast is the safety net for a balance-changing booking.
  await expect(page.getByText(/driver cod deducted/i).first()).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: /^undo$/i }).click();

  await expect.poll(() => readUsage(page, "driver_cod_undo")).toBe(before + 1);

  // The rolled-back booking leaves no transaction behind.
  await page.getByRole("link", { name: /transactions/i }).click();
  await expect(page.getByText(/^driver cod$/i)).toHaveCount(0, { timeout: 20_000 });
});
