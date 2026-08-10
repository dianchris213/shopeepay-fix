import { expect, test } from "@playwright/test";

import { hasCredentials, login, missingCredentialsMessage } from "./helpers";

import { allowTransientRetries } from "./flaky";

allowTransientRetries("lifecycle timing plus a live refresh request");

/**
 * Telegram Mini App suspend → resume lifecycle.
 *
 * A Mini App is never "closed": Telegram freezes the WebView when the user
 * switches chats and thaws it minutes or hours later. The only signal the app
 * gets is a `visibilitychange` — and by then the cached access token can be
 * long expired. If the first thing the resumed app does is fetch transactions,
 * PostgREST answers 401/403 and the user sees an empty, broken dashboard.
 *
 * Unlike `session-resume-after-suspension.spec.ts` (which ages the stored
 * token and watches real responses), this spec drives the lifecycle exactly as
 * the platform does and asserts on the *request ordering at the network layer*:
 *
 *   1. `page.evaluate` redefines `document.visibilityState` to "hidden" and
 *      dispatches `visibilitychange` — the suspend;
 *   2. the same mock flips it back to "visible" and dispatches `focus`
 *      + `visibilitychange` — the resume;
 *   3. `page.route` intercepts every backend request and records the order in
 *      which they are issued.
 *
 * Assertion: after resuming, the auth token refresh is *issued* before the
 * first protected data query — the ordering guarantee that keeps 401/403 off
 * the screen. Every data request in the resume window is additionally held
 * back briefly, so a refresh that were merely fired "around the same time"
 * cannot pass by accident.
 */

type Recorded = { kind: "refresh" | "auth" | "data"; url: string; at: number };

function classify(url: string): Recorded["kind"] | null {
  if (/\/auth\/v1\/token\b/.test(url)) {
    return /grant_type=refresh_token/.test(url) ? "refresh" : "auth";
  }
  if (/\/auth\/v1\//.test(url)) return "auth";
  if (/\/rest\/v1\//.test(url)) return "data";
  return null;
}

/** Mocks the Telegram/WebView visibility transition inside the page. */
const setVisibility = (state: "hidden" | "visible") => {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
  Object.defineProperty(document, "hidden", {
    configurable: true,
    get: () => state === "hidden",
  });
  document.dispatchEvent(new Event("visibilitychange"));
  if (state === "visible") {
    window.dispatchEvent(new Event("focus"));
  } else {
    window.dispatchEvent(new Event("blur"));
  }
};

test.describe("TMA lifecycle: suspend and resume", () => {
  test.skip(!hasCredentials, missingCredentialsMessage);

  test("refreshes the session before any protected query after resuming", async ({ page }) => {
    const requests: Recorded[] = [];
    let recording = false;
    // Data requests are delayed inside the resume window so that a refresh
    // fired concurrently (rather than first) cannot win the race by luck.
    let holdDataRequests = false;

    await page.route(/\/(auth|rest)\/v1\//, async (route) => {
      const url = route.request().url();
      const kind = classify(url);
      if (recording && kind) {
        requests.push({ kind, url, at: Date.now() });
        if (kind === "data" && holdDataRequests) {
          await new Promise((resolve) => setTimeout(resolve, 400));
        }
      }
      await route.continue();
    });

    await login(page);
    await page.waitForLoadState("networkidle");

    // ---- suspend ---------------------------------------------------------
    await page.evaluate(setVisibility, "hidden" as const);
    // Long enough for the app to consider the session stale on wake-up.
    await page.waitForTimeout(1_000);

    // Age the persisted token the way hours in the background would.
    const aged = await page.evaluate(() => {
      const keys = Object.keys(window.localStorage).filter(
        (key) => key.startsWith("sb-") && key.endsWith("-auth-token"),
      );
      let patched = 0;
      for (const key of keys) {
        const raw = window.localStorage.getItem(key);
        if (!raw) continue;
        try {
          const session = JSON.parse(raw) as { expires_at?: number; expires_in?: number } | null;
          if (!session || typeof session !== "object") continue;
          session.expires_at = Math.floor(Date.now() / 1000) - 6 * 60 * 60;
          session.expires_in = 0;
          window.localStorage.setItem(key, JSON.stringify(session));
          patched += 1;
        } catch {
          // Not a session payload.
        }
      }
      return patched;
    });
    expect(aged, "expected a persisted Supabase session to age before resuming").toBeGreaterThan(0);

    // Only traffic from the resume onwards is under test.
    requests.length = 0;
    recording = true;
    holdDataRequests = true;

    // ---- resume ----------------------------------------------------------
    await page.evaluate(setVisibility, "visible" as const);

    await expect
      .poll(() => requests.filter((request) => request.kind === "refresh").length, {
        message: "resuming the Mini App must trigger a proactive token refresh",
        timeout: 20_000,
      })
      .toBeGreaterThan(0);

    // Let any post-resume hydration queries be issued too.
    await page.waitForTimeout(2_000);
    holdDataRequests = false;

    const firstRefresh = requests.findIndex((request) => request.kind === "refresh");
    const firstQuery = requests.findIndex((request) => request.kind === "data");

    if (firstQuery !== -1) {
      expect(
        firstRefresh,
        `a protected query (${requests[firstQuery]?.url}) was issued before the session refresh`,
      ).toBeLessThan(firstQuery);
    }

    // The resumed app must stay signed in and rendered, not bounce to /auth.
    expect(page.url()).not.toMatch(/\/auth\b/);
    await expect(page.getByRole("link", { name: /analytics/i })).toBeVisible();
  });
});
