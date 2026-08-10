import { supabase } from "@/integrations/supabase/client";
import { addBreadcrumb, captureTelemetry } from "@/lib/telemetry";
import { shouldRefreshSession, type SessionLike } from "@/lib/session-resilience";

/**
 * Aggressive session/token resiliency (additive layer on top of
 * `session-resilience.ts`).
 *
 * Three problems this solves:
 *
 *  1. **Stale token after suspension.** A Mini App can sit frozen for hours;
 *     the cached access token is then already expired and the first query
 *     401s. `ensureFreshSession()` is an await-able gate that refreshes first.
 *  2. **Refresh stampede.** Ten queries resuming at once must trigger *one*
 *     refresh, not ten. All callers share a single in-flight promise.
 *  3. **Revoked sessions.** A refresh that fails with an auth error means the
 *     session is gone for good — retrying is pointless and must be reported.
 */

export type SessionState = "fresh" | "refreshed" | "expired" | "revoked" | "error";

export type SessionCheck = { state: SessionState; expiresAt?: number | undefined };

/** Refresh proactively this long before expiry (ms). */
export const PROACTIVE_REFRESH_LEAD_MS = 60_000;
/** Never schedule a wake-up further out than this (ms) — clocks drift. */
export const MAX_REFRESH_DELAY_MS = 15 * 60_000;
/** Nor sooner than this, so a bad expires_at cannot spin the timer. */
export const MIN_REFRESH_DELAY_MS = 5_000;

/**
 * When should the proactive timer next fire for a session? Pure so the policy
 * is unit-testable without fake timers.
 */
export function nextRefreshDelayMs(
  session: SessionLike,
  nowMs: number = Date.now(),
): number | null {
  if (!session) return null;
  const expiresAt = session.expires_at;
  if (typeof expiresAt !== "number") return MIN_REFRESH_DELAY_MS;
  const untilRefresh = expiresAt * 1000 - nowMs - PROACTIVE_REFRESH_LEAD_MS;
  return Math.min(MAX_REFRESH_DELAY_MS, Math.max(MIN_REFRESH_DELAY_MS, untilRefresh));
}

/** An auth error that will never recover: the session was revoked or reused. */
export function isRevokedSessionError(error: unknown): boolean {
  if (!error) return false;
  const status = (error as { status?: unknown }).status;
  const message = String((error as { message?: unknown }).message ?? error).toLowerCase();
  if (status === 401 || status === 403) return true;
  return (
    message.includes("refresh token not found") ||
    message.includes("refresh_token_not_found") ||
    message.includes("invalid refresh token") ||
    message.includes("already used") ||
    message.includes("session_not_found") ||
    message.includes("user not found")
  );
}

let inFlight: Promise<SessionCheck> | null = null;

/**
 * Guarantee a usable, non-stale access token before the caller runs a query.
 * Concurrent callers share one refresh round-trip.
 */
export function ensureFreshSession(force = false): Promise<SessionCheck> {
  if (inFlight) return inFlight;
  inFlight = runEnsure(force).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function runEnsure(force: boolean): Promise<SessionCheck> {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    const session = data.session;
    if (!session) return { state: "expired" };

    if (!force && !shouldRefreshSession(session)) {
      return { state: "fresh", expiresAt: session.expires_at };
    }

    addBreadcrumb("auth", "proactive refresh");
    const refreshed = await supabase.auth.refreshSession();
    if (refreshed.error) throw refreshed.error;
    if (!refreshed.data.session) return { state: "expired" };
    return { state: "refreshed", expiresAt: refreshed.data.session.expires_at };
  } catch (error) {
    const revoked = isRevokedSessionError(error);
    captureTelemetry(
      "auth.session_refresh",
      error,
      { revoked, forced: force },
      revoked ? "warning" : "error",
    );
    return { state: revoked ? "revoked" : "error" };
  }
}

type Cleanup = () => void;

/**
 * Keep a timer permanently one step ahead of expiry: after every check the
 * next wake-up is re-armed from the *new* token's lifetime. `onLost` fires
 * when the session can no longer be recovered.
 */
export function startProactiveRefresh(
  onLost: (state: SessionState) => void = () => {},
  scheduler: {
    setTimeout: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
    clearTimeout: (handle: ReturnType<typeof setTimeout>) => void;
  } = globalThis,
): Cleanup {
  let handle: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  const tick = async () => {
    if (stopped) return;
    const result = await ensureFreshSession();
    if (stopped) return;
    if (result.state === "revoked" || result.state === "expired") {
      onLost(result.state);
      return; // Nothing left to refresh; the auth gate takes over.
    }
    const delay = nextRefreshDelayMs({ expires_at: result.expiresAt });
    if (delay !== null) handle = scheduler.setTimeout(() => void tick(), delay);
  };

  void tick();

  return () => {
    stopped = true;
    if (handle !== undefined) scheduler.clearTimeout(handle);
  };
}
