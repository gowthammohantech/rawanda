/**
 * CTZ-02 persona choice + session: cards announce name, relationship and state; choosing writes
 * `citizen.persona.selected` + `session.started` and lands per state; "Switch persona" clears
 * the session (`session.ended`); a relaunch restores the last persona and tab; the five tabs
 * are labelled with ≥ 56pt items.
 */
import { PERSONA_IDS } from "@laif/mock-data";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import TabsLayout from "../../../app/(app)/(tabs)/_layout.tsx";
import { WalletHeader } from "../../components/WalletHeader.tsx";
import { EntryRedirect } from "../../navigation/EntryRedirect.tsx";
import { PersonaScreen } from "../../screens/onboarding/PersonaScreen.tsx";
import { createAppSession } from "../../session.ts";
import { appGuardHref, landingHref } from "../../state/access.ts";
import { createWalletStore, WALLET_STORAGE_KEY } from "../../state/session.ts";
import { auditsOf, renderShell } from "../../test/harness.tsx";
import { lastHref, resetRouter } from "../../test/router-stub.tsx";

vi.mock("expo-router", () => import("../../test/router-stub.tsx"));

describe("persona picker and session", () => {
  beforeEach(() => resetRouter());

  it("announces each persona card with name, relationship and state", async () => {
    await renderShell(<PersonaScreen />, { readyTestId: `persona-card-${PERSONA_IDS.citizenRep}` });
    const cards = screen
      .getAllByRole("button")
      .filter((b) => b.getAttribute("data-testid")?.startsWith("persona-card-"));
    expect(cards).toHaveLength(5);
    const withdrawn = screen.getByTestId(`persona-card-${PERSONA_IDS.citizenWithdrawn}`);
    expect(withdrawn.getAttribute("aria-label")).toMatch(
      /^Tezvox Ixaliqua, Self, CONSENT WITHDRAWN\./u,
    );
    const rep = screen.getByTestId(`persona-card-${PERSONA_IDS.citizenRep}`);
    expect(rep.getAttribute("aria-label")).toMatch(
      /Representative for Qorzo Texaumbra, CONSENT GIVEN/u,
    );
    const pending = screen.getByTestId(`persona-card-${PERSONA_IDS.citizenPending}`);
    expect(pending.getAttribute("aria-label")).toContain("NOT VERIFIED");
    expect(
      within(pending).getByText("Demo persona — role switching is not real sign-in"),
    ).toBeTruthy();
  });

  it("choosing CTZ-P3 records the choice and lands on consent-withdrawn", async () => {
    const { store, services } = await renderShell(<PersonaScreen />, {
      readyTestId: `persona-card-${PERSONA_IDS.citizenWithdrawn}`,
    });
    fireEvent.click(screen.getByTestId(`persona-card-${PERSONA_IDS.citizenWithdrawn}`));
    await waitFor(() => expect(lastHref()).toBe("/consent-withdrawn"));
    expect(services.session.current()?.id).toBe(PERSONA_IDS.citizenWithdrawn);
    expect(await auditsOf(store, "citizen.persona.selected")).toHaveLength(1);
    expect(await auditsOf(store, "session.started")).toHaveLength(1);
    expect(services.wallet.getState().activePatientId).not.toBeNull();
  });

  it("CTZ-P5 → /verify, CTZ-P1 → /health", async () => {
    await renderShell(<PersonaScreen />, {
      readyTestId: `persona-card-${PERSONA_IDS.citizenPending}`,
    });
    fireEvent.click(screen.getByTestId(`persona-card-${PERSONA_IDS.citizenPending}`));
    await waitFor(() => expect(lastHref()).toBe("/verify"));
    fireEvent.click(screen.getByTestId(`persona-card-${PERSONA_IDS.citizen1}`));
    await waitFor(() => expect(lastHref()).toBe("/health"));
  });

  it("Switch persona clears the session; relaunch restores the last persona and tab", async () => {
    const first = await renderShell(<WalletHeader title="My health" />, {
      before: (s) => {
        s.session.switchTo(PERSONA_IDS.citizen2);
        s.wallet.getState().setLastTab("timeline");
      },
      readyTestId: "wallet-header",
    });
    expect(screen.getByText("Demo persona")).toBeTruthy();
    first.unmount();

    // Relaunch: same storage → same persona and last tab.
    const second = await renderShell(<EntryRedirect />, {
      store: first.store,
      readyTestId: "redirect",
    });
    expect(second.services.session.current()?.id).toBe(PERSONA_IDS.citizen2);
    expect(screen.getByTestId("redirect").getAttribute("data-href")).toBe("/timeline");
    second.unmount();

    const third = await renderShell(<WalletHeader title="My health" />, {
      store: first.store,
      readyTestId: "wallet-menu",
    });
    fireEvent.click(screen.getByTestId("wallet-menu"));
    fireEvent.click(await screen.findByTestId("switch-persona"));
    await waitFor(() => expect(third.services.session.current()).toBeNull());
    expect(lastHref()).toBe("/persona");
    expect(await auditsOf(first.store, "session.ended")).toHaveLength(1);
    expect(window.localStorage.getItem("laif.citizen.persona")).toBeNull();
    expect(window.localStorage.getItem(WALLET_STORAGE_KEY)).toBeNull();
  });

  it("five labelled tabs with item min height 56", async () => {
    await renderShell(<TabsLayout />, { readyTestId: "tab-bar" });
    const bar = screen.getByTestId("tab-bar");
    for (const label of ["My health", "Next steps", "Reminders", "Timeline", "More"]) {
      expect(within(bar).getByRole("button", { name: label })).toBeTruthy();
    }
    expect(Number(bar.getAttribute("data-min-height"))).toBeGreaterThanOrEqual(56);
    expect(Number(bar.getAttribute("data-min-width"))).toBeGreaterThanOrEqual(44);
  });
});

