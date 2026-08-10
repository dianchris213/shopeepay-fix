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
 * Form defaults of the Add Transaction modal:
 *   - Expense opens with an empty category plus the interactive Settings hint.
 *   - Income on the Shopeepay (driver) wallet preselects "Driver COD".
 */

const cash: Account = {
  id: "a1",
  name: "Cash",
  type: "Cash",
  amount: 100_000,
  color: "#22c55e",
  icon: "Banknote",
  sub: "Cash",
};

describe("AddTransactionSheet defaults", () => {
  beforeEach(() => {
    hydrateState({ ...initialState, accounts: [cash], transactions: [], bills: [] });
    ensureShopeePayAccount();
  });

  it("opens on Expense with no category selected and an interactive Settings hint", async () => {
    render(<AddTransactionSheet open onClose={() => {}} />);

    await screen.findByRole("dialog");
    const categoryGroup = screen.getByRole("group", { name: /Category|Kategori/i });
    for (const button of Array.from(categoryGroup.querySelectorAll("button"))) {
      expect(button.getAttribute("aria-pressed")).not.toBe("true");
    }

    const hint = screen.getByTestId("tx-create-category-hint");
    expect(hint.textContent).toContain("Silakan pilih atau buat kategori terlebih dahulu");

    const link = screen.getByTestId("tx-create-category-link");
    expect(link.tagName).toBe("BUTTON");

    const user = userEvent.setup();
    await user.click(link);
    // The category manager opens on top without closing the transaction sheet.
    await waitFor(() => expect(screen.getAllByRole("dialog").length).toBeGreaterThan(1));
  });

  it("shows an inline error when saving an Expense with no category", async () => {
    const user = userEvent.setup();
    render(<AddTransactionSheet open onClose={() => {}} />);
    await screen.findByRole("dialog");

    await user.type(screen.getByLabelText("Amount in rupiah"), "25000");
    // The save button is disabled while invalid; its wrapper marks the form as
    // touched so the inline errors appear.
    const save = screen.getByRole("button", { name: /Simpan|Save/i });
    expect(save).toBeDisabled();
    await user.click(save.parentElement!);

    expect(screen.getByTestId("tx-category-required")).toBeTruthy();
  });

  it("preselects Driver COD for Income on the Shopeepay wallet", async () => {
    const user = userEvent.setup();
    render(<AddTransactionSheet open onClose={() => {}} />);
    await screen.findByRole("dialog");

    await user.click(screen.getByRole("button", { name: /Pemasukan|income/i }));
    const driverName = shopeePayAccount()!.name;
    expect(driverName).toBe("Shopeepay");
    await user.click(screen.getByRole("button", { name: driverName }));

    await waitFor(() => {
      const group = screen.getByRole("group", { name: /Category|Kategori/i });
      expect(Array.from(group.querySelectorAll("button")).map((button) => button.textContent?.trim())).toEqual([
        "Driver COD",
      ]);
      const active = Array.from(group.querySelectorAll("button")).find(
        (b) => b.getAttribute("aria-pressed") === "true",
      );
      expect(active?.textContent?.trim()).toBe("Driver COD");
    });
    expect(screen.getByTestId("tx-driver-cod-default-hint")).toBeTruthy();
    expect(screen.queryByTestId("tx-create-category-hint")).toBeNull();
  });

  it("keeps the category empty when toggling back to Expense", async () => {
    const user = userEvent.setup();
    render(<AddTransactionSheet open onClose={() => {}} />);
    await screen.findByRole("dialog");

    await user.click(screen.getByRole("button", { name: /Pemasukan|income/i }));
    await user.click(screen.getByRole("button", { name: shopeePayAccount()!.name }));
    await user.click(screen.getByRole("button", { name: /Pengeluaran|expense/i }));
    const categoryGroup = screen.getByRole("group", { name: /Category|Kategori/i });
    expect(categoryGroup.querySelectorAll("button[aria-pressed]")).toHaveLength(0);

    expect(screen.getByTestId("tx-create-category-hint")).toBeTruthy();
  });

  it("explains the empty list for Expense + Shopeepay and links to Settings", async () => {
    const user = userEvent.setup();
    render(<AddTransactionSheet open onClose={() => {}} />);
    await screen.findByRole("dialog");

    await user.click(screen.getByRole("button", { name: shopeePayAccount()!.name }));

    const empty = await screen.findByTestId("tx-empty-categories");
    expect(empty.textContent).toContain("Belum ada kategori untuk Expense + ShopeePay");

    await user.click(screen.getByTestId("tx-empty-categories-link"));
    await waitFor(() => expect(screen.getAllByRole("dialog").length).toBeGreaterThan(1));
  });

  it("refuses to submit an Expense on Shopeepay without a category", async () => {
    const user = userEvent.setup();
    render(<AddTransactionSheet open onClose={() => {}} />);
    await screen.findByRole("dialog");

    await user.click(screen.getByRole("button", { name: shopeePayAccount()!.name }));
    await user.type(screen.getByLabelText("Amount in rupiah"), "25000");

    const save = screen.getByRole("button", { name: /Simpan|Save/i });
    expect(save).toBeDisabled();
    await user.click(save.parentElement!);

    expect(screen.getByTestId("tx-category-required")).toBeTruthy();
    expect(shopeePayAccount()!.amount).toBe(0);
  });
});

