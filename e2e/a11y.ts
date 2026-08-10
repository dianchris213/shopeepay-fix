import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Managed accessibility baseline.
 *
 * The suite scans every key screen with axe-core and fails on any blocking
 * violation. Genuine, documented, pre-existing exceptions live in
 * `a11y-baseline.json` so they do not generate CI noise — but the allowlist is
 * deliberately narrow:
 *
 *   - an exception matches one rule on one screen, optionally pinned to
 *     specific DOM targets and a maximum node count;
 *   - a *new* violation, a *new* offending node, or a node count above
 *     `maxNodes` is never allowlisted and fails the run;
 *   - every entry carries `reason`, `owner` and `addedOn`, and may carry
 *     `expires` — once the date passes the exception stops suppressing and the
 *     build turns red again, so debt cannot be parked forever;
 *   - an entry that no longer matches anything is reported as stale so the
 *     allowlist shrinks as the app improves.
 *
 * Regenerate deliberately with:  bun run test:e2e:a11y:update
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const BASELINE_PATH = resolve(HERE, "a11y-baseline.json");

export type A11yException = {
  /** Screen name passed to `auditScreen` (e.g. "wallets"). */
  screen: string;
  /** axe rule id (e.g. "color-contrast"). */
  rule: string;
  /** Optional exact node targets; when omitted the rule is allowed screen-wide. */
  targets?: string[];
  /** Upper bound on offending nodes; a regression above it fails. */
  maxNodes?: number;
  reason: string;
  owner?: string;
  addedOn?: string;
  /** ISO date; after it the exception no longer suppresses the violation. */
  expires?: string;
};

type Baseline = {
  description?: string;
  policy?: { blockingImpacts?: string[]; tags?: string[] };
  exceptions: A11yException[];
};

export type AxeNode = { target: unknown[]; failureSummary?: string };
export type AxeViolation = {
  id: string;
  impact?: string | null;
  help: string;
  helpUrl?: string;
  nodes: AxeNode[];
};

function readBaseline(): Baseline {
  try {
    const parsed = JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as Baseline;
    return { ...parsed, exceptions: parsed.exceptions ?? [] };
  } catch {
    return { exceptions: [] };
  }
}

const baseline = readBaseline();

export const BLOCKING_IMPACTS = new Set(
  baseline.policy?.blockingImpacts ?? ["serious", "critical"],
);
export const AXE_TAGS = baseline.policy?.tags ?? ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

/** Fail when an allowlisted exception no longer matches anything. */
export const strictStaleCheck = process.env["A11Y_STRICT"] === "1";
/** Rewrite the allowlist from the current run instead of asserting against it. */
export const updateBaseline = process.env["A11Y_UPDATE_BASELINE"] === "1";

/** Stable, comparable string for one offending DOM node. */
export function targetOf(node: AxeNode): string {
  return node.target
    .flat(Infinity as number)
    .map((part) => String(part))
    .join(" ");
}

function isExpired(exception: A11yException, now: Date): boolean {
  if (!exception.expires) return false;
  const expiry = new Date(`${exception.expires}T23:59:59.999Z`);
  return Number.isFinite(expiry.getTime()) && expiry.getTime() < now.getTime();
}

export type ScreenReport = {
  screen: string;
  /** Violations that must fail the run. */
  blocking: AxeViolation[];
  /** Violations suppressed by a live allowlist entry. */
  allowlisted: { rule: string; nodes: number; reason: string }[];
  /** Non-blocking impacts, reported only. */
  advisory: AxeViolation[];
  /** Allowlist entries for this screen that matched nothing. */
  stale: A11yException[];
  /** Allowlist entries that have passed their `expires` date. */
  expired: A11yException[];
};

/**
 * Split a screen's axe violations into blocking / allowlisted / advisory.
 *
 * A violation is only suppressed when a live (non-expired) exception matches
 * the rule AND covers every offending node AND the node count is within
 * `maxNodes`. Any node outside the allowlist is re-reported as a blocking
 * violation containing just the unexpected nodes.
 */
