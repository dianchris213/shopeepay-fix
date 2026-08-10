/**
 * Production error telemetry.
 *
 * A single, dependency-free funnel that every crash path feeds into:
 * React error boundaries, session-refresh failures and manual reports.
 *
 * Design constraints:
 *   - **No PII leaves the device.** Emails, phone numbers, bearer tokens,
 *     Supabase keys and long digit runs (card/account numbers) are redacted
 *     from every string before a report is emitted, recursively, including
 *     object keys that are known to hold personal data.
 *   - **Deterministic and testable.** No timers, no network calls of its own;
 *     transport is a pluggable sink so unit tests can assert on payloads.
 *   - **Bounded.** Breadcrumbs are a ring buffer and identical errors are
 *     de-duplicated inside a short window, so a render loop cannot flood the
 *     transport.
 */

export type TelemetrySeverity = "error" | "warning" | "info";

export type TelemetryContext = Record<string, unknown>;

export type TelemetryEvent = {
  /** Stable grouping key, e.g. "widget.analytics-chart". */
  scope: string;
  message: string;
  stack?: string | undefined;
  /** Error class name when available ("TypeError", "AuthApiError", …). */
  kind?: string | undefined;
  severity: TelemetrySeverity;
  /** Redacted, JSON-safe extra context. */
  context: TelemetryContext;
  /** Recent user/app actions leading up to the failure (redacted). */
  breadcrumbs: Breadcrumb[];
  /** Non-identifying session fingerprint; never the user id or email. */
  release: string;
  timestamp: number;
};

export type Breadcrumb = {
  category: string;
  message: string;
  at: number;
  data?: TelemetryContext | undefined;
};

export type TelemetrySink = (event: TelemetryEvent) => void;

export const BREADCRUMB_LIMIT = 25;
export const DEDUPE_WINDOW_MS = 10_000;
const STRING_LENGTH_LIMIT = 2_000;
const OBJECT_DEPTH_LIMIT = 4;

/* ------------------------------------------------------------------ *
 * PII redaction
 * ------------------------------------------------------------------ */

/** Keys whose values are dropped outright, whatever they contain. */
const SENSITIVE_KEYS =
  /^(email|e_?mail|phone|password|pass|token|access_token|refresh_token|apikey|api_key|authorization|auth|secret|session|jwt|user_?id|full_?name|name|avatar|address|iban|card|pan|cvv)$/i;

const REDACTIONS: Array<[RegExp, string]> = [
  // Emails.
  [/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]"],
  // JWT / Supabase publishable & secret keys.
  [/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, "[jwt]"],
  [/sb_(?:publishable|secret)_[\w-]+/g, "[sb_key]"],
  [/Bearer\s+[\w.\-~+/]+=*/gi, "Bearer [redacted]"],
  // Phone numbers (international-ish) and long digit runs (cards, accounts).
  [/\+\d[\d\s().-]{7,}\d/g, "[phone]"],
  [/\b\d{9,}\b/g, "[number]"],
];

/** Redact PII patterns from a single string. */
export function scrubString(value: string): string {
  let out = value;
  for (const [pattern, replacement] of REDACTIONS) out = out.replace(pattern, replacement);
  return out.length > STRING_LENGTH_LIMIT ? `${out.slice(0, STRING_LENGTH_LIMIT)}…` : out;
}

/**
 * Recursively redact a value: sensitive keys are dropped, strings are scrubbed,
 * cycles and over-deep structures are collapsed. The result is JSON-safe.
 */
export function scrubValue(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (value == null) return value;
  if (typeof value === "string") return scrubString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "function" || typeof value === "symbol") return undefined;
  if (value instanceof Error) return scrubString(value.stack ?? `${value.name}: ${value.message}`);
  if (depth >= OBJECT_DEPTH_LIMIT) return "[depth]";
  if (typeof value === "object") {
    if (seen.has(value)) return "[circular]";
    seen.add(value);
    if (Array.isArray(value)) {
      return value.slice(0, 20).map((item) => scrubValue(item, depth + 1, seen));
    }
    const out: TelemetryContext = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.test(key)) {
        out[key] = "[redacted]";
        continue;
      }
      const scrubbed = scrubValue(item, depth + 1, seen);
      if (scrubbed !== undefined) out[key] = scrubbed;
    }
    return out;
  }
  return String(value);
}

