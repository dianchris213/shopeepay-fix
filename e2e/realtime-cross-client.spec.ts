// Cross-client realtime sync: two independent browser contexts (two "devices")
// signed into the same account must converge without any manual refresh.
import { expect, test } from "./fixtures";

import { hasCredentials, login, missingCredentialsMessage } from "./helpers";
import { SEED_PREFIX, cleanupTestData, seedTestData } from "./seed";

const stamp = Date.now();
const noteFromClientA = `${SEED_PREFIX} RT-A ${stamp}`;
const AMOUNT = 12_345;

test.beforeAll(async () => {
  if (hasCredentials) await seedTestData();
});
test.afterAll(async () => {
  if (hasCredentials) await cleanupTestData();
});

/** Opens the All Transactions list on the given page. */
async function openTransactionList(page: import("@playwright/test").Page) {
  await page.getByRole("link", { name: /home/i }).click();
  await page
    .getByText(/all transactions|view all/i)
    .first()
    .click();
  const list = page.getByRole("dialog", { name: /all transactions/i });
  await expect(list).toBeVisible();
  return list;
}

/**
 * Client A inserts a transaction; client B — already sitting on the home screen
 * in a separate browser context — must show it in its transaction list without
 * ever being reloaded.
 */
test("a transaction added on one client appears on a second client in real time", async ({
  browser,
}) => {
  test.skip(!hasCredentials, missingCredentialsMessage);

  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  try {
    await login(pageA);
    await login(pageB);

    // Client B parks on the home screen and never reloads for the rest of the test.
    await pageB.getByRole("link", { name: /home/i }).click();
    await expect(pageB.getByRole("button", { name: /add transaction/i })).toBeVisible();

    // Client A records an expense.
    await pageA.getByRole("button", { name: /add transaction/i }).click();
    await pageA.getByLabel(/amount in rupiah/i).fill(String(AMOUNT));
    await pageA
      .getByRole("button", { name: /food|makan/i })
      .first()
      .click();
    await pageA.getByPlaceholder(/optional|opsional/i).fill(noteFromClientA);
    await pageA.getByRole("button", { name: /save transaction/i }).click();

    // Client A obviously has it (optimistic local write).
    const listA = await openTransactionList(pageA);
    await expect(listA.getByText(noteFromClientA, { exact: false }).first()).toBeVisible({
      timeout: 20_000,
    });

    // The assertion that matters: client B converges with no manual refresh.
    const listB = await openTransactionList(pageB);
    await expect(listB.getByText(noteFromClientA, { exact: false }).first()).toBeVisible({
      timeout: 40_000,
    });
  } finally {
    await contextA.close();
    await contextB.close();
  }
});

/**
 * Background-drop recovery across clients: client B is backgrounded (its socket
 * may be frozen, exactly like an Android TMA), client A mutates data, then B
 * comes back to the foreground and must catch up on its own.
 */
test("a backgrounded client catches up after regaining focus", async ({ browser }) => {
  test.skip(!hasCredentials, missingCredentialsMessage);

  const note = `${SEED_PREFIX} RT-BG ${stamp}`;
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  try {
    await login(pageA);
    await login(pageB);
    await pageB.getByRole("link", { name: /home/i }).click();

    // Simulate the app being sent to the background.
    await pageB.evaluate(() => {
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => "hidden",
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });

    // Client A writes while B is away.
    await pageA.getByRole("button", { name: /add transaction/i }).click();
    await pageA.getByLabel(/amount in rupiah/i).fill(String(AMOUNT));
    await pageA
      .getByRole("button", { name: /food|makan/i })
      .first()
      .click();
    await pageA.getByPlaceholder(/optional|opsional/i).fill(note);
    await pageA.getByRole("button", { name: /save transaction/i }).click();
    const listA = await openTransactionList(pageA);
    await expect(listA.getByText(note, { exact: false }).first()).toBeVisible({ timeout: 20_000 });

    // B returns to the foreground: the focus-recovery handler must refetch.
    await pageB.evaluate(() => {
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => "visible",
      });
      document.dispatchEvent(new Event("visibilitychange"));
      window.dispatchEvent(new Event("focus"));
    });

    const listB = await openTransactionList(pageB);
    await expect(listB.getByText(note, { exact: false }).first()).toBeVisible({ timeout: 40_000 });
  } finally {
    await contextA.close();
    await contextB.close();
  }
});