export function classifyViolations(
  screen: string,
  violations: AxeViolation[],
  now: Date = new Date(),
): ScreenReport {
  const forScreen = baseline.exceptions.filter((e) => e.screen === screen);
  const live = forScreen.filter((e) => !isExpired(e, now));
  const expired = forScreen.filter((e) => isExpired(e, now));
  const used = new Set<A11yException>();

  const blocking: AxeViolation[] = [];
  const allowlisted: ScreenReport["allowlisted"] = [];
  const advisory: AxeViolation[] = [];

  for (const violation of violations) {
    if (!BLOCKING_IMPACTS.has(violation.impact ?? "")) {
      advisory.push(violation);
      continue;
    }

    const exception = live.find((e) => e.rule === violation.id);
    if (!exception) {
      blocking.push(violation);
      continue;
    }
    used.add(exception);

    // Node-level check: only the documented targets are forgiven.
    const unexpected = exception.targets
      ? violation.nodes.filter((node) => !exception.targets!.includes(targetOf(node)))
      : [];
    const overBudget =
      exception.maxNodes !== undefined && violation.nodes.length > exception.maxNodes;

    if (unexpected.length === 0 && !overBudget) {
      allowlisted.push({
        rule: violation.id,
        nodes: violation.nodes.length,
        reason: exception.reason,
      });
      continue;
    }

    blocking.push({
      ...violation,
      help: overBudget
        ? `${violation.help} — ${violation.nodes.length} node(s) exceeds the allowlisted maximum of ${exception.maxNodes}`
        : `${violation.help} — node(s) outside the documented allowlist entry`,
      nodes: unexpected.length > 0 ? unexpected : violation.nodes,
    });
  }

  return {
    screen,
    blocking,
    allowlisted,
    advisory,
    stale: live.filter((e) => !used.has(e)),
    expired,
  };
}

/** Human-readable failure text for the assertion message. */
export function formatBlocking(report: ScreenReport): string {
  const lines = report.blocking.map(
    (violation) =>
      `  [${violation.impact}] ${violation.id}: ${violation.help}\n` +
      violation.nodes
        .slice(0, 5)
        .map((node) => `      → ${targetOf(node)}`)
        .join("\n"),
  );
  const expired = report.expired.map(
    (e) => `  [expired allowlist] ${e.rule} (expired ${e.expires}) — ${e.reason}`,
  );
  return [
    `New accessibility violations on "${report.screen}" (not covered by e2e/a11y-baseline.json):`,
    ...lines,
    ...expired,
    "",
    "Fix the issue, or document it deliberately with: bun run test:e2e:a11y:update",
  ].join("\n");
}

/**
 * Baseline regeneration. Collects the run's blocking violations and rewrites
 * `a11y-baseline.json`, pinned to the exact nodes and node counts observed.
 */
const collected = new Map<string, A11yException>();

export function collectForBaseline(screen: string, violations: AxeViolation[]) {
  for (const violation of violations) {
    if (!BLOCKING_IMPACTS.has(violation.impact ?? "")) continue;
    const key = `${screen}::${violation.id}`;
    const targets = Array.from(new Set(violation.nodes.map(targetOf))).sort();
    collected.set(key, {
      screen,
      rule: violation.id,
      targets,
      maxNodes: violation.nodes.length,
      reason: `TODO: document why this is accepted — ${violation.help}`,
      owner: "TODO",
      addedOn: new Date().toISOString().slice(0, 10),
    });
  }
}

export function writeCollectedBaseline() {
  if (!updateBaseline) return;
  const next: Baseline = {
    ...baseline,
    exceptions: Array.from(collected.values()).sort((a, b) =>
      `${a.screen}${a.rule}`.localeCompare(`${b.screen}${b.rule}`),
    ),
  };
  writeFileSync(BASELINE_PATH, `${JSON.stringify(next, null, 2)}\n`, "utf8");
}

export const baselineExceptionCount = baseline.exceptions.length;
export const baselinePath = BASELINE_PATH;
