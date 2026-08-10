#!/usr/bin/env bun
/**
 * Builds the structured PR comment body from the CI artifacts:
 *   - Playwright results (playwright-report/results.json)
 *   - Lighthouse scores, key metrics and failed budgets (.lighthouseci/)
 *   - direct links to the uploaded workflow artifacts
 *
 * Usage: bun scripts/pr-comment.mjs > pr-comment.md
 *
 * The workflow posts (or updates) the file with actions/github-script, keyed by
 * the HTML marker below so a PR keeps exactly one comment.
 */
import { writeFileSync } from "node:fs";

import { renderE2ESummary } from "./e2e-summary.mjs";
import { renderLighthouseSummary } from "./lighthouse-summary.mjs";

export const MARKER = "<!-- ci-summary: fortress-sentinel -->";

const env = (name) => process.env[name] ?? "";
const runUrl =
  env("GITHUB_SERVER_URL") && env("GITHUB_REPOSITORY") && env("GITHUB_RUN_ID")
    ? `${env("GITHUB_SERVER_URL")}/${env("GITHUB_REPOSITORY")}/actions/runs/${env("GITHUB_RUN_ID")}`
    : null;

const body = [
  MARKER,
  "## CI summary",
  "",
  renderE2ESummary({ detailed: false }),
  "",
  renderLighthouseSummary(),
  "",
  "---",
  "",
  runUrl
    ? `📦 **Artifacts** (traces, videos, screenshots, HTML report, Lighthouse JSON): [workflow run](${runUrl}#artifacts) · commit \`${env("GITHUB_SHA").slice(0, 7)}\``
    : "📦 Artifacts are attached to the workflow run.",
  "",
  "_Traces open with `bunx playwright show-trace <trace.zip>` after downloading the `playwright-report-*` artifact._",
].join("\n");

const out = process.argv[2];
if (out) writeFileSync(out, `${body}\n`);
else console.log(body);
