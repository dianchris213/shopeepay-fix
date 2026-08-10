import { beforeEach, describe, expect, it } from "vitest";

import {
  DEFAULT_CUSTOM_WALLET_NAME,
  ensureDefaultCustomAccount,
  getState,
  hydrateState,
  initialState,
  updateAccount,
} from "@/lib/finance-store";
import { customLabel } from "@/lib/streams";

describe("default custom wallet", () => {
  beforeEach(() => {
    hydrateState({ ...initialState, accounts: [], transactions: [] });
  });

  it('creates "Dana Custom" with a zero balance when no custom wallet exists', () => {
    ensureDefaultCustomAccount();
    const custom = getState().accounts.filter((a) => a.type === "Custom");
    expect(custom).toHaveLength(1);
    expect(custom[0]!.name).toBe(DEFAULT_CUSTOM_WALLET_NAME);
    expect(custom[0]!.amount).toBe(0);
    expect(customLabel(getState())).toBe(DEFAULT_CUSTOM_WALLET_NAME);
  });

  it("is idempotent and never overwrites a rename", () => {
    ensureDefaultCustomAccount();
    const id = getState().accounts.find((a) => a.type === "Custom")!.id;
    updateAccount(id, { name: "Uang Ibuk" });

    ensureDefaultCustomAccount();
    const custom = getState().accounts.filter((a) => a.type === "Custom");
    expect(custom).toHaveLength(1);
    expect(custom[0]!.name).toBe("Uang Ibuk");
    expect(customLabel(getState())).toBe("Uang Ibuk");
  });
});
