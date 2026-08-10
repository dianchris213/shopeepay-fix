# End-to-end smoke tests

Playwright coverage for the core journeys:

| Spec | Covers |
| --- | --- |
| `auth.spec.ts` | Sign-in screen + successful authentication routing |
| `wallet-crud.spec.ts` | Wallet create/delete through the confirmation modal |
| `analytics.spec.ts` | Analytics rendering + preset date-range switching |
| `analytics-custom-range.spec.ts` | Custom start/end dates recalculating totals, net flow and the period-over-period delta |
| `a11y-confirm-dialog.spec.ts` | `ConfirmDeleteDialog` ARIA roles, focus trap, Escape/keyboard operation, focus restore |
| `cascading-delete.spec.ts` | Wallet/bill/transaction deletion cascades + immediate income, expense and net-cash-flow recalculation |
| `date-range-edge-cases.spec.ts` | Empty selections, inverted start/end validation, single-day windows, timezone-boundary consistency |
| `visual-regression.spec.ts` | Pixel baselines for the Analytics dashboard and `ConfirmDeleteDialog` |

## Run

```bash
bunx playwright install chromium   # once
bun run test:e2e
```

The config starts `bun run dev` automatically, or reuses a server when
`E2E_BASE_URL` is set.

## Visual regression

`visual-regression.spec.ts` compares the Analytics dashboard and the
`ConfirmDeleteDialog` against committed PNG baselines in
`e2e/__screenshots__/<project>/`. Currency figures and chart geometry are masked,
so the check flags layout/styling breakage rather than data churn. Rendering is
pinned in `playwright.config.ts` (fixed viewport, `colorScheme: dark`,
`locale: en-US`, `timezoneId: UTC`, `deviceScaleFactor: 1`, animations disabled)
and tolerances allow 2% differing pixels.

Missing baselines are written on the first run; review the generated PNGs and
commit them. After an intentional UI change, refresh them with:

```bash
bun run test:e2e:update
```

Because baselines are platform sensitive, generate them on Linux (or in the CI
container) so they match the GitHub Actions runner.

## Credentials

Email confirmation is enabled on the backend, so the authenticated specs need a
confirmed account:

```bash
E2E_EMAIL="you@example.com" E2E_PASSWORD="…" bun run test:e2e
```

Without those variables the authenticated specs are skipped and only the public
sign-in screen check runs.

`E2E_CHROMIUM_PATH` can point at a pre-installed Chromium binary if the
sandbox/CI image already ships one.

## Test data isolation

`e2e/seed.ts` provisions data programmatically through the backend Data API using
the test account's own session (so RLS applies — no service-role key needed):

- one wallet, one bill and three dated transactions, all named with the
  `E2E-SEED` prefix;
- `e2e/global-setup.ts` cleans leftovers, then seeds before the suite runs;
- `e2e/global-teardown.ts` deletes every `E2E-SEED%` row afterwards.

Ad-hoc rows created inside specs use an `E2E ` prefix and are also removed by
teardown, so tests never depend on persistent user state.

## CI

`.github/workflows/e2e.yml` runs the suite on every push and pull request with
Bun, publishes a pass/fail table to the GitHub job summary
(`scripts/e2e-summary.mjs`) and uploads the HTML report as an artifact.

When a run fails it additionally uploads the debugging bundle — Playwright
traces (`bunx playwright show-trace trace.zip`), failure screenshots and videos —
plus any visual-regression `-actual` / `-expected` / `-diff` images, retained for
14 days.

Failing tests are retried automatically (once locally, twice on CI) before the
job is marked red, so transient network jitter cannot produce a false negative;
tests that pass only on retry are reported as flaky in the job summary.

