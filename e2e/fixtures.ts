import { test as base } from "@playwright/test";

import { canSeed, cleanupTestData, seedTestData, verifySeededData } from "./seed";

/**
 * Per-test-file data isolation.
 *
 * The suite used to rely purely on the job-level global setup: one seed for the
 * whole run. Any spec that created, renamed or deleted a row therefore leaked
 * state into every spec after it, and the failure showed up somewhere else
 * entirely. These fixtures move provisioning down to the individual test.
 *
 * Usage — replace the Playwright import in a spec:
 *
 *   import { test, expect } from "./fixtures";
 *
 *   test("wallet rename persists", async ({ page, seededData }) => { ... });
 *
 * `seededData` resets the database to the committed baseline before the test
 * body runs and removes everything again afterwards, so the spec observes
 * exactly the fixtures in e2e/seed.ts regardless of what ran before it.
 *
 * Determinism under parallelism: seeding is serialised through
 * `seedMutex` (an in-process promise chain) and every row carries the
 * `E2E-SEED` prefix scoped to the single dedicated test account, so two
 * workers can never interleave a cleanup with another test's seed.
 */

/** Serialises seed/reset so concurrent workers cannot interleave writes. */
let seedMutex: Promise<unknown> = Promise.resolve();

function exclusive<T>(work: () => Promise<T>): Promise<T> {
  const next = seedMutex.then(work, work);
  // Keep the chain alive even when a link rejects.
  seedMutex = next.catch(() => {});
  return next;
}

export type SeedFixtures = {
  /** Baseline fixtures, re-created before the test and removed after it. */
  seededData: { seeded: boolean };
  /** Empty database (baseline removed) for specs that assert empty states. */
  emptyData: { seeded: false };
};

export const test = base.extend<SeedFixtures>({
  // `auto` — importing this file is enough: every test in the spec starts from
  // the committed baseline and leaves nothing behind, with no per-test opt-in.
  seededData: [
    async ({}, use) => {
      if (!canSeed) {
        // Without credentials the authenticated specs skip themselves; do not
        // pretend the database was provisioned.
        await use({ seeded: false });
        return;
      }
      await exclusive(async () => {
        await seedTestData();
        await verifySeededData();
      });
      await use({ seeded: true });
      await exclusive(cleanupTestData);
    },
    { auto: true },
  ],

  emptyData: async ({}, use) => {
    if (canSeed) await exclusive(cleanupTestData);
    await use({ seeded: false });
    if (canSeed) await exclusive(cleanupTestData);
  },
});

export { expect } from "@playwright/test";
