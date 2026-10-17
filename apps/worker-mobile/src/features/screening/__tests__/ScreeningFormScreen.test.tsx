/**
 * HWM-05 screening form: field errors in EN / RW (switching re-translates, values kept), the
 * error summary + tap-to-focus, typing-check wording, autosave that survives a restart (new
 * shell on the same store), discard with confirmation + `screening.draft_discarded`, drafts
 * never in the sync queue, the Screen tab, `/screenings/new` create / resume and Find picker mode.
 */
import type { AuditEvent, Patient, Screening, SyncOperation } from "@laif/domain";
import { FACILITY_IDS, PERSONA_IDS } from "@laif/mock-data";
import { createMemoryStoreAdapter, type StoreAdapter } from "@laif/repositories";
import { createTestRepository } from "@laif/test-utils";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { useEffect, useState, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useRepository } from "../../../providers.tsx";
import { useSession } from "../../../session/useSession.ts";
import { routerLog } from "../../../test/router-stub.tsx";
import { renderShell } from "../../../test/shell-harness.tsx";
import { FindPatientScreen } from "../../patients/FindPatientScreen.tsx";
import { NewScreeningScreen } from "../NewScreeningScreen.tsx";
import { ScreeningFormScreen } from "../ScreeningFormScreen.tsx";
import { ScreenTab } from "../ScreenTab.tsx";

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

/** Creates a fresh draft for `patientId` as the signed-in worker, then renders the form. */
function WithNewDraft({
  patientId,
  onDraft,
}: {
  patientId: string;
  onDraft: (id: string) => void;
}) {
  const repo = useRepository();
  const [draftId, setDraftId] = useState<string | null>(null);
  useEffect(() => {
    void repo.saveScreeningDraft({ patientId }, crypto.randomUUID()).then((r) => {
      onDraft(r.data.id);
      setDraftId(r.data.id);
    });
  }, [repo, patientId, onDraft]);
  return draftId === null ? null : <ScreeningFormScreen draftId={draftId} />;
}

const seededStore = async (): Promise<StoreAdapter> => {
  const store = createMemoryStoreAdapter();
  await createTestRepository({ appId: "worker", persona: WORKER, store });
  return store;
};

const draftsOf = async (store: StoreAdapter) =>
  (await store.getAll<Screening>("screenings")).filter(
    (s) => s.status === "draft" && s.workerId === WORKER,
  );

/** An alpha1 patient without a draft on the device. */
const freePatient = async (store: StoreAdapter): Promise<Patient> => {
  const drafted = new Set((await draftsOf(store)).map((d) => d.patientId));
  const patient = (await store.getAll<Patient>("patients")).find(
    (p) => p.facilityId === FACILITY && !drafted.has(p.id),
  );
  if (!patient) throw new Error("no free patient");
  return patient;
};

const ready = () => screen.findByTestId("screening-form-screen", {}, { timeout: 8000 });

async function renderNewForm(store?: StoreAdapter) {
  const s = store ?? (await seededStore());
  const patient = await freePatient(s);
  const ids: string[] = [];
  const view = await renderShell(
    <SignedIn>
      <WithNewDraft patientId={patient.id} onDraft={(id) => ids.push(id)} />
    </SignedIn>,
    { store: s },
  );
  await ready();
  return { view, store: s, patient, draftId: () => ids[0]! };
}

const input = (field: string) => screen.getByTestId<HTMLInputElement>(`field-${field}`);
const type = (field: string, value: string) =>
  fireEvent.change(input(field), { target: { value } });
/** Error under a control: text inputs sit one row below the Field frame; pickers directly. */
const errorOf = (field: string) => {
  const levels = field === "glucoseUnit" || field === "glucoseContext" ? 1 : 2;
  let node: HTMLElement = input(field);
  for (let i = 0; i < levels; i += 1) node = node.parentElement!;
  return within(node).queryByTestId("field-error")?.textContent ?? null;
};
const choose = (field: string, label: string) =>
  fireEvent.click(within(input(field)).getByRole("radio", { name: label }));
const review = () => fireEvent.click(screen.getByTestId("screening-review"));
const switchTo = (language: "Ikinyarwanda" | "English") =>
  fireEvent.click(
    within(screen.getAllByTestId("language-switcher")[0]!).getByRole("radio", { name: language }),
  );
