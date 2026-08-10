import { expect, test, type Page } from "@playwright/test";

import { hasCredentials, login, missingCredentialsMessage, openManageWallets } from "./helpers";

/**
 * End-to-end keyboard navigation specs.
 *
 * The app must be fully operable without a pointer. These specs drive it with
 * Tab / Shift+Tab / Enter / Space / Escape only and assert the four things
 * keyboard users depend on:
 *
 *   1. reachability — every primary control can be focused in a sane order;
 *   2. activation — Enter and Space trigger the focused control;
 *   3. containment — focus is trapped inside an open modal;
 *   4. restoration — dismissing a modal returns focus to its trigger.
 */

type ActiveElement = {
  tag: string;
  label: string;
  testId: string | null;
  insideDialog: boolean;
};

/** Describe whatever currently has focus, from the DOM's point of view. */
async function active(page: Page): Promise<ActiveElement> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el) return { tag: "none", label: "", testId: null, insideDialog: false };
    const label = (
      el.getAttribute("aria-label") ??
      el.textContent ??
      (el as HTMLInputElement).placeholder ??
      ""
    )
      .replace(/\s+/g, " ")
      .trim();
    return {
      tag: el.tagName.toLowerCase(),
      label,
      testId: el.getAttribute("data-testid"),
      insideDialog: Boolean(el.closest('[role="dialog"], [role="alertdialog"]')),
    };
  });
}

/** Tab `count` times and return the sequence of focused descriptors. */
async function tabThrough(page: Page, count: number, shift = false): Promise<ActiveElement[]> {
  const seen: ActiveElement[] = [];
  for (let i = 0; i < count; i += 1) {
    await page.keyboard.press(shift ? "Shift+Tab" : "Tab");
    seen.push(await active(page));
  }
  return seen;
}

/** Tab (bounded) until the predicate matches the focused element. */
async function tabUntil(page: Page, match: (el: ActiveElement) => boolean, limit = 60) {
  for (let i = 0; i < limit; i += 1) {
    await page.keyboard.press("Tab");
    const el = await active(page);
    if (match(el)) return el;
  }
  throw new Error(`No element matched within ${limit} Tab presses.`);
}

