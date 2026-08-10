import { translate, type Language, type TranslationKey } from "@/lib/i18n";

/**
 * Turns raw Supabase / network / server-function failures into a short,
 * human-readable title + explanation. The app never surfaces raw JSON,
 * status codes or stack traces to the user.
 */

type Rule = { match: RegExp; title: TranslationKey; body: TranslationKey };

const authRules: Rule[] = [
  {
    match: /invalid login credentials|invalid_credentials/i,
    title: "err.badCredentials",
    body: "err.badCredentialsBody",
  },
  {
    match: /email not confirmed|email_not_confirmed/i,
    title: "err.emailUnconfirmed",
    body: "err.emailUnconfirmedBody",
  },
  {
    match: /user already registered|already been registered|user_already_exists/i,
    title: "err.emailTaken",
    body: "err.emailTakenBody",
  },
  {
    match: /user not found|no user found/i,
    title: "err.userNotFound",
    body: "err.userNotFoundBody",
  },
  {
    match: /password should be|weak.?password|at least 6 characters/i,
    title: "err.weakPassword",
    body: "err.weakPasswordBody",
  },
  {
    match: /unable to validate email|invalid email|email_address_invalid/i,
    title: "err.invalidEmail",
    body: "err.invalidEmailBody",
  },
  {
    match: /rate limit|too many requests|over_email_send_rate_limit|429/i,
    title: "err.rateLimited",
    body: "err.rateLimitedBody",
  },
  {
    match: /signups? not allowed|signup_disabled/i,
    title: "err.signupDisabled",
    body: "err.signupDisabledBody",
  },
  {
    match: /unsupported provider|provider is not enabled/i,
    title: "err.providerOff",
    body: "err.providerOffBody",
  },
];

const genericRules: Rule[] = [
  {
    match: /duplicate key|already exists|23505|unique constraint/i,
    title: "err.duplicate",
    body: "err.duplicateBody",
  },
  {
    match: /row-level security|permission denied|not authorized|403/i,
    title: "err.notAllowed",
    body: "err.notAllowedBody",
  },
  {
    match: /unauthorized|jwt|session|401/i,
    title: "err.sessionExpired",
    body: "err.sessionExpiredBody",
  },
  {
    match: /timeout|timed out|aborted/i,
    title: "err.timeout",
    body: "err.timeoutBody",
  },
];

/** Pulls a message string out of anything an API layer might throw. */
export function rawMessageOf(error: unknown): string {
  if (!error) return "";
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (typeof error === "object") {
    const e = error as { message?: unknown; error?: unknown; error_description?: unknown };
    if (typeof e.message === "string") return e.message;
    if (typeof e.error_description === "string") return e.error_description;
    if (typeof e.error === "string") return e.error;
  }
  return "";
}

function looksTechnical(message: string) {
  return (
    !message ||
    message.length > 140 ||
    /^\s*[[{]/.test(message) ||
    /HTTPError|unhandled|status \d{3}|at .+:\d+:\d+/i.test(message)
  );
}

export type FriendlyError = { title: string; body: string };

function browserIsOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

function offlineError(lang: Language): FriendlyError | null {
  if (!browserIsOffline()) return null;
  return { title: translate(lang, "err.offline"), body: translate(lang, "err.offlineBody") };
}

function resolve(rules: Rule[], message: string, lang: Language): FriendlyError | null {
  const rule = rules.find((r) => r.match.test(message));
  if (!rule) return null;
  return { title: translate(lang, rule.title), body: translate(lang, rule.body) };
}

/** Friendly copy for a sign-in / sign-up / password-reset failure. */
export function describeAuthError(error: unknown, lang: Language): FriendlyError {
  const message = rawMessageOf(error);
  return (
    offlineError(lang) ??
    resolve(authRules, message, lang) ??
    resolve(genericRules, message, lang) ?? {
      title: translate(lang, "err.signInFailed"),
      body: looksTechnical(message) ? translate(lang, "err.genericBody") : message,
    }
  );
}

/** Friendly copy for any database / server-function failure. */
export function describeDataError(
  error: unknown,
  lang: Language,
  fallbackTitle: TranslationKey = "err.generic",
): FriendlyError {
  const message = rawMessageOf(error);
  return (
    offlineError(lang) ??
    resolve(genericRules, message, lang) ?? {
      title: translate(lang, fallbackTitle),
      body: looksTechnical(message) ? translate(lang, "err.genericBody") : message,
    }
  );
}
