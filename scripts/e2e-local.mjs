#!/usr/bin/env node
/**
 * One-command local E2E runner — the same pipeline CI executes, on a laptop.
 *
 *   bun run e2e:local                     # full chromium suite
 *   bun run e2e:local -- --project=webkit # any extra playwright flags
 *   bun run e2e:local -- wallet-crud.spec.ts
 *
 * Lifecycle:
 *   1. validate the local secrets/.env files (fails fast, never prints values)
 *   2. reset + seed the backend fixtures
 *   3. run Playwright with the CI configuration (playwright.config.ts also
 *      starts and stops the dev server, so no stray process is left behind)
 *   4. scrub artifacts, then always reset the backend — even on Ctrl-C
 *
 * Cross-platform: pure Node, no shell built-ins, no `&&` chains.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import process from "node:process";

const runner = process.env["npm_execpath"]?.includes("bun") ? "bun" : "bunx";

function run(command, args, { optional = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: process.platform === "win32",
      env: process.env,
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0 || optional) resolve(code ?? 0);
      else
        reject(Object.assign(new Error(`${command} ${args.join(" ")} exited ${code}`), { code }));
    });
  });
}

const step = (n, label) => console.log(`\n\x1b[1m[${n}/4] ${label}\x1b[0m`);

let cleanedUp = false;
async function teardown() {
  if (cleanedUp) return;
  cleanedUp = true;
  step(4, "Scrubbing artifacts and resetting the backend");
  await run("bun", ["scripts/scrub-artifacts.mjs"], { optional: true });
  await run("bun", ["scripts/e2e-seed.mjs", "reset"], { optional: true });
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    teardown().finally(() => process.exit(130));
  });
}

async function main() {
  step(1, "Validating local environment");
  if (!existsSync(".env.e2e.local") && !existsSync(".env.local") && !process.env["CI"]) {
    console.log("ℹ️  No .env.e2e.local found — reading credentials from the current environment.");
  }
  // The validator loads the same .env files the suite does, so a local run
  // fails with the identical, actionable message CI would print.
  await run("bun", ["scripts/check-ci-secrets.mjs"]);

  step(2, "Resetting and seeding deterministic fixtures");
  await run("bun", ["scripts/e2e-seed.mjs", "seed"]);

  step(3, "Running Playwright (same config as CI)");
  const extra = process.argv.slice(2);
  const args = ["playwright", "test", ...(extra.length ? extra : ["--project=chromium"])];
  await run(runner === "bun" ? "bunx" : runner, args);

  await teardown();
  console.log("\n✅ Local E2E run finished — backend reset to baseline.");
}

main().catch(async (error) => {
  console.error(`\n❌ ${error.message}`);
  await teardown();
  process.exit(typeof error.code === "number" && error.code !== 0 ? error.code : 1);
});
