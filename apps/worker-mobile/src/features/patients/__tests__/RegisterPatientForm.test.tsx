/**
 * HWM-04 registration form: validation in EN and RW (switching re-translates visible errors and
 * keeps the input), error summary + focus, pilot-age prompt, national ID unavailable, the
 * possible-matches sheet (use existing / register anyway → flagged) and the double-submit guard.
 */
import type { AuditEvent, Patient } from "@laif/domain";
import { FACILITY_IDS, PERSONA_IDS } from "@laif/mock-data";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { useEffect, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useSession } from "../../../session/useSession.ts";
import { routerLog } from "../../../test/router-stub.tsx";
import { renderShell, type ShellView } from "../../../test/shell-harness.tsx";
import { RegisterPatientScreen } from "../RegisterPatientScreen.tsx";

vi.mock("expo-router", () => import("../../../test/router-stub.tsx"));

const WORKER = PERSONA_IDS.chwAlpha1A;

function SignedIn({ children }: { children: ReactNode }) {
  const { status, signIn } = useSession();
  useEffect(() => {
    if (status === "signed_out") void signIn(WORKER, FACILITY_IDS.alpha1);
  }, [status, signIn]);
  return status === "signed_in" ? <>{children}</> : null;
}

const renderForm = async (initialName?: string): Promise<ShellView> => {
  const view = await renderShell(
    <SignedIn>
      <RegisterPatientScreen {...(initialName === undefined ? {} : { initialName })} />
    </SignedIn>,
    { readyTestId: "register-screen" },
  );
  await screen.findByTestId("register-form", {}, { timeout: 5000 });
  return view;
};

const input = (field: string) => screen.getByTestId<HTMLInputElement>(`field-${field}`);
const type = (field: string, value: string) =>
  fireEvent.change(input(field), { target: { value } });
const errorOf = (field: string) =>
  within(input(field).parentElement!).queryByTestId("field-error")?.textContent ?? null;
const chooseSex = (label: string) =>
  fireEvent.click(within(screen.getByTestId("field-sex")).getByRole("radio", { name: label }));
const save = () => fireEvent.click(screen.getByTestId("register-save"));
const switchTo = (language: "Ikinyarwanda" | "English") =>
  fireEvent.click(
    within(screen.getAllByTestId("language-switcher")[0]!).getByRole("radio", { name: language }),
  );

const patientsNamed = async (view: ShellView, name: string) =>
  (await view.store.getAll<Patient>("patients")).filter((p) => p.displayName === name);

beforeEach(() => {
  routerLog.length = 0;
});

