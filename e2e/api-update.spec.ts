import { expect, test, type APIRequestContext } from "@playwright/test";

import { apiSession, canCallApi, missingApiConfigMessage, type ApiSession } from "./api";
import { SEED_PREFIX } from "./seed";

import { allowTransientRetries } from "./flaky";

allowTransientRetries("direct backend writes; same network jitter as api.spec.ts");

/**
 * API-level update/edit coverage.
 *
 * The UI specs prove the *screens* can edit a record; these hit PostgREST
 * directly so the contract is verified without the React layer in the way:
 *
 *   - PATCH round-trips (full and partial) and returns the updated row;
 *   - untouched columns are preserved by a partial update;
 *   - server-side constraints reject bad edits (NOT NULL, type coercion,
 *     unique names, unknown columns);
 *   - RLS scopes every edit to the owner — a foreign id matches zero rows and
 *     re-assigning `user_id` is refused by the policy's WITH CHECK;
 *   - last-write-wins ordering for sequential edits to the same row.
 */

const NAME = {
  walletA: `${SEED_PREFIX} Update Wallet A`,
  walletB: `${SEED_PREFIX} Update Wallet B`,
  bill: `${SEED_PREFIX} Update Bill`,
  tx: `${SEED_PREFIX} update transaction`,
};

let session: ApiSession;
let walletA = "";
let walletB = "";
let billId = "";
let txId = "";

/** PATCH one row by id and return status + parsed body. */
async function patchRow(
  request: APIRequestContext,
  table: string,
  id: string,
  payload: Record<string, unknown>,
) {
  const response = await request.patch(`${session.restUrl}/${table}?id=eq.${id}`, {
    headers: session.headers,
    data: payload,
  });
  const text = await response.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* non-JSON error bodies are surfaced verbatim */
  }
  return { status: response.status(), body: body as Record<string, unknown> & unknown[] };
}

async function readRow(table: string, id: string) {
  const { data, error } = await session.db.from(table).select("*").eq("id", id).single();
  if (error) throw new Error(`read ${table}/${id} failed: ${error.message}`);
  return data as Record<string, unknown>;
}

