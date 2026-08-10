import { defineConfig, devices } from "@playwright/test";

import { loadEnv } from "./e2e/env";

loadEnv();

const PORT = Number(process.env["E2E_PORT"] ?? 8080);
const baseURL = process.env["E2E_BASE_URL"] ?? `http://localhost:${PORT}`;
const isCI = Boolean(process.env["CI"]);

/**
 * Playwright smoke-test setup.
 *
 * Run with:  bunx playwright test
 * Credentials: set E2E_EMAIL / E2E_PASSWORD to a confirmed account.
 * Test data is provisioned by e2e/global-setup.ts and removed again by
 * e2e/global-teardown.ts so runs never depend on persistent DB state.
 *
 * Flake policy: a failing test is retried once (twice on CI) before the run is
 * marked failed, so transient network jitter against the backend cannot turn
 * into a red build. Tests that only pass on retry are reported as "flaky".
 * Diagnostics (trace + screenshot + video) are retained for those attempts.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: {
    timeout: 10_000,
    // Visual-regression tolerances: small anti-aliasing differences must not
    // fail a run, real layout breakage must.
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.02,
      threshold: 0.2,
      animations: "disabled",
      caret: "hide",
      scale: "css",
    },
  },
  // Baselines are committed next to the specs, one folder per snapshot name.
  snapshotPathTemplate: "{testDir}/__screenshots__/{projectName}/{arg}{ext}",
  updateSnapshots: "missing",
  fullyParallel: false,
  workers: 1,
  // Targeted retries: one CI attempt for everything, so a genuine regression
  // still turns the job red. Specs that depend on flaky infrastructure opt into
  // up to two extra attempts via `allowTransientRetries()` (see e2e/flaky.ts)
  // and must be listed in e2e/flaky-allowlist.json;
  // scripts/assert-no-flaky.mjs fails the job on any other retried test.
  retries: isCI ? 1 : 0,
  // Never let a cascade of failures burn the whole CI budget.
  maxFailures: isCI ? 5 : 0,
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  reporter: isCI
    ? [
        ["github"],
        ["list"],
        ["json", { outputFile: "playwright-report/results.json" }],
        ["html", { outputFolder: "playwright-report/html", open: "never" }],
      ]
    : [["list"]],
  // Traces, screenshots and videos land here and are uploaded by CI on failure.
  outputDir: "test-results",
  use: {
    baseURL,
    // `sources: false` keeps repository source files out of the uploaded trace;
    // scripts/scrub-artifacts.mjs redacts tokens from the remaining text logs.
    trace: { mode: "retain-on-failure", sources: false, screenshots: true, snapshots: true },
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    ...devices["Desktop Chrome"],
    viewport: { width: 430, height: 932 },
    // Deterministic rendering for the visual-regression baselines.
    colorScheme: "dark",
    locale: "en-US",
    timezoneId: "UTC",
    deviceScaleFactor: 1,
    // Optional escape hatch for environments with a pre-installed browser.
    launchOptions: process.env["E2E_CHROMIUM_PATH"]
      ? { executablePath: process.env["E2E_CHROMIUM_PATH"] }
      : {},
  },
  /**
   * Cross-browser matrix.
   *
   *  - chromium      : the full suite (functional + committed visual baselines).
   *  - webkit        : the same functional suite on the Safari engine, which is
   *                    what Telegram iOS actually renders with. Pixel baselines
   *                    are engine-specific, so visual specs are excluded here.
   *  - mobile-safari : iPhone-sized WebKit, used for the iOS dark-mode visual
   *                    regression baselines only.
   *
   * Run everything: bun run test:e2e:cross-browser
   */
  projects: [
    {
      name: "chromium",
      testIgnore: /visual-regression-ios-dark\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 430, height: 932 } },
    },
    {
      name: "webkit",
      testIgnore: /visual-regression.*\.spec\.ts/,
      use: { ...devices["Desktop Safari"], viewport: { width: 430, height: 932 } },
    },
    {
      name: "mobile-safari",
      testMatch: /visual-regression-ios-dark\.spec\.ts/,
      use: { ...devices["iPhone 14 Pro"] },
    },
  ],
  webServer: process.env["E2E_BASE_URL"]
    ? undefined
    : {
        command: "bun run dev",
        url: baseURL,
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
