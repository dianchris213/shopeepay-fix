import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { Sheet } from "@/components/Sheet";

/**
 * Unit coverage for the modal keyboard contract implemented in Sheet.
 *
 * The E2E keyboard specs assert the same behaviour against the real app; these
 * run in jsdom so a regression is caught in seconds without a backend.
 */

function Harness({ onClose = () => {} }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => {
          setOpen(true);
        }}
      >
        Open sheet
      </button>
      <Sheet
        open={open}
        onClose={() => {
          setOpen(false);
          onClose();
        }}
        title="Test sheet"
      >
        <button>First</button>
        <button>Second</button>
      </Sheet>
    </>
  );
}

describe("Sheet keyboard accessibility", () => {
  it("exposes itself as a modal dialog", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Open sheet" }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-label", "Test sheet");
  });

  it("moves focus into the panel when it opens", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Open sheet" }));

    await waitFor(() => {
      expect(screen.getByTestId("sheet-panel")).toHaveFocus();
    });
  });

  it("keeps Tab inside the panel and wraps at the end", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Open sheet" }));
    const panel = await screen.findByTestId("sheet-panel");
    await waitFor(() => expect(panel).toHaveFocus());

    // jsdom has no layout, so the trap's visibility filter needs a hint.
    for (const button of screen.getAllByRole("button")) {
      vi.spyOn(button, "getClientRects").mockReturnValue([
        { width: 10, height: 10 },
      ] as unknown as DOMRectList);
    }

    await user.tab();
    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "First" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Second" })).toHaveFocus();

    // At the last control, Tab wraps back to the first rather than escaping.
    await user.tab();
    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();

    // Shift+Tab wraps the other way.
    await user.tab({ shift: true });
    expect(screen.getByRole("button", { name: "Second" })).toHaveFocus();
  });

  it("closes on Escape and restores focus to the trigger", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);

    const trigger = screen.getByRole("button", { name: "Open sheet" });
    await user.click(trigger);
    await waitFor(() => expect(screen.getByTestId("sheet-panel")).toHaveFocus());

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});
