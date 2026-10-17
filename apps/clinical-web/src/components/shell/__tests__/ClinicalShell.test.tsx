/**
 * CLN-01 task 8/9: grouped nav (Workspace / Governance / Settings + Help), role chip, active
 * facility, RoleBanner, EN → RW label switch, facility switch, persona switch and sign out.
 */
import { rwResources, type enResources } from "@laif/i18n";
import { FACILITY_IDS, PERSONA_IDS } from "@laif/mock-data";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { auditEvents, renderApp } from "../../../test/render-app.tsx";

const rwClinical = rwResources.clinical as typeof enResources.clinical;

const signedIn = (
  personaId: string = PERSONA_IDS.clinAlpha1,
  facilityId: string = FACILITY_IDS.alpha1,
) => ({ personaId, facilityId }) as const;

describe("ClinicalShell", () => {
  it("renders the grouped nav, top bar persona info and the RoleBanner", async () => {
    await renderApp({ path: "/clinical/queue", signIn: signedIn() });
    const nav = screen.getByRole("navigation", { name: "Main navigation" });
    expect(within(nav).getByText("Workspace")).toBeTruthy();
    expect(within(nav).getByText("Governance")).toBeTruthy();
    for (const name of ["Review queue", "Patients", "Referrals", "Care-team tasks", "Audit"]) {
      expect(within(nav).getByRole("link", { name: new RegExp(name) })).toBeTruthy();
    }
    expect(screen.getByRole("link", { name: "Settings" }).getAttribute("href")).toBe(
      "/clinical/settings",
    );
    expect(screen.getByRole("button", { name: "Help" })).toBeTruthy();
    expect(screen.getByTestId("role-chip").textContent).toBe("Clinician");
    const banner = screen.getByRole("note");
    expect(banner.textContent).toContain("Zorvel Quorandi");
    expect(banner.textContent).toContain("Demo Health Centre Alpha-1");
    expect(banner.textContent).toContain("Demo role switch — not authentication");
    expect(screen.getByRole("link", { name: /Search patients/ }).getAttribute("href")).toBe(
      "/clinical/patients",
    );
    expect(screen.getByRole("button", { name: "Notifications" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Skip to main content" })).toBeTruthy();
  });

  it("switches nav labels to Kinyarwanda without a reload", async () => {
    const user = userEvent.setup();
    await renderApp({ path: "/clinical/patients", signIn: signedIn() });
    await user.click(screen.getByRole("button", { name: "Ikinyarwanda" }));
    const nav = screen.getByRole("navigation");
    await waitFor(() =>
      expect(
        within(nav).getByRole("link", { name: new RegExp(rwClinical.nav.queue) }),
      ).toBeTruthy(),
    );
    expect(within(nav).getByText(rwClinical.nav.section.workspace)).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(rwClinical.nav.patients);
    expect(document.documentElement.lang).toBe("rw");
  });

  it("keeps the session across a reload; sign out returns to login and records session.ended", async () => {
    const user = userEvent.setup();
    const first = await renderApp({ path: "/clinical/tasks", signIn: signedIn() });
    first.unmount();

    // "Reload": a fresh boot from the stored session lands on the same route.
    const { router, store, services } = await renderApp({
      path: "/clinical/tasks",
      store: first.store,
    });
    expect(screen.getByTestId("app-shell")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: "Care-team tasks" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /Switch demo persona/ }));
    await user.click(await screen.findByRole("menuitem", { name: "Sign out" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/clinical/login"));
    expect(router.state.location.search).toBe("");
    expect(await screen.findByTestId("public-shell")).toBeTruthy();
    expect(services.session.state()).toBeNull();
    const ended = await auditEvents(store, "session.ended");
    expect(ended).toHaveLength(1);
    expect(ended[0]).toMatchObject({
      actorId: PERSONA_IDS.clinAlpha1,
      facilityId: FACILITY_IDS.alpha1,
    });
  });

  it("switches the active facility among the permitted ones", async () => {
    const user = userEvent.setup();
    const { services } = await renderApp({
      path: "/clinical/queue",
      signIn: signedIn(PERSONA_IDS.coordAlpha, FACILITY_IDS.alpha1),
    });
    await user.click(screen.getByRole("button", { name: /Switch demo persona/ }));
    expect(screen.queryByRole("menuitem", { name: /Beta-1/ })).toBeNull();
    await user.click(
      await screen.findByRole("menuitem", { name: "Switch to Demo Health Centre Alpha-2" }),
    );
    await waitFor(() =>
      expect(services.session.state()?.activeFacilityId).toBe(FACILITY_IDS.alpha2),
    );
    expect(screen.getByRole("note").textContent).toContain("Demo Health Centre Alpha-2");
  });

  it("switching persona from the menu ends the old session and starts a new one", async () => {
    const user = userEvent.setup();
    const { services, store } = await renderApp({
      path: "/clinical/queue",
      signIn: signedIn(PERSONA_IDS.coordAlpha, FACILITY_IDS.alpha2),
    });
    await user.click(screen.getByRole("button", { name: /Switch demo persona/ }));
    await user.click(await screen.findByRole("menuitemradio", { name: /Quilra Xabezo/ }));
    await waitFor(() => expect(services.session.state()?.persona.id).toBe(PERSONA_IDS.nurseAlpha2));
    expect(services.session.state()?.activeFacilityId).toBe(FACILITY_IDS.alpha2);
    await waitFor(async () => expect(await auditEvents(store, "session.started")).toHaveLength(1));
    expect((await auditEvents(store, "session.ended"))[0]?.actorId).toBe(PERSONA_IDS.coordAlpha);
    expect((await auditEvents(store, "session.started"))[0]?.actorId).toBe(PERSONA_IDS.nurseAlpha2);
    await waitFor(() => expect(screen.getByTestId("role-chip").textContent).toBe("Nurse reviewer"));
  });
});