const audits = (store: StoreAdapter, action: string) =>
  store.getAll<AuditEvent>("auditEvents").then((all) => all.filter((e) => e.action === action));

beforeEach(() => {
  routerLog.length = 0;
});

describe("ScreeningFormScreen (HWM-05)", () => {
  it("glucose without unit/context blocks Review with field errors; EN⇄RW re-translates, values kept", async () => {
    await renderNewForm();
    expect(screen.getByTestId("patient-mini-card")).toBeTruthy();
    // Unit and context start unselected (no default).
    for (const radio of within(input("glucoseUnit")).getAllByRole("radio")) {
      expect(radio.getAttribute("aria-checked")).toBe("false");
    }
    type("systolic", "128");
    type("diastolic", "82");
    type("glucoseValue", "7,8");
    review();
    await waitFor(() => expect(errorOf("glucoseUnit")).toBe("Select a unit."));
    expect(errorOf("glucoseContext")).toBe(
      "Select whether the person was fasting, or choose “Not recorded”.",
    );
    expect(errorOf("systolic")).toBeNull();
    expect(screen.getByTestId("error-summary-title").textContent).toBe("2 fields need attention");
    expect(screen.getByTestId("screening-review").getAttribute("aria-disabled")).toBe("true");
    expect(routerLog).toEqual([]);

    switchTo("Ikinyarwanda");
    await waitFor(() => expect(errorOf("glucoseUnit")).toBe("Hitamo igipimo (unit)."));
    expect(errorOf("glucoseContext")).toBe(
      "Hitamo niba yari atariye, cyangwa uhitemo “Ntibyanditswe”.",
    );
    expect(screen.getByTestId("error-summary-title").textContent).toBe(
      "Ahantu 2 hakeneye gukosorwa",
    );
    expect(input("systolic").value).toBe("128");
    expect(input("glucoseValue").value).toBe("7,8");
    switchTo("English");
    await waitFor(() => expect(errorOf("glucoseUnit")).toBe("Select a unit."));

    choose("glucoseUnit", "millimoles per litre");
    choose("glucoseContext", "Not fasting");
    await waitFor(() => expect(screen.queryByTestId("error-summary")).toBeNull());
    expect(errorOf("glucoseUnit")).toBeNull();
    review();
    await waitFor(() =>
      expect(routerLog).toContainEqual({
        method: "push",
        href: {
          pathname: "/screenings/draft/[draftId]/review",
          params: { draftId: expect.any(String) as unknown },
        },
      }),
    );
  });

  it("systolic ≤ diastolic and out-of-range → 'check for typing errors' wording, never diagnostic", async () => {
    await renderNewForm();
    type("systolic", "90");
    type("diastolic", "95");
    review();
    await waitFor(() =>
      expect(errorOf("diastolic")).toBe("Diastolic must be lower than systolic."),
    );
    type("systolic", "300");
    await waitFor(() =>
      expect(errorOf("systolic")).toBe(
        "Outside the expected entry range (60–260 mmHg). Check for typing errors.",
      ),
    );
    type("systolic", "120");
    type("diastolic", "80");
    type("glucoseValue", "700");
    choose("glucoseUnit", "milligrams per decilitre");
    choose("glucoseContext", "Fasting");
    await waitFor(() =>
      expect(errorOf("glucoseValue")).toBe(
        "Outside the expected entry range (18–630 mg/dL). Check for typing errors.",
      ),
    );
    expect(errorOf("diastolic")).toBeNull();
    const text = screen.getByTestId("screening-form-screen").textContent ?? "";
    expect(text).not.toMatch(/\bhigh\b|abnormal|diagnos(is|e)d/i);
    expect(screen.getByTestId("entry-range-note").textContent).toContain(
      "DEMO_RULE_NOT_CLINICALLY_VALIDATED",
    );
    // Accessible labels include the unit.
    expect(input("systolic").getAttribute("aria-label")).toBe(
      "Systolic, millimetres of mercury, Required",
    );
  });

  it("error summary: count + links that focus the field", async () => {
    await renderNewForm();
    review();
    await waitFor(() =>
      expect(screen.getByTestId("error-summary-title").textContent).toBe("2 fields need attention"),
    );
    // First invalid field focused.
    expect(document.activeElement).toBe(input("systolic"));
    const link = screen.getByTestId("error-link-diastolic");
    fireEvent.click(link);
    await waitFor(() => expect(document.activeElement).toBe(input("diastolic")));
  });

  it("autosaves on the device (no sync op) and the values survive a restart", async () => {
    const { view, store, draftId } = await renderNewForm();
    type("systolic", "141");
    type("glucoseValue", "6.4");
    choose("glucoseUnit", "millimoles per litre");
    await waitFor(
      () =>
        expect(screen.getByTestId("draft-status").textContent).toMatch(
          /^Draft saved on this device · \d{2}:\d{2}$/,
        ),
      { timeout: 4000 },
    );
    const saved = await store.get<Screening>("screenings", draftId());
    expect(saved).toMatchObject({ status: "draft", systolic: 141, glucoseValue: 6.4 });
    expect(saved?.glucoseUnit).toBe("mmol/L");
    expect(saved?.glucoseContext).toBeNull();
    // Drafts are never queued for sync.
    const ops = await store.getAll<SyncOperation>("syncOperations");
    expect(ops.filter((op) => op.entityId === draftId() || op.entityType === "screening")).toEqual(
      [],
    );
    // Created audited once (draft_saved with no `before`), not one event per keystroke.
    const created = (await audits(store, "screening.draft_saved")).filter(
      (e) => e.entityId === draftId(),
    );
    expect(created.length).toBeGreaterThanOrEqual(1);
    expect(created.length).toBeLessThanOrEqual(3);

    // "Kill" the app: unmount everything, boot a new shell on the same store.
    view.unmount();
    await renderShell(
      <SignedIn>
        <ScreeningFormScreen draftId={draftId()} />
      </SignedIn>,
      { store },
    );
    await ready();
    expect(input("systolic").value).toBe("141");
    expect(input("glucoseValue").value).toBe("6.4");
    expect(
      within(input("glucoseUnit"))
        .getByRole("radio", { name: "millimoles per litre" })
        .getAttribute("aria-checked"),
    ).toBe("true");
    expect(screen.getByTestId("draft-status").textContent).toMatch(/^Draft saved on this device/);
  });

  it("discard needs confirmation and writes screening.draft_discarded", async () => {
    const { store, draftId } = await renderNewForm();
    fireEvent.click(screen.getByTestId("draft-options"));
    fireEvent.click(await screen.findByTestId("discard-draft"));
    const sheet = await screen.findByTestId("discard-confirm");
    expect(sheet.textContent).toContain("Discard this draft?");
    expect(await store.get("screenings", draftId())).toBeDefined();
    fireEvent.click(within(sheet).getByRole("button", { name: "Discard draft" }));
    await waitFor(async () => expect(await store.get("screenings", draftId())).toBeUndefined());
    const events = (await audits(store, "screening.draft_discarded")).filter(
      (e) => e.entityId === draftId(),
    );
    expect(events.length).toBe(1);
    await waitFor(() => expect(routerLog).toContainEqual({ method: "replace", href: "/screen" }));
  });

  it("a draft no longer on the device → not-found state", async () => {
    await renderShell(
      <SignedIn>
        <ScreeningFormScreen draftId="screening-missing" />
      </SignedIn>,
      { store: await seededStore() },
    );
    await screen.findByTestId("screening-draft-missing", {}, { timeout: 8000 });
    fireEvent.click(screen.getByTestId("back-to-screen"));
    expect(routerLog).toContainEqual({ method: "replace", href: "/screen" });
  });
});

