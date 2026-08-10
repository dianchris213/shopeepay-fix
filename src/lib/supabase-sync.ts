/**
 * Bridges the local (optimistic) stores with the Lovable Cloud database.
 *
 * Every mutation is applied to the in-memory store first — so the UI stays at
 * 0ms latency — and mirrored to the backend in the background via a small
 * row-level diff of the previous vs. next state.
 */
import type { RealtimeChannel } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";
import {
  AuthRequiredError,
  isMissingAuthUserError,
  notifyReauthRequired,
  requireAuthUserId,
} from "@/lib/auth-user";
import { bindFocusRecovery } from "@/lib/focus-recovery";
import {
  recordCatchUpRefetch,
  recordChannelLifecycle,
  resetRealtimeHealth,
  type CatchUpReason,
} from "@/lib/realtime-health";

import { enqueueWrite, pendingWrites } from "@/lib/sync-queue";

import {
  defaultCategories,
  hydrateCategories,
  setCategorySyncHandler,
  type Category,
  type CategoryKind,
  type IconKey,
} from "@/lib/categories-store";
import {
  getState,
  hydrateState,
  initialState,
  setFinanceSyncHandler,
  type Account,
  type AccountType,
  type Bill,
  type Currency,
  type FinanceState,
  type Language,
  type Theme,
  type Transaction,
} from "@/lib/finance-store";

let userId: string | null = null;
/**
 * Incremented on every hydrate/stop so a slow request from a previous session
 * can never overwrite the store after the user switched accounts or signed out.
 */
let hydrationToken = 0;

const uuid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const run = enqueueWrite;

/* ------------------------------------------------------------------ mapping */

const walletRow = (a: Account, uid: string) => ({
  id: a.id,
  user_id: uid,
  name: a.name,
  type: a.type,
  balance: a.amount,
  sub: a.sub,
  icon: a.icon,
  color: a.color,
});

/**
 * Cloud scope encoding for categories.
 *
 * A category created inside a custom wallet must stay in that wallet. The
 * `categories.type` column carries the scope alongside the kind
 * (`"expense"` globally, `"expense:<walletId>"` for one custom wallet) so a
 * round-trip through the cloud can never drop the wallet association and leak
 * the row into the "System (all wallets)" list.
 */
const encodeCategoryType = (c: Category) => (c.walletId ? `${c.kind}:${c.walletId}` : c.kind);

function decodeCategoryType(value: string): { kind: CategoryKind; walletId?: string } {
  const [kind, walletId] = value.split(":");
  const safeKind: CategoryKind = kind === "income" ? "income" : "expense";
  return walletId ? { kind: safeKind, walletId } : { kind: safeKind };
}

const categoryRow = (c: Category, uid: string) => ({
  id: c.id,
  user_id: uid,
  name: c.name,
  type: encodeCategoryType(c),
  icon: c.icon,
});

const txRow = (t: Transaction, uid: string, walletIds: Map<string, string>) => ({
  id: t.id,
  user_id: uid,
  // wallet_id is the source of truth; the name is only a display label.
  wallet_id: t.walletId ?? walletIds.get(t.via) ?? null,
  wallet_name: t.via,
  category_name: t.category,
  type: t.amount < 0 ? "expense" : "income",
  amount: t.amount,
  note: t.name,
  icon: t.icon,
  date: t.date,
});

const billRow = (b: Bill, uid: string, index: number) => ({
  id: b.id,
  user_id: uid,
  name: b.name,
  amount: b.amount,
  due_date: b.dueDate ?? null,
  icon: b.icon,
  paid: b.paid,
  is_recurring: b.isRecurring ?? false,
  priority_order: index,
});

const profileRow = (s: FinanceState) => ({
  name: s.profile.name,
  avatar: s.profile.avatar,
  currency: s.settings.currency,
  language: s.settings.language,
  theme: s.settings.theme,
  push_notifications: s.settings.pushNotifications,
  biometric_lock: s.settings.biometricLock,
  pin_set: s.settings.pinSet,
  reduce_motion: s.settings.reduceMotion,
  reserve: s.reserve,
  last_sync: s.settings.lastSync,
});

