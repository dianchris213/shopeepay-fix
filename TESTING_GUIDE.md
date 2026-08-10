# Testing guide

How to run the Playwright suite, where credentials live, and — most
importantly — how to regenerate visual and accessibility baselines safely.

## 1. Credentials

The authenticated specs sign in as one dedicated test account. Credentials are
**never** committed.

| Where   | How                                                                                                                                                                     |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local   | `cp .env.e2e.example .env.e2e.local` and fill in `E2E_EMAIL` / `E2E_PASSWORD`. The file is git-ignored.                                                                 |
| CI      | Repository → Settings → Secrets and variables → Actions: `E2E_EMAIL`, `E2E_PASSWORD`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`. |
| One-off | `E2E_EMAIL=… E2E_PASSWORD=… bun run test:e2e` (inline values win over files).                                                                                           |

The committed `.env` holds publishable backend config only. Load order is
`.env.e2e.local` → `.env.local` → `.env`, and anything already in the
environment always wins (`e2e/env.ts`).

Missing credentials **skip** the authenticated specs locally but **fail** the
run on CI (or with `E2E_REQUIRE_CREDENTIALS=1`), so a green build can never
mean "nothing was tested".

If the account does not exist yet, the seeder creates it on first run. With
email confirmation enabled you must confirm the address once, then re-run.

## 2. Deterministic seeding

`e2e/global-setup.ts` runs before the suite and always performs the same three
steps: **clean → seed → verify**.

- Fixtures come from `e2e/time.ts` (frozen clock `2026-06-15T12:00:00Z`, fixed
  dates and amounts) — never from the real wall clock.
- Seeded state: 1 wallet, 1 bill, 3 dated transactions (this month income +
  expense, last month expense), all prefixed `E2E-SEED`.
- Seeding uses the test account's own session, so RLS applies and no
  service-role key is needed.
- `verifySeededData()` re-reads the rows and fails setup if the counts differ,
  so a half-seeded database never masquerades as a broken feature.
- `e2e/global-teardown.ts` deletes every `E2E-SEED%` row afterwards.

Result: identical assertions on any machine, in any timezone, on any day.

## 3. Running

```bash
bunx playwright install chromium   # once
bun run test:e2e                   # full suite
bun run test:e2e:ui                # interactive
bun run test:e2e:api               # browser-free API contract tests
bun run test:e2e:a11y              # accessibility audit
bun run test:e2e:tz                # timezone-sensitive specs
```

## 4. Regenerating visual baselines

Only regenerate when the UI change is **intentional**.

```bash
# 1. Confirm the failure is the change you meant to make.
bun run test:e2e
bunx playwright show-report playwright-report/html

# 2. Update page-level baselines (Analytics, core screens).
bun run test:e2e:update

# 3. Update modal/dialog baselines.
bun run test:e2e:update:modals

# 4. Re-run clean, with no update flag, to prove the new baselines are stable.
bun run test:e2e

# Single snapshot only (safest — smallest possible diff):
bunx playwright test visual-regression.spec.ts -g "analytics dashboard" --update-snapshots
```

Baselines live in `e2e/__screenshots__/<project>/`.

**Best practices**

- Baselines are platform sensitive. Generate them on Linux (or in the CI
  container) so they match the GitHub Actions runner; macOS-generated PNGs
  will fail CI on font rendering alone.
- Never blanket-update. Update the specific spec or snapshot that changed, so
  an unrelated regression cannot be baked into a baseline.
- Regenerate on a clean seed (`bun run test:e2e` performs setup automatically)
  — never against hand-edited local data.
- Commit baseline PNGs in their **own commit**, separate from code, with a
  message naming the intentional UI change.

## 5. Regenerating the accessibility baseline

```bash
# See what changed first.
bun run test:e2e:a11y

# Regenerate the allowlist from the current run.
bun run test:e2e:a11y:update

# Then fail on stale/unmatched entries before pushing.
bun run test:e2e:a11y:strict
```

`e2e/a11y-baseline.json` is an allowlist of deliberately accepted violations.
After regenerating, fill in `reason`, `owner` and `expires` for every new
entry — an entry without them is an untracked bug, not an accepted one. The
list should shrink over time; a growing list in a PR needs justification.

## 6. Reviewing baseline diffs in a PR

1. Open the PR's **Files changed** and use GitHub's image swipe/onion-skin view
   on each changed PNG.
2. Check the diff is confined to the component you touched — stray changes in
   spacing, fonts or colors elsewhere mean the change was broader than intended.
3. Confirm masked regions (currency figures, chart geometry) are still masked;
   a diff in a masked area means a mask selector broke.
4. Check the snapshot count: new files = new coverage (good), deleted files =
   lost coverage (needs an explanation).
5. For a failing CI run, download the artifacts from the run page:
   `playwright-report` (HTML report), `playwright-failure-artifacts-*`
   (traces, screenshots, videos) and `playwright-visual-diffs-*`
   (`-actual` / `-expected` / `-diff` PNGs). Open a trace with:

   ```bash
   bunx playwright show-trace trace.zip
   ```

6. Approving a PR that touches baselines means approving the new screenshots —
   review them as carefully as the code.