Configure these repository secrets: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`,
`VITE_SUPABASE_PROJECT_ID`, `E2E_EMAIL`, `E2E_PASSWORD`.

## Deterministic time (`e2e/time.ts`)

All specs run against a frozen clock. `installFrozenClock()` (called from
`login()`) pins the browser to `2026-06-15T12:00:00Z` via `page.clock`, and the
seeder inserts hardcoded dates/amounts derived from the same constants. Range
filters therefore select identical rows regardless of machine timezone, CI
region, or when the run happens.

## API-level tests (`e2e/api.spec.ts`)

Browser-free checks against the backend: analytics aggregation over explicit
date ranges (including empty and inverted ranges), wallet/bill deletion
constraints, and per-user scoping. Run with `bun run test:e2e:api`.

### Update / edit contract (`e2e/api-update.spec.ts`)

PATCH coverage for the record-editing paths, straight against PostgREST:
full and partial round-trips, preservation of untouched columns, sibling-row
isolation, and last-write-wins ordering. It also pins the server-side
rejections an edit must never bypass — `NOT NULL` (23502), numeric coercion
(22P02), unknown columns (PGRST204), duplicate wallet/bill names (23505),
broken foreign keys (23503) — plus RLS scoping: a foreign id matches zero
rows, and re-assigning `user_id` is refused by the policy's `WITH CHECK`
(42501). Included in `bun run test:e2e:api`.

## Accessibility audits (`e2e/a11y-audit.spec.ts`)

`@axe-core/playwright` scans Home, Wallets, Analytics, Settings, Bills and the
navigation against WCAG 2.1 A/AA. Any `serious` or `critical` violation fails
the run (and CI); lower-impact findings are attached to the report as JSON.
Run with `bun run test:e2e:a11y`.

### Allowlist and auto-regression tracking (`e2e/a11y-baseline.json`)

Known, deliberately accepted violations live in `e2e/a11y-baseline.json`. The
allowlist is intentionally narrow so it can never hide a regression:

| Field | Meaning |
| --- | --- |
| `screen` + `rule` | The single screen and axe rule the entry covers. |
| `targets` | Exact offending nodes. A **new** node fails even for an allowlisted rule. |
| `maxNodes` | Upper bound; more offending nodes than this fails. |
| `reason` / `owner` | Why it is accepted and who owns the fix. |
| `expires` | After this date the entry stops suppressing and the build goes red. |

Anything not listed fails immediately, so any violation introduced by new code
is an automatic build failure. Entries that stop matching are reported as
stale (and fail under `bun run test:e2e:a11y:strict`) so the list shrinks as
the app improves.

- `bun run test:e2e:a11y` — audit against the allowlist.
- `bun run test:e2e:a11y:strict` — additionally fail on stale entries.
- `bun run test:e2e:a11y:update` — regenerate the allowlist from the current
  run. Review the diff and fill in `reason`/`owner`/`expires` before committing.

## Keyboard navigation (`e2e/keyboard-navigation.spec.ts`)

Drives the app with Tab / Shift+Tab / Enter / Space / Escape only and asserts
the four guarantees keyboard users depend on: reachability (no positive
`tabindex`, every destination focusable), activation (Enter and Space fire the
focused control), containment (focus is trapped inside an open sheet and wraps
at both ends, including nested sheets where Escape closes only the topmost),
and restoration (dismissing a sheet returns focus to its trigger). A form is
also completed end to end without a pointer. Run with
`bun run test:e2e:keyboard`; the same contract is unit-tested in jsdom by
`src/test/sheet-focus.test.tsx`.

## Visual baselines

`visual-regression.spec.ts` covers Analytics and the ConfirmDeleteDialog;
`visual-regression-core.spec.ts` covers the Wallets list, Bills list and the
main navigation in each active state. Refresh baselines deliberately with
`bun run test:e2e:update`.

`visual-regression-modals.spec.ts` covers the states the full-page baselines
never reach: the add-transaction sheet (empty and filled), the manage
wallets/bills sheets, the add-account form, the confirm-delete dialog, and an
analytics window forced to contain no data (the empty state). Each shot is
scoped to the sheet panel rather than the viewport, and currency figures are
masked, so a diff means layout or styling changed — not data. Refresh with
`bun run test:e2e:update:modals`.

## Cross-timezone verification (`e2e/timezone-invariance.spec.ts`)

Two independent clocks can break determinism: the CI runner's `TZ` and the
browser's timezone. The spec re-runs the same pinned analytics window under
UTC, `America/Los_Angeles`, `Asia/Jakarta` and `Pacific/Kiritimati` (UTC+14,
the far side of the date line) and asserts the frozen clock holds and the
rendered totals are identical in every zone. The `timezones` matrix job in
`.github/workflows/e2e.yml` runs it again with the *runner* clock set to each
of those zones, and `Cross-timezone verified` is the single status check that
is green only when the whole matrix passed. Run locally with
`bun run test:e2e:tz` (prefix with `TZ=Asia/Jakarta` to mimic a CI job).
