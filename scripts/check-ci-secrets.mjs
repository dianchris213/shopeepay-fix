#!/usr/bin/env node
/**
 * Fail-fast guardrail for CI jobs that need real credentials.
 *
 * Playwright (authenticated specs), the axe audit and Lighthouse CI all render
 * protected routes. Without backend config and a test account they do not fail
 * loudly — they render an empty auth screen and "pass", producing a green build
 * that tested nothing. This script is run as the FIRST step of those jobs and
 * aborts with an actionable message instead.
 *
 * Usage:  node scripts/check-ci-secrets.mjs [--backend-only]
 *
 * Each requirement accepts a canonical name plus historical aliases, so a
 * repository configured with either naming convention passes:
 *
 *   E2E_TEST_EMAIL        | E2E_EMAIL
 *   E2E_TEST_PASSWORD     | E2E_PASSWORD
 *   VITE_SUPABASE_URL     | SUPABASE_URL
 *   VITE_SUPABASE_ANON_KEY| VITE_SUPABASE_PUBLISHABLE_KEY | SUPABASE_PUBLISHABLE_KEY
 */

// Local runs read the same git-ignored env files the Playwright suite reads,
// so `bun run e2e:local` fails with the identical message CI would print.
{
  const { existsSync, readFileSync } = await import("node:fs");
  for (const file of [".env.e2e.local", ".env.local", ".env"]) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split("\n")) {
      if (line.trim().startsWith("#")) continue;
      const match = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i.exec(line);
      if (!match || process.env[match[1]]) continue;
      process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
    }
  }
}

const backendOnly = process.argv.includes("--backend-only");

/** @type {{ names: string[]; what: string; where: string; backend?: boolean }[]} */
const REQUIRED = [
  {
    names: ["VITE_SUPABASE_URL", "SUPABASE_URL"],
    what: "Backend API URL",
    where: "Lovable Cloud → project settings (the https://<ref>.supabase.co value)",
    backend: true,
  },
  {
    names: ["VITE_SUPABASE_ANON_KEY", "VITE_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_PUBLISHABLE_KEY"],
    what: "Publishable/anon backend key",
    where: "Lovable Cloud → project settings (never the service-role key)",
    backend: true,
  },
  {
    names: ["E2E_TEST_EMAIL", "E2E_EMAIL"],
    what: "E-mail of the dedicated, confirmed test account",
    where: "an account created only for CI — never a real user",
  },
  {
    names: ["E2E_TEST_PASSWORD", "E2E_PASSWORD"],
    what: "Password of the dedicated test account",
    where: "the same throwaway CI account",
  },
];

const requirements = backendOnly ? REQUIRED.filter((r) => r.backend) : REQUIRED;
const missing = requirements.filter((r) => !r.names.some((n) => (process.env[n] ?? "").trim()));

if (missing.length === 0) {
  console.log(
    `✅ CI secrets present (${requirements.map((r) => r.names[0]).join(", ")}).` +
      " Values are never printed.",
  );
  process.exit(0);
}

const lines = [
  "",
  "❌ Missing required CI secrets — refusing to run tests that would silently pass.",
  "",
  ...missing.flatMap((r) => [
    `  • ${r.names[0]}${r.names.length > 1 ? `  (or ${r.names.slice(1).join(" / ")})` : ""}`,
    `      ${r.what}`,
    `      Source: ${r.where}`,
  ]),
  "",
  "Configure them in GitHub → Settings → Secrets and variables → Actions →",
  '"New repository secret", then re-run this workflow.',
  "Locally, put the same values in .env.e2e.local (git-ignored).",
  "",
];

console.error(lines.join("\n"));

// Surface the same message in the job summary so reviewers see it without
// opening the raw log.
if (process.env["GITHUB_STEP_SUMMARY"]) {
  const { appendFileSync } = await import("node:fs");
  appendFileSync(
    process.env["GITHUB_STEP_SUMMARY"],
    `### ❌ Missing CI secrets\n\n${missing
      .map((r) => `- \`${r.names[0]}\` — ${r.what}`)
      .join("\n")}\n\nAdd them under **Settings → Secrets and variables → Actions**.\n`,
  );
}

process.exit(1);
