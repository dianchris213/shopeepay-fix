import { render, screen, waitFor, within, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SyncStatusPanel } from "@/components/SyncStatusPanel";
import { formatSyncLog } from "@/lib/sync-log";
import { getSyncHistory, recordSyncEvent, resetSyncState, setSyncState } from "@/lib/sync-status";
import { clearToasts, getToasts } from "@/lib/toast-store";

/**
 * Support utilities in the Settings → Cloud Sync panel:
 * copying the sync log to the clipboard, and clearing it behind a
 * confirmation prompt so the log can never be lost by a stray tap.
 */

describe("sync history support actions", () => {
  beforeEach(() => {
    localStorage.clear();
    act(() => {
      resetSyncState();
      clearToasts();
    });
  });
  afterEach(() =>
    act(() => {
      resetSyncState();
      clearToasts();
    }),
  );

  function seed() {
    act(() => {
      setSyncState({ status: "error", pending: 2 });
      recordSyncEvent("offline", 2, Date.UTC(2026, 0, 2, 3, 4, 5));
    });
  }

  it("formats a support-friendly log with timestamps, states and errors", () => {
    const text = formatSyncLog({
      header: "header",
      status: "error",
      pending: 2,
      lastSyncedAt: Date.UTC(2026, 0, 1),
      entries: [{ status: "offline", pending: 2, at: Date.UTC(2026, 0, 2, 3, 4, 5) }],
      labelFor: () => "Offline",
    });
    expect(text).toContain("header");
    expect(text).toContain("state: error");
    expect(text).toContain("pending: 2");
    expect(text).toContain("2026-01-01T00:00:00.000Z");
    expect(text).toContain("2026-01-02T03:04:05.000Z");
    expect(text).toContain("Offline");
  });

  it("copies the log to the clipboard and shows Copied! feedback", async () => {
    const user = userEvent.setup();
    // Defined after userEvent.setup() so its own clipboard stub cannot win.
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    seed();
    render(<SyncStatusPanel />);

    await user.click(screen.getByTestId("sync-history-copy"));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const copied = writeText.mock.calls[0]![0] as string;
    expect(copied).toContain("state: error");
    expect(copied).toContain("history (newest first):");

    await waitFor(() =>
      expect(screen.getByTestId("sync-history-copy-label")).toHaveTextContent("Copied!"),
    );
    // Announced politely for screen-reader users too.
    expect(screen.getByTestId("sync-copy-live")).toHaveTextContent("Copied!");
  });

  it("requires confirmation before clearing the log and can be cancelled", async () => {
    const user = userEvent.setup();
    seed();
    render(<SyncStatusPanel />);
    expect(getSyncHistory().length).toBeGreaterThan(0);

    await user.click(screen.getByTestId("sync-history-clear"));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");

    await user.click(within(dialog).getByRole("button", { name: /^cancel$/i }));
    // Cancelling must be a no-op.
    expect(getSyncHistory().length).toBeGreaterThan(0);

    await user.click(screen.getByTestId("sync-history-clear"));
    const reopened = await screen.findByRole("alertdialog");
    await user.click(within(reopened).getByRole("button", { name: /clear log/i }));

    expect(getSyncHistory()).toEqual([]);
    expect(screen.getByTestId("sync-history-empty")).toBeInTheDocument();
    expect(getToasts().some((t) => /cleared/i.test(t.title))).toBe(true);
  });

  it("disables the clear button when there is nothing to clear", () => {
    render(<SyncStatusPanel />);
    expect(screen.getByTestId("sync-history-clear")).toBeDisabled();
  });
});
