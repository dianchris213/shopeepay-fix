#!/usr/bin/env bun
/**
 * Turns the Playwright JSON report into a GitHub step summary.
 * Usage (CI): bun scripts/e2e-summary.mjs >> "$GITHUB_STEP_SUMMARY"
 *
 * `renderE2ESummary()` is reused by scripts/pr-comment.mjs so the PR comment
 * and the step summary can never drift apart.
 */
import { existsSync, readFileSync } from "node:fs";

const REPORT = "playwright-report/results.json";

const icon = { passed: "✅", failed: "❌", skipped: "⏭️", flaky: "⚠️" };

// Playwright's JSON reporter uses expected/unexpected/flaky/skipped outcomes.
const normalize = (status) =>
  ({ expected: "passed", unexpected: "failed", timedOut: "failed" })[status] ?? status;

/** Parse the report into `{ tally, rows }`, or null when no report exists. */
export function readE2EReport(reportPath = REPORT) {
  if (!existsSync(reportPath)) return null;
  const report = JSON.parse(readFileSync(reportPath, "utf8"));
  const rows = [];
  const tally = { passed: 0, failed: 0, skipped: 0, flaky: 0 };

  function walk(suite, trail = []) {
    const path = suite.title ? [...trail, suite.title] : trail;
    for (const spec of suite.specs ?? []) {
      for (const result of spec.tests ?? []) {
        const status = normalize(result.status);
        if (status in tally) tally[status] += 1;
        const duration = Math.round((result.results?.[0]?.duration ?? 0) / 100) / 10;
        rows.push({ status, title: [...path, spec.title].join(" › "), duration });
      }
    }
    for (const child of suite.suites ?? []) walk(child, path);
  }

  for (const suite of report.suites ?? []) walk(suite);
  return { tally, rows };
}

/**
 * Markdown summary of the run.
 * @param {{ detailed?: boolean; reportPath?: string }} [options]
 */
export function renderE2ESummary({ detailed = true, reportPath = REPORT } = {}) {
  const parsed = readE2EReport(reportPath);
  if (!parsed) {
    return "### Playwright E2E\n\nNo report produced — see the job log for details.";
  }
  const { tally, rows } = parsed;
  const failed = tally.failed > 0;
  const head = [
    `### Playwright E2E — ${failed ? "❌ failed" : "✅ passed"}`,
    "",
    `**${tally.passed} passed** · ${tally.failed} failed · ${tally.flaky} flaky · ${tally.skipped} skipped`,
    "",
  ];

  // In the PR comment only the interesting rows are listed; the full table
  // stays in the job summary.
  const shown = detailed ? rows : rows.filter((r) => r.status === "failed" || r.status === "flaky");
  if (!detailed && shown.length === 0) return head.join("\n").trimEnd();

  const table = [
    "| Result | Test | Duration |",
    "| --- | --- | --- |",
    ...shown.map((r) => `| ${icon[r.status] ?? "•"} ${r.status} | ${r.title} | ${r.duration}s |`),
  ];
  if (shown.length === 0) table.push("| • | no tests ran | 0s |");
  return [...head, ...table].join("\n");
}

// Direct execution: print the full summary.
if (import.meta.main ?? process.argv[1]?.endsWith("e2e-summary.mjs")) {
  console.log(renderE2ESummary());
}
