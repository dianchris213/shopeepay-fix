#!/usr/bin/env bun
/**
 * Turns the Lighthouse CI output in `.lighthouseci/` into markdown: the
 * category scores and key metrics per URL, plus every failed budget/assertion.
 *
 * Usage (CI): bun scripts/lighthouse-summary.mjs >> "$GITHUB_STEP_SUMMARY"
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DIR = ".lighthouseci";

const METRICS = [
  ["first-contentful-paint", "FCP"],
  ["largest-contentful-paint", "LCP"],
  ["total-blocking-time", "TBT"],
  ["cumulative-layout-shift", "CLS"],
];

const pct = (v) => (typeof v === "number" ? Math.round(v * 100) : null);
const score = (v) => (v == null ? "–" : `${v >= 90 ? "🟢" : v >= 50 ? "🟡" : "🔴"} ${v}`);

/** @returns {string} markdown */
export function renderLighthouseSummary(dir = DIR) {
  if (!existsSync(dir)) {
    return "### Lighthouse CI\n\nNo Lighthouse output found — see the job log for details.";
  }

  const files = readdirSync(dir).filter((f) => /^lhr-.*\.json$/.test(f));
  if (files.length === 0) {
    return "### Lighthouse CI\n\nNo Lighthouse reports produced — see the job log for details.";
  }

  // Keep the last run per URL (LHCI runs each URL `numberOfRuns` times).
  const byUrl = new Map();
  for (const file of files) {
    try {
      const lhr = JSON.parse(readFileSync(join(dir, file), "utf8"));
      byUrl.set(lhr.finalDisplayedUrl ?? lhr.requestedUrl, lhr);
    } catch {
      /* a truncated report must not break the summary */
    }
  }

  const rows = [];
  for (const [url, lhr] of byUrl) {
    const path = new URL(url).pathname;
    const cats = lhr.categories ?? {};
    const metrics = METRICS.map(([id]) => lhr.audits?.[id]?.displayValue ?? "–");
    rows.push(
      `| \`${path}\` | ${score(pct(cats.performance?.score))} | ${score(
        pct(cats.accessibility?.score),
      )} | ${metrics.join(" | ")} |`,
    );
  }

  // Failed assertions (performance budgets, metric caps) from lighthouserc.json.
  const failures = [];
  const assertionsFile = join(dir, "assertion-results.json");
  if (existsSync(assertionsFile)) {
    try {
      for (const a of JSON.parse(readFileSync(assertionsFile, "utf8"))) {
        if (a.passed) continue;
        failures.push(
          `| ${a.level === "error" ? "❌" : "⚠️"} | \`${a.auditId}\` | ${a.actual} | ${a.expected} (${a.operator}) | \`${new URL(a.url).pathname}\` |`,
        );
      }
    } catch {
      /* ignore malformed assertion output */
    }
  }

  const out = [
    `### Lighthouse CI — ${failures.some((f) => f.startsWith("| ❌")) ? "❌ budget exceeded" : "✅ within budget"}`,
    "",
    `| Route | Perf | A11y | ${METRICS.map(([, label]) => label).join(" | ")} |`,
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...rows,
  ];

  if (failures.length > 0) {
    out.push(
      "",
      "<details><summary>Failed assertions & budgets</summary>",
      "",
      "| | Audit | Actual | Budget | Route |",
      "| --- | --- | --- | --- | --- |",
      ...failures,
      "",
      "</details>",
    );
  }

  return out.join("\n");
}

if (import.meta.main ?? process.argv[1]?.endsWith("lighthouse-summary.mjs")) {
  console.log(renderLighthouseSummary());
}
