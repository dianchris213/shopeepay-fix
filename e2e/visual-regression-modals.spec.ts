import { expect, test, type Page } from "@playwright/test";

import {
  hasCredentials,
  login,
  missingCredentialsMessage,
  openManageBills,
  openManageWallets,
  stabilizeForScreenshot,
} from "./helpers";

/**
 * Visual-regression baselines for modals, forms and empty states.
 *
 * These are the surfaces the existing full-page baselines never reach: they
 * only exist while a sheet is open, while a form is mid-validation, or while a
 * list has nothing in it — exactly the states that silently break when shared
 * layout primitives change.
 *
 * Baselines live in `e2e/__screenshots__/` and are regenerated deliberately
 * with:  bun run test:e2e:update:modals
 *
 * Each shot is scoped to the panel (not the viewport) and masks volatile
 * currency figures, so a diff means layout/styling changed — not data.
 */

/** The sheet panel itself: stable geometry, no page scroll position in frame. */
function panel(page: Page) {
  return page.getByTestId("sheet-panel").last();
}

async function settle(page: Page) {
  await stabilizeForScreenshot(page);
  // Sheets animate in over ~240ms; wait for the transform to finish.
  await page.waitForTimeout(150);
}

test.describe("visual regression — modals, forms and empty states", () => {
  test.skip(!hasCredentials, missingCredentialsMessage);

  test("add-transaction sheet matches its baseline", async ({ page }) => {
    await login(page);
    await page
      .getByRole("button", { name: /add transaction|add/i })
      .last()
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await settle(page);

    await expect(panel(page)).toHaveScreenshot("modal-add-transaction.png", {
      maxDiffPixelRatio: 0.01,
    });
  });

  test("add-transaction sheet with a filled amount matches its baseline", async ({ page }) => {
    await login(page);
    await page
      .getByRole("button", { name: /add transaction|add/i })
      .last()
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();

    // A populated form exercises different type sizes and the active-chip state.
    await page.getByLabel(/amount in rupiah/i).fill("125000");
    await settle(page);

    await expect(panel(page)).toHaveScreenshot("form-add-transaction-filled.png", {
      maxDiffPixelRatio: 0.01,
    });
  });

  test("manage wallets sheet matches its baseline", async ({ page }) => {
    await login(page);
    await openManageWallets(page);
    await expect(page.getByRole("dialog")).toBeVisible();
    await settle(page);

    await expect(panel(page)).toHaveScreenshot("modal-manage-wallets.png", {
      // Balances are live data; the layout around them is what is under test.
      mask: [page.getByRole("dialog").locator(".tabular-nums")],
      maxDiffPixelRatio: 0.01,
    });
  });

  test("add-account form matches its baseline", async ({ page }) => {
    await login(page);
    await openManageWallets(page);
    await page.getByRole("button", { name: /add account/i }).click();
    await expect(page.getByRole("dialog").last()).toBeVisible();
    await settle(page);

    await expect(panel(page)).toHaveScreenshot("form-add-account.png", {
      maxDiffPixelRatio: 0.01,
    });
  });

  test("manage bills sheet matches its baseline", async ({ page }) => {
    await login(page);
    await openManageBills(page);
    await expect(page.getByRole("dialog")).toBeVisible();
    await settle(page);

    await expect(panel(page)).toHaveScreenshot("modal-manage-bills.png", {
      mask: [page.getByRole("dialog").locator(".tabular-nums")],
      maxDiffPixelRatio: 0.01,
    });
  });

  test("confirm-delete dialog matches its baseline", async ({ page }) => {
    await login(page);
    await openManageWallets(page);

    const remove = page.getByRole("button", { name: /delete|remove/i }).first();
    test.skip(!(await remove.isVisible().catch(() => false)), "No deletable row in this account.");

    await remove.click();
    const confirm = page.getByRole("alertdialog");
    await expect(confirm).toBeVisible();
    await settle(page);

    await expect(confirm).toHaveScreenshot("modal-confirm-delete.png", {
      // The row name is account data; the dialog chrome is what is baselined.
      mask: [confirm.locator("strong, b")],
      maxDiffPixelRatio: 0.01,
    });

    // Leave the fixture untouched.
    await page.keyboard.press("Escape");
  });

  test("empty analytics window matches its baseline", async ({ page }) => {
    await login(page);
    await page.getByRole("link", { name: /analytics/i }).click();

    // Force a window that provably contains no transactions so the zero/empty
    // rendering is captured rather than whatever data the account happens to have.
    await page
      .getByTestId("range-toggle")
      .getByRole("button", { name: /custom range/i })
      .click();
    await page.getByLabel(/start date/i).fill("2001-01-01");
    await page.getByLabel(/end date/i).fill("2001-01-02");
    await settle(page);

    await expect(page.getByTestId("an-total-spent")).toBeVisible();
    await expect(page.locator("main").first()).toHaveScreenshot("empty-analytics-window.png", {
      maxDiffPixelRatio: 0.01,
    });
  });
});
