import { supabase } from "@/integrations/supabase/client";

/** Refresh the session when it expires within this window (seconds). */
export const REFRESH_MARGIN_SECONDS = 120;

export type SessionLike = { expires_at?: number | undefined } | null;

/**
 * A Telegram Mini App can sit suspended in the background for hours. When it
 * comes back the cached access token is often already expired, and the next
 * request fails with a stale 401/403. Deciding purely from `expires_at` keeps
 * that logic testable.
 */
export function shouldRefreshSession(session: SessionLike, nowMs: number = Date.now()): boolean {
  if (!session) return false;
  const expiresAt = session.expires_at;
  if (typeof expiresAt !== "number") return true;
  return expiresAt * 1000 - nowMs <= REFRESH_MARGIN_SECONDS * 1000;
}

/**
 * Verify (and if needed refresh) the Supabase session. Returns true when the
 * app still has a usable session afterwards.
 */
export async function verifySession(): Promise<boolean> {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    const session = data.session;
    if (!session) return false;
    if (!shouldRefreshSession(session)) return true;
    const refreshed = await supabase.auth.refreshSession();
    if (refreshed.error) throw refreshed.error;
    return Boolean(refreshed.data.session);
  } catch (error) {
    console.error("[session resilience]", error);
    return false;
  }
}

type Cleanup = () => void;

/**
 * Re-verify the session whenever the Mini App returns to the foreground:
 * tab visibility, window focus and Telegram's own activation event.
 */
export function watchSessionLifecycle(check: () => void = () => void verifySession()): Cleanup {
  if (typeof document === "undefined") return () => {};

  const onVisible = () => {
    if (document.visibilityState === "visible") check();
  };
  const onFocus = () => check();
  const onOnline = () => check();

  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("focus", onFocus);
  window.addEventListener("online", onOnline);

  const webApp = (
    window as unknown as {
      Telegram?: {
        WebApp?: {
          onEvent?: (e: string, h: () => void) => void;
          offEvent?: (e: string, h: () => void) => void;
        };
      };
    }
  ).Telegram?.WebApp;
  webApp?.onEvent?.("activated", onFocus);

  return () => {
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("focus", onFocus);
    window.removeEventListener("online", onOnline);
    webApp?.offEvent?.("activated", onFocus);
  };
}