describe("Screen tab + /screenings/new (HWM-05)", () => {
  it("lists drafts on this device with completeness; Resume and Choose patient navigate", async () => {
    const store = await seededStore();
    const [draft] = await draftsOf(store);
    await renderShell(
      <SignedIn>
        <ScreenTab />
      </SignedIn>,
      { store },
    );
    const list = await screen.findByTestId("screen-drafts", {}, { timeout: 8000 });
    expect(screen.getByTestId("drafts-label").textContent).toBe("DRAFTS ON THIS DEVICE");
    const row = within(list).getByTestId(`screen-draft-${draft!.id}`);
    expect(within(row).getByTestId("draft-completeness").textContent).toMatch(/^\d of 5 fields$/);
    fireEvent.click(within(row).getByTestId(`resume-${draft!.id}`));
    expect(routerLog).toContainEqual({
      method: "push",
      href: { pathname: "/screenings/draft/[draftId]", params: { draftId: draft!.id } },
    });
    fireEvent.click(screen.getByTestId("choose-patient"));
    expect(routerLog).toContainEqual({
      method: "push",
      href: { pathname: "/patients", params: { mode: "pick" } },
    });
  });

  it("empty: 'No drafts. Choose a patient to start.'", async () => {
    const store = await seededStore();
    for (const d of await draftsOf(store)) {
      await store.transaction(async (tx) => tx.delete("screenings", d.id));
    }
    await renderShell(
      <SignedIn>
        <ScreenTab />
      </SignedIn>,
      { store },
    );
    const empty = await screen.findByTestId("drafts-empty", {}, { timeout: 8000 });
    expect(empty.textContent).toContain("No drafts. Choose a patient to start.");
  });

  it("new: no draft → creates one (measuredAt = demo now, audited) and replaces to the form", async () => {
    const store = await seededStore();
    const patient = await freePatient(store);
    await renderShell(
      <SignedIn>
        <NewScreeningScreen patientId={patient.id} />
      </SignedIn>,
      { store },
    );
    await waitFor(() => expect(routerLog.some((e) => e.method === "replace")).toBe(true), {
      timeout: 8000,
    });
    const created = (await draftsOf(store)).filter((d) => d.patientId === patient.id);
    expect(created.length).toBe(1);
    expect(created[0]).toMatchObject({ systolic: null, glucoseUnit: null, glucoseContext: null });
    expect(created[0]!.measuredAt).toMatch(/^2026-10-14T/);
    expect(routerLog).toContainEqual({
      method: "replace",
      href: { pathname: "/screenings/draft/[draftId]", params: { draftId: created[0]!.id } },
    });
    const events = (await audits(store, "screening.draft_saved")).filter(
      (e) => e.entityId === created[0]!.id,
    );
    expect(events.length).toBe(1);
  });

  it("new: existing draft → 'Resume draft from …?' Resume / Start new", async () => {
    const store = await seededStore();
    const [draft] = await draftsOf(store);
    await renderShell(
      <SignedIn>
        <NewScreeningScreen patientId={draft!.patientId} />
      </SignedIn>,
      { store },
    );
    const prompt = await screen.findByTestId("resume-prompt", {}, { timeout: 8000 });
    expect(prompt.textContent).toMatch(/Resume draft from \d{2}:\d{2}\?/);
    fireEvent.click(screen.getByTestId("resume-draft"));
    expect(routerLog).toContainEqual({
      method: "replace",
      href: { pathname: "/screenings/draft/[draftId]", params: { draftId: draft!.id } },
    });
    routerLog.length = 0;
    fireEvent.click(screen.getByTestId("start-new-draft"));
    await waitFor(() => expect(routerLog.length).toBe(1));
    const mine = (await draftsOf(store)).filter((d) => d.patientId === draft!.patientId);
    expect(mine.length).toBe(2);
  });

  it("new: patient not in scope / not on this device → /denied, no draft", async () => {
    const store = await seededStore();
    const other = { id: "patient-other-facility" };
    const before = (await draftsOf(store)).length;
    await renderShell(
      <SignedIn>
        <NewScreeningScreen patientId={other.id} />
      </SignedIn>,
      { store },
    );
    await waitFor(
      () =>
        expect(routerLog).toContainEqual({
          method: "replace",
          href: { pathname: "/denied", params: { reason: "patient" } },
        }),
      { timeout: 8000 },
    );
    expect((await draftsOf(store)).length).toBe(before);
  });

  it("Find picker mode: banner, choosing a patient opens /screenings/new", async () => {
    const store = await seededStore();
    const patient = await freePatient(store);
    await renderShell(
      <SignedIn>
        <FindPatientScreen pick />
      </SignedIn>,
      { store },
    );
    await screen.findByTestId("find-pick-banner", {}, { timeout: 8000 });
    fireEvent.change(screen.getByTestId("patient-search-input"), {
      target: { value: patient.syntheticIdentifier },
    });
    const results = await screen.findByTestId("search-results");
    await act(async () => {
      await new Promise((r) => setTimeout(r, 400));
    });
    const rows = await within(results).findAllByRole("button");
    fireEvent.click(rows[0]!);
    expect(routerLog).toContainEqual({
      method: "push",
      href: { pathname: "/screenings/new", params: { patientId: patient.id } },
    });
  });
});
