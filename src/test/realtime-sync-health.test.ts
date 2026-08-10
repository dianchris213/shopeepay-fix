import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { bindFocusRecovery } from "@/lib/focus-recovery";
import {
  formatRealtimeHealth,
  getRealtimeHealth,
  recordCatchUpRefetch,
  recordChannelLifecycle,
  resetRealtimeHealth,
  setRealtimeLogger,
  type RealtimeLogRecord,
} from "@/lib/realtime-health";

/** jsdom keeps `visibilityState` read-only, so we stub the getter per test. */
function setVisibility(value: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => value,
  });
}

describe("realtime sync health monitor", () => {
  let logs: RealtimeLogRecord[];

  beforeEach(() => {
    logs = [];
    resetRealtimeHealth();
    setRealtimeLogger((record) => logs.push(record));
  });

  afterEach(() => {
    setRealtimeLogger();
    resetRealtimeHealth();
  });

  it("starts disconnected with no catch-up recorded", () => {
    const health = getRealtimeHealth();
    expect(health.connected).toBe(false);
    expect(health.lastStatus).toBeNull();
    expect(health.lastCatchUpAt).toBeNull();
  });

  it("reports SUBSCRIBED as connected", () => {
    recordChannelLifecycle("SUBSCRIBED", undefined, 1_000);
    const health = getRealtimeHealth();
    expect(health.connected).toBe(true);
    expect(health.lastStatus).toBe("SUBSCRIBED");
    expect(health.lastStatusAt).toBe(1_000);
    expect(health.subscribeCount).toBe(1);
    expect(health.dropCount).toBe(0);
  });

  it.each(["CLOSED", "TIMED_OUT", "CHANNEL_ERROR"] as const)(
    "reports %s as disconnected and counts the drop",
    (status) => {
      recordChannelLifecycle("SUBSCRIBED");
      recordChannelLifecycle(status, "socket died");
      const health = getRealtimeHealth();
      expect(health.connected).toBe(false);
      expect(health.lastStatus).toBe(status);
      expect(health.dropCount).toBe(1);
    },
  );

  it("emits one structured log line per lifecycle event", () => {
    recordChannelLifecycle("SUBSCRIBED");
    recordChannelLifecycle("TIMED_OUT", "no heartbeat");
    expect(logs).toHaveLength(2);
    expect(logs[0]).toMatchObject({
      channel: "realtime",
      event: "lifecycle",
      status: "SUBSCRIBED",
    });
    expect(logs[1]).toMatchObject({
      event: "lifecycle",
      status: "TIMED_OUT",
      connected: false,
      detail: "no heartbeat",
    });
    expect(typeof logs[1]?.at).toBe("string");
  });

  it("timestamps the last successful catch-up refetch with its trigger", () => {
    recordCatchUpRefetch("visibilitychange", 5_000);
    const health = getRealtimeHealth();
    expect(health.lastCatchUpAt).toBe(5_000);
    expect(health.lastCatchUpReason).toBe("visibilitychange");
    expect(health.catchUpCount).toBe(1);
    expect(logs[0]).toMatchObject({ event: "catch-up", reason: "visibilitychange" });
  });

  it("formats a support-friendly summary", () => {
    recordChannelLifecycle("SUBSCRIBED", undefined, 1_000);
    recordCatchUpRefetch("subscribed", 2_000);
    const text = formatRealtimeHealth();
    expect(text).toContain("realtime: connected (SUBSCRIBED)");
    expect(text).toContain("lastCatchUpReason: subscribed");
  });

  it("never lets a throwing logger break recording", () => {
    setRealtimeLogger(() => {
      throw new Error("sink exploded");
    });
    expect(() => recordChannelLifecycle("SUBSCRIBED")).not.toThrow();
    expect(getRealtimeHealth().connected).toBe(true);
  });
});

describe("focus recovery", () => {
  let unbind: () => void;
  let onCatchUp: ReturnType<typeof vi.fn<(reason: string) => void>>;
  let onResubscribe: ReturnType<typeof vi.fn<(reason: string) => void>>;

  beforeEach(() => {
    setVisibility("visible");
    onCatchUp = vi.fn<(reason: string) => void>();
    onResubscribe = vi.fn<(reason: string) => void>();
    unbind = bindFocusRecovery({ onCatchUp, onResubscribe });
  });

  afterEach(() => {
    unbind();
    setVisibility("visible");
  });

  it("refetches when the app regains focus", () => {
    window.dispatchEvent(new Event("focus"));
    expect(onCatchUp).toHaveBeenCalledWith("focus");
    expect(onResubscribe).toHaveBeenCalledWith("focus");
  });

  it("refetches when the document becomes visible again after a background drop", () => {
    setVisibility("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(onCatchUp).not.toHaveBeenCalled();

    setVisibility("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(onCatchUp).toHaveBeenCalledWith("visibilitychange");
  });

  it("refetches when the network comes back and on page restore", () => {
    window.dispatchEvent(new Event("online"));
    window.dispatchEvent(new Event("pageshow"));
    expect(onCatchUp).toHaveBeenCalledWith("online");
    expect(onCatchUp).toHaveBeenCalledWith("pageshow");
  });

  it("stays silent while signed out", () => {
    unbind();
    const inactive = vi.fn();
    unbind = bindFocusRecovery({ onCatchUp: inactive, isActive: () => false });
    window.dispatchEvent(new Event("focus"));
    expect(inactive).not.toHaveBeenCalled();
  });

  it("stops listening after unbind", () => {
    unbind();
    window.dispatchEvent(new Event("focus"));
    expect(onCatchUp).not.toHaveBeenCalled();
    unbind = () => {};
  });

  it("records the catch-up in the health monitor when wired together", () => {
    resetRealtimeHealth();
    unbind();
    unbind = bindFocusRecovery({ onCatchUp: (reason) => recordCatchUpRefetch(reason, 9_000) });
    window.dispatchEvent(new Event("focus"));
    expect(getRealtimeHealth().lastCatchUpAt).toBe(9_000);
    expect(getRealtimeHealth().lastCatchUpReason).toBe("focus");
    resetRealtimeHealth();
  });
});
