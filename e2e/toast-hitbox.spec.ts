import { expect, test } from "@playwright/test";

/**
 * Toast hitbox + pass-through contract.
 *
 * Two guarantees are asserted against the real, rendered backfill toast:
 *
 *  1. the dismiss "X" has an enlarged (>= 44x44) touch target and reliably
 *     responds to both a mouse click and a touch tap;
 *  2. the toast overlay never steals pointer events from the UI underneath —
 *     only the toast card itself is interactive, the surrounding container is
 *     `pointer-events: none`.
 *
 * The toast is rendered through the dev-only `window.__c2hToast` automation
 * hook so the spec needs no backend, no account and no legacy dataset.
 */

const MIN_TOUCH = 44;

async function showBackfillToast(page: import("@playwright/test").Page) {
  await page.waitForFunction(() => "__c2hToast" in window);
  await page.evaluate(() => {
    (window as unknown as { __c2hToast: { backfill: (n?: number) => string } }).__c2hToast.backfill(
      3,
    );
  });
}

test.describe("backfill toast hitbox", () => {
  // Touch emulation so the dismiss target can be tapped like on a phone.
  test.use({ hasTouch: true });

  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // The auth screen is enough: ToastHost lives at the app root.
    await expect(page.getByPlaceholder("you@email.com")).toBeVisible();
    await showBackfillToast(page);
    await expect(page.getByText(/optimizing older transactions/i)).toBeVisible();
  });

  test("dismiss button exposes a >= 44px touch target and closes on click", async ({ page }) => {
    const dismiss = page.getByRole("button", { name: /dismiss notification/i });
    await expect(dismiss).toBeVisible();

    const box = (await dismiss.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(MIN_TOUCH);
    expect(box.height).toBeGreaterThanOrEqual(MIN_TOUCH);

    // The enlarged padding — not just the 28px visual pill — must hit-test to
    // the button, so an imprecise thumb still dismisses the toast.
    const offsets = [
      [-14, -14],
      [14, -14],
      [-14, 14],
      [14, 14],
    ] as const;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    for (const [dx, dy] of offsets) {
      const onButton = await page.evaluate(
        ({ x, y }) => {
          const el = document.elementFromPoint(x, y) as HTMLElement | null;
          return Boolean(el?.closest('button[aria-label="Dismiss notification"]'));
        },
        { x: cx + dx, y: cy + dy },
      );
      expect(onButton, `offset ${dx},${dy} should hit the dismiss button`).toBe(true);
    }

    await dismiss.click();
    await expect(page.getByText(/optimizing older transactions/i)).toHaveCount(0);
  });

  test("dismiss button responds to a touch tap", async ({ page }) => {
    const dismiss = page.getByRole("button", { name: /dismiss notification/i });
    const box = (await dismiss.boundingBox())!;
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.getByText(/optimizing older transactions/i)).toHaveCount(0);
  });

  test("toast container does not block pointer events underneath it", async ({ page }) => {
    const container = page.locator('[aria-live="polite"]').filter({ hasText: /optimizing/i });
    await expect(container).toHaveCSS("pointer-events", "none");

    // The card itself must stay clickable even though its parent is inert.
    const card = page.getByRole("status").filter({ hasText: /optimizing/i });
    await expect(card).toHaveCSS("pointer-events", "auto");

    const box = (await container.boundingBox())!;
    const cardBox = (await card.boundingBox())!;

    // Sample a point inside the overlay but beside the card: hit-testing must
    // resolve to whatever is painted below, never to the toast layer.
    const probe = await page.evaluate(
      ({ x, y }) => {
        const el = document.elementFromPoint(x, y) as HTMLElement | null;
        return {
          insideToastLayer: Boolean(el?.closest('[aria-live="polite"]')),
          tag: el?.tagName.toLowerCase() ?? "none",
        };
      },
      { x: box.x + 2, y: cardBox.y + cardBox.height / 2 },
    );
    expect(probe.insideToastLayer).toBe(false);

    // End-to-end proof: a control rendered under the toast still receives input
    // while the toast is on screen.
    const email = page.getByPlaceholder("you@email.com");
    await email.click();
    await email.fill("hitbox@example.com");
    await expect(email).toHaveValue("hitbox@example.com");
    await expect(page.getByText(/optimizing older transactions/i)).toBeVisible();
  });
});
