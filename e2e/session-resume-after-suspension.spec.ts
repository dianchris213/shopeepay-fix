import { expect, test } from "@playwright/test";

import { hasCredentials, login, missingCredentialsMessage } from "./helpers";

import { allowTransientRetries } from "./flaky";

allowTransientRetries("depends on a real token refresh round trip");

/**
 * Long-suspension resume.
 *
 * A Telegram Mini App (or a backgrounded mobile tab) can sit frozen for hours.
 * When it wakes up, the cached access token is already expired — so the very
 * first PostgREST call would 401 unless the proactive refresh layer
 * (`session-resilience.ts` + `session-refresh.ts`) gets in front of it.
 *
 * This spec reproduces exactly that sequence and asserts the ordering
 * guarantee rather than the absence of a visible error:
 *
 *   1. sign in, then rewrite the persisted session so `expires_at` is in the
 *      past — the state the app finds itself in after a long suspension;
 *   2. fire the foreground transition the app listens for
 *      (`visibilitychange` + `focus` + `online`);
 *   3. assert a token refresh is issued, that it happens *before* the first
 *      data query after resume, and that no data or auth response in the whole
 *      resume window came back 401/403.
 */

type Observed = {
  /** "refresh" = auth token refresh, "data" = PostgREST/RPC query. */
  kind: "refresh" | "data" | "auth";
  status: number;
  url: string;
};

function classify(url: string): Observed["kind"] | null {
  if (/\/auth\/v1\/token\b/.test(url)) {
    return /grant_type=refresh_token/.test(url) ? "refresh" : "auth";
  }
  if (/\/auth\/v1\//.test(url)) return "auth";
  if (/\/rest\/v1\//.test(url)) return "data";
  return null;
}

test.describe("resume after long suspension", () => {
  test.skip(!hasCredentials, missingCredentialsMessage);

  test("proactive refresh runs before any query and no request 401/403s", async ({ page }) => {
    const observed: Observed[] = [];

    page.on("response", (response) => {
      const kind = classify(response.url());
      if (!kind) return;
      observed.push({ kind, status: response.status(), url: response.url() });
    });

    await login(page);

    // Everything recorded from here on belongs to the resume window.
    const resumeStart = observed.length;

    // ---- 1. Simulate the suspension -------------------------------------
    // Age the persisted session so the cached access token is already expired,
    // which is what the app would find after hours in the background.
    const expired = await page.evaluate(() => {
      const keys = Object.keys(window.localStorage).filter(
        (key) => key.startsWith("sb-") && key.endsWith("-auth-token"),
      );
      let patched = 0;
      for (const key of keys) {
        const raw = window.localStorage.getItem(key);
        if (!raw) continue;
        try {
          const session = JSON.parse(raw) as {
            expires_at?: number;
            expires_in?: number;
          } | null;
          if (!session || typeof session !== "object") continue;
          // 6 hours in the past: unambiguously expired, not merely stale.
          session.expires_at = Math.floor(Date.now() / 1000) - 6 * 60 * 60;
          session.expires_in = 0;
          window.localStorage.setItem(key, JSON.stringify(session));
          patched += 1;
        } catch {
          // Not a session payload — ignore.
        }
      }
      return { keys: keys.length, patched };
    });

    // A green run must mean the scenario was actually set up.
    expect(
      expired.patched,
      "expected a persisted Supabase session to age; none was found in localStorage",
    ).toBeGreaterThan(0);

    // ---- 2. Simulate the resume -----------------------------------------
    // The app re-verifies on visibility, focus and reconnect; fire all three,
    // exactly as a real foreground transition would.
    await page.evaluate(() => {
      document.dispatchEvent(new Event("visibilitychange"));
      window.dispatchEvent(new Event("focus"));
      window.dispatchEvent(new Event("online"));
    });

    // ---- 3. A refresh must be issued ------------------------------------
    await expect
      .poll(() => observed.slice(resumeStart).filter((event) => event.kind === "refresh").length, {
        message: "expected a refresh_token request after the app resumed",
        timeout: 20_000,
      })
      .toBeGreaterThan(0);

    const window_ = observed.slice(resumeStart);
    const firstRefresh = window_.findIndex((event) => event.kind === "refresh");
    const firstQuery = window_.findIndex((event) => event.kind === "data");

    // The refresh must land before the app talks to the database again. When
    // no query happened yet, the ordering guarantee holds trivially.
    if (firstQuery !== -1) {
      expect(
        firstRefresh,
        `a data query (${window_[firstQuery]?.url}) was issued before the session was refreshed`,
      ).toBeLessThan(firstQuery);
    }

    // The refresh itself must succeed, otherwise "no 401 yet" is luck.
    expect(window_[firstRefresh]?.status).toBeLessThan(400);

    // ---- 4. No request in the resume window may be rejected -------------
    const rejected = window_.filter((event) => event.status === 401 || event.status === 403);
    expect(
      rejected.map((event) => `${event.status} ${event.kind} ${event.url}`),
      "the proactive refresh must prevent every 401/403 after resuming",
    ).toEqual([]);

    // Give any post-resume hydration a chance to fire and re-check, so a late
    // query cannot slip a 401 in after the assertions above.
    await page.waitForTimeout(2_000);
    const lateRejected = observed
      .slice(resumeStart)
      .filter((event) => event.status === 401 || event.status === 403);
    expect(lateRejected.map((event) => `${event.status} ${event.url}`)).toEqual([]);

    // And the user is still signed in — the app must not have bounced to the
    // auth screen while recovering the session.
    await expect(page.getByRole("link", { name: /analytics/i })).toBeVisible();
  });
});
