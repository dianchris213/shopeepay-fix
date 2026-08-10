import { assertCredentialsWhenRequired, loadEnv } from "./env";
import { canSeed, cleanupTestData, seedTestData, verifySeededData } from "./seed";

/**
 * Provisions a deterministic database state before the suite runs:
 * clean leftovers → seed fixtures → verify what landed.
 */
export default async function globalSetup() {
  loadEnv();
  // Green-but-skipped runs are worse than red runs: on CI a missing credential
  // aborts the job instead of quietly disabling the authenticated specs.
  assertCredentialsWhenRequired();

  if (!canSeed) {
    console.warn(
      "[e2e] Skipping data seeding: set E2E_EMAIL / E2E_PASSWORD (see TESTING_GUIDE.md).",
    );
    return;
  }

  await cleanupTestData();
  await seedTestData();
  await verifySeededData();
  console.log("[e2e] Seeded deterministic fixtures (1 wallet, 1 bill, 3 transactions).");
}