/**
 * Last profile row we observed on the server. Preferences use it for a 3-way
 * merge on every catch-up refetch: a server value that has NOT changed since
 * the previous fetch can never overwrite a newer local toggle (theme,
 * language, reduce motion, currency), while a genuine change made on another
 * device still wins. Without this, an in-flight or failed profile write made
 * the preference switches look dead — they flipped back on the next poll.
 */
let serverProfileSnapshot: Record<string, unknown> | null = null;

/** Local value wins unless the server value changed since the last fetch. */
function mergePreference<T>(
  serverValue: unknown,
  column: string,
  localValue: T,
  parse: (v: unknown) => T,
): T {
  const previous = serverProfileSnapshot ? serverProfileSnapshot[column] : undefined;
  if (serverProfileSnapshot && Object.is(previous, serverValue)) return localValue;
  if (serverValue === null || serverValue === undefined) return localValue;
  return parse(serverValue);
}

const LANGUAGES = ["en", "id"] as const satisfies readonly Language[];
const THEMES = ["dark", "light"] as const satisfies readonly Theme[];
const CURRENCIES = ["IDR", "USD"] as const satisfies readonly Currency[];

/**
 * Server columns are plain `text`, so an unexpected value (older row, manual
 * edit) must not poison the store. Unknown/absent values keep the local one.
 */
function normalizeSetting<T extends string>(
  value: unknown,
  allowed: readonly string[],
  fallback: T,
): T {
  return typeof value === "string" && allowed.includes(value) ? (value as T) : fallback;
}

/* ------------------------------------------------------------------- diffing */

function diff<T extends { id: string }>(prev: T[], next: T[]) {
  const prevMap = new Map(prev.map((x) => [x.id, x]));
  const nextMap = new Map(next.map((x) => [x.id, x]));
  const upserts = next.filter((x) => {
    const before = prevMap.get(x.id);
    return !before || JSON.stringify(before) !== JSON.stringify(x);
  });
  const removed = prev.filter((x) => !nextMap.has(x.id)).map((x) => x.id);
  return { upserts, removed };
}

/**
 * Owner-bound cloud write. The `user_id` stamped on the row is resolved from
 * the *live* session at send time (not from a possibly stale module variable),
 * which is what prevents `violates foreign key constraint "…_user_id_fkey"`.
 * When no session can be recovered the write is dropped and the user is asked
 * to sign in again instead of the queue retry-storming an unowned payload.
 */
export function authedWrite(
  scope: string,
  send: (uid: string) => PromiseLike<{ error: unknown }>,
) {
  run(scope, async () => {
    let uid: string;
    try {
      uid = await requireAuthUserId();
    } catch (error) {
      if (error instanceof AuthRequiredError) return { error: null };
      return { error };
    }
    userId = uid;
    const result = await send(uid);
    if (result.error && isMissingAuthUserError(result.error)) {
      notifyReauthRequired();
      return { error: null };
    }
    return result;
  });
}

