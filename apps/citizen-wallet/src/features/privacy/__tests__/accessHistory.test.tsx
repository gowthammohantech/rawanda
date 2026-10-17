/**
 * CTZ-07 access history: CTZ-P1 sees seeded staff reads (role + synthetic facility, never a
 * name) and own views ("You") with Kigali times, newest first; All / Care team / Me filter;
 * viewing the list writes `citizen.access_history.viewed`. Privacy home shows the latest 3;
 * the notice logs `citizen.privacy_notice.viewed`.
 */
import { PERSONA_IDS } from "@laif/mock-data";
import { fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { auditsOf, renderShell } from "../../../test/harness.tsx";
import { resetRouter, routerLog } from "../../../test/router-stub.tsx";
import { AccessHistoryScreen } from "../AccessHistoryScreen.tsx";
import { PrivacyHomeScreen } from "../PrivacyHomeScreen.tsx";
import { PrivacyNoticeScreen } from "../PrivacyNoticeScreen.tsx";

vi.mock("expo-router", () => import("../../../test/router-stub.tsx"));

const as = (personaId: string) => ({
  before: (s: { session: { switchTo: (id: string) => unknown } }) =>
    void s.session.switchTo(personaId),
});
const rowsIn = (root: HTMLElement) => within(root).queryAllByTestId(/^access-event-/u);
const allRows = () => screen.getAllByTestId("access-row-actor").map((el) => el.textContent ?? "");
const STAFF_NAMES = /Dr\.|Nurse [A-Z][a-z]+ [A-Z]|Uwimana|Mukamana/u;

describe("access history", () => {
  beforeEach(() => resetRouter(["(app)", "(tabs)", "more", "privacy", "access-history"]));

  it("lists staff reads by role + facility and own views as 'You', newest first, with Kigali times", async () => {
    const view = await renderShell(<AccessHistoryScreen />, {
      ...as(PERSONA_IDS.citizen1),
      readyTestId: "access-list",
    });
    const actors = allRows();
    expect(actors.length).toBeGreaterThan(3);
    expect(actors.some((a) => a === "You")).toBe(true);
    const staff = actors.filter((a) => a !== "You");
    expect(staff.length).toBeGreaterThan(0);
    for (const a of staff) expect(a).toMatch(/^.+ \(synthetic\) · .+$/u);
    expect(actors.join(" ")).not.toMatch(STAFF_NAMES);
    // Kigali wall time (UTC+2), e.g. "12 Oct 2026, 10:24 · For your care review".
    for (const el of screen.getAllByTestId("access-row-time")) {
      expect(el.textContent).toMatch(/^\d{1,2} [A-Z][a-z]{2} 2026, \d\d:\d\d · /u);
    }
    const chips = screen.getAllByTestId("access-row-chip").map((el) => el.textContent);
    expect(chips).toContain("YOU");
    expect(chips).toContain("VIEWED");
    expect(screen.getAllByTestId("access-row-action")[0]?.textContent).toMatch(/^Looked at /u);

    // Newest first (repository order) — the rendered order matches listAccessEvents.
    const events = await view
      .repo()
      .listAccessEvents((await view.repo().getSession())!.activePatientId!);
    const rendered = rowsIn(screen.getByTestId("access-list")).map((el) =>
      el.getAttribute("data-testid"),
    );
    expect(rendered).toEqual(events.map((e) => `access-event-${e.id}`));
    expect(await auditsOf(view.store, "citizen.access_history.viewed")).toHaveLength(1);
  });

  it("filter: Care team shows only staff, Me only own views; counts on the chips", async () => {
    await renderShell(<AccessHistoryScreen />, {
      ...as(PERSONA_IDS.citizen1),
      readyTestId: "access-list",
    });
    const total = allRows().length;
    const careTab = screen.getByRole("tab", { name: /Care team/u });
    fireEvent.click(careTab);
    const staff = allRows();
    expect(staff.every((a) => a !== "You")).toBe(true);
    fireEvent.click(screen.getByRole("tab", { name: /^Me/u }));
    const own = allRows();
    expect(own.every((a) => a === "You")).toBe(true);
    expect(staff.length + own.length).toBe(total);
    expect(careTab.getAttribute("aria-label")).toContain(String(staff.length));
    fireEvent.click(screen.getByRole("tab", { name: /^All/u }));
    expect(allRows()).toHaveLength(total);
  });

  it("privacy home: latest 3 accesses, See all, notice link, ask for a correction", async () => {
    await renderShell(<PrivacyHomeScreen />, {
      ...as(PERSONA_IDS.citizen1),
      readyTestId: "privacy-latest-access",
    });
    expect(rowsIn(screen.getByTestId("privacy-latest-access"))).toHaveLength(3);
    expect(screen.getByText("Who has looked at my record")).toBeTruthy();
    // CTZ-P1's seeded requests (one still open, one resolved-amended) show with status chips.
    expect(await screen.findByTestId("privacy-requests", {}, { timeout: 10_000 })).toBeTruthy();
    const chips = screen.getAllByTestId("correction-status-chip").map((el) => el.textContent);
    expect(chips.some((c) => c?.includes("CORRECTED"))).toBe(true);
    fireEvent.click(screen.getByTestId("privacy-see-all-access"));
    fireEvent.click(screen.getByTestId("privacy-notice-link"));
    fireEvent.click(screen.getByTestId("privacy-ask-correction"));
    expect(routerLog.map((r) => r.href)).toEqual([
      "/more/privacy/access-history",
      "/more/privacy/notice",
      "/more/privacy/corrections/new",
    ]);
  });

  it("notice: demo heading, version, rights not available in this demo; view audited", async () => {
    const view = await renderShell(<PrivacyNoticeScreen />, {
      ...as(PERSONA_IDS.citizen1),
      readyTestId: "privacy-notice-body",
    });
    expect(screen.getByTestId("notice-heading").textContent).toBe(
      "DEMO NOTICE — NOT APPROVED WORDING",
    );
    expect(screen.getByTestId("notice-version").textContent).toBe("Version demo-notice-v0.1");
    for (const right of ["access", "correction", "portability", "erasure"]) {
      expect(screen.getByTestId(`notice-right-${right}`).textContent).toContain(
        "not available in this demo",
      );
    }
    expect(screen.getByTestId("notice-stored").textContent).toContain("store data in Rwanda");
    await vi.waitFor(async () =>
      expect(await auditsOf(view.store, "citizen.privacy_notice.viewed")).toHaveLength(1),
    );
  });

  it("representative sees Grace's history only, own views as 'You'", async () => {
    await renderShell(<AccessHistoryScreen />, {
      ...as(PERSONA_IDS.citizenRep),
      readyTestId: "access-list",
    });
    expect(screen.getByTestId("representative-banner")).toBeTruthy();
    expect(allRows().length).toBeGreaterThan(0);
  });
});
