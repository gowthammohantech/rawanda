/**
 * CLN-03 patient record: WF-04 direct URL → permission denied, no PHI in the DOM, exactly one
 * `access.denied`; unknown id → not-found EmptyState; DUPLICATE_IDENTITY_PAIR warning (icon +
 * text, in-scope candidate listed, out-of-scope counted, never merged); one `patient.viewed`
 * under StrictMode; overview (provenance, KPI strip, latest screening) and the CLN-04 tabs.
 */
import type { AuditEvent, Patient } from "@laif/domain";
import { createSeed, FACILITY_IDS, PERSONA_IDS, SEED_ANCHORS } from "@laif/mock-data";
import { createMemoryStoreAdapter } from "@laif/repositories";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { routes } from "../../../app/routes.ts";
import { auditEvents, renderApp } from "../../../test/render-app.tsx";
import { createTestClinicalRepo } from "../../../test/test-repository.ts";

const CLINICIAN = { personaId: PERSONA_IDS.clinAlpha1, facilityId: FACILITY_IDS.alpha1 };
const BETA = { personaId: PERSONA_IDS.clinBeta1, facilityId: FACILITY_IDS.beta1 };
const seed = createSeed();
const byId = (id: string) => seed.patients.find((p) => p.id === id) as Patient;
const WF04 = byId(SEED_ANCHORS.WF04_OTHER_FACILITY_PATIENT.patientId);
const [DUP_A_ID, DUP_B_ID] = SEED_ANCHORS.DUPLICATE_IDENTITY_PAIR.patientIds;
const DUP_A = byId(DUP_A_ID);
const DUP_B = byId(DUP_B_ID);
const WF01 = byId(SEED_ANCHORS.WF01_FLAGGED_REVIEW.patientId);

const forEntity = (events: AuditEvent[], id: string) => events.filter((e) => e.entityId === id);