export function scrubContext(context: TelemetryContext): TelemetryContext {
  return scrubValue(context) as TelemetryContext;
}

/* ------------------------------------------------------------------ *
 * Breadcrumbs
 * ------------------------------------------------------------------ */

let breadcrumbs: Breadcrumb[] = [];

/** Record a redacted breadcrumb in the bounded ring buffer. */
export function addBreadcrumb(
  category: string,
  message: string,
  data?: TelemetryContext,
  at: number = Date.now(),
): void {
  breadcrumbs.push({
    category,
    message: scrubString(message),
    at,
    ...(data ? { data: scrubContext(data) } : {}),
  });
  if (breadcrumbs.length > BREADCRUMB_LIMIT) {
    breadcrumbs = breadcrumbs.slice(-BREADCRUMB_LIMIT);
  }
}

export function getBreadcrumbs(): Breadcrumb[] {
  return [...breadcrumbs];
}

export function clearBreadcrumbs(): void {
  breadcrumbs = [];
}

/* ------------------------------------------------------------------ *
 * Sinks & transport
 * ------------------------------------------------------------------ */

const sinks = new Set<TelemetrySink>();

/** Register a transport (Sentry, a logging endpoint, a test spy…). */
export function registerTelemetrySink(sink: TelemetrySink): () => void {
  sinks.add(sink);
  return () => void sinks.delete(sink);
}

export function clearTelemetrySinks(): void {
  sinks.clear();
}

let release = "dev";

/** Set the non-identifying build/release marker attached to every event. */
export function setTelemetryRelease(value: string): void {
  release = scrubString(value);
}

/* ------------------------------------------------------------------ *
 * Capture
 * ------------------------------------------------------------------ */

const recentSignatures = new Map<string, number>();

export function resetTelemetryDedupe(): void {
  recentSignatures.clear();
}

function describe(error: unknown): { message: string; stack?: string; kind?: string } {
  if (error instanceof Response) {
    return { message: `Response ${error.status}`, kind: "Response" };
  }
  if (error instanceof Error) {
    return {
      message: error.message,
      ...(error.stack !== undefined && { stack: error.stack }),
      kind: error.name,
    };
  }
  return { message: typeof error === "string" ? error : safeString(error) };
}

function safeString(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

/**
 * Build a fully redacted telemetry event without emitting it. Exposed so tests
 * (and callers that want to inspect before sending) can reason about payloads.
 */
export function buildTelemetryEvent(
  scope: string,
  error: unknown,
  context: TelemetryContext = {},
  severity: TelemetrySeverity = "error",
  now: number = Date.now(),
): TelemetryEvent {
  const described = describe(error);
  return {
    scope,
    message: scrubString(described.message),
    stack: described.stack ? scrubString(described.stack) : undefined,
    kind: described.kind,
    severity,
    context: scrubContext(context),
    breadcrumbs: getBreadcrumbs(),
    release,
    timestamp: now,
  };
}

/**
 * Report an error to every registered sink.
 *
 * Returns the emitted event, or `null` when the report was suppressed as a
 * duplicate inside {@link DEDUPE_WINDOW_MS}.
 */
export function captureTelemetry(
  scope: string,
  error: unknown,
  context: TelemetryContext = {},
  severity: TelemetrySeverity = "error",
  now: number = Date.now(),
): TelemetryEvent | null {
  const event = buildTelemetryEvent(scope, error, context, severity, now);
  const signature = `${scope}|${event.kind ?? ""}|${event.message}`;

  const last = recentSignatures.get(signature);
  if (last !== undefined && now - last < DEDUPE_WINDOW_MS) return null;
  recentSignatures.set(signature, now);
  // Keep the dedupe map from growing without bound in a long-lived session.
  if (recentSignatures.size > 200) {
    for (const [key, at] of recentSignatures) {
      if (now - at >= DEDUPE_WINDOW_MS) recentSignatures.delete(key);
    }
  }

  for (const sink of sinks) {
    try {
      sink(event);
    } catch {
      // A broken transport must never escalate into a second crash.
    }
  }

  // Always leave a trace in the console pipeline, expanded and redacted.
  const line = `[telemetry:${scope}] ${event.message}`;
  if (severity === "error") console.error(line, event.stack ?? "", event.context);
  else if (severity === "warning") console.warn(line, event.context);
  else console.info(line, event.context);

  addBreadcrumb("telemetry", `${scope}: ${event.message}`, undefined, now);
  return event;
}
