import { afterEach, describe, expect, it, vi } from "vitest";

import {
  REFRESH_MARGIN_SECONDS,
  shouldRefreshSession,
  watchSessionLifecycle,
} from "@/lib/session-resilience";

const NOW = 1_700_000_000_000;
const inSeconds = (s: number) => Math.floor(NOW / 1000) + s;

describe("shouldRefreshSession", () => {
  it("never refreshes when there is no session", () => {
    expect(shouldRefreshSession(null, NOW)).toBe(false);
  });

  it("keeps a session that is comfortably valid", () => {
    expect(shouldRefreshSession({ expires_at: inSeconds(3600) }, NOW)).toBe(false);
  });

  it("refreshes inside the safety margin", () => {
    expect(shouldRefreshSession({ expires_at: inSeconds(REFRESH_MARGIN_SECONDS - 1) }, NOW)).toBe(
      true,
    );
  });

  it("refreshes an already-expired token (the suspended Mini App case)", () => {
    expect(shouldRefreshSession({ expires_at: inSeconds(-10) }, NOW)).toBe(true);
  });

  it("refreshes when the expiry is unknown", () => {
    expect(shouldRefreshSession({}, NOW)).toBe(true);
  });
});

describe("watchSessionLifecycle", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete (window as unknown as { Telegram?: unknown }).Telegram;
  });

  it("re-checks on foreground, focus and reconnect, and stops after cleanup", () => {
    const check = vi.fn();
    const stop = watchSessionLifecycle(check);

    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("focus"));
    window.dispatchEvent(new Event("online"));
    expect(check).toHaveBeenCalledTimes(3);

    stop();
    window.dispatchEvent(new Event("focus"));
    expect(check).toHaveBeenCalledTimes(3);
  });

  it("ignores a visibility change that hides the app", () => {
    const check = vi.fn();
    const stop = watchSessionLifecycle(check);
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(check).not.toHaveBeenCalled();
    stop();
  });

  it("subscribes to the Telegram activation event when the bridge exists", () => {
    const onEvent = vi.fn();
    const offEvent = vi.fn();
    (window as unknown as { Telegram: unknown }).Telegram = { WebApp: { onEvent, offEvent } };

    const stop = watchSessionLifecycle(vi.fn());
    expect(onEvent).toHaveBeenCalledWith("activated", expect.any(Function));
    stop();
    expect(offEvent).toHaveBeenCalledWith("activated", expect.any(Function));
  });
});
