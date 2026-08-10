import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Network fluctuation coverage for the retry queue.
 *
 * These tests drive `navigator.onLine` and the send() outcome up and down
 * repeatedly, then assert the two properties that matter for offline-first
 * correctness:
 *   1. nothing is dropped while the connection is down, and
 *   2. everything drains in strict FIFO order once it comes back.
 */

/** Fresh module instances so each test gets a pristine in-memory queue. */
async function loadModules() {
  vi.resetModules();
  const status = await import("@/lib/sync-status");
  const queue = await import("@/lib/sync-queue");
  return { ...status, ...queue };
}

/** Controllable fake network shared by the tests below. */
function makeNetwork() {
  let online = true;
  const onLine = vi.spyOn(navigator, "onLine", "get").mockImplementation(() => online);
  const completed: string[] = [];

  return {
    completed,
    get online() {
      return online;
    },
    goOffline() {
      online = false;
      window.dispatchEvent(new Event("offline"));
    },
    goOnline() {
      online = true;
      window.dispatchEvent(new Event("online"));
    },
    /** A write that only succeeds while the fake network is up. */
    write(label: string) {
      return vi.fn(async () => {
        if (!online) return { error: new Error(`offline: ${label}`) };
        completed.push(label);
        return { error: null };
      });
    },
    restore: () => onLine.mockRestore(),
  };
}

describe("sync queue under network fluctuation", () => {
  let net: ReturnType<typeof makeNetwork>;

  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    net = makeNetwork();
  });

  afterEach(() => {
    net.restore();
    vi.useRealTimers();
  });

  it("queues every write while offline and drains them in FIFO order when back online", async () => {
    const m = await loadModules();
    m.resetSyncState();

    net.goOffline();

    const labels = ["a", "b", "c", "d", "e"];
    const sends = labels.map((l) => net.write(l));
    labels.forEach((l, i) => m.enqueueWrite(l, sends[i]!));

    await vi.advanceTimersByTimeAsync(0);

    // Nothing may be attempted, and nothing may be dropped.
    sends.forEach((s) => expect(s).not.toHaveBeenCalled());
    expect(m.pendingWrites()).toBe(labels.length);
    expect(m.getSyncState()).toEqual({ status: "offline", pending: labels.length });

    net.goOnline();
    await vi.advanceTimersByTimeAsync(5_000);

    expect(net.completed).toEqual(labels);
    expect(m.pendingWrites()).toBe(0);
    expect(m.getSyncState()).toEqual({ status: "synced", pending: 0 });
  });

  it("survives repeated offline/online flapping without losing or reordering writes", async () => {
    const m = await loadModules();
    m.resetSyncState();

    const labels = ["op1", "op2", "op3", "op4", "op5", "op6"];
    const sends = labels.map((l) => net.write(l));

    // Enqueue the first half while the connection is already down.
    net.goOffline();
    for (let i = 0; i < 3; i += 1) m.enqueueWrite(labels[i]!, sends[i]!);
    await vi.advanceTimersByTimeAsync(0);
    expect(net.completed).toEqual([]);

    // Flap three times; each restoration is too short-lived to fully drain
    // before the next drop, which is exactly the fragile case.
    for (let cycle = 0; cycle < 3; cycle += 1) {
      net.goOnline();
      await vi.advanceTimersByTimeAsync(1);
      net.goOffline();
      await vi.advanceTimersByTimeAsync(1);
      expect(m.getSyncState().status).toBe("offline");
    }

    // More work arrives mid-outage and must land behind the existing backlog.
    for (let i = 3; i < labels.length; i += 1) m.enqueueWrite(labels[i]!, sends[i]!);
    await vi.advanceTimersByTimeAsync(0);
    expect(m.pendingWrites() + net.completed.length).toBe(labels.length);

    // Connection finally stabilises.
    net.goOnline();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(net.completed).toEqual(labels);
    expect(m.pendingWrites()).toBe(0);
    expect(m.getSyncState()).toEqual({ status: "synced", pending: 0 });
    // A completed drain must stamp the last-sync time.
    expect(m.getLastSyncedAt()).toBeTypeOf("number");
  });

  it("keeps retrying a write that fails intermittently, then continues the queue", async () => {
    const m = await loadModules();
    m.resetSyncState();

    const completed: string[] = [];
    let failuresLeft = 3;
    const flaky = vi.fn(async () => {
      if (failuresLeft > 0) {
        failuresLeft -= 1;
        return { error: new Error("transient 503") };
      }
      completed.push("flaky");
      return { error: null };
    });
    const follower = vi.fn(async () => {
      completed.push("follower");
      return { error: null };
    });

    m.enqueueWrite("flaky", flaky);
    m.enqueueWrite("follower", follower);

    await vi.advanceTimersByTimeAsync(0);
    // Head-of-line: the follower must not overtake the failing write.
    expect(completed).toEqual([]);
    expect(m.getSyncState().status).toBe("error");

    await vi.advanceTimersByTimeAsync(60_000);

    expect(flaky).toHaveBeenCalledTimes(4);
    expect(completed).toEqual(["flaky", "follower"]);
    expect(m.getSyncState()).toEqual({ status: "synced", pending: 0 });
  });

  it("force retry drains a backlog immediately instead of waiting out the backoff", async () => {
    const m = await loadModules();
    m.resetSyncState();

    let up = false;
    const send = vi.fn(async () => (up ? { error: null } : { error: new Error("down") }));

    m.enqueueWrite("wallets", send);
    await vi.advanceTimersByTimeAsync(0);
    expect(m.getSyncState()).toEqual({ status: "error", pending: 1 });
    expect(send).toHaveBeenCalledTimes(1);

    // Network is back, but the scheduled backoff has not elapsed yet.
    up = true;
    await m.retryNow();

    expect(send).toHaveBeenCalledTimes(2);
    expect(m.pendingWrites()).toBe(0);
    expect(m.getSyncState()).toEqual({ status: "synced", pending: 0 });
  });

  it("gives up on a permanently failing write without stalling the rest of the queue", async () => {
    const m = await loadModules();
    m.resetSyncState();

    const completed: string[] = [];
    const doomed = vi.fn(async () => ({ error: new Error("permanent") }));
    const healthy = vi.fn(async () => {
      completed.push("healthy");
      return { error: null };
    });

    m.enqueueWrite("doomed", doomed);
    m.enqueueWrite("healthy", healthy);

    await vi.advanceTimersByTimeAsync(300_000);

    expect(doomed).toHaveBeenCalledTimes(m.MAX_ATTEMPTS);
    expect(completed).toEqual(["healthy"]);
    expect(m.pendingWrites()).toBe(0);
  });
});
