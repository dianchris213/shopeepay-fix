#!/usr/bin/env bun
/**
 * Standalone E2E database seeding / reset hook.
 *
 * The Playwright global setup already calls the same helpers, but CI (and any
 * developer chasing a flaky spec) needs to be able to force the database back
 * to the known baseline without running the whole suite:
 *
 *   bun scripts/e2e-seed.mjs reset    # remove every E2E-SEED row
 *   bun scripts/e2e-seed.mjs seed     # reset, then seed the fixtures
 *   bun scripts/e2e-seed.mjs verify   # assert the baseline is exactly right
 *
 * All work goes through the publishable (anon) key as the dedicated test
 * account, so RLS applies and the service-role key is never needed or exposed.
 */
import { cleanupTestData, canSeed, seedTestData, verifySeededData } from "../e2e/seed.ts";

const command = process.argv[2] ?? "seed";

if (!canSeed) {
  console.error(
    "❌ Cannot seed: backend config and E2E credentials are required.\n" +
      "   Set VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, E2E_TEST_EMAIL and E2E_TEST_PASSWORD\n" +
      "   (aliases: VITE_SUPABASE_PUBLISHABLE_KEY, E2E_EMAIL, E2E_PASSWORD) in the environment\n" +
      "   or in .env.e2e.local (git-ignored).",
  );
  process.exit(1);
}

switch (command) {
  case "reset":
    await cleanupTestData();
    console.log("✅ E2E fixtures removed — database back to baseline.");
    break;
  case "seed":
    await seedTestData();
    await verifySeededData();
    console.log("✅ Seeded deterministic fixtures (1 wallet, 1 bill, 3 transactions).");
    break;
  case "verify":
    await verifySeededData();
    console.log("✅ Seeded baseline verified.");
    break;
  default:
    console.error(`Unknown command "${command}". Use: reset | seed | verify`);
    process.exit(1);
}