describe("PatientPage", () => {
  it("WF-04: an out-of-scope patient URL is denied, shows no PHI and appends one access.denied", async () => {
    const { store } = await renderApp({ path: routes.patient(WF04.id), signIn: CLINICIAN });
    expect(await screen.findByTestId("permission-denied")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: "Patient overview" })).toBeTruthy();
    const text = document.body.textContent ?? "";
    expect(text).not.toContain(WF04.displayName);
    expect(text).not.toContain(WF04.syntheticIdentifier);
    expect(screen.queryByTestId("patient-header")).toBeNull();

    await waitFor(async () =>
      expect(forEntity(await auditEvents(store, "access.denied"), WF04.id)).toHaveLength(1),
    );
    const [denied] = forEntity(await auditEvents(store, "access.denied"), WF04.id);
    expect(denied?.outcome).toBe("denied");
    expect(denied?.actorId).toBe(PERSONA_IDS.clinAlpha1);
    expect(forEntity(await auditEvents(store, "patient.viewed"), WF04.id)).toHaveLength(0);
  });

  it("an unknown id shows the not-found EmptyState", async () => {
    await renderApp({ path: routes.patient("pat-does-not-exist"), signIn: CLINICIAN });
    expect(
      await screen.findByText("No synthetic patient with this ID in your facilities"),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to patient search" })).toBeTruthy();
  });

  it("opening a patient appends exactly one patient.viewed (StrictMode)", async () => {
    const { store } = await renderApp({ path: routes.patient(WF01.id), signIn: CLINICIAN });
    const header = await screen.findByTestId("patient-header");
    expect(within(header).getByRole("heading", { name: WF01.displayName })).toBeTruthy();
    expect(within(header).getByText("Synthetic")).toBeTruthy();
    expect(within(header).getByText(WF01.syntheticIdentifier)).toBeTruthy();
    await screen.findByTestId("patient-kpis");
    await new Promise((resolve) => setTimeout(resolve, 100));
    const viewed = forEntity(await auditEvents(store, "patient.viewed"), WF01.id);
    expect(viewed).toHaveLength(1);
    expect(viewed[0]?.facilityId).toBe(FACILITY_IDS.alpha1);
    expect(viewed[0]?.patientId).toBe(WF01.id);
  });

  it("overview: provenance, KPI strip, latest screening and the record tabs", async () => {
    const user = userEvent.setup();
    await renderApp({ path: routes.patient(WF01.id), signIn: CLINICIAN });
    const provenance = await screen.findByTestId("identity-provenance");
    expect(within(provenance).getByText("Synthetic demo identifier")).toBeTruthy();
    expect(within(provenance).getByText("Facility-scoped demo ID")).toBeTruthy();
    expect(within(provenance).getByText("Synthetic demo seed")).toBeTruthy();
    const kpis = await screen.findByTestId("patient-kpis");
    for (const label of ["Screenings", "Open reviews", "Open referrals", "Open tasks"]) {
      expect(within(kpis).getByText(label)).toBeTruthy();
    }
    expect(screen.getByRole("heading", { name: "Latest screening" })).toBeTruthy();
    expect(await screen.findByText("Blood pressure")).toBeTruthy();
    expect(screen.queryByTestId("duplicate-warning")).toBeNull();

    await user.click(screen.getByRole("tab", { name: "Screenings" }));
    expect(await screen.findByTestId("screening-timeline")).toBeTruthy();
    await user.click(screen.getByRole("tab", { name: "Reviews" }));
    expect(await screen.findByTestId("patient-reviews")).toBeTruthy();
    await user.click(screen.getByRole("tab", { name: "Referrals & tasks" }));
    await waitFor(() =>
      expect(
        screen.queryByTestId("followup-timeline") ??
          screen.queryByText(
            "No referrals, follow-ups or review decisions for this synthetic patient",
          ),
      ).not.toBeNull(),
    );
  });

  it("DUPLICATE_IDENTITY_PAIR shows the warning with icon + text and the in-scope candidate", async () => {
    const { store } = await renderApp({ path: routes.patient(DUP_A.id), signIn: BETA });
    const warning = await screen.findByTestId("duplicate-warning");
    expect(warning.querySelector("svg")).not.toBeNull();
    expect(within(warning).getByText("Possible duplicate record")).toBeTruthy();
    expect(
      within(warning).getByText(
        "Possible duplicate record — verify identity before acting. Records are never merged automatically.",
      ),
    ).toBeTruthy();
    expect(await within(warning).findByRole("link", { name: DUP_B.displayName })).toHaveProperty(
      "href",
      expect.stringContaining(routes.patient(DUP_B.id)),
    );
    expect(within(warning).queryByRole("button")).toBeNull(); // no merge action
    // Nothing was merged or changed.
    const patients = await store.getAll<Patient>("patients");
    expect(patients.find((p) => p.id === DUP_A.id)?.duplicateCandidateIds).toEqual([DUP_B.id]);
    expect(patients.find((p) => p.id === DUP_B.id)).toBeDefined();
  });

  it("counts, but never names, a duplicate candidate outside the user's facilities", async () => {
    const store = createMemoryStoreAdapter();
    await createTestClinicalRepo(undefined, store);
    await store.put("patients", { ...DUP_A, duplicateCandidateIds: [DUP_B.id, WF01.id] });
    await renderApp({ path: routes.patient(DUP_A.id), signIn: BETA, store });
    const warning = await screen.findByTestId("duplicate-warning");
    expect(
      await within(warning).findByText("1 further candidate outside your facilities"),
    ).toBeTruthy();
    expect(warning.textContent).not.toContain(WF01.displayName);
    expect(within(warning).getByRole("link", { name: DUP_B.displayName })).toBeTruthy();
  });

  it("?tab=screenings opens the Screenings tab (CLN-06 correction-history link)", async () => {
    await renderApp({ path: routes.patient(WF01.id, "screenings"), signIn: CLINICIAN });
    const tab = await screen.findByRole("tab", { name: "Screenings" });
    expect(tab.getAttribute("aria-selected")).toBe("true");
  });
});
