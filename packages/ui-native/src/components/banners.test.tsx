import { buildI18nInstance, createMemoryLanguageStorage } from "@laif/i18n";
import { renderNative } from "@laif/test-utils/native";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it } from "vitest";

import { AppHeader } from "./AppHeader.tsx";
import { AppText, type AppTextRef } from "./AppText.tsx";
import { DemoBanner } from "./DemoBanner.tsx";
import { LanguageSwitcher } from "./LanguageSwitcher.tsx";
import { OfflineBanner } from "./OfflineBanner.tsx";
import { PrivacyNotice } from "./PrivacyNotice.tsx";
import { RoleBanner } from "./RoleBanner.tsx";
import { RuleDisclaimer } from "./RuleDisclaimer.tsx";
import { Screen } from "./Screen.tsx";

const BANNER_EN = "DEMONSTRATION — SYNTHETIC PATIENT DATA — NOT FOR CLINICAL USE";

describe("DemoBanner / Screen", () => {
  it("renders the demo banner text in EN and RW", () => {
    const en = renderNative(<DemoBanner />);
    expect(screen.getByText(BANNER_EN)).toBeTruthy();
    en.unmount();
    const rw = renderNative(<DemoBanner />, { language: "rw" });
    expect(rw.getByTestId("demo-banner").textContent).not.toBe(BANNER_EN);
    expect(rw.getByTestId("demo-banner").textContent?.trim()).not.toBe("");
  });

  it("Screen always renders the DemoBanner as its first child (AC 3)", () => {
    renderNative(
      <Screen header={<AppHeader title="Today" />}>
        <AppText>Body</AppText>
      </Screen>,
    );
    const root = screen.getByTestId("screen");
    const banner = screen.getByTestId("demo-banner");
    expect(root.firstElementChild).toBe(banner);
    expect(banner.textContent).toContain(BANNER_EN);
    expect(screen.getByText("Body")).toBeTruthy();
    expect(screen.queryByTestId("offline-banner")).toBeNull();
  });

  it("Screen shows the offline strip when offline", () => {
    renderNative(<Screen offline lastSyncedLabel="07:45" scroll={false} />);
    expect(screen.getByText("You are offline. Changes are saved on this device.")).toBeTruthy();
    expect(screen.getByText("Last synced 07:45")).toBeTruthy();
    expect(screen.getByTestId("offline-banner").getAttribute("aria-live")).toBe("polite");
  });
});

describe("AppHeader / LanguageSwitcher", () => {
  it("renders the LanguageSwitcher by default (AC 3) and a labelled back button", () => {
    let back = 0;
    renderNative(<AppHeader title="Patients" subtitle="Alpha-1" onBack={() => (back += 1)} />);
    expect(screen.getByTestId("language-switcher")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Patients" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(back).toBe(1);
  });

  it("titleRef receives the title's host node (apps move screen-reader focus to it, CTZ-09)", () => {
    const ref = createRef<AppTextRef>();
    renderNative(<AppHeader title="Timeline" titleRef={ref} />);
    expect(ref.current).toBe(screen.getByRole("heading", { name: "Timeline" }));
  });

  it("can hide the switcher explicitly", () => {
    renderNative(<AppHeader title="Sign in" showLanguageSwitcher={false} />);
    expect(screen.queryByTestId("language-switcher")).toBeNull();
  });

  it("switches and persists the language", async () => {
    const storage = createMemoryLanguageStorage("en");
    const i18n = buildI18nInstance({ appId: "worker", storage }, "en", storage);
    renderNative(<LanguageSwitcher />, { i18n });
    const en = screen.getByRole("radio", { name: "English" });
    const rw = screen.getByRole("radio", { name: "Ikinyarwanda" });
    expect(en.getAttribute("aria-checked")).toBe("true");
    expect(rw.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(rw);
    await waitFor(() => expect(i18n.language).toBe("rw"));
    expect(await storage.get()).toBe("rw");
    expect(screen.getByRole("radio", { name: "Ikinyarwanda" }).getAttribute("aria-checked")).toBe(
      "true",
    );
  });
});

describe("Other banners", () => {
  it("RoleBanner states the demo role switch is not authentication", () => {
    renderNative(
      <RoleBanner
        personaName="Aline U."
        roleLabel="Community health worker"
        scopeLabel="Alpha-1"
      />,
    );
    expect(screen.getByText("Aline U.")).toBeTruthy();
    expect(screen.getByText("Demo role switch — not authentication")).toBeTruthy();
    expect(screen.getByText("Community health worker · Scope: Alpha-1")).toBeTruthy();
  });

  it("RuleDisclaimer shows the code and the translated explanation", () => {
    renderNative(<RuleDisclaimer />);
    expect(screen.getByText("DEMO_RULE_NOT_CLINICALLY_VALIDATED")).toBeTruthy();
    expect(screen.getByText(/illustrative demo rule/)).toBeTruthy();
  });

  it("PrivacyNotice and OfflineBanner default copy", () => {
    renderNative(
      <>
        <PrivacyNotice />
        <OfflineBanner />
      </>,
    );
    expect(screen.getByText("Privacy")).toBeTruthy();
    expect(screen.getByText(/synthetic data only/)).toBeTruthy();
  });
});
