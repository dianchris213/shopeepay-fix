/**
 * Focus / background-drop recovery.
 *
 * Android Telegram Mini Apps freeze the websocket while the app is
 * backgrounded, so returning to the app must trigger a catch-up refetch even
 * when no realtime event ever arrived. This module owns *only* the event
 * plumbing (so it can be unit-tested without a live socket); the actual
 * refetch/resubscribe work is injected by the caller.
 */
import type { CatchUpReason } from "@/lib/realtime-health";

export type FocusRecoveryHandlers = {
  /** Run a catch-up refetch of transactions/wallets/bills/categories. */
  onCatchUp: (reason: CatchUpReason) => void;
  /** Re-open the realtime channel; the old socket may be dead. */
  onResubscribe?: (reason: CatchUpReason) => void;
  /** Gate: skip while signed out. Defaults to always-on. */
  isActive?: () => boolean;
};

/** Events that mean "we may have missed updates while away". */
const RECOVERY_EVENTS = [
  ["visibilitychange", "visibilitychange"],
  ["focus", "focus"],
  ["online", "online"],
  ["pageshow", "pageshow"],
] as const satisfies ReadonlyArray<readonly [string, CatchUpReason]>;

/**
 * Binds the recovery listeners. Returns an unbind function — callers that bind
 * once for the app lifetime can ignore it; tests use it to stay isolated.
 */
export function bindFocusRecovery(handlers: FocusRecoveryHandlers): () => void {
  if (typeof window === "undefined" || typeof document === "undefined") return () => {};

  const isActive = handlers.isActive ?? (() => true);
  const bound: Array<() => void> = [];

  for (const [event, reason] of RECOVERY_EVENTS) {
    const listener = () => {
      // A hidden document means we're going away, not coming back.
      if (document.visibilityState !== "visible") return;
      if (!isActive()) return;
      handlers.onResubscribe?.(reason);
      handlers.onCatchUp(reason);
    };
    const target: EventTarget = event === "visibilitychange" ? document : window;
    target.addEventListener(event, listener);
    bound.push(() => target.removeEventListener(event, listener));
  }

  return () => {
    for (const off of bound) off();
    bound.length = 0;
  };
}
