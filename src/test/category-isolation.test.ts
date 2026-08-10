import { describe, expect, it } from "vitest";

import {
  CUSTOM_CATEGORY_NAMES,
  isCustomCategory,
  isDriverCategory,
  visibleCategoriesFor,
  type Category,
} from "@/lib/categories-store";

const cat = (name: string, kind: Category["kind"] = "expense"): Category => ({
  id: name,
  name,
  kind,
  icon: "wallet",
});

const all: Category[] = [
  cat("Food"),
  cat("Transport"),
  cat("Driver Bensin"),
  cat("Driver COD", "income"),
  cat("Uang Ibu"),
  cat("Belanja Custom"),
  cat("Salary", "income"),
  cat("Driver Bonus", "income"),
  cat("Tabungan Custom", "income"),
];

describe("category isolation per wallet type", () => {
  it("keeps a Custom wallet empty until it has explicitly scoped categories", () => {
    const visible = visibleCategoriesFor({
      categories: all,
      kind: "expense",
      walletType: "Custom",
      walletId: "w1",
    });
    expect(visible).toEqual([]);
  });

  it("hides custom-exclusive categories from every non-custom wallet", () => {
    for (const walletType of ["Cash", "Bank", "E-Wallet", "Driver", null]) {
      const visible = visibleCategoriesFor({ categories: all, kind: "expense", walletType });
      expect(visible.some((c) => isCustomCategory(c.name))).toBe(false);
    }
  });

  it("never leaks a custom category name into a standard wallet list", () => {
    const names = visibleCategoriesFor({ categories: all, kind: "expense", walletType: "Cash" }).map(
      (c) => c.name,
    );
    for (const custom of CUSTOM_CATEGORY_NAMES) expect(names).not.toContain(custom);
  });

  it("pins Driver categories to the top", () => {
    const expense = visibleCategoriesFor({ categories: all, kind: "expense", walletType: "Cash" });
    expect(isDriverCategory(expense[0]!.name)).toBe(true);
    const income = visibleCategoriesFor({ categories: all, kind: "income", walletType: "Cash" });
    expect(isDriverCategory(income[0]!.name)).toBe(true);
  });

  it("keeps Driver COD out of Expense and inside Income", () => {
    const expense = visibleCategoriesFor({ categories: all, kind: "expense", walletType: "Cash" });
    expect(expense.map((c) => c.name)).not.toContain("Driver COD");
    const income = visibleCategoriesFor({ categories: all, kind: "income", walletType: "Cash" });
    expect(income.map((c) => c.name)).toContain("Driver COD");
  });

  it("scopes a per-wallet custom category to its own wallet", () => {
    const scoped: Category[] = [
      ...all,
      { id: "w1c", name: "Jajan Ibu", kind: "expense", icon: "wallet", walletId: "w1" },
    ];
    const own = visibleCategoriesFor({
      categories: scoped,
      kind: "expense",
      walletType: "Custom",
      walletId: "w1",
    });
    expect(own.map((c) => c.name)).toContain("Jajan Ibu");
    const other = visibleCategoriesFor({
      categories: scoped,
      kind: "expense",
      walletType: "Custom",
      walletId: "w2",
    });
    expect(other.map((c) => c.name)).not.toContain("Jajan Ibu");
    const standard = visibleCategoriesFor({
      categories: scoped,
      kind: "expense",
      walletType: "Cash",
    });
    expect(standard.map((c) => c.name)).not.toContain("Jajan Ibu");
  });

  it("keeps the two kinds apart", () => {
    const income = visibleCategoriesFor({ categories: all, kind: "income", walletType: "Cash" });
    expect(income.every((c) => c.kind === "income")).toBe(true);
    const customIncome = visibleCategoriesFor({
      categories: all,
      kind: "income",
      walletType: "Custom",
      walletId: "w1",
    });
    expect(customIncome).toEqual([]);
  });

  it("always offers Driver COD for ShoopeePay income", () => {
    const visible = visibleCategoriesFor({
      categories: [],
      kind: "income",
      walletType: "Driver",
      walletId: "shopee",
    });
    expect(visible.map((c) => c.name)).toEqual(["Driver COD"]);
  });

  it("shows only Driver COD for ShopeePay income even when other income categories exist", () => {
    const visible = visibleCategoriesFor({
      categories: all,
      kind: "income",
      walletType: "Driver",
      walletId: "shopee",
    });
    expect(visible.map((c) => c.name)).toEqual(["Driver COD"]);
  });

  it("shows no categories for ShopeePay expense", () => {
    const visible = visibleCategoriesFor({
      categories: all,
      kind: "expense",
      walletType: "Driver",
      walletId: "shopee",
    });
    expect(visible).toEqual([]);
  });

  it("returns an empty list rather than falling back to another set", () => {
    expect(
      visibleCategoriesFor({ categories: [cat("Food")], kind: "expense", walletType: "Custom" }),
    ).toEqual([]);
  });
});
