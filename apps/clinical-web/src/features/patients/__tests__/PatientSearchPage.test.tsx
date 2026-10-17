/**
 * CLN-03 patient search: initial recent-in-facility list, validation (1 character), empty
 * state (WF-04 name from Alpha-1 → 0 rows), one privacy-safe `patient.searched` per settled
 * query, pagination (20 / page, URL, back), facility filter scoping (clinician: Alpha-1 only;
 * coordinator → Alpha-2 only), top-bar search + Ctrl+K.
 */
import type { Patient } from "@laif/domain";
import { createSeed, FACILITY_IDS, PERSONA_IDS, SEED_ANCHORS } from "@laif/mock-data";
import { createMemoryStoreAdapter } from "@laif/repositories";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { routes } from "../../../app/routes.ts";
import { auditEvents, renderApp } from "../../../test/render-app.tsx";
import { createTestClinicalRepo } from "../../../test/test-repository.ts";

const CLINICIAN = { personaId: PERSONA_IDS.clinAlpha1, facilityId: FACILITY_IDS.alpha1 };
const COORDINATOR = { personaId: PERSONA_IDS.coordAlpha, facilityId: FACILITY_IDS.alpha1 };
const seed = createSeed();
const patientsOf = (facilityId: string) => seed.patients.filter((p) => p.facilityId === facilityId);
const wf04 = seed.patients.find(
  (p) => p.id === SEED_ANCHORS.WF04_OTHER_FACILITY_PATIENT.patientId,
) as Patient;

const resultRows = async () => {
  const results = await screen.findByTestId("patient-results");
  return within(results).queryAllByTestId("patient-row-link");
};

const searchBoxes = () => screen.getAllByRole("searchbox", { name: "Search patients" });
/** The page's own search box (the top bar has a second one with the same name). */
const pageSearch = () => screen.getByTestId<HTMLInputElement>("patient-search-input");

