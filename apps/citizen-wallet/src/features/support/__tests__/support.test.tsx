/**
 * CTZ-08 Support: the not-an-emergency and no-medical-advice notices are present (EN + RW),
 * no forbidden phrases ("call 112", "we will monitor", "diagnos…"), no number dials, the
 * callback is disabled without consent / without a persona, help topics are static and one
 * `citizen.support.viewed` / `citizen.help.viewed` is written per focus.
 */
import { PERSONA_IDS } from "@laif/mock-data";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { Linking } from "react-native";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { auditsOf, renderShell } from "../../../test/harness.tsx";
import { lastHref, resetRouter } from "../../../test/router-stub.tsx";
import { HelpScreen } from "../HelpScreen.tsx";
import { SupportScreen } from "../SupportScreen.tsx";

vi.mock("expo-router", () => import("../../../test/router-stub.tsx"));

const T = { timeout: 10_000 };
const as = (personaId: string) => ({
  before: (s: { session: { switchTo: (id: string) => unknown } }) =>
    void s.session.switchTo(personaId),
});

const FORBIDDEN = [
  /call\s*112/iu,
  /\b112\b/u,
  /we will monitor/iu,
  /monitor(ed|ing)? (you|your)/iu,
  /diagnos/iu,
  /within \d+ (minutes|hours)/iu,
  /tel:/iu,
];

const expectNoForbidden = (text: string) => {
  for (const pattern of FORBIDDEN) expect(text).not.toMatch(pattern);
};

describe("Support", () => {
  beforeEach(() => resetRouter(["(app)", "(tabs)", "more", "support"]));

  it("shows both notices, the care team and an enabled callback (consent granted)", async () => {
    const view = await renderShell(<SupportScreen />, {
      ...as(PERSONA_IDS.citizen2),
      readyTestId: "support-callback",
    });
    expect(screen.getByTestId("not-an-emergency").textContent).toContain(
      "This app is not for emergencies. If you feel very unwell, go to your nearest health facility now.",
    );
    expect(screen.getByTestId("no-medical-advice").textContent).toContain(
      "This app does not give medical advice.",
    );
    expect(screen.getByTestId("care-team-who").textContent).toMatch(
      /^Who to contact: your care team at /u,
    );
    expect(screen.getByTestId("support-callback").getAttribute("aria-disabled")).not.toBe("true");
    expectNoForbidden(view.container.textContent ?? "");
    fireEvent.click(screen.getByTestId("support-callback"));
    expect(lastHref()).toBe("/more/support/callback");
    await waitFor(async () =>
      expect(await auditsOf(view.store, "citizen.support.viewed")).toHaveLength(1),
    );
  });

  it("'Call' never dials: it opens the demo-number sheet", async () => {
    const openURL = vi.spyOn(Linking, "openURL");
    await renderShell(<SupportScreen />, {
      ...as(PERSONA_IDS.citizen2),
      readyTestId: "contact-call",
    });
    fireEvent.click(screen.getByTestId("contact-call"));
    expect(await screen.findByTestId("contact-sheet", {}, T)).toBeTruthy();
    expect(openURL).not.toHaveBeenCalled();
    openURL.mockRestore();
  });

  it("consent withdrawn (CTZ-P3): Support renders, callback disabled with the reason", async () => {
    const view = await renderShell(<SupportScreen />, {
      ...as(PERSONA_IDS.citizenWithdrawn),
      readyTestId: "support-callback-disabled",
    });
    expect(screen.getByTestId("support-callback-disabled").textContent).toBe(
      "Give consent to send requests",
    );
    expect(screen.getByTestId("support-callback").getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByTestId("not-an-emergency")).toBeTruthy();
    // No health read happened.
    expect(await auditsOf(view.store, "access.denied")).toHaveLength(0);
  });

  it("before a persona is chosen: callback disabled, nothing audited", async () => {
    const view = await renderShell(<SupportScreen base="/support" />, {
      readyTestId: "support-callback-disabled",
    });
    expect(screen.getByTestId("support-callback-disabled").textContent).toBe(
      "Choose a demo persona and give consent to send requests.",
    );
    fireEvent.click(screen.getByTestId("support-help"));
    expect(lastHref()).toBe("/support/help");
    expect(await auditsOf(view.store, "citizen.support.viewed")).toHaveLength(0);
  });

  it("Kinyarwanda copy carries the same notices without forbidden phrases", async () => {
    const view = await renderShell(<SupportScreen />, {
      ...as(PERSONA_IDS.citizen2),
      readyTestId: "support-callback",
    });
    await act(async () => {
      await view.services.i18n.setLanguage("rw");
    });
    await waitFor(() =>
      expect(screen.getByTestId("not-an-emergency").textContent).toContain(
        "Iyi porogaramu si iy'ibihe byihutirwa.",
      ),
    );
    expect(screen.getByTestId("no-medical-advice").textContent).toContain(
      "Iyi porogaramu ntitanga inama z'ubuvuzi.",
    );
    expectNoForbidden(view.container.textContent ?? "");
  });
});

describe("Help topics", () => {
  beforeEach(() => resetRouter(["(app)", "(tabs)", "more", "support", "help"]));

  it("lists the five static topics with links; one citizen.help.viewed", async () => {
    const view = await renderShell(<HelpScreen />, {
      ...as(PERSONA_IDS.citizen2),
      readyTestId: "help-topics",
    });
    for (const id of ["reviewed", "latestCheck", "stopReminders", "demoPersona", "correction"]) {
      expect(screen.getByTestId(`help-topic-${id}`)).toBeTruthy();
    }
    expect(screen.getByText("What does 'Reviewed' mean?")).toBeTruthy();
    fireEvent.click(screen.getByTestId("help-link-stopReminders"));
    expect(lastHref()).toBe("/reminders/preferences");
    fireEvent.click(screen.getByTestId("help-link-correction"));
    expect(lastHref()).toBe("/more/privacy/corrections/new");
    expectNoForbidden(view.container.textContent ?? "");
    await waitFor(async () =>
      expect(await auditsOf(view.store, "citizen.help.viewed")).toHaveLength(1),
    );
  });

  it("without a persona only the demo-persona link is shown", async () => {
    await renderShell(<HelpScreen base="/support" />, { readyTestId: "help-topics" });
    expect(screen.getByTestId("help-link-demoPersona")).toBeTruthy();
    expect(screen.queryByTestId("help-link-reviewed")).toBeNull();
  });
});
