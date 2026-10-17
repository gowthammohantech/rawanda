/**
 * HWM-04 Find tab: Recent (empty → touched patients), debounced facility-scoped search with
 * rows (mono DEMO identifier, age, sex), minimum length, empty state with the prefilled
 * Register CTA, offline note, and EN ⇄ RW.
 */
import type { Patient } from "@laif/domain";
import { FACILITY_IDS, PERSONA_IDS } from "@laif/mock-data";
import { createMemoryStoreAdapter } from "@laif/repositories";
import { createTestRepository } from "@laif/test-utils";
import { fireEvent, screen, within } from "@testing-library/react";
import { useEffect, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { recentPatientsKey } from "../../../data/recentPatients.ts";
import { useSession } from "../../../session/useSession.ts";
import { routerLog } from "../../../test/router-stub.tsx";
import { renderShell } from "../../../test/shell-harness.tsx";
import { FindPatientScreen } from "../FindPatientScreen.tsx";

vi.mock("expo-router", () => import("../../../test/router-stub.tsx"));

const WORKER = PERSONA_IDS.chwAlpha1A;

function SignedIn({ children }: { children: ReactNode }) {
  const { status, signIn } = useSession();
  useEffect(() => {
    if (status === "signed_out") void signIn(WORKER, FACILITY_IDS.alpha1);
  }, [status, signIn]);
  return status === "signed_in" ? <>{children}</> : null;
}

const renderFind = () =>
  renderShell(
    <SignedIn>
      <FindPatientScreen />
    </SignedIn>,
    { readyTestId: "find-screen" },
  );

const search = (value: string) =>
  fireEvent.change(screen.getByTestId("patient-search-input"), { target: { value } });

beforeEach(() => {
  routerLog.length = 0;
});

describe("FindPatientScreen (HWM-04)", () => {
  it("initial: Recent empty + Register; 'dem' lists only this facility's patients by identifier prefix", async () => {
    const view = await renderFind();
    expect(await screen.findByTestId("recent-empty")).toBeTruthy();
    expect(screen.getByTestId("find-scope-note").textContent).toBe(
      "Patients of Demo Health Centre Alpha-1 saved on this device",
    );
    search("d");
    expect(await screen.findByText("Type at least 2 characters to search")).toBeTruthy();
    search("dem");
    const count = await screen.findByTestId("search-count", {}, { timeout: 3000 });
    const local = (await view.store.getAll<Patient>("patients")).filter(
      (p) => p.facilityId === FACILITY_IDS.alpha1,
    );
    expect(count.textContent).toBe(`${local.length} patients found`);
    const ids = screen.getAllByTestId("patient-identifier").map((n) => n.textContent);
    expect(ids.every((id) => id?.startsWith("DEMO-"))).toBe(true);

    const row = screen.getByTestId(
      `patient-row-${local.find((p) => p.syntheticIdentifier === "DEMO-P-0005")!.id}`,
    );
    expect(row.getAttribute("aria-label")).toBe("Qorvox Zelqarqo, DEMO-P-0005, 44 years, Male");
    fireEvent.click(row);
    expect(routerLog.at(-1)?.href).toEqual({
      pathname: "/patients/[patientId]",
      params: { patientId: local.find((p) => p.syntheticIdentifier === "DEMO-P-0005")!.id },
    });
  });

  it("no match → empty state + Register CTA prefilled with the query", async () => {
    await renderFind();
    search("Zzyzx Nobody");
    expect(
      await screen.findByText(
        "No patient matches 'Zzyzx Nobody' on this device",
        {},
        { timeout: 3000 },
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByTestId("register-prefilled"));
    expect(routerLog.at(-1)?.href).toEqual({
      pathname: "/patients/register",
      params: { name: "Zzyzx Nobody" },
    });
    fireEvent.click(screen.getByTestId("register-new-patient"));
    expect(routerLog.at(-1)?.href).toBe("/patients/register");
  });

  it("Recent shows patients touched on this device (stale ids skipped); offline note; RW copy", async () => {
    const store = createMemoryStoreAdapter();
    await createTestRepository({
      appId: "worker",
      persona: WORKER,
      store,
      faults: { offline: true },
    });
    const patient = (await store.getAll<Patient>("patients")).find(
      (p) => p.syntheticIdentifier === "DEMO-P-0005",
    )!;
    window.localStorage.setItem(
      recentPatientsKey(FACILITY_IDS.alpha1),
      JSON.stringify([patient.id, "gone"]),
    );
    await renderShell(
      <SignedIn>
        <FindPatientScreen />
      </SignedIn>,
      { readyTestId: "find-screen", store },
    );
    const recent = await screen.findByTestId("recent-patients");
    expect(within(recent).getAllByRole("button")).toHaveLength(1);
    expect(within(recent).getByText("Qorvox Zelqarqo")).toBeTruthy();
    expect((await screen.findByTestId("find-offline-note")).textContent).toBe(
      "Search covers patients saved on this device",
    );
    // Offline search is fully functional (local store only).
    search("qorvox");
    expect(await screen.findByText("1 patient found", {}, { timeout: 3000 })).toBeTruthy();

    fireEvent.click(
      within(screen.getAllByTestId("language-switcher")[0]!).getByRole("radio", {
        name: "Ikinyarwanda",
      }),
    );
    expect(await screen.findByText("Umurwayi 1 wabonetse")).toBeTruthy();
    expect(screen.getByText("Andika umurwayi mushya")).toBeTruthy();
  });
});