function syncFinance(prev: FinanceState, next: FinanceState) {
  if (!userId) return;

  if (JSON.stringify(profileRow(prev)) !== JSON.stringify(profileRow(next))) {
    // upsert, not update: an account whose profile row is missing (created
    // before the signup trigger existed, or a failed trigger) would silently
    // match 0 rows, so preferences like the UI language were never persisted
    // and the next catch-up refetch reverted them.
    authedWrite("profile", (uid) =>
      supabase.from("profiles").upsert({ id: uid, ...profileRow(next) }, { onConflict: "id" }),
    );
  }

  const wallets = diff(prev.accounts, next.accounts);
  if (wallets.upserts.length)
    authedWrite("wallets", (uid) =>
      supabase.from("wallets").upsert(wallets.upserts.map((a) => walletRow(a, uid))),
    );
  if (wallets.removed.length)
    run("wallets", () => supabase.from("wallets").delete().in("id", wallets.removed));

  const walletIds = new Map(next.accounts.map((a) => [a.name, a.id]));
  const txs = diff(prev.transactions, next.transactions);
  if (txs.upserts.length)
    authedWrite("transactions", (uid) =>
      supabase.from("transactions").upsert(txs.upserts.map((t) => txRow(t, uid, walletIds))),
    );
  if (txs.removed.length)
    run("transactions", () => supabase.from("transactions").delete().in("id", txs.removed));

  const orderChanged = prev.bills.map((b) => b.id).join() !== next.bills.map((b) => b.id).join();
  const bills = diff(prev.bills, next.bills);
  const billUpserts = orderChanged ? next.bills : bills.upserts;
  if (billUpserts.length)
    authedWrite("bills", (uid) =>
      supabase.from("bills").upsert(billUpserts.map((b) => billRow(b, uid, next.bills.indexOf(b)))),
    );
  if (bills.removed.length)
    run("bills", () => supabase.from("bills").delete().in("id", bills.removed));
}

function syncCategories(prev: Category[], next: Category[]) {
  if (!userId) return;
  const { upserts, removed } = diff(prev, next);
  if (upserts.length)
    authedWrite("categories", (uid) =>
      supabase.from("categories").upsert(upserts.map((c) => categoryRow(c, uid))),
    );
  if (removed.length)
    run("categories", () => supabase.from("categories").delete().in("id", removed));
}

/* ------------------------------------------------------------------ hydrate */

/**
 * New accounts start completely blank — only the default categories are
 * created so the app is immediately usable.
 */
async function seedCategories(uid: string) {
  // Re-resolve the owner from the live session: seeding with a stale id is the
  // classic source of `categories_user_id_fkey` violations on first run.
  const owner = await requireAuthUserId().catch(() => uid);
  const categories: Category[] = defaultCategories.map((c) => ({ ...c, id: uuid() }));
  const { error } = await supabase
    .from("categories")
    .insert(categories.map((c) => categoryRow(c, owner)));
  // Surfacing the failure keeps local and cloud categories from silently diverging.
  if (error) throw error;
  return categories;
}