describe("PatientSearchPage", () => {
  it("initially lists the active facility's patients (page 1, no query), in scope only", async () => {
    await renderApp({ path: routes.patients(), signIn: CLINICIAN });
    const alpha1 = patientsOf(FACILITY_IDS.alpha1);
    await waitFor(async () => expect(await resultRows()).toHaveLength(alpha1.length));
    const names = (await resultRows()).map((link) => link.textContent);
    expect(names).not.toContain(wf04.displayName);
    for (const p of patientsOf(FACILITY_IDS.beta1)) expect(names).not.toContain(p.displayName);
    expect(screen.getByText(`Showing 1–${alpha1.length} of ${alpha1.length}`)).toBeTruthy();
    expect(searchBoxes()).toHaveLength(2);
  });

  it("shows an inline error for a 1-character query and does not search", async () => {
    const user = userEvent.setup();
    const { router, store } = await renderApp({ path: routes.patients(), signIn: CLINICIAN });
    await resultRows();
    await user.type(pageSearch(), "Q");
    expect(await screen.findByText("Enter at least 2 characters.")).toBeTruthy();
    expect(pageSearch().getAttribute("aria-invalid")).toBe("true");
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(router.state.location.search).toBe("");
    expect(await auditEvents(store, "patient.searched")).toHaveLength(0);
  });

  it("WF-04: the Beta-1 patient's name from Alpha-1 → 0 rows, empty state, one privacy-safe audit", async () => {
    const user = userEvent.setup();
    const { router, store } = await renderApp({ path: routes.patients(), signIn: CLINICIAN });
    await resultRows();
    await user.type(pageSearch(), wf04.displayName);
    await waitFor(() =>
      expect(new URLSearchParams(router.state.location.search).get("q")).toBe(wf04.displayName),
    );
    expect(
      await screen.findByText(`No synthetic patients match '${wf04.displayName}'`),
    ).toBeTruthy();
    expect(await resultRows()).toHaveLength(0);

    await waitFor(async () => expect(await auditEvents(store, "patient.searched")).toHaveLength(1));
    const [event] = await auditEvents(store, "patient.searched");
    expect(event?.changeSummary).toMatchObject({
      queryLength: wf04.displayName.length,
      resultCount: 0,
    });
    expect(JSON.stringify(event)).not.toContain(wf04.displayName);
    expect(JSON.stringify(event)).not.toContain("Quavox");

    // Clear filters returns to the recent list.
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    await waitFor(async () =>
      expect(await resultRows()).toHaveLength(patientsOf(FACILITY_IDS.alpha1).length),
    );
  });

  it("matches by synthetic ID and records one audit per settled query (not per keystroke)", async () => {
    const user = userEvent.setup();
    const target = patientsOf(FACILITY_IDS.alpha1)[0] as Patient;
    const { store } = await renderApp({ path: routes.patients(), signIn: CLINICIAN });
    await resultRows();
    await user.type(pageSearch(), target.syntheticIdentifier);
    await waitFor(async () => {
      const rows = await resultRows();
      expect(rows.map((r) => r.textContent)).toEqual([target.displayName]);
    });
    await new Promise((resolve) => setTimeout(resolve, 400));
    const searched = await auditEvents(store, "patient.searched");
    expect(searched).toHaveLength(1);
    expect(searched[0]?.changeSummary).toMatchObject({
      queryLength: target.syntheticIdentifier.length,
      resultCount: 1,
    });
  });

  it("paginates 20 per page; the URL reflects the page and back restores it", async () => {
    const user = userEvent.setup();
    const store = createMemoryStoreAdapter();
    await createTestClinicalRepo(undefined, store);
    const template = patientsOf(FACILITY_IDS.alpha1)[0] as Patient;
    const extra: Patient[] = Array.from({ length: 25 }, (_, i) => ({
      ...template,
      id: `test-pat-${String(i).padStart(2, "0")}` as Patient["id"],
      syntheticIdentifier: `DEMO-T-${String(i).padStart(4, "0")}`,
      displayName: `Zz Pagination ${String(i).padStart(2, "0")}`,
      duplicateCandidateIds: [],
    }));
    await store.bulkPut("patients", extra);
    const total = patientsOf(FACILITY_IDS.alpha1).length + extra.length;

    const { router } = await renderApp({ path: routes.patients(), signIn: CLINICIAN, store });
    await waitFor(async () => expect(await resultRows()).toHaveLength(20));
    expect(screen.getByText(`Showing 1–20 of ${total}`)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Next page" }));
    await waitFor(() => expect(router.state.location.search).toBe("?page=2"));
    await waitFor(() => expect(screen.getByText(`Showing 21–40 of ${total}`)).toBeTruthy());
    expect(await resultRows()).toHaveLength(20);

    await router.navigate(-1);
    await waitFor(() => expect(router.state.location.search).toBe(""));
    await waitFor(() => expect(screen.getByText(`Showing 1–20 of ${total}`)).toBeTruthy());

    await router.navigate(routes.patients({ page: 3 }));
    await waitFor(() => expect(screen.getByText(`Showing 41–${total} of ${total}`)).toBeTruthy());
  });

  it("clinician: the facility filter lists Alpha-1 only", async () => {
    await renderApp({ path: routes.patients(), signIn: CLINICIAN });
    const select = screen.getByRole<HTMLSelectElement>("combobox", { name: /^Facility/ });
    expect([...select.options].map((o) => o.textContent)).toEqual(["Demo Health Centre Alpha-1"]);
  });

  it("coordinator: filtering by Alpha-2 shows only Alpha-2 patients (active facility switches)", async () => {
    const { router, services } = await renderApp({ path: routes.patients(), signIn: COORDINATOR });
    await waitFor(async () =>
      expect(await resultRows()).toHaveLength(patientsOf(FACILITY_IDS.alpha1).length),
    );
    const select = screen.getByRole<HTMLSelectElement>("combobox", { name: /^Facility/ });
    expect([...select.options].map((o) => o.textContent)).toEqual([
      "Demo Health Centre Alpha-1",
      "Demo Health Centre Alpha-2",
    ]);
    fireEvent.change(select, { target: { value: FACILITY_IDS.alpha2 } });
    await waitFor(() =>
      expect(new URLSearchParams(router.state.location.search).get("facility")).toBe(
        FACILITY_IDS.alpha2,
      ),
    );
    expect(services.session.state()?.activeFacilityId).toBe(FACILITY_IDS.alpha2);
    const alpha2 = patientsOf(FACILITY_IDS.alpha2)
      .map((p) => p.displayName)
      .sort();
    await waitFor(async () =>
      expect((await resultRows()).map((r) => r.textContent).sort()).toEqual(alpha2),
    );
    const results = screen.getByTestId("patient-results");
    expect(within(results).queryAllByText("Demo Health Centre Alpha-1")).toHaveLength(0);
  });

  it("ignores a ?facility= outside the persona's scope (falls back to the active facility)", async () => {
    const { services } = await renderApp({
      path: routes.patients({ facility: FACILITY_IDS.beta1 }),
      signIn: CLINICIAN,
    });
    await waitFor(async () =>
      expect(await resultRows()).toHaveLength(patientsOf(FACILITY_IDS.alpha1).length),
    );
    expect(services.session.state()?.activeFacilityId).toBe(FACILITY_IDS.alpha1);
  });

  it("top bar: Ctrl+K focuses the search box; Enter opens the search with ?q=", async () => {
    const user = userEvent.setup();
    const { router } = await renderApp({ path: routes.queue(), signIn: CLINICIAN });
    const topbar = screen.getByTestId("topbar-search");
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(document.activeElement).toBe(topbar);
    await user.type(topbar, "DEMO-P{Enter}");
    await waitFor(() => expect(router.state.location.pathname).toBe("/clinical/patients"));
    expect(new URLSearchParams(router.state.location.search).get("q")).toBe("DEMO-P");
    await waitFor(() => expect(pageSearch().value).toBe("DEMO-P"));
  });
});