describe("RegisterPatientForm (HWM-04)", () => {
  it("missing family name → field error in EN; switching to RW re-translates it and keeps the input", async () => {
    await renderForm();
    type("givenName", "Demo");
    type("dateOfBirth", "1980-01-02");
    chooseSex("Female");
    save();
    await waitFor(() => expect(errorOf("familyName")).toBe("This field is required."));
    expect(errorOf("givenName")).toBeNull();
    expect(screen.getByTestId("error-summary-title").textContent).toBe("1 field needs attention");
    // First invalid field focused.
    expect(document.activeElement).toBe(input("familyName"));

    switchTo("Ikinyarwanda");
    await waitFor(() => expect(errorOf("familyName")).toBe("Iki gice kigomba kuzuzwa."));
    expect(screen.getByTestId("error-summary-title").textContent).toBe(
      "Ahantu 1 hakeneye gukosorwa",
    );
    expect(input("givenName").value).toBe("Demo");
    expect(input("dateOfBirth").value).toBe("1980-01-02");
    switchTo("English");
    await waitFor(() => expect(errorOf("familyName")).toBe("This field is required."));
  });

  it("empty submit → every required field flagged, summary with count; nothing written", async () => {
    const view = await renderForm();
    const before = (await view.store.getAll("patients")).length;
    save();
    await waitFor(() =>
      expect(screen.getByTestId("error-summary-title").textContent).toBe("4 fields need attention"),
    );
    expect(errorOf("givenName")).toBe("This field is required.");
    expect(errorOf("dateOfBirth")).toBe("This field is required.");
    expect(
      within(screen.getByTestId("field-sex")).getByText("This field is required."),
    ).toBeTruthy();
    expect((await view.store.getAll("patients")).length).toBe(before);
  });

  it("validates name characters, future DOB, age range, estimated age and phone format", async () => {
    await renderForm();
    type("givenName", "Demo1");
    type("familyName", "Person");
    type("dateOfBirth", "2026-12-01");
    type("phone", "0991234");
    chooseSex("Male");
    save();
    await waitFor(() =>
      expect(errorOf("givenName")).toBe("Use letters, spaces, hyphens or apostrophes only."),
    );
    expect(errorOf("dateOfBirth")).toBe("The date cannot be in the future.");
    expect(errorOf("phone")).toBe("Enter a phone number in the format 07X XXX XXXX.");
    expect(input("phone").value).toBe("099 123 4");

    type("dateOfBirth", "1890-01-01");
    await waitFor(() =>
      expect(errorOf("dateOfBirth")).toBe("Age must be between 0 and 120 years."),
    );
    fireEvent.click(
      within(screen.getByTestId("field-birthMode")).getByRole("radio", { name: "Estimated age" }),
    );
    type("estimatedAge", "121");
    save();
    await waitFor(() =>
      expect(errorOf("estimatedAge")).toBe("Age must be between 0 and 120 years."),
    );
  });

  it("national ID lookup is disabled with the explanatory caption (no identity fabricated)", async () => {
    await renderForm();
    const row = screen.getByTestId("national-id-lookup");
    expect(row.getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByTestId("national-id-caption").textContent).toBe(
      "National identity service not connected in this demo",
    );
  });

  it("under-18 DOB → non-blocking pilot prompt; saves (offline) once despite a double tap", async () => {
    const view = await renderForm("Demo Youngperson");
    expect(input("givenName").value).toBe("Demo");
    expect(input("familyName").value).toBe("Youngperson");
    type("dateOfBirth", "2015-03-04");
    expect(await screen.findByTestId("pilot-age-warning")).toBeTruthy();
    expect(screen.getByText("The pilot screens adults — check the date of birth.")).toBeTruthy();
    chooseSex("Not recorded");
    type("villageLabel", "Demo Cell A");
    type("phone", "0780000001");
    await act(async () => {
      await view.repo().demo.setFaults({ offline: true });
    });
    save();
    save();
    await waitFor(() => expect(routerLog.some((e) => e.method === "replace")).toBe(true));
    const rows = await patientsNamed(view, "Demo Youngperson");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      dateOfBirth: "2015-03-04",
      sexOptional: "not_recorded",
      villageLabel: "Demo Cell A",
      syntheticPhone: "0780000001",
      identityStatus: "unverified",
    });
    expect(await view.repo().sync.list({ entityId: rows[0]!.id })).toHaveLength(1);
    expect(routerLog.filter((e) => e.method === "replace")).toEqual([
      {
        method: "replace",
        href: { pathname: "/patients/[patientId]", params: { patientId: rows[0]!.id } },
      },
    ]);
    expect(await screen.findByText("Saved on this device")).toBeTruthy();
  });

  it("near-duplicate → matches sheet with reasons; Register anyway stores needs_match_review + patient.match_flagged", async () => {
    const view = await renderForm();
    type("givenName", "Qorvoks");
    type("familyName", "Zelqarqo");
    type("dateOfBirth", "1981-12-11");
    chooseSex("Male");
    save();
    const sheet = await screen.findByTestId("possible-matches-sheet");
    expect(within(sheet).getByText("This patient may already exist")).toBeTruthy();
    expect(within(sheet).getByText("DEMO-P-0005")).toBeTruthy();
    expect(within(sheet).getByTestId("match-reasons").textContent).toBe(
      "Why: similar name, same date of birth, same sex",
    );
    expect(within(sheet).getByTestId("match-demo-note").textContent).toMatch(/not validated$/u);
    expect(await patientsNamed(view, "Qorvoks Zelqarqo")).toHaveLength(0);

    fireEvent.click(within(sheet).getByTestId("register-anyway"));
    await waitFor(() => expect(routerLog.some((e) => e.method === "replace")).toBe(true));
    const [flagged] = await patientsNamed(view, "Qorvoks Zelqarqo");
    expect(flagged?.identityStatus).toBe("needs_match_review");
    const actions = (await view.store.getAll<AuditEvent>("auditEvents"))
      .filter((e) => e.entityId === flagged!.id)
      .map((e) => e.action);
    expect(actions.sort()).toEqual(["patient.match_flagged", "patient.registered"]);
  });

  it("Use this patient → navigates to the existing record without writing", async () => {
    const view = await renderForm();
    type("givenName", "Qorvox");
    type("familyName", "Zelqarqo");
    type("dateOfBirth", "1981-12-11");
    chooseSex("Male");
    save();
    const sheet = await screen.findByTestId("possible-matches-sheet");
    const existing = (await view.store.getAll<Patient>("patients")).find(
      (p) => p.syntheticIdentifier === "DEMO-P-0005",
    )!;
    const ops = (await view.repo().sync.list()).length;
    fireEvent.click(within(sheet).getByTestId(`use-existing-${existing.id}`));
    expect(routerLog).toEqual([
      {
        method: "replace",
        href: { pathname: "/patients/[patientId]", params: { patientId: existing.id } },
      },
    ]);
    expect(await patientsNamed(view, "Qorvox Zelqarqo")).toHaveLength(1);
    expect((await view.repo().sync.list()).length).toBe(ops);
  });
});
