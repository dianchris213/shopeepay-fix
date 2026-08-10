import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SyncIndicator } from "@/components/SyncIndicator";
import { resetSyncState, setSyncState, type SyncStatus } from "@/lib/sync-status";

/**
 * Accessibility contract for the cloud sync badge.
 *
 * The badge is the only surface that tells a user whether their money data
 * reached the cloud, so it must be (a) reachable by keyboard with a visible
 * focus ring and (b) announced by screen readers on every state transition.
 *
 * The E2E companion (e2e/sync-badge-a11y.spec.ts) verifies the rendered
 * :focus-visible ring in a real browser; this suite locks the semantics.
 */

const expected: Record<Exclude<SyncStatus, "idle">, RegExp> = {
  syncing: /syncing/i,
  synced: /^synced/i,
  offline: /offline/i,
  error: /unsaved changes/i,
};

function badge() {
  return screen.getByRole("status");
}

describe("SyncIndicator accessibility", () => {
  beforeEach(() => {
    localStorage.clear();
    act(() => resetSyncState());
  });
  afterEach(() => act(() => resetSyncState()));

  it("renders nothing while sync has never run", () => {
    render(<SyncIndicator />);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("is a polite, atomic live region", () => {
    act(() => setSyncState({ status: "syncing", pending: 1 }));
    render(<SyncIndicator />);
    expect(badge()).toHaveAttribute("aria-live", "polite");
    expect(badge()).toHaveAttribute("aria-atomic", "true");
  });

  it("broadcasts the correct text for all four states", () => {
    act(() => setSyncState({ status: "syncing", pending: 2 }));
    render(<SyncIndicator />);

    for (const status of ["syncing", "synced", "offline", "error"] as const) {
      act(() => setSyncState({ status, pending: status === "synced" ? 0 : 2 }));
      // The announced text lives in the live region's *content* (sr-only span),
      // because screen readers re-read changed content, not changed labels.
      expect(badge().textContent).toMatch(expected[status]);
      expect(badge().getAttribute("aria-label")).toMatch(expected[status]);
    }
  });

  it("includes the pending count in the announcement", () => {
    act(() => setSyncState({ status: "error", pending: 3 }));
    render(<SyncIndicator />);
    expect(badge().textContent).toMatch(/3 pending/);
  });

  it("is a keyboard tab stop that shows a focus-visible ring", async () => {
    const user = userEvent.setup();
    act(() => setSyncState({ status: "synced", pending: 0 }));
    render(<SyncIndicator />);

    expect(badge()).toHaveAttribute("tabIndex", "0");
    await user.tab();
    expect(badge()).toHaveFocus();

    // Ring styling is applied via focus-visible utilities (verified visually in
    // the Playwright spec); assert the classes so they cannot be dropped.
    const className = badge().className;
    expect(className).toMatch(/focus-visible:ring-2/);
    expect(className).toMatch(/focus-visible:ring-offset-2/);
    expect(className).toMatch(/outline-none/);
  });
});
