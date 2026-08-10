/**
 * Pure validation for the in-app "Change Password" flow.
 *
 * Kept free of React and Supabase so the rules can be unit tested and reused
 * by both the sheet UI and any future account screen.
 */
export const MIN_PASSWORD_LENGTH = 8;

export type PasswordChangeInput = {
  current: string;
  next: string;
  confirm: string;
};

/** Translation key of the first broken rule, or null when the input is valid. */
export type PasswordChangeError =
  "cp.required" | "cp.tooShort" | "cp.mismatch" | "cp.sameAsOld" | null;

export function validatePasswordChange({
  current,
  next,
  confirm,
}: PasswordChangeInput): PasswordChangeError {
  if (!current.trim() || !next || !confirm) return "cp.required";
  if (next.length < MIN_PASSWORD_LENGTH) return "cp.tooShort";
  if (next !== confirm) return "cp.mismatch";
  if (next === current) return "cp.sameAsOld";
  return null;
}

/**
 * Map a Supabase auth error message onto a user-facing translation key.
 * Re-authentication failures are reported as a wrong current password.
 */
export function passwordErrorKey(message: string | undefined): "cp.wrongCurrent" | "cp.error" {
  const text = (message ?? "").toLowerCase();
  if (text.includes("invalid login") || text.includes("credential") || text.includes("password"))
    return "cp.wrongCurrent";
  return "cp.error";
}
