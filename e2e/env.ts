import { existsSync, readFileSync } from "node:fs";

/**
 * Files read (in order) when the suite boots. Earlier wins: a value already in
 * `process.env` (CI / GitHub Actions Secrets, or an inline `E2E_EMAIL=… bunx
 * playwright test`) is never overwritten by a file.
 *
 * `.env` is committed and holds only publishable backend config. Secrets such
 * as `E2E_EMAIL` / `E2E_PASSWORD` belong in `.env.e2e.local` (or `.env.local`),
 * both git-ignored — never in `.env`.
 */
const ENV_FILES = [".env.e2e.local", ".env.local", ".env"] as const;

/**
 * Minimal .env loader — Playwright does not read .env by itself and we only
 * need the publishable Supabase values plus the E2E credentials.
 */
export function loadEnv(files: readonly string[] = ENV_FILES) {
  for (const file of files) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const match = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i.exec(line);
      if (!match || line.trim().startsWith("#")) continue;
      const key = match[1]!;
      if (process.env[key]) continue;
      process.env[key] = match[2]!.replace(/^['"]|['"]$/g, "");
    }
  }
}

export type E2ECredentials = { email: string; password: string };

/** First non-empty value among the given variable names. */
function pick(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name];
    if (value && value.trim()) return value;
  }
  return undefined;
}

/**
 * Credentials for the dedicated test account, or `null` when unconfigured.
 * `E2E_TEST_EMAIL` / `E2E_TEST_PASSWORD` are the canonical names;
 * `E2E_EMAIL` / `E2E_PASSWORD` remain supported as aliases.
 */
export function readCredentials(): E2ECredentials | null {
  const email = pick("E2E_TEST_EMAIL", "E2E_EMAIL");
  const password = pick("E2E_TEST_PASSWORD", "E2E_PASSWORD");
  return email && password ? { email, password } : null;
}

/** Publishable backend config used by the seeder (never the service-role key). */
export function readBackendConfig() {
  const url = pick("VITE_SUPABASE_URL", "SUPABASE_URL");
  const key = pick(
    "VITE_SUPABASE_ANON_KEY",
    "VITE_SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_PUBLISHABLE_KEY",
  );
  return url && key ? { url, key } : null;
}

/**
 * On CI (or when `E2E_REQUIRE_CREDENTIALS=1`) a missing credential is a hard
 * failure: silently skipping the authenticated specs would produce a green
 * build that tested nothing.
 */
export function assertCredentialsWhenRequired() {
  const required = Boolean(process.env["CI"] ?? process.env["E2E_REQUIRE_CREDENTIALS"]);
  if (!required) return;
  const credentials = readCredentials();
  const missing = [
    !credentials && "E2E_TEST_EMAIL / E2E_TEST_PASSWORD (aliases: E2E_EMAIL / E2E_PASSWORD)",
    !readBackendConfig() && "VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY",
  ].filter(Boolean);

  if (missing.length === 0) return;
  throw new Error(
    `E2E credentials are required here but missing: ${missing.join(", ")}.\n` +
      "Locally: put them in .env.e2e.local (git-ignored).\n" +
      "CI: add them under Settings → Secrets and variables → Actions.",
  );
}
