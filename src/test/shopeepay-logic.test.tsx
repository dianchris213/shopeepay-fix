import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { AddTransactionSheet } from "@/components/AddTransactionSheet";
import {
  ensureShopeePayAccount,
  hydrateState,
  initialState,
  shopeePayAccount,
  type Account,
} from "@/lib/finance-store";

/**
 * Universal rule: the category selector is ALWAYS empty by default, for every
 * wallet (including Shopeepay) and every tab. A manual pick survives unrelated
 * edits, but any tab/wallet change clears it again.
 */

const cash: Account = {
  id: "a1",
  name: "Cash",
  type: "Cash",
  amount: 250_000,
  color: "#22c55e",
  icon: "Banknote",
  sub: "Cash",
};

/** aria-pressed label of the currently selected category chip, if any. */
function pressedCategory(): string | null {
  const group = screen.getByRole("group", { name: /Category|Kategori/i });
  const active = Array.from(group.querySelectorAll("button")).find(
    (b) => b.getAttribute("aria-pressed") === "true",
  );
  return active?.textContent?.trim() ?? null;
}

describe("Universal empty category rules", () => {
  beforeEach(() => {
    hydrateState({ ...initialState, accounts: [cash], transactions: [], bills: [] });
    ensureShopeePayAccount();
  });

  it("keeps a manual category when the user only edits amount, note or date", async () => {
    const user = userEvent.setup();
    render(<AddTransactionSheet open onClose={() => {}} />);
    await screen.findByRole("dialog");

    await user.click(screen.getByRole("button", { name: /Pemasukan|income/i }));
    await user.click(screen.getByRole("button", { name: shopeePayAccount()!.name }));
    await waitFor(() => expect(pressedCategory()).toBeNull());

    const group = screen.getByRole("group", { name: /Category|Kategori/i });
    const first = group.querySelector("button");
    if (first) {
      const label = first.textContent!.trim();
      await user.click(first);
      expect(pressedCategory()).toBe(label);

      // Unrelated edits must NOT clear the manual pick.
      await user.type(screen.getByLabelText("Amount in rupiah"), "45000");
      expect(pressedCategory()).toBe(label);
    }
  });

  it("clears the category on every tab and wallet change", async () => {
    const user = userEvent.setup();
    render(<AddTransactionSheet open onClose={() => {}} />);
    await screen.findByRole("dialog");

    await user.click(screen.getByRole("button", { name: /Pemasukan|income/i }));
    await user.click(screen.getByRole("button", { name: shopeePayAccount()!.name }));
    await waitFor(() => expect(pressedCategory()).toBeNull());
    expect(screen.getByTestId("tx-create-category-hint")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /Pengeluaran|expense/i }));
    expect(pressedCategory()).toBeNull();
    expect(screen.getByTestId("tx-create-category-hint")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /Pemasukan|income/i }));
    await waitFor(() => expect(pressedCategory()).toBeNull());
  });

  it("never shows a default-category note on any wallet", async () => {
    const user = userEvent.setup();
    render(<AddTransactionSheet open onClose={() => {}} />);
    await screen.findByRole("dialog");

    await user.click(screen.getByRole("button", { name: /Pemasukan|income/i }));
    await user.click(screen.getByRole("button", { name: "Cash" }));

    expect(screen.queryByTestId("tx-default-category-note")).toBeNull();
    expect(pressedCategory()).toBeNull();
  });
});
