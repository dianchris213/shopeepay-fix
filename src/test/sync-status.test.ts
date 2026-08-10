import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const STORAGE_KEY = "c2h.sync-status";

/** Fresh module instances so each test re-reads localStorage on boot. */
async function loadModules() {
  vi.resetModules();
  const status = await import("@/lib/sync-status");
  const queue = await import("@/lib/sync-queue");
  return { ...status, ...queue };
}

describe("sync status persistence", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it("persists a synced state and restores it after a refresh", async () => {
    const first = await loadModules();
    first.setSyncState({ status: "synced", pending: 0 });
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual({
      status: "synced",
      pending: 0,
    });

    const afterRefresh = await loadModules();
    expect(afterRefresh.getSyncState()).toEqual({ status: "synced", pending: 0 });
  });

  it("restores queued writes as unsaved changes after a refresh", async () => {
    const first = await loadModules();
    first.setSyncState({ status: "syncing", pending: 3 });

    const afterRefresh = await loadModules();
    // The in-memory queue is gone, so pending work must surface as unsaved.
    expect(afterRefresh.getSyncState()).toEqual({ status: "error", pending: 3 });
  });

  it("clears the unsaved state only once the queued retry succeeds", async () => {
    const m = await loadModules();
    m.resetSyncState();

    let failNext = true;
    const send = vi.fn(async () => {
      if (failNext) return { error: new Error("network") };
      return { error: null };
    });

    m.enqueueWrite("wallets", send);
    await vi.advanceTimersByTimeAsync(0);

    expect(m.getSyncState().status).toBe("error");
    expect(m.getSyncState().pending).toBe(1);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).pending).toBe(1);

    // Still unsaved across a refresh while the write is outstanding.
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).status).toBe("error");

    failNext = false;
    await vi.advanceTimersByTimeAsync(2_000);

    expect(send).toHaveBeenCalledTimes(2);
    expect(m.getSyncState()).toEqual({ status: "synced", pending: 0 });
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual({
      status: "synced",
      pending: 0,
    });

    const afterRefresh = await loadModules();
    expect(afterRefresh.getSyncState().status).toBe("synced");
  });

  it("reports offline without dropping the queued write", async () => {
    const m = await loadModules();
    m.resetSyncState();
    const onLine = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);

    const send = vi.fn(async () => ({ error: null }));
    m.enqueueWrite("transactions", send);
    await vi.advanceTimersByTimeAsync(0);

    expect(send).not.toHaveBeenCalled();
    expect(m.getSyncState()).toEqual({ status: "offline", pending: 1 });

    onLine.mockReturnValue(true);
    await vi.advanceTimersByTimeAsync(1_000);

    expect(send).toHaveBeenCalledTimes(1);
    expect(m.getSyncState()).toEqual({ status: "synced", pending: 0 });
    onLine.mockRestore();
  });
});
