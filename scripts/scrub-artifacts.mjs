#!/usr/bin/env bun
/**
 * Redacts anything secret that may have landed in a Playwright artifact before
 * it is uploaded to GitHub Actions.
 *
 * Playwright records network activity and DOM snapshots. Even though the suite
 * avoids typing raw credentials where possible, an access token can still end
 * up in a trace's network log, an HTML report or a JSON result. This script
 * rewrites every text-ish artifact, replacing known secret values (read from
 * the environment) and any bearer/JWT-shaped string with a placeholder.
 *
 * Usage:  bun scripts/scrub-artifacts.mjs [dir ...]     (default: test-results, playwright-report)
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";

const DIRS = process.argv.slice(2);
const TARGETS = DIRS.length > 0 ? DIRS : ["test-results", "playwright-report"];
const TEXT_EXT = new Set([".json", ".txt", ".log", ".html", ".md", ".xml", ".csv", ".har"]);
const PLACEHOLDER = "***REDACTED***";

/** Env vars whose literal values must never appear in an artifact. */
const SECRET_VARS = [
  "E2E_TEST_PASSWORD",
  "E2E_PASSWORD",
  "E2E_TEST_EMAIL",
  "E2E_EMAIL",
  "VITE_SUPABASE_ANON_KEY",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SENTRY_AUTH_TOKEN",
];

const literals = SECRET_VARS.map((name) => (process.env[name] ?? "").trim())
  .filter((v) => v.length >= 8)
  // Longest first so a prefix never shadows a longer secret.
  .sort((a, b) => b.length - a.length);

/** Token shapes that are secret regardless of the environment. */
const PATTERNS = [
  // JWT access/refresh tokens
  [/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, PLACEHOLDER],
  // Supabase publishable / secret keys
  [/sb_(?:publishable|secret)_[A-Za-z0-9_-]{8,}/g, PLACEHOLDER],
  // Authorization / apikey headers and JSON fields
  [/("(?:authorization|apikey|api_key)"\s*:\s*")[^"]+(")/gi, `$1${PLACEHOLDER}$2`],
  [/(bearer\s+)[A-Za-z0-9._-]{8,}/gi, `$1${PLACEHOLDER}`],
  [
    /("(?:access_token|refresh_token|provider_token|password)"\s*:\s*")[^"]*(")/g,
    `$1${PLACEHOLDER}$2`,
  ],
];

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function scrubText(text) {
  let out = text;
  for (const literal of literals) out = out.replaceAll(literal, PLACEHOLDER);
  for (const [pattern, replacement] of PATTERNS) out = out.replace(pattern, replacement);
  // Trailing safety net: masked email local-parts in query strings.
  for (const literal of literals)
    out = out.replace(new RegExp(escape(encodeURIComponent(literal)), "g"), PLACEHOLDER);
  return out;
}

let scanned = 0;
let changed = 0;

function walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return; // artifact directory absent (nothing failed) — fine
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walk(full);
      continue;
    }
    if (!TEXT_EXT.has(extname(entry).toLowerCase())) continue;
    scanned += 1;
    const original = readFileSync(full, "utf8");
    const scrubbed = scrubText(original);
    if (scrubbed !== original) {
      writeFileSync(full, scrubbed);
      changed += 1;
    }
  }
}

for (const dir of TARGETS) walk(dir);

console.log(
  `🔒 Artifact scrub: ${scanned} text file(s) scanned, ${changed} redacted ` +
    `(${literals.length} secret value(s) known to this run).`,
);
