/**
 * UI-free realtime sync health monitor.
 *
 * Purely observational: it records *whether* the Supabase Realtime channel is
 * currently `SUBSCRIBED`, every channel lifecycle transition, and the exact
 * moment of the last successful catch-up refetch. Nothing here renders, and
 * nothing here changes sync behaviour — it only reports.
 *
 * Two consumers:
 *   - structured `console.debug` lines (traceability on Android TMA, where the
 *     websocket can silently die while the app is backgrounded);
 *   - an optional React subscription for diagnostics screens/tests.
 */
import { useSyncExternalStore } from "react";

/** The four Supabase channel statuses we care about. */
export type ChannelLifecycleStatus = "SUBSCRIBED" | "CLOSED" | "TIMED_OUT" | "CHANNEL_ERROR";

/** Why a catch-up refetch ran — helps attribute drops to a trigger. */
export type CatchUpReason =
  | "subscribed"
  | "visibilitychange"
  | "focus"
  | "online"
  | "pageshow"
  | "poll"
  | "resubscribe"
  | "realtime-event"
  | "manual";

export type RealtimeHealth = {
  /** True only while the channel is in the `SUBSCRIBED` state. */
  connected: boolean;
  /** Last observed lifecycle status, `null` before the first subscribe attempt. */
  lastStatus: ChannelLifecycleStatus | null;
  lastStatusAt: number | null;
  /** Timestamp of the last *successful* catch-up refetch. */
  lastCatchUpAt: number | null;
  lastCatchUpReason: CatchUpReason | null;
  /** Monotonic counters — cheap health signal over a session. */
  subscribeCount: number;
  dropCount: number;
  catchUpCount: number;
};

const INITIAL: RealtimeHealth = {
  connected: false,
  lastStatus: null,
  lastStatusAt: null,
  lastCatchUpAt: null,
  lastCatchUpReason: null,
  subscribeCount: 0,
  dropCount: 0,
  catchUpCount: 0,
};

let health: RealtimeHealth = { ...INITIAL };
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

/* ---------------------------------------------------------------- logging */

export type RealtimeLogRecord = {
  channel: "realtime";
  event: "lifecycle" | "catch-up";
  status?: ChannelLifecycleStatus;
  reason?: CatchUpReason;
  at: string;
  connected: boolean;
  subscribeCount: number;
  dropCount: number;
  catchUpCount: number;
  lastCatchUpAt: string | null;
  detail?: string;
};

export type RealtimeLogger = (record: RealtimeLogRecord) => void;

const defaultLogger: RealtimeLogger = (record) => {
  // Single structured line keeps device logs greppable: `[realtime:lifecycle]`.
  const tag = record.event === "lifecycle" ? "[realtime:lifecycle]" : "[realtime:catch-up]";
  const isDrop = record.status && record.status !== "SUBSCRIBED";
  const write = isDrop ? console.warn : console.debug;
  write.call(console, tag, record);
};

let logger: RealtimeLogger = defaultLogger;

/** Test/diagnostics hook: swap the log sink (pass nothing to restore default). */
export function setRealtimeLogger(next?: RealtimeLogger) {
  logger = next ?? defaultLogger;
}

function log(partial: Pick<RealtimeLogRecord, "event" | "status" | "reason" | "detail">) {
  try {
    logger({
      channel: "realtime",
      at: new Date().toISOString(),
      connected: health.connected,
      subscribeCount: health.subscribeCount,
      dropCount: health.dropCount,
      catchUpCount: health.catchUpCount,
      lastCatchUpAt: health.lastCatchUpAt ? new Date(health.lastCatchUpAt).toISOString() : null,
      ...partial,
    });
  } catch {
    /* logging must never break sync */
  }
}

/* ---------------------------------------------------------------- recording */

/** Records a Supabase channel lifecycle transition and logs it. */
export function recordChannelLifecycle(
  status: ChannelLifecycleStatus,
  detail?: string,
  at: number = Date.now(),
) {
  const subscribed = status === "SUBSCRIBED";
  health = {
    ...health,
    connected: subscribed,
    lastStatus: status,
    lastStatusAt: at,
    subscribeCount: health.subscribeCount + (subscribed ? 1 : 0),
    dropCount: health.dropCount + (subscribed ? 0 : 1),
  };
  log({ event: "lifecycle", status, ...(detail ? { detail } : {}) });
  emit();
}

/** Records the instant a catch-up refetch completed successfully. */
export function recordCatchUpRefetch(reason: CatchUpReason, at: number = Date.now()) {
  health = {
    ...health,
    lastCatchUpAt: at,
    lastCatchUpReason: reason,
    catchUpCount: health.catchUpCount + 1,
  };
  log({ event: "catch-up", reason });
  emit();
}

export function getRealtimeHealth(): RealtimeHealth {
  return health;
}

/** Test/sign-out helper. */
export function resetRealtimeHealth() {
  health = { ...INITIAL };
  emit();
}

export function subscribeRealtimeHealth(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useRealtimeHealth(): RealtimeHealth {
  return useSyncExternalStore(
    subscribeRealtimeHealth,
    () => health,
    () => INITIAL,
  );
}

/** Support-friendly one-liner dump, mirroring `formatSyncLog`'s tone. */
export function formatRealtimeHealth(state: RealtimeHealth = health): string {
  return [
    `realtime: ${state.connected ? "connected (SUBSCRIBED)" : "disconnected"}`,
    `lastStatus: ${state.lastStatus ?? "never"}`,
    `lastStatusAt: ${state.lastStatusAt ? new Date(state.lastStatusAt).toISOString() : "never"}`,
    `lastCatchUpAt: ${state.lastCatchUpAt ? new Date(state.lastCatchUpAt).toISOString() : "never"}`,
    `lastCatchUpReason: ${state.lastCatchUpReason ?? "none"}`,
    `subscribes: ${state.subscribeCount}  drops: ${state.dropCount}  catchUps: ${state.catchUpCount}`,
  ].join("\n");
}
