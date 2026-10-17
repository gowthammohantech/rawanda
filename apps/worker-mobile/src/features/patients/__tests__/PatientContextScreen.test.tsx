/**
 * HWM-04 patient context: in-scope open (header, history, follow-ups, New screening, audited
 * `patient.viewed`, Recent), the denied path for another facility / an id not on the device
 * (`access.denied`, no patient data rendered) and the `MATCH REVIEW` + `SAVED ON THIS DEVICE`
 * pills of a flagged offline registration.
 */
import type { AuditEvent, Patient } from "@laif/domain";
import { FACILITY_IDS, PERSONA_IDS } from "@laif/mock-data";
import { createMemoryStoreAdapter, type StoreAdapter } from "@laif/repositories";
import { createTestRepository } from "@laif/test-utils";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { useEffect, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import DeniedRoute from "../../../../app/(app)/denied.tsx";
import { recentPatientsKey } from "../../../data/recentPatients.ts";
import { useSession } from "../../../session/useSession.ts";
import { routerLog, searchParams } from "../../../test/router-stub.tsx";
import { renderShell } from "../../../test/shell-harness.tsx";
import { PatientContextScreen } from "../PatientContextScreen.tsx";

vi.mock("expo-router", () => import("../../../test/router-stub.tsx"));

const WORKER = PERSONA_IDS.chwAlpha1A;
const FACILITY = FACILITY_IDS.alpha1;

function SignedIn({ children }: { children: ReactNode }) {
  const { status, signIn } = useSession();
  useEffect(() => {
    if (status === "signed_out") void signIn(WORKER, FACILITY);
  }, [status, signIn]);
  return status === "signed_in" ? <>{children}</> : null;
}

const seededStore = async (): Promise<StoreAdapter> => {
  const store = createMemoryStoreAdapter();
  await createTestRepository({ appId: "worker", persona: WORKER, store });
  return store;
};

const renderContext = (patientId: string, store: StoreAdapter) =>
  renderShell(
    <SignedIn>
      <PatientContextScreen patientId={patientId} />
    </SignedIn>,
    { store },
  );

const audits = (store: StoreAdapter, action: string) =>
  store.getAll<AuditEvent>("auditEvents").then((all) => all.filter((e) => e.action === action));

beforeEach(() => {
  routerLog.length = 0;
  searchParams.current = {};
});

describe("PatientContextScreen (HWM-04)", () => {
  it("in scope: header micro-labels, history, open follow-ups, New screening; audits patient.viewed", async () => {
    const store = await seededStore();
    const followUp = (
      await store.getAll<{ id: string; patientId: string; status: string }>("followUps")
    ).find((f) => f.status === "assigned")!;
    const patient = (await store.get<Patient>("patients", followUp.patientId))!;
    await renderContext(patient.id, store);
    await screen.findByTestId("patient-context-screen", {}, { timeout: 5000 });

    expect(screen.getByTestId("patient-name").textContent).toBe(patient.displayName);
    expect(screen.getByTestId("patient-identifier-value").textContent).toBe(
      patient.syntheticIdentifier,
    );
    const card = screen.getByTestId("patient-header-card");
    for (const label of ["Identifier", "Age", "Facility"]) {
      expect(within(card).getByText(label)).toBeTruthy();
    }
    expect(screen.getByTestId("patient-facility").textContent).toBe("Demo Health Centre Alpha-1");
    expect(screen.getByTestId("patient-sync-pill").textContent).toBe("Synced");
    expect(screen.queryByTestId("patient-match-review")).toBeNull();

    const row = await screen.findByTestId(`patient-follow-up-${followUp.id}`);
    fireEvent.click(row);
    fireEvent.click(screen.getByTestId("new-screening"));
    expect(routerLog.map((e) => e.href)).toEqual([
      { pathname: "/tasks/[followUpId]", params: { followUpId: followUp.id } },
      { pathname: "/screenings/new", params: { patientId: patient.id } },
    ]);
    expect(screen.getByTestId("section-screenings")).toBeTruthy();

    await waitFor(async () =>
      expect((await audits(store, "patient.viewed")).map((e) => e.entityId)).toEqual([patient.id]),
    );
    expect(JSON.parse(window.localStorage.getItem(recentPatientsKey(FACILITY)) ?? "[]")).toEqual([
      patient.id,
    ]);
  });

  it("another facility's patient → /denied, access.denied written, no patient data rendered", async () => {
    const store = await seededStore();
    const template = (await store.getAll<Patient>("patients"))[0]!;
    const foreign: Patient = {
      ...template,
      id: "22222222-2222-4222-8222-222222222222" as Patient["id"],
      syntheticIdentifier: "DEMO-P-9902",
      displayName: "Foreign Beta-Person",
      facilityId: FACILITY_IDS.beta1,
      districtId: "dist-beta" as Patient["districtId"],
    };
    await store.put("patients", foreign);
    await renderContext(foreign.id, store);
    await waitFor(() =>
      expect(routerLog).toEqual([
        { method: "replace", href: { pathname: "/denied", params: { reason: "patient" } } },
      ]),
    );
    expect(screen.queryByText("Foreign Beta-Person")).toBeNull();
    expect(screen.queryByText("DEMO-P-9902")).toBeNull();
    expect(screen.queryByTestId("patient-context-screen")).toBeNull();
    const denied = await audits(store, "access.denied");
    expect(denied).toHaveLength(1);
    expect(denied[0]).toMatchObject({ entityType: "patient", entityId: foreign.id });
    expect(await audits(store, "patient.viewed")).toHaveLength(0);
  });

  it("an id not on this device → /denied + access.denied", async () => {
    const store = await seededStore();
    await renderContext("not-on-this-device", store);
    await waitFor(() => expect(routerLog).toHaveLength(1));
    expect(routerLog[0]).toEqual({
      method: "replace",
      href: { pathname: "/denied", params: { reason: "patient" } },
    });
    expect(await audits(store, "access.denied")).toHaveLength(1);
  });

  it("denied screen (reason=patient) shows ACCESS DENIED and the patient copy only", async () => {
    searchParams.current = { reason: "patient" };
    await renderShell(
      <SignedIn>
        <DeniedRoute />
      </SignedIn>,
      { readyTestId: "denied-screen" },
    );
    expect(screen.getByTestId("access-denied-label").textContent).toBe("Access denied");
    expect(screen.getByText("This patient is not available")).toBeTruthy();
  });

  it("flagged offline registration → MATCH REVIEW and SAVED ON THIS DEVICE pills + note", async () => {
    const store = createMemoryStoreAdapter();
    const t = await createTestRepository({
      appId: "worker",
      persona: WORKER,
      store,
      faults: { offline: true },
    });
    const flagged = await t.repo.registerPatient(
      {
        givenName: "Qorvox",
        familyName: "Zelqarqo",
        dateOfBirth: "1981-12-11",
        sex: "male",
        facilityId: FACILITY,
        matchDecision: "register_anyway_flagged",
      },
      t.key(),
    );
    await renderContext(flagged.data.id, store);
    await screen.findByTestId("patient-context-screen", {}, { timeout: 5000 });
    expect(screen.getByTestId("patient-match-review").textContent).toBe("Match review");
    await waitFor(() =>
      expect(screen.getByTestId("patient-sync-pill").textContent).toBe("Saved on this device"),
    );
    expect(screen.getByTestId("patient-match-note")).toBeTruthy();
    expect(screen.getByTestId("patient-identifier-value").textContent).toMatch(/^DEMO-/u);
    expect(await screen.findByTestId("screenings-empty")).toBeTruthy();
  });
});
