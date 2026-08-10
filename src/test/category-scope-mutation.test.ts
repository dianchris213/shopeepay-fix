import { beforeEach, describe, expect, it } from "vitest";

import {
  addCategory,
  getCategories,
  hydrateCategories,
  visibleCategoriesFor,
} from "@/lib/categories-store";

describe("category creation scope", () => {
  beforeEach(() => hydrateCategories([]));

  it("isolates a newly created category to its target custom wallet", () => {
    addCategory({ name: "Khusus Dana", icon: "wallet", kind: "expense", walletId: "wallet-a" });

    const categories = getCategories();
    const own = visibleCategoriesFor({
      categories,
      kind: "expense",
      walletType: "Custom",
      walletId: "wallet-a",
    });
    const other = visibleCategoriesFor({
      categories,
      kind: "expense",
      walletType: "Custom",
      walletId: "wallet-b",
    });
    const system = visibleCategoriesFor({ categories, kind: "expense", walletType: "Cash" });

    expect(own.map((category) => category.name)).toContain("Khusus Dana");
    expect(other.map((category) => category.name)).not.toContain("Khusus Dana");
    expect(system.map((category) => category.name)).not.toContain("Khusus Dana");
  });
});