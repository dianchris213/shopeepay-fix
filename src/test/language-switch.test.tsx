import { act } from "react";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getState, hydrateState, updateSettings, type FinanceState } from "@/lib/finance-store";
import { useT } from "@/lib/i18n";

function Probe() {
  const { t, lang } = useT();
  return (
    <div>
      <span data-testid="lang">{lang}</span>
      <span data-testid="title">{t("an.title")}</span>
    </div>
  );
}

/** Mirrors the shape `hydrateFromCloud` pushes into the store after a refetch. */
function cloudSnapshot(patch: Partial<FinanceState["settings"]> = {}): FinanceState {
  const local = getState();
  return { ...local, settings: { ...local.settings, ...patch } };
}

describe("language switching", () => {
  beforeEach(() => {
    updateSettings({ language: "en" });
  });

  afterEach(() => {
    updateSettings({ language: "en" });
  });

  it("re-renders every subscriber instantly, with no reload", () => {
    render(<Probe />);
    expect(screen.getByTestId("lang")).toHaveTextContent("en");
    expect(screen.getByTestId("title")).toHaveTextContent("Analytics");

    act(() => {
      updateSettings({ language: "id" });
    });

    expect(screen.getByTestId("lang")).toHaveTextContent("id");
    expect(screen.getByTestId("title")).toHaveTextContent("Analitik");
  });

  it("persists the choice to local storage", () => {
    updateSettings({ language: "id" });
    const raw = localStorage.getItem("c2h.finance.v1");
    expect(raw).toBeTruthy();
    expect((JSON.parse(raw!) as FinanceState).settings.language).toBe("id");
  });

  it("survives a catch-up refetch that carries the same language back", () => {
    updateSettings({ language: "id" });
    hydrateState(cloudSnapshot({ language: "id" }));
    expect(getState().settings.language).toBe("id");
  });

  it("keeps the local language when the server row has no preference yet", () => {
    // Regression: hydrate used to fall back to hard-coded "en"/"dark"/"IDR",
    // so a refetch racing the profile write made the switcher look dead.
    updateSettings({ language: "id", theme: "light", currency: "USD" });
    const local = getState();
    hydrateState({
      ...local,
      settings: {
        ...local.settings,
        language: local.settings.language,
        theme: local.settings.theme,
        currency: local.settings.currency,
      },
    });
    const after = getState().settings;
    expect(after.language).toBe("id");
    expect(after.theme).toBe("light");
    expect(after.currency).toBe("USD");
  });

  it("accepts an explicit server-side language change from another device", () => {
    updateSettings({ language: "en" });
    hydrateState(cloudSnapshot({ language: "id" }));
    expect(getState().settings.language).toBe("id");
  });
});
