import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  BREADCRUMB_LIMIT,
  DEDUPE_WINDOW_MS,
  addBreadcrumb,
  buildTelemetryEvent,
  captureTelemetry,
  clearBreadcrumbs,
  clearTelemetrySinks,
  getBreadcrumbs,
  registerTelemetrySink,
  resetTelemetryDedupe,
  scrubContext,
  scrubString,
  setTelemetryRelease,
  type TelemetryEvent,
} from "@/lib/telemetry";

const NOW = 1_700_000_000_000;

beforeEach(() => {
  clearBreadcrumbs();
  clearTelemetrySinks();
  resetTelemetryDedupe();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

describe("PII redaction", () => {
  it("removes emails, tokens and long digit runs from strings", () => {
    const dirty =
      "failed for ana@example.com with Bearer abc.def-123 token eyJhbG.cGF5.c2ln and card 4111111111111111";
    const clean = scrubString(dirty);
    expect(clean).not.toContain("ana@example.com");
    expect(clean).not.toContain("4111111111111111");
    expect(clean).not.toContain("eyJhbG.cGF5.c2ln");
    expect(clean).toContain("[email]");
    expect(clean).toContain("Bearer [redacted]");
  });

  it("redacts sensitive object keys and keeps safe ones", () => {
    const out = scrubContext({
      widget: "analytics-chart",
      email: "ana@example.com",
      access_token: "secret-value",
      user_id: "uuid-1234",
      nested: { phone: "+62 812 3456 7890", note: "reach me at ana@example.com" },
    });
    expect(out["widget"]).toBe("analytics-chart");
    expect(out["email"]).toBe("[redacted]");
    expect(out["access_token"]).toBe("[redacted]");
    expect(out["user_id"]).toBe("[redacted]");
    const nested = out["nested"] as Record<string, unknown>;
    expect(nested["phone"]).toBe("[redacted]");
    expect(nested["note"]).toBe("reach me at [email]");
  });

  it("survives circular structures", () => {
    const a: Record<string, unknown> = { name: "x" };
    a["self"] = a;
    expect(() => scrubContext(a)).not.toThrow();
    expect(JSON.stringify(scrubContext(a))).toContain("[circular]");
  });
});

describe("breadcrumbs", () => {
  it("keeps a bounded ring buffer of redacted crumbs", () => {
    for (let i = 0; i < BREADCRUMB_LIMIT + 10; i++) addBreadcrumb("ui", `tap ${i}`);
    const crumbs = getBreadcrumbs();
    expect(crumbs).toHaveLength(BREADCRUMB_LIMIT);
    expect(crumbs.at(-1)?.message).toBe(`tap ${BREADCRUMB_LIMIT + 9}`);
  });

  it("scrubs breadcrumb messages and data", () => {
    addBreadcrumb("auth", "login ana@example.com", { email: "ana@example.com" });
    const crumb = getBreadcrumbs()[0]!;
    expect(crumb.message).toBe("login [email]");
    expect(crumb.data?.["email"]).toBe("[redacted]");
  });
});

describe("captureTelemetry", () => {
  it("emits a redacted event with stack and context to every sink", () => {
    const events: TelemetryEvent[] = [];
    registerTelemetrySink((e) => events.push(e));
    setTelemetryRelease("test");

    const error = new TypeError("cannot read chart for ana@example.com");
    captureTelemetry("widget.analytics-chart", error, { widget: "analytics-chart" }, "error", NOW);

    expect(events).toHaveLength(1);
    const event = events[0]!;
    expect(event.scope).toBe("widget.analytics-chart");
    expect(event.kind).toBe("TypeError");
    expect(event.message).toBe("cannot read chart for [email]");
    expect(event.stack).toBeTruthy();
    expect(event.stack).not.toContain("ana@example.com");
    expect(event.context["widget"]).toBe("analytics-chart");
    expect(event.release).toBe("test");
    expect(event.timestamp).toBe(NOW);
  });

  it("de-duplicates identical errors inside the dedupe window", () => {
    const sink = vi.fn();
    registerTelemetrySink(sink);
    const error = new Error("boom");

    expect(captureTelemetry("widget.hero", error, {}, "error", NOW)).not.toBeNull();
    expect(captureTelemetry("widget.hero", error, {}, "error", NOW + 100)).toBeNull();
    expect(
      captureTelemetry("widget.hero", error, {}, "error", NOW + DEDUPE_WINDOW_MS + 1),
    ).not.toBeNull();
    expect(sink).toHaveBeenCalledTimes(2);
  });

  it("does not let a broken sink escalate into a second crash", () => {
    registerTelemetrySink(() => {
      throw new Error("transport down");
    });
    expect(() =>
      captureTelemetry("widget.hero", new Error("boom"), {}, "error", NOW),
    ).not.toThrow();
  });

  it("describes a thrown Response without leaking the body", () => {
    const event = buildTelemetryEvent(
      "loader",
      new Response("nope", { status: 401 }),
      {},
      "error",
      NOW,
    );
    expect(event.message).toBe("Response 401");
    expect(event.kind).toBe("Response");
  });

  it("attaches the breadcrumb trail to the event", () => {
    addBreadcrumb("navigation", "/analytics", undefined, NOW);
    const event = buildTelemetryEvent("widget.chart", new Error("boom"), {}, "error", NOW);
    expect(event.breadcrumbs.at(-1)?.message).toBe("/analytics");
  });
});
