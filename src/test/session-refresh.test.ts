import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();
const refreshSession = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getSession: () => getSession(), refreshSession: () => refreshSession() } },
}));

import {
  MAX_REFRESH_DELAY_MS,
  MIN_REFRESH_DELAY_MS,
  PROACTIVE_REFRESH_LEAD_MS,
  ensureFreshSession,
  isRevokedSessionError,
  nextRefreshDelayMs,
  startProactiveRefresh,
} from "@/lib/session-refresh";

const NOW = 1_700_000_000_000;
const inSeconds = (s: number) => Math.floor(NOW / 1000) + s;
// Mocked Supabase sessions are relative to the real clock, because the code
// under test calls Date.now() itself.
const session = (s: number) => ({
  data: { session: { expires_at: Math.floor(Date.now() / 1000) + s } },
  error: null,
});

beforeEach(() => {
  getSession.mockReset();
  refreshSession.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

describe("nextRefreshDelayMs", () => {
  it("schedules ahead of expiry by the lead time", () => {
    expect(nextRefreshDelayMs({ expires_at: inSeconds(600) }, NOW)).toBe(
      600_000 - PROACTIVE_REFRESH_LEAD_MS,
    );
  });

  it("clamps to the maximum for very long sessions", () => {
    expect(nextRefreshDelayMs({ expires_at: inSeconds(86_400) }, NOW)).toBe(MAX_REFRESH_DELAY_MS);
  });

  it("clamps to the minimum for an already-expired token", () => {
    expect(nextRefreshDelayMs({ expires_at: inSeconds(-100) }, NOW)).toBe(MIN_REFRESH_DELAY_MS);
  });

  it("returns null without a session", () => {
    expect(nextRefreshDelayMs(null, NOW)).toBeNull();
  });
});

describe("isRevokedSessionError", () => {
  it.each([
    { message: "Refresh Token Not Found" },
    { message: "Invalid Refresh Token: Already Used" },
    { message: "session_not_found" },
    { status: 401, message: "unauthorized" },
  ])("detects a terminal auth failure: %o", (error) => {
    expect(isRevokedSessionError(error)).toBe(true);
  });

  it("treats a network blip as recoverable", () => {
    expect(isRevokedSessionError(new Error("Failed to fetch"))).toBe(false);
    expect(isRevokedSessionError(null)).toBe(false);
  });
});

describe("ensureFreshSession", () => {
  it("leaves a comfortably valid token alone", async () => {
    getSession.mockResolvedValue(session(3600));
    await expect(ensureFreshSession()).resolves.toMatchObject({ state: "fresh" });
    expect(refreshSession).not.toHaveBeenCalled();
  });

  it("refreshes a token inside the safety margin", async () => {
    getSession.mockResolvedValue(session(10));
    refreshSession.mockResolvedValue(session(3600));
    await expect(ensureFreshSession()).resolves.toMatchObject({ state: "refreshed" });
    expect(refreshSession).toHaveBeenCalledTimes(1);
  });

  it("reports 'expired' when there is no session at all", async () => {
    getSession.mockResolvedValue({ data: { session: null }, error: null });
    await expect(ensureFreshSession()).resolves.toEqual({ state: "expired" });
  });

  it("reports 'revoked' for a terminal refresh failure", async () => {
    getSession.mockResolvedValue(session(10));
    refreshSession.mockResolvedValue({
      data: { session: null },
      error: { message: "Invalid Refresh Token: Already Used", status: 400 },
    });
    await expect(ensureFreshSession()).resolves.toEqual({ state: "revoked" });
  });

  it("reports 'error' for a recoverable network failure", async () => {
    getSession.mockRejectedValue(new Error("Failed to fetch"));
    await expect(ensureFreshSession()).resolves.toEqual({ state: "error" });
  });

  it("collapses a concurrent stampede into a single refresh", async () => {
    getSession.mockResolvedValue(session(10));
    refreshSession.mockResolvedValue(session(3600));
    const results = await Promise.all([
      ensureFreshSession(),
      ensureFreshSession(),
      ensureFreshSession(),
    ]);
    expect(results.every((r) => r.state === "refreshed")).toBe(true);
    expect(getSession).toHaveBeenCalledTimes(1);
    expect(refreshSession).toHaveBeenCalledTimes(1);
  });
});

describe("startProactiveRefresh", () => {
  it("re-arms a timer from the refreshed token lifetime", async () => {
    getSession.mockResolvedValue(session(10));
    refreshSession.mockResolvedValue(session(3600));
    const calls: number[] = [];
    const setTimeoutSpy = (_fn: () => void, ms: number) => {
      calls.push(ms);
      return 1 as unknown as ReturnType<typeof setTimeout>;
    };
    const clearTimeoutSpy = vi.fn();

    const stop = startProactiveRefresh(() => {}, {
      setTimeout: setTimeoutSpy,
      clearTimeout: clearTimeoutSpy,
    });
    await vi.waitFor(() => expect(calls.length).toBeGreaterThan(0));
    expect(calls[0]).toBeGreaterThan(MIN_REFRESH_DELAY_MS);

    stop();
    expect(clearTimeoutSpy).toHaveBeenCalled();
  });

  it("signals a lost session instead of retrying forever", async () => {
    getSession.mockResolvedValue({ data: { session: null }, error: null });
    const setTimeoutSpy = vi.fn(() => 1 as unknown as ReturnType<typeof setTimeout>);
    const onLost = vi.fn();

    const stop = startProactiveRefresh(onLost, {
      setTimeout: setTimeoutSpy,
      clearTimeout: vi.fn(),
    });
    await vi.waitFor(() => expect(onLost).toHaveBeenCalledWith("expired"));
    expect(setTimeoutSpy).not.toHaveBeenCalled();
    stop();
  });
});
