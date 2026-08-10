import { test } from "@playwright/test";

/**
 * Controlled, *targeted* retries.
 *
 * Blanket retries hide real regressions: a test that only passes on the third
 * attempt is a broken test, not a network hiccup. The suite therefore runs with
 * a single CI retry by default (see playwright.config.ts) and only specs that
 * legitimately depend on flaky infrastructure — a live backend round trip,
 * WebKit's slower paint pipeline — opt into more.
 *
 * Call at the top of a spec file, outside any `test()`:
 *
 *   allowTransientRetries("hits the live backend; DNS/TLS jitter is expected");
 *
 * Every opted-in file must also be listed in e2e/flaky-allowlist.json.
 * `scripts/assert-no-flaky.mjs` runs after the suite and fails the job when a
 * test outside that allowlist needed a retry, so the final CI status always
 * reflects the real outcome.
 */
export const TRANSIENT_RETRIES = 2;

export function allowTransientRetries(reason: string, retries = TRANSIENT_RETRIES) {
  test.describe.configure({ retries });
  test.beforeEach(async ({}, testInfo) => {
    testInfo.annotations.push({ type: "transient-retries", description: reason });
  });
}
