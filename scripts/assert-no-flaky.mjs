#!/usr/bin/env bun
/**
 * Flaky guard: fails the job when a test needed a retry without being on the
 * allowlist, so controlled retries can never quietly mask a real regression.
 *
 * Usage (CI, after the Playwright run):  bun scripts/assert-no-flaky.mjs
 * Exit codes: 0 = clean or allowlisted only, 1 = unexpected flakiness.
 */
import { existsSync, readFileSync } from "node:fs";

const REPORT = "playwright-report/results.json";
const ALLOWLIST = "e2e/flaky-allowlist.json";

if (!existsSync(REPORT)) {
  console.log("ℹ️  No Playwright JSON report — nothing to check.");
  process.exit(0);
}

const allow = existsSync(ALLOWLIST)
  ? new Map(
      (JSON.parse(readFileSync(ALLOWLIST, "utf8")).allow ?? []).map((e) => [e.file, e.reason]),
    )
  : new Map();

const report = JSON.parse(readFileSync(REPORT, "utf8"));
const flaky = [];

function walk(suite, file = suite.file) {
  for (const spec of suite.specs ?? []) {
    for (const test of spec.tests ?? []) {
      if (test.status !== "flaky") continue;
      const specFile = (spec.file ?? file ?? "").split("/").pop() ?? "";
      flaky.push({
        file: specFile,
        title: spec.title,
        attempts: test.results?.length ?? 0,
        allowed: allow.has(specFile),
      });
    }
  }
  for (const child of suite.suites ?? []) walk(child, child.file ?? file);
}
for (const suite of report.suites ?? []) walk(suite);

const unexpected = flaky.filter((f) => !f.allowed);

for (const f of flaky) {
  const label = f.allowed ? "⚠️  allowlisted flaky" : "❌ unexpected flaky";
  console.log(`${label}: ${f.file} › ${f.title} (${f.attempts} attempts)`);
  if (f.allowed) console.log(`     reason: ${allow.get(f.file)}`);
}

if (unexpected.length === 0) {
  console.log(`✅ No unexpected flakiness (${flaky.length} allowlisted retries).`);
  process.exit(0);
}

console.error(
  `\n❌ ${unexpected.length} test(s) passed only on retry and are not on the allowlist.\n` +
    "   Fix the test (preferred), or add the spec to e2e/flaky-allowlist.json with a\n" +
    "   written reason and call allowTransientRetries() in that file.\n",
);
process.exit(1);