/** Loads everything for the signed-in user, seeding sensible defaults on first run. */
export async function hydrateFromCloud(uid: string) {
  userId = uid;
  hydrationToken += 1;
  const token = hydrationToken;
  const isStale = () => token !== hydrationToken;

  const [profileRes, walletRes, categoryRes, txRes, billRes] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", uid).maybeSingle(),
    supabase.from("wallets").select("*").order("created_at", { ascending: true }),
    supabase.from("categories").select("*").order("created_at", { ascending: true }),
    supabase.from("transactions").select("*").order("date", { ascending: false }).limit(1000),
    supabase.from("bills").select("*").order("priority_order", { ascending: true }),
  ]);

  if (isStale()) return;

  // Supabase resolves (rather than rejects) on query errors — without this the
  // UI would silently render an empty account as if the user had no data.
  const failed = [profileRes, walletRes, categoryRes, txRes, billRes].find((r) => r.error);
  if (failed?.error) throw failed.error;

  const accounts: Account[] = (walletRes.data ?? []).map((w) => ({
    id: w.id,
    name: w.name,
    type: w.type as AccountType,
    amount: Number(w.balance),
    sub: w.sub,
    icon: w.icon,
    color: w.color,
  }));
  let categories: Category[] = (categoryRes.data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    icon: c.icon as IconKey,
    ...decodeCategoryType(c.type),
  }));
  const bills: Bill[] = (billRes.data ?? []).map((b) => ({
    id: b.id,
    name: b.name,
    amount: Number(b.amount),
    ...(b.due_date ? { dueDate: b.due_date } : {}),
    icon: b.icon,
    paid: b.paid,
    isRecurring: b.is_recurring ?? false,
  }));
  const transactions: Transaction[] = (txRes.data ?? []).map((t) => ({
    id: t.id,
    name: t.note,
    ...(t.wallet_id ? { walletId: t.wallet_id } : {}),
    via: t.wallet_name,
    category: t.category_name,
    date: t.date,
    amount: Number(t.amount),
    icon: t.icon,
  }));

  if (!categories.length) {
    categories = await seedCategories(uid);
    if (isStale()) return;
  }

  const profile = profileRes.data;
  // Preferences fall back to what the device already has, never to hard-coded
  // defaults, and a stale server value never clobbers a fresh local toggle.
  const local = getState();
  const settings = {
    currency: mergePreference(profile?.currency, "currency", local.settings.currency, (v) =>
      normalizeSetting<Currency>(v, CURRENCIES, local.settings.currency),
    ),
    language: mergePreference(profile?.language, "language", local.settings.language, (v) =>
      normalizeSetting<Language>(v, LANGUAGES, local.settings.language),
    ),
    theme: mergePreference(profile?.theme, "theme", local.settings.theme, (v) =>
      normalizeSetting<Theme>(v, THEMES, local.settings.theme),
    ),
    pushNotifications: mergePreference(
      profile?.push_notifications,
      "push_notifications",
      local.settings.pushNotifications,
      Boolean,
    ),
    biometricLock: mergePreference(
      profile?.biometric_lock,
      "biometric_lock",
      local.settings.biometricLock,
      Boolean,
    ),
    pinSet: mergePreference(profile?.pin_set, "pin_set", local.settings.pinSet, Boolean),
    reduceMotion: mergePreference(
      profile?.reduce_motion,
      "reduce_motion",
      local.settings.reduceMotion,
      Boolean,
    ),
    lastSync: profile?.last_sync ?? local.settings.lastSync,
  };

  serverProfileSnapshot = profile
    ? {
        name: profile.name,
        avatar: profile.avatar,
        currency: profile.currency,
        language: profile.language,
        theme: profile.theme,
        push_notifications: profile.push_notifications,
        biometric_lock: profile.biometric_lock,
        pin_set: profile.pin_set,
        reduce_motion: profile.reduce_motion,
        reserve: profile.reserve,
      }
    : null;

  hydrateState({
    ...initialState,
    profile: {
      name: mergePreference(profile?.name, "name", local.profile.name, String),
      avatar: mergePreference(profile?.avatar, "avatar", local.profile.avatar, String),
    },
    settings,
    reserve: profile?.reserve != null ? Number(profile.reserve) : local.reserve,
    accounts,
    transactions,
    bills,
    // Notifications are device-local; a catch-up refetch must not clear them.
    notifications: local.notifications,
  });

  hydrateCategories(categories);
  startRealtime(uid);
}

setFinanceSyncHandler(syncFinance);
setCategorySyncHandler(syncCategories);

/* ----------------------------------------------------------------- realtime */

const REALTIME_TABLES = ["transactions", "wallets", "bills", "categories", "profiles"] as const;
/** Small coalescing window: several rows often change in one logical action. */
const REFETCH_DEBOUNCE_MS = 120;
/** Safety net for Android TMA, where the socket can die while backgrounded. */
const POLL_INTERVAL_MS = 25_000;

let channel: RealtimeChannel | null = null;
let channelUid: string | null = null;
let refetchTimer: ReturnType<typeof setTimeout> | null = null;
let refetching = false;
let refetchAgain = false;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let listenersBound = false;
let resubscribeTimer: ReturnType<typeof setTimeout> | null = null;

function clearRefetchTimer() {
  if (refetchTimer) {
    clearTimeout(refetchTimer);
    refetchTimer = null;
  }
}

/**
 * Pulls the freshest server state. Local writes that are still queued win:
 * refetching mid-flight would roll back the optimistic UI, so we wait for the
 * queue to drain and try again.
 */
