import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { loadEnv, readBackendConfig, readCredentials } from "./env";
import { FIXED_AMOUNTS, FIXED_DATES } from "./time";

loadEnv();

/**
 * Every row created by the E2E suite carries this prefix so setup/teardown can
 * provision and remove test data without touching real user records.
 */
export const SEED_PREFIX = "E2E-SEED";

export const SEEDED_WALLET = `${SEED_PREFIX} Wallet`;
export const SEEDED_BILL = `${SEED_PREFIX} Bill`;

const backend = readBackendConfig();
const credentials = readCredentials();

/** True when programmatic seeding is possible (backend config + test account). */
export const canSeed = Boolean(backend && credentials);

/**
 * Signs in as the dedicated E2E user. If the account does not exist yet the
 * seeder provisions it once via sign-up, so a fresh CI project (or a new
 * developer machine) converges on the same starting state without anyone
 * clicking through the UI. When email confirmation is enabled the sign-up
 * cannot be auto-confirmed — the error then tells you to confirm it once.
 */
async function client(): Promise<{ db: SupabaseClient; userId: string }> {
  const db = createClient(backend!.url, backend!.key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const creds = { email: credentials!.email, password: credentials!.password };

  const { data, error } = await db.auth.signInWithPassword(creds);
  if (data?.user) return { db, userId: data.user.id };

  if (!/invalid login credentials/i.test(error?.message ?? "")) {
    throw new Error(`E2E seed sign-in failed: ${error?.message}`);
  }

  const signUp = await db.auth.signUp(creds);
  if (signUp.error) {
    throw new Error(`E2E test user could not be provisioned: ${signUp.error.message}`);
  }
  const retry = await db.auth.signInWithPassword(creds);
  if (!retry.data?.user) {
    throw new Error(
      `E2E test user "${creds.email}" was created but cannot sign in ` +
        `(${retry.error?.message ?? "unknown error"}). ` +
        "Confirm the address once in the backend, then re-run.",
    );
  }
  return { db, userId: retry.data.user.id };
}

/** Removes every row previously created by the suite (idempotent). */
export async function cleanupTestData() {
  if (!canSeed) return;
  const { db, userId } = await client();
  const pattern = `${SEED_PREFIX}%`;

  // Transactions first: they reference wallets and categories.
  await db.from("transactions").delete().eq("user_id", userId).like("note", pattern);
  await db.from("transactions").delete().eq("user_id", userId).like("wallet_name", pattern);
  await db.from("bills").delete().eq("user_id", userId).like("name", pattern);
  await db.from("wallets").delete().eq("user_id", userId).like("name", pattern);
  await db.auth.signOut();
}

/**
 * Provisions an isolated wallet + bill (and a couple of dated transactions so
 * the analytics range filters have something to recalculate).
 */
export async function seedTestData() {
  if (!canSeed) return;
  await cleanupTestData();

  const { db, userId } = await client();
  // Deterministic, hardcoded fixture dates/amounts (see e2e/time.ts). They must
  // never derive from the real clock: the browser clock is frozen to the same
  // instant, so every range filter yields identical results on every machine.
  const thisMonth = FIXED_DATES.thisMonth;
  const lastMonth = FIXED_DATES.lastMonth;

  const { data: wallet, error: walletError } = await db
    .from("wallets")
    .insert({
      user_id: userId,
      name: SEEDED_WALLET,
      type: "Bank Account",
      balance: FIXED_AMOUNTS.walletBalance,
      sub: "E2E fixture",
      icon: "wallet",
    })
    .select("id")
    .single();
  if (walletError) throw new Error(`E2E wallet seed failed: ${walletError.message}`);

  const { error: billError } = await db.from("bills").insert({
    user_id: userId,
    name: SEEDED_BILL,
    amount: FIXED_AMOUNTS.billAmount,
    due_date: FIXED_DATES.billDue,
    icon: "bills",
  });
  if (billError) throw new Error(`E2E bill seed failed: ${billError.message}`);

  const { error: txError } = await db.from("transactions").insert([
    {
      user_id: userId,
      wallet_id: wallet.id,
      wallet_name: SEEDED_WALLET,
      category_name: "Food",
      type: "expense",
      amount: FIXED_AMOUNTS.expenseThisMonth,
      note: `${SEED_PREFIX} expense this month`,
      date: thisMonth,
    },
    {
      user_id: userId,
      wallet_id: wallet.id,
      wallet_name: SEEDED_WALLET,
      category_name: "Salary",
      type: "income",
      amount: FIXED_AMOUNTS.incomeThisMonth,
      note: `${SEED_PREFIX} income this month`,
      date: thisMonth,
    },
    {
      user_id: userId,
      wallet_id: wallet.id,
      wallet_name: SEEDED_WALLET,
      category_name: "Transport",
      type: "expense",
      amount: FIXED_AMOUNTS.expenseLastMonth,
      note: `${SEED_PREFIX} expense last month`,
      date: lastMonth,
    },
  ]);
  if (txError) throw new Error(`E2E transaction seed failed: ${txError.message}`);

  await db.auth.signOut();
}

/**
 * Re-reads the seeded rows and fails loudly when the database state does not
 * match the fixtures. A partially seeded database otherwise surfaces later as
 * an unrelated, confusing assertion failure inside a spec.
 */
export async function verifySeededData() {
  if (!canSeed) return;
  const { db, userId } = await client();
  const counts = await Promise.all([
    db
      .from("wallets")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .like("name", `${SEED_PREFIX}%`),
    db
      .from("bills")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .like("name", `${SEED_PREFIX}%`),
    db
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .like("note", `${SEED_PREFIX}%`),
  ]);
  const expected = [1, 1, 3];
  const labels = ["wallets", "bills", "transactions"];
  counts.forEach((result, index) => {
    if (result.error) throw new Error(`E2E seed verification failed: ${result.error.message}`);
    if (result.count !== expected[index]) {
      throw new Error(
        `E2E seed verification failed: expected ${expected[index]} seeded ${labels[index]}, found ${result.count}.`,
      );
    }
  });
  await db.auth.signOut();
}
