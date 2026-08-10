import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { dictionaries, languageLabels, translate, useT, type Language } from "@/lib/i18n";

function Probe() {
  const { t, lang } = useT();
  return (
    <div>
      <span data-testid="lang">{lang}</span>
      <span data-testid="title">{t("an.title")}</span>
    </div>
  );
}

describe("i18n translation context", () => {
  it("exposes both supported languages", () => {
    expect(Object.keys(languageLabels).sort()).toEqual(["en", "id"]);
  });

  it("keeps the English and Indonesian dictionaries in sync", () => {
    const en = Object.keys(dictionaries.en).sort();
    const id = Object.keys(dictionaries.id).sort();
    expect(id).toEqual(en);
  });

  it("has no empty translation strings", () => {
    for (const lang of Object.keys(dictionaries) as Language[]) {
      for (const [key, value] of Object.entries(dictionaries[lang])) {
        expect(value, `${lang}.${key} must not be empty`).toBeTruthy();
      }
    }
  });

  it("translates a known key per language", () => {
    expect(translate("en", "an.title")).toBe("Analytics");
    expect(translate("id", "an.title")).toBe("Analitik");
  });

  it("falls back to the key itself when it is unknown", () => {
    // Unknown keys must never render as "undefined" in the UI.
    expect(translate("en", "does.not.exist" as never)).toBe("does.not.exist");
  });

  it("provides a working translator through the hook", () => {
    render(<Probe />);
    expect(screen.getByTestId("lang")).toHaveTextContent(/en|id/);
    expect(screen.getByTestId("title").textContent).not.toBe("");
  });

  it("ships user-facing error copy in both languages", () => {
    for (const key of [
      "err.badCredentials",
      "err.offline",
      "err.deleteAccountFailed",
      "vd.dupWallet",
      "vd.dupCategory",
      "vd.dupBill",
    ] as const) {
      expect(translate("en", key)).not.toBe(key);
      expect(translate("id", key)).not.toBe(key);
    }
  });
});