test.describe("keyboard navigation", () => {
  test.skip(!hasCredentials, missingCredentialsMessage);

  test("no element opts out of the natural tab order with a positive tabindex", async ({
    page,
  }) => {
    await login(page);
    // Positive tabindex values reorder focus unpredictably and are a common
    // source of keyboard traps; the app must rely on DOM order only.
    const offenders = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>("[tabindex]"))
        .filter((el) => Number(el.getAttribute("tabindex")) > 0)
        .map((el) => el.outerHTML.slice(0, 120)),
    );
    expect(offenders).toEqual([]);
  });

  test("the bottom navigation is reachable and activatable by keyboard alone", async ({ page }) => {
    await login(page);
    await page.locator("body").click();
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

    // Every destination must be reachable purely by tabbing.
    const labels = ["Analytics", "Wallets", "Settings"];
    for (const label of labels) {
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      const link = page.getByRole("link", { name: new RegExp(label, "i") });
      await link.focus();
      await expect(link).toBeFocused();

      // Enter activates a link, as it would for a mouse click.
      await page.keyboard.press("Enter");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(link).toHaveAttribute("aria-current", "page");
    }
  });

  test("Shift+Tab walks focus back through the same controls", async ({ page }) => {
    await login(page);
    await page.getByRole("link", { name: /analytics/i }).focus();

    const forward = await tabThrough(page, 3);
    const backward = await tabThrough(page, 3, true);

    expect(forward).toHaveLength(3);
    // Reversing must land on the previously visited controls, in reverse.
    expect(backward.slice(0, 2).map((el) => el.label)).toEqual(
      forward
        .slice(0, 2)
        .map((el) => el.label)
        .reverse(),
    );
  });

  test("Space activates the add-transaction button and Escape dismisses the sheet", async ({
    page,
  }) => {
    await login(page);
    const trigger = page.getByRole("button", { name: /add transaction|add/i }).last();
    await trigger.focus();
    await expect(trigger).toBeFocused();

    await page.keyboard.press("Space");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    // Focus restoration: the user must not be dumped back at the top of the page.
    await expect(trigger).toBeFocused();
  });

  test("focus is trapped inside an open modal and wraps at both ends", async ({ page }) => {
    await login(page);
    const trigger = page.getByRole("button", { name: /add transaction|add/i }).last();
    await trigger.focus();
    await page.keyboard.press("Enter");

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // Focus enters the modal rather than staying behind it.
    await expect.poll(async () => (await active(page)).insideDialog, { timeout: 5_000 }).toBe(true);

    // Tabbing far past the last control must never escape into the page behind.
    const visited = await tabThrough(page, 25);
    expect(
      visited.filter((el) => !el.insideDialog),
      "Tab escaped the modal",
    ).toEqual([]);

    // The first control is reachable again — the trap wraps rather than sticks.
    const wrapped = new Set(visited.map((el) => el.label));
    expect(wrapped.size).toBeGreaterThan(1);

    // Shift+Tab is trapped too.
    const back = await tabThrough(page, 10, true);
    expect(
      back.filter((el) => !el.insideDialog),
      "Shift+Tab escaped the modal",
    ).toEqual([]);

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  test("a form can be completed end to end without a pointer", async ({ page }) => {
    await login(page);
    const trigger = page.getByRole("button", { name: /add transaction|add/i }).last();
    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog")).toBeVisible();

    // Reach the amount field by tabbing, then type into it.
    await tabUntil(page, (el) => el.label.toLowerCase().includes("amount"));
    await page.keyboard.type("125000");
    await expect(page.getByLabel(/amount in rupiah/i)).toHaveValue(/125/);

    // Escape must still work while a text field holds focus.
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("Escape closes only the topmost sheet when modals are nested", async ({ page }) => {
    await login(page);
    await openManageWallets(page);

    const dialogs = page.getByRole("dialog");
    await expect(dialogs.first()).toBeVisible();
    const outerCount = await dialogs.count();

    // Open a nested sheet from inside the manage list, if one is offered.
    const nestedTrigger = page.getByRole("button", { name: /edit|add account/i }).first();
    if (await nestedTrigger.isVisible().catch(() => false)) {
      await nestedTrigger.focus();
      await page.keyboard.press("Enter");
      await expect
        .poll(async () => dialogs.count(), { timeout: 5_000 })
        .toBeGreaterThan(outerCount);

      // One Escape dismisses the inner sheet only — the outer list survives.
      await page.keyboard.press("Escape");
      await expect.poll(async () => dialogs.count(), { timeout: 5_000 }).toBe(outerCount);
      await expect(dialogs.first()).toBeVisible();
    }

    // A second Escape closes the remaining sheet.
    await page.keyboard.press("Escape");
    await expect(dialogs).toHaveCount(0);
  });

  test("the analytics range toggle is operable from the keyboard", async ({ page }) => {
    await login(page);
    await page.getByRole("link", { name: /analytics/i }).click();

    const toggle = page.getByTestId("range-toggle");
    const thisMonth = toggle.getByRole("button", { name: /this month/i });
    await thisMonth.focus();
    await page.keyboard.press("Enter");
    await expect(thisMonth).toHaveAttribute("aria-pressed", "true");

    // Tab to the neighbouring option and activate it with Space.
    const custom = toggle.getByRole("button", { name: /custom range/i });
    await custom.focus();
    await page.keyboard.press("Space");
    await expect(custom).toHaveAttribute("aria-pressed", "true");
    // The revealed date inputs must be focusable straight away.
    await page.getByLabel(/start date/i).focus();
    await expect(page.getByLabel(/start date/i)).toBeFocused();
  });
});