describe("wallet session store + routing decisions", () => {
  it("persists the context per persona and drops it on a persona change", () => {
    const storage = window.localStorage;
    const session = createAppSession(storage);
    session.switchTo(PERSONA_IDS.citizen1);
    const wallet = createWalletStore(session, storage);
    wallet.getState().setContext({ accountId: "acc-1", activePatientId: "pat-1" });
    wallet.getState().setLastTab("reminders");
    const restored = createWalletStore(createAppSession(storage), storage).getState();
    expect(restored).toMatchObject({
      personaId: PERSONA_IDS.citizen1,
      accountId: "acc-1",
      activePatientId: "pat-1",
      lastTab: "reminders",
    });
    session.switchTo(PERSONA_IDS.citizen2);
    expect(wallet.getState()).toMatchObject({
      personaId: PERSONA_IDS.citizen2,
      activePatientId: null,
    });
  });

  it("guard decisions", () => {
    const base = {
      personaId: "p" as never,
      displayName: "x",
      verification: null,
      links: [],
      patients: [],
    };
    const active = {
      ...base,
      account: { status: "active" } as never,
      activePatientId: "pat" as never,
    };
    expect(appGuardHref(null, null, false)).toBe("/persona");
    expect(
      appGuardHref(
        { ...active, account: { status: "pending_verification" } as never },
        null,
        false,
      ),
    ).toBe("/verify");
    expect(appGuardHref({ ...active, account: { status: "locked" } as never }, null, false)).toBe(
      "/recover",
    );
    expect(appGuardHref({ ...active, activePatientId: null }, null, false)).toBe("/consent");
    expect(appGuardHref(active, "not_recorded", false)).toBe("/consent");
    expect(appGuardHref(active, "withdrawn", false)).toBe("/consent-withdrawn");
    expect(appGuardHref(active, "withdrawn", true)).toBeNull();
    expect(appGuardHref(active, "granted", false)).toBeNull();
    expect(appGuardHref(active, "granted", true)).toBe("/health");
    expect(landingHref(active, "granted", "more")).toBe("/more");
  });
});