async function refetchNow(reason: CatchUpReason = "manual") {
  const uid = userId;
  if (!uid) return;
  if (refetching) {
    refetchAgain = true;
    return;
  }
  if (pendingWrites() > 0) {
    scheduleRefetch(reason);
    return;
  }
  refetching = true;
  try {
    await hydrateFromCloud(uid);
    // Audit signal: the exact instant the client caught up with the server.
    recordCatchUpRefetch(reason);
  } catch (error) {
    console.error("[realtime:refetch]", error);
  } finally {
    refetching = false;
    if (refetchAgain) {
      refetchAgain = false;
      scheduleRefetch(reason);
    }
  }
}

function scheduleRefetch(reason: CatchUpReason = "realtime-event") {
  if (!userId) return;
  clearRefetchTimer();
  refetchTimer = setTimeout(() => {
    refetchTimer = null;
    void refetchNow(reason);
  }, REFETCH_DEBOUNCE_MS);
}

/** Re-open the socket subscription after an error/timeout/close. */
function scheduleResubscribe() {
  if (resubscribeTimer || !userId) return;
  resubscribeTimer = setTimeout(() => {
    resubscribeTimer = null;
    const uid = userId;
    if (!uid) return;
    teardownChannel();
    startRealtime(uid);
    void refetchNow("resubscribe");
  }, 2000);
}

function teardownChannel() {
  if (channel) {
    void supabase.removeChannel(channel);
    channel = null;
    channelUid = null;
  }
}

/** Catch-up triggers that do not depend on the websocket staying alive. */
function bindLifecycleListeners() {
  if (listenersBound || typeof window === "undefined") return;
  listenersBound = true;

  bindFocusRecovery({
    isActive: () => userId !== null,
    // The socket may have been frozen while the TMA was backgrounded.
    onResubscribe: () => scheduleResubscribe(),
    onCatchUp: (reason) => void refetchNow(reason),
  });
}

function startPolling() {
  if (pollTimer) return;
  pollTimer = setInterval(() => {
    if (!userId) return;
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    void refetchNow("poll");
  }, POLL_INTERVAL_MS);
}

/**
 * Subscribes to row-level changes for this user's data so any other client
 * (web tab, Telegram Mini App, second device) reflects inserts, updates and
 * deletes instantly — no manual sync tap required.
 */
function startRealtime(uid: string) {
  bindLifecycleListeners();
  startPolling();
  if (channel && channelUid === uid) return;
  if (channel) teardownChannel();

  const ch = supabase.channel(`c2h-sync-${uid}`, { config: { private: false } });
  for (const table of REALTIME_TABLES) {
    ch.on(
      "postgres_changes",
      // RLS still applies to the stream; the filter keeps the payload minimal.
      {
        event: "*",
        schema: "public",
        table,
        filter: table === "profiles" ? `id=eq.${uid}` : `user_id=eq.${uid}`,
      },
      () => scheduleRefetch(),
    );
  }
  channel = ch;
  channelUid = uid;

  // Realtime enforces RLS with the socket's JWT — without an explicit refresh a
  // stale/absent token silently yields a subscribed channel that never emits.
  void supabase.auth
    .getSession()
    .then(({ data }) => {
      const token = data.session?.access_token;
      if (token) supabase.realtime.setAuth(token);
    })
    .catch(() => undefined)
    .finally(() => {
      if (channel !== ch) return;
      ch.subscribe((status, err) => {
        if (status === "SUBSCRIBED") {
          recordChannelLifecycle("SUBSCRIBED");
          // Anything that changed while we were disconnected.
          void refetchNow("subscribed");
          return;
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          recordChannelLifecycle(status, err?.message);
          scheduleResubscribe();
        }
      });
    });
}

export function stopCloudSync() {
  userId = null;
  serverProfileSnapshot = null;
  hydrationToken += 1;
  clearRefetchTimer();
  if (resubscribeTimer) {
    clearTimeout(resubscribeTimer);
    resubscribeTimer = null;
  }
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  teardownChannel();
  resetRealtimeHealth();
}
