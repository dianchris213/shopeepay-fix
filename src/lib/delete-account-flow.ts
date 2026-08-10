import { describeDataError } from "@/lib/error-messages";
import { translate, type Language } from "@/lib/i18n";
import { toast } from "@/lib/toast-store";

export type DeleteAccountDeps = {
  /** Calls the server function that removes the user and all their rows. */
  deleteAccount: () => Promise<{ ok?: boolean } | undefined>;
  signOut: () => Promise<unknown>;
  clearLocalData: () => void;
  redirect: () => void;
  setBusy: (busy: boolean) => void;
  setError: (message: string | null) => void;
  lang: Language;
};

export type DeleteAccountOutcome =
  { status: "deleted" } | { status: "busy" } | { status: "failed"; title: string; body: string };

/**
 * Orchestrates the "Delete Account" flow: busy state, human-readable errors,
 * local cleanup, sign-out and routing back to sign-in. Extracted from the
 * Settings route so the behaviour is unit-testable.
 */
export async function runAccountDeletion(
  deps: DeleteAccountDeps,
  isBusy: boolean,
): Promise<DeleteAccountOutcome> {
  if (isBusy) return { status: "busy" };

  deps.setBusy(true);
  deps.setError(null);

  try {
    const result = await deps.deleteAccount();
    if (!result?.ok) throw new Error(translate(deps.lang, "err.deleteAccountFailed"));
  } catch (error) {
    console.error("[delete account]", error);
    deps.setBusy(false);
    const friendly = describeDataError(error, deps.lang, "err.deleteAccountFailed");
    deps.setError(`${friendly.title} — ${friendly.body}`);
    toast.error(friendly.title, friendly.body);
    return { status: "failed", title: friendly.title, body: friendly.body };
  }

  toast.success(
    translate(deps.lang, "toast.accountDeleted"),
    translate(deps.lang, "toast.accountDeletedBody"),
  );

  // Best-effort cleanup — never block the redirect on these.
  try {
    deps.clearLocalData();
  } catch (error) {
    console.error("[clear local data]", error);
  }

  try {
    await deps.signOut();
  } catch (error) {
    console.error("[sign out after delete]", error);
  }

  // Only route back to sign-in once the account is really gone.
  deps.redirect();
  return { status: "deleted" };
}
