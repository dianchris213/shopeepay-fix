import { supabase } from "@/integrations/supabase/client";
import { getState } from "@/lib/finance-store";
import { translate } from "@/lib/i18n";
import { ensureFreshSession } from "@/lib/session-refresh";
import { toast } from "@/lib/toast-store";

/**
 * Single source of truth for "which user is writing right now".
 *
 * Cloud rows (categories, wallets, …) carry a `user_id` that is a foreign key
 * onto the auth users table. A cached/stale id — a deleted account, a revoked
 * session, a sign-out race — makes Postgres reject the insert with
 * `violates foreign key constraint "…_user_id_fkey"`. Resolving the id from
 * the live session right before every write removes that class of failure.
 */

export class AuthRequiredError extends Error {
  constructor(message = "Authentication required") {
    super(message);
    this.name = "AuthRequiredError";
  }
}

/** True for a Postgres FK violation on an owner column (`*_user_id_fkey`). */
export function isMissingAuthUserError(error: unknown): boolean {
  if (!error) return false;
  const e = error as { code?: unknown; message?: unknown; details?: unknown; hint?: unknown };
  const text = `${e.code ?? ""} ${e.message ?? ""} ${e.details ?? ""} ${e.hint ?? ""}`.toLowerCase();
  if (text.includes("user_id_fkey")) return true;
  return text.includes("23503") && text.includes("user_id");
}

let lastNoticeAt = Number.NEGATIVE_INFINITY;
const NOTICE_THROTTLE_MS = 10_000;

/** Asks the user to sign in again — throttled so a burst of writes shows once. */
export function notifyReauthRequired(now = Date.now()): boolean {
  if (now - lastNoticeAt < NOTICE_THROTTLE_MS) return false;
  lastNoticeAt = now;
  const lang = getState().settings.language;
  toast.error(translate(lang, "err.sessionExpired"), translate(lang, "err.sessionExpiredBody"));
  return true;
}

/** Test helper. */
export function resetReauthNotice() {
  lastNoticeAt = Number.NEGATIVE_INFINITY;
}

/**
 * Resolves the authenticated user id, refreshing a stale token first.
 * Never returns null/undefined/"" — it throws `AuthRequiredError` instead so
 * callers can never send an unowned payload to the database.
 */
export async function requireAuthUserId(): Promise<string> {
  try {
    await ensureFreshSession();
  } catch {
    // A failed refresh is not fatal on its own; getUser() decides below.
  }
  let id: string | undefined;
  try {
    const { data, error } = await supabase.auth.getUser();
    if (!error) id = data?.user?.id ?? undefined;
  } catch {
    id = undefined;
  }
  if (typeof id !== "string" || id.trim() === "") {
    notifyReauthRequired();
    throw new AuthRequiredError();
  }
  return id;
}
