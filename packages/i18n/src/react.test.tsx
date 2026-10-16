// @vitest-environment jsdom
import { vMsg } from "@laif/contracts";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { createI18n } from "./create-i18n.ts";
import { I18nProvider, useLanguage, useT } from "./react.tsx";
import { createMemoryLanguageStorage } from "./storage.ts";
import { createTestI18n } from "./testing.ts";
import { useFieldErrorText } from "./validation.ts";

afterEach(() => cleanup());

/** The package compiles without the DOM lib (core must not use DOM types). */
const text = (testId: string): string | null =>
  (screen.getByTestId(testId) as unknown as { textContent: string | null }).textContent;
const htmlLang = (): string =>
  (globalThis as unknown as { document: { documentElement: { lang: string } } }).document
    .documentElement.lang;

function Probe({ error }: { error?: string }) {
  const t = useT();
  const tDemo = useT("demo");
  const { language, setLanguage, languages } = useLanguage();
  const errorText = useFieldErrorText(error === undefined ? undefined : { message: error });
  return (
    <div>
      <p data-testid="save">{t("actions.save")}</p>
      <p data-testid="banner">{tDemo("banner")}</p>
      <p data-testid="lang">{language}</p>
      <p data-testid="langs">{languages.join(",")}</p>
      <p data-testid="error">{errorText ?? ""}</p>
      <button type="button" onClick={() => void setLanguage(language === "en" ? "rw" : "en")}>
        {t(`languageName.${language === "en" ? "rw" : "en"}`)}
      </button>
    </div>
  );
}

describe("<I18nProvider> / hooks", () => {
  it("re-renders on language switch and persists the choice", async () => {
    const storage = createMemoryLanguageStorage();
    const i18n = await createI18n({ appId: "clinical", storage });
    render(
      <I18nProvider i18n={i18n}>
        <Probe error={vMsg("reasonTooShort", { min: 10 })} />
      </I18nProvider>,
    );
    expect(text("save")).toBe("Save");
    expect(text("lang")).toBe("en");
    expect(text("langs")).toBe("en,rw");
    expect(text("error")).toBe("Give a reason of at least 10 characters.");

    await act(async () => {
      fireEvent.click(screen.getByRole("button"));
      await Promise.resolve();
    });

    expect(text("save")).toBe("Bika");
    expect(text("lang")).toBe("rw");
    expect(text("banner")).toContain("IGERAGEZA");
    expect(text("error")).toBe("Tanga impamvu ifite nibura inyuguti 10.");
    expect(storage.peek()).toBe("rw");
    expect(htmlLang()).toBe("rw");
  });

  it("works with createTestI18n and renders no error text when there is none", () => {
    render(
      <I18nProvider i18n={createTestI18n("rw")}>
        <Probe />
      </I18nProvider>,
    );
    expect(text("save")).toBe("Bika");
    expect(text("error")).toBe("");
  });

  it("useLanguage throws outside the provider", () => {
    function Bare() {
      useLanguage();
      return null;
    }
    const spy = console.error;
    console.error = () => {};
    try {
      expect(() => render(<Bare />)).toThrow("<I18nProvider>");
    } finally {
      console.error = spy;
    }
  });
});
