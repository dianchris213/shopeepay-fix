import { useSyncExternalStore } from "react";

export type SyncStatus = "idle" | "syncing" | "synced" | "offline" | "error";

export type SyncState = {
  status: SyncStatus;
  /** Number of cloud writes still waiting to succeed. */
  pending: number;
};

const STORAGE_KEY = "c2h.sync-status";
const IDLE: SyncState = { status: "idle", pending: 0 };

/**
 * Restores the last known sync state. A refresh drops the in-memory retry
 * queue, so anything still pending is reported as unsaved ("error") until a
 * later flush succeeds and clears it.
 */
function load(): SyncState {
  if (typeof window === "undefined") return IDLE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return IDLE;
    const parsed = JSON.parse(raw) as Partial<SyncState>;
    const pending = Number(parsed.pending) || 0;
    if (pending > 0) return { status: "error", pending };
    return { status: parsed.status === "synced" ? "synced" : "idle", pending: 0 };
  } catch {
    return IDLE;
  }
}

let state: SyncState = load();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function persist() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* storage full or unavailable — the indicator is best-effort */
  }
}

export function setSyncState(next: Partial<SyncState>) {
  const merged = { ...state, ...next };
  if (merged.status === state.status && merged.pending === state.pending) return;
  const statusChanged = merged.status !== state.status;
  state = merged;
  persist();
  if (statusChanged && merged.status !== "idle") {
    recordSyncEvent(merged.status, merged.pending);
  }
  listeners.forEach((l) => l());
}

export function getSyncState() {
  return state;
}

/** Test/sign-out helper: forget any persisted sync state. */
export function resetSyncState() {
  state = IDLE;
  if (typeof window !== "undefined") window.localStorage.removeItem(STORAGE_KEY);
  resetSyncHistory();
  listeners.forEach((l) => l());
}

/** Re-reads persisted state (used on boot in tests and after storage resets). */
export function reloadSyncState() {
  state = load();
  listeners.forEach((l) => l());
}

export function useSyncState() {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => IDLE,
  );
}

/* ------------------------------------------------ last successful sync time */

const LAST_SYNC_KEY = "c2h.sync-last";

/**
 * Timestamp of the last fully drained queue. Deliberately kept OUT of
 * `SyncState` so the persisted status payload (and every existing consumer of
 * `getSyncState()`) keeps its exact shape.
 */
function loadLastSyncedAt(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LAST_SYNC_KEY);
    if (!raw) return null;
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

let lastSyncedAt: number | null = loadLastSyncedAt();
const lastSyncListeners = new Set<() => void>();

function subscribeLastSynced(listener: () => void) {
  lastSyncListeners.add(listener);
  return () => lastSyncListeners.delete(listener);
}

/** Records "the queue reached zero at this instant". */
export function markSyncSuccess(at: number = Date.now()) {
  if (lastSyncedAt === at) return;
  lastSyncedAt = at;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(LAST_SYNC_KEY, String(at));
    } catch {
      /* best-effort */
    }
  }
  lastSyncListeners.forEach((l) => l());
}

export function getLastSyncedAt() {
  return lastSyncedAt;
}

export function resetLastSyncedAt() {
  lastSyncedAt = null;
  if (typeof window !== "undefined") window.localStorage.removeItem(LAST_SYNC_KEY);
  lastSyncListeners.forEach((l) => l());
}

export function useLastSyncedAt() {
  return useSyncExternalStore(
    subscribeLastSynced,
    () => lastSyncedAt,
    () => null,
  );
}

/* ---------------------------------------------------------- sync history log */

export type SyncEvent = {
  status: Exclude<SyncStatus, "idle">;
  pending: number;
  at: number;
};

const HISTORY_KEY = "c2h.sync-history";
/** Keep the log intentionally tiny — this is a transparency aid, not an audit trail. */
const HISTORY_LIMIT = 5;

function loadHistory(): SyncEvent[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (e): e is SyncEvent =>
          !!e && typeof e.at === "number" && typeof e.status === "string" && e.status !== "idle",
      )
      .slice(0, HISTORY_LIMIT);
  } catch {
    return [];
  }
}

const EMPTY_HISTORY: SyncEvent[] = [];
let history: SyncEvent[] = loadHistory();
const historyListeners = new Set<() => void>();

function subscribeHistory(listener: () => void) {
  historyListeners.add(listener);
  return () => historyListeners.delete(listener);
}

/** Newest-first append, capped at HISTORY_LIMIT entries. */
export function recordSyncEvent(status: SyncEvent["status"], pending: number, at = Date.now()) {
  history = [{ status, pending, at }, ...history].slice(0, HISTORY_LIMIT);
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch {
      /* best-effort */
    }
  }
  historyListeners.forEach((l) => l());
}

export function getSyncHistory() {
  return history;
}

export function resetSyncHistory() {
  if (!history.length) return;
  history = [];
  if (typeof window !== "undefined") window.localStorage.removeItem(HISTORY_KEY);
  historyListeners.forEach((l) => l());
}

export function useSyncHistory() {
  return useSyncExternalStore(
    subscribeHistory,
    () => history,
    () => EMPTY_HISTORY,
  );
}