test.describe("API — update / edit", () => {
  test.skip(!canCallApi, missingApiConfigMessage);
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async () => {
    session = await apiSession();
    const { db, userId } = session;

    // Clean any residue from an interrupted run so unique names stay free.
    await db.from("transactions").delete().eq("user_id", userId).like("note", `${SEED_PREFIX}%`);
    await db.from("bills").delete().eq("user_id", userId).eq("name", NAME.bill);
    await db
      .from("wallets")
      .delete()
      .eq("user_id", userId)
      .in("name", [NAME.walletA, NAME.walletB]);

    const { data: wallets, error: walletError } = await db
      .from("wallets")
      .insert([
        {
          user_id: userId,
          name: NAME.walletA,
          type: "Bank Account",
          balance: 1_000_000,
          sub: "before",
          icon: "wallet",
        },
        { user_id: userId, name: NAME.walletB, type: "E-Wallet", balance: 250_000 },
      ])
      .select("id, name");
    if (walletError) throw new Error(`fixture wallets failed: ${walletError.message}`);
    walletA = wallets!.find((w) => w.name === NAME.walletA)!.id as string;
    walletB = wallets!.find((w) => w.name === NAME.walletB)!.id as string;

    const { data: bill, error: billError } = await db
      .from("bills")
      .insert({
        user_id: userId,
        name: NAME.bill,
        amount: 500_000,
        due_date: "2026-06-20",
        paid: false,
      })
      .select("id")
      .single();
    if (billError) throw new Error(`fixture bill failed: ${billError.message}`);
    billId = bill!.id as string;

    const { data: tx, error: txError } = await db
      .from("transactions")
      .insert({
        user_id: userId,
        wallet_id: walletA,
        wallet_name: NAME.walletA,
        category_name: "Food",
        type: "expense",
        amount: 75_000,
        note: NAME.tx,
        date: "2026-06-10T09:00:00.000Z",
      })
      .select("id")
      .single();
    if (txError) throw new Error(`fixture transaction failed: ${txError.message}`);
    txId = tx!.id as string;
  });

  test.afterAll(async () => {
    if (!session) return;
    const { db, userId } = session;
    await db.from("transactions").delete().eq("user_id", userId).like("note", `${SEED_PREFIX}%`);
    await db.from("bills").delete().eq("user_id", userId).like("name", `${SEED_PREFIX} Update%`);
    await db.from("wallets").delete().eq("user_id", userId).like("name", `${SEED_PREFIX} Update%`);
    await session.signOut();
  });

  test("PATCH updates a wallet and returns the persisted representation", async ({ request }) => {
    const renamed = `${NAME.walletA} Renamed`;
    const { status, body } = await patchRow(request, "wallets", walletA, {
      name: renamed,
      balance: 1_750_500,
      sub: "after",
    });

    expect(status, JSON.stringify(body)).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(1);

    const returned = body[0] as Record<string, unknown>;
    expect(returned["name"]).toBe(renamed);
    expect(Number(returned["balance"])).toBe(1_750_500);

    // The response body must reflect what is actually stored, not the request.
    const stored = await readRow("wallets", walletA);
    expect(stored["name"]).toBe(renamed);
    expect(Number(stored["balance"])).toBe(1_750_500);
    expect(stored["sub"]).toBe("after");

    // Restore the fixture name for the remaining assertions.
    await patchRow(request, "wallets", walletA, { name: NAME.walletA });
  });

  test("a partial edit leaves untouched columns intact", async ({ request }) => {
    const before = await readRow("wallets", walletA);

    const { status } = await patchRow(request, "wallets", walletA, { balance: 42 });
    expect(status).toBe(200);

    const after = await readRow("wallets", walletA);
    expect(Number(after["balance"])).toBe(42);
    // Everything the client did not send must survive the edit untouched.
    for (const column of ["name", "type", "icon", "color", "user_id", "created_at"]) {
      expect(after[column], `column "${column}" must not change`).toEqual(before[column]);
    }
  });

  test("editing a row never touches its siblings", async ({ request }) => {
    const siblingBefore = await readRow("wallets", walletB);
    await patchRow(request, "wallets", walletA, { sub: "isolated edit" });
    expect(await readRow("wallets", walletB)).toEqual(siblingBefore);
  });

  test("renaming a wallet onto an existing name is rejected as a conflict", async ({ request }) => {
    // wallets_user_name_unique is case/whitespace insensitive.
    const { status, body } = await patchRow(request, "wallets", walletA, {
      name: `  ${NAME.walletB.toUpperCase()}  `,
    });

    expect(status, JSON.stringify(body)).toBe(409);
    expect((body as Record<string, unknown>)["code"]).toBe("23505");
    // The rejected edit must not have partially applied.
    expect(await readRow("wallets", walletA)).toMatchObject({ name: NAME.walletA });
  });

  test("clearing a NOT NULL column is rejected", async ({ request }) => {
    const { status, body } = await patchRow(request, "wallets", walletA, { name: null });
    expect(status, JSON.stringify(body)).toBe(400);
    expect((body as Record<string, unknown>)["code"]).toBe("23502");
    expect(await readRow("wallets", walletA)).toMatchObject({ name: NAME.walletA });
  });

  test("a non-numeric amount is rejected instead of silently coerced", async ({ request }) => {
    const { status, body } = await patchRow(request, "bills", billId, { amount: "not-a-number" });
    expect(status, JSON.stringify(body)).toBe(400);
    expect((body as Record<string, unknown>)["code"]).toBe("22P02");
    expect(Number((await readRow("bills", billId))["amount"])).toBe(500_000);
  });

  test("an unknown column is rejected rather than ignored", async ({ request }) => {
    const { status, body } = await patchRow(request, "bills", billId, {
      definitely_not_a_column: true,
    });
    expect(status, JSON.stringify(body)).toBe(400);
    expect((body as Record<string, unknown>)["code"]).toBe("PGRST204");
  });

  test("RLS scopes edits to the owner", async ({ request }) => {
    // A well-formed id the caller does not own matches zero rows: the update
    // succeeds syntactically but changes nothing and leaks nothing.
    const foreignId = "00000000-0000-4000-8000-000000000000";
    const missing = await patchRow(request, "wallets", foreignId, { balance: 1 });
    expect(missing.status).toBe(200);
    expect(missing.body).toHaveLength(0);

    // Re-assigning ownership is refused by the policy's WITH CHECK clause.
    const stolen = await patchRow(request, "wallets", walletA, { user_id: foreignId });
    expect(stolen.status, JSON.stringify(stolen.body)).toBe(403);
    expect((stolen.body as Record<string, unknown>)["code"]).toBe("42501");
    expect(await readRow("wallets", walletA)).toMatchObject({ user_id: session.userId });
  });

  test("bill edits round-trip booleans and dates", async ({ request }) => {
    const paid = await patchRow(request, "bills", billId, {
      paid: true,
      due_date: "2026-07-01",
      amount: 612_345,
    });
    expect(paid.status, JSON.stringify(paid.body)).toBe(200);

    const afterPaid = await readRow("bills", billId);
    expect(afterPaid["paid"]).toBe(true);
    expect(String(afterPaid["due_date"])).toBe("2026-07-01");
    expect(Number(afterPaid["amount"])).toBe(612_345);

    const unpaid = await patchRow(request, "bills", billId, { paid: false });
    expect(unpaid.status).toBe(200);
    expect((await readRow("bills", billId))["paid"]).toBe(false);
  });

  test("sequential edits to the same row are last-write-wins", async ({ request }) => {
    await patchRow(request, "bills", billId, { amount: 111 });
    await patchRow(request, "bills", billId, { amount: 222 });
    const final = await patchRow(request, "bills", billId, { amount: 333 });

    expect(final.status).toBe(200);
    expect(Number((final.body[0] as Record<string, unknown>)["amount"])).toBe(333);
    expect(Number((await readRow("bills", billId))["amount"])).toBe(333);
  });

  test("re-pointing a transaction updates both the FK and its denormalized name", async ({
    request,
  }) => {
    const { status } = await patchRow(request, "transactions", txId, {
      wallet_id: walletB,
      wallet_name: NAME.walletB,
      amount: 99_000,
      note: `${NAME.tx} edited`,
    });
    expect(status).toBe(200);

    const stored = await readRow("transactions", txId);
    expect(stored["wallet_id"]).toBe(walletB);
    // The denormalized label must not drift from the foreign key it mirrors.
    expect(stored["wallet_name"]).toBe(NAME.walletB);
    expect(Number(stored["amount"])).toBe(99_000);
    expect(stored["note"]).toBe(`${NAME.tx} edited`);
    // The date was not part of the edit and must be preserved exactly.
    expect(new Date(String(stored["date"])).toISOString()).toBe("2026-06-10T09:00:00.000Z");
  });

  test("a transaction cannot be re-pointed at a wallet the caller does not own", async ({
    request,
  }) => {
    const { status, body } = await patchRow(request, "transactions", txId, {
      wallet_id: "00000000-0000-4000-8000-000000000000",
    });
    // Foreign key integrity is enforced server-side (23503), never client-side.
    expect(status, JSON.stringify(body)).toBe(409);
    expect((body as Record<string, unknown>)["code"]).toBe("23503");
    expect((await readRow("transactions", txId))["wallet_id"]).toBe(walletB);
  });
});
