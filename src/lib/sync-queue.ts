import { markSyncSuccess, setSyncState, type SyncStatus } from "@/lib/sync-status";

type QueuedWrite = {
  scope: string;
  /** Factory so each retry issues a fresh request. */
  send: () => PromiseLike<{ error: unknown }>;
  attempts: number;
};

export const MAX_ATTEMPTS = 6;

const queue: QueuedWrite[] = [];
let flushing = false;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

const isOffline = () => typeof navigator !== "undefined" && navigator.onLine === false;

function publish(status: SyncStatus) {
  setSyncState({ status, pending: queue.length });
}

function scheduleRetry(attempts: number) {
  if (retryTimer) return;
  const delay = Math.min(30_000, 1_000 * 2 ** Math.max(0, attempts - 1));
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void flushQueue();
  }, delay);
}

/** Drains the queue, retrying the head write with exponential backoff. */
export async function flushQueue(): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    while (queue.length) {
      if (isOffline()) {
        publish("offline");
        scheduleRetry(1);
        return;
      }
      const op = queue[0]!;
      publish("syncing");
      try {
        const { error } = await op.send();
        if (error) throw error;
        queue.shift();
      } catch (error) {
        op.attempts += 1;
        console.error(`[sync:${op.scope}]`, error);
        if (op.attempts >= MAX_ATTEMPTS) {
          // Give up on this write; local storage still holds the truth.
          queue.shift();
          publish("error");
          continue;
        }
        publish(isOffline() ? "offline" : "error");
        scheduleRetry(op.attempts);
        return;
      }
    }
    markSyncSuccess();
    publish("synced");
  } finally {
    flushing = false;
  }
}

/**
 * Queues a cloud write. Failures are retried instead of being dropped; the
 * local store remains the offline fallback meanwhile.
 */
export function enqueueWrite(scope: string, send: () => PromiseLike<{ error: unknown }>) {
  queue.push({ scope, send, attempts: 0 });
  setSyncState({ pending: queue.length });
  void flushQueue();
}

export const pendingWrites = () => queue.length;

/**
 * User-initiated "Sync now": cancels the pending backoff timer, forgives the
 * accumulated attempt counts so a stalled write gets its full retry budget
 * again, and drains immediately.
 */
export function retryNow(): Promise<void> {
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  for (const op of queue) op.attempts = 0;
  return flushQueue();
}

/** Test helper: drop everything without touching the persisted status. */
export function resetQueue() {
  queue.length = 0;
  flushing = false;
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => void flushQueue());
  window.addEventListener("offline", () => publish("offline"));
}
