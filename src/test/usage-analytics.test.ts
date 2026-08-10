import { beforeEach, describe, expect, it } from "vitest";

import {
  getUsageStats,
  resetUsageStats,
  trackUsage,
  usageCount,
  USAGE_EVENTS,
} from "@/lib/usage-analytics";

describe("local usage analytics", () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetUsageStats();
  });

  it("starts every counter at zero", () => {
    for (const event of USAGE_EVENTS) expect(usageCount(event)).toBe(0);
  });

  it("counts WhatsApp export preview opens", () => {
    trackUsage("wa_export_preview_opened");
    trackUsage("wa_export_preview_opened");
    expect(usageCount("wa_export_preview_opened")).toBe(2);
    expect(usageCount("driver_cod_undo")).toBe(0);
  });

  it("counts Driver COD undo invocations and stamps the time", () => {
    const counter = trackUsage("driver_cod_undo", 1_700_000_000_000);
    expect(counter).toEqual({ count: 1, lastAt: 1_700_000_000_000 });
    expect(getUsageStats().driver_cod_undo.lastAt).toBe(1_700_000_000_000);
  });

  it("persists counters across a reload", () => {
    trackUsage("wa_export_preview_opened");
    const raw = window.localStorage.getItem("c2h.usage.v1");
    expect(raw).toContain("wa_export_preview_opened");
    expect(JSON.parse(raw!).wa_export_preview_opened.count).toBe(1);
  });

  it("never throws when storage is unavailable", () => {
    const original = window.localStorage.setItem;
    window.localStorage.setItem = () => {
      throw new Error("quota");
    };
    expect(() => trackUsage("driver_cod_undo")).not.toThrow();
    window.localStorage.setItem = original;
  });
});
