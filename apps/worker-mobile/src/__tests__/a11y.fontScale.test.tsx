/**
 * HWM-10 accessibility pass: every worker screen rendered at font scale 2.0 (app multiplier 2 via
 * `DisplayPrefsProvider` + OS `PixelRatio.getFontScale() = 2`):
 * - the DemoBanner is shown;
 * - no text is single-line truncated (nowrap + ellipsis) or clipped by a fixed height — rows wrap;
 * - every pressable has a role, an accessible (translated) name — icon-only controls included —
 *   and a hit area ≥ 44 × 44 pt;
 * - status pills expose their full text ("Status: …").
 */
import { enResources } from "@laif/i18n";
import { FACILITY_IDS, PERSONA_IDS } from "@laif/mock-data";
import { DisplayPrefsProvider, minTouchTarget } from "@laif/ui-native";
import { screen, waitFor } from "@testing-library/react";
import { useEffect, type ReactElement, type ReactNode } from "react";
import { PixelRatio } from "react-native";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { DeniedScreen } from "../features/auth/DeniedScreen.tsx";
import { SignInScreen } from "../features/auth/SignInScreen.tsx";
import { RecordAttemptScreen } from "../features/followup/RecordAttemptForm.tsx";
import { RecordOutcomeScreen } from "../features/followup/RecordOutcomeForm.tsx";
import { HomeScreen } from "../features/home/HomeScreen.tsx";
import { FindPatientScreen } from "../features/patients/FindPatientScreen.tsx";
import { PatientContextScreen } from "../features/patients/PatientContextScreen.tsx";
import { RegisterPatientScreen } from "../features/patients/RegisterPatientScreen.tsx";
import { RevokedDeviceScreen } from "../features/revocation/RevokedDeviceScreen.tsx";
import { ScreeningDetailScreen } from "../features/screening/ScreeningDetailScreen.tsx";
import { ScreeningFormScreen } from "../features/screening/ScreeningFormScreen.tsx";
import { ScreenTab } from "../features/screening/ScreenTab.tsx";
import { ActivityLogScreen } from "../features/settings/ActivityLogScreen.tsx";
import { NetworkSimulationScreen } from "../features/settings/NetworkSimulationScreen.tsx";
import { ResetDemoScreen } from "../features/settings/ResetDemoScreen.tsx";
import { SettingsScreen } from "../features/settings/SettingsScreen.tsx";
import { SyncCenterScreen } from "../features/sync/SyncCenterScreen.tsx";
import { TaskDetailScreen } from "../features/tasks/TaskDetailScreen.tsx";
import { TasksScreen } from "../features/tasks/TasksScreen.tsx";
import { useSession } from "../session/useSession.ts";
import { renderShell } from "../test/shell-harness.tsx";

vi.mock("expo-router", () => import("../test/router-stub.tsx"));

// Full shell renders: generous per-test budget when the machine is loaded.
vi.setConfig({ testTimeout: 30_000 });

const T = { timeout: 10_000 };
const SCALE = 2;
const BANNER = enResources.demo.banner;
const PRESSABLE_ROLES = ["button", "checkbox", "radio", "switch", "tab", "link"] as const;
const noop = () => undefined;

function SignedIn({ children }: { children: ReactNode }) {
  const { status, signIn } = useSession();
  useEffect(() => {
    if (status === "signed_out") void signIn(PERSONA_IDS.chwAlpha1A, FACILITY_IDS.alpha1);
  }, [status, signIn]);
  return status === "signed_in" ? <>{children}</> : null;
}

type Ids = { patient: string; task: string; draft: string; screening: string };
type Case = [name: string, ui: (ids: Ids) => ReactElement, ready: string, signedIn?: boolean];

const CASES: Case[] = [
  ["Sign-in", () => <SignInScreen onPersonaChosen={noop} />, "sign-in-screen", false],
  ["Today", () => <HomeScreen />, "today-screen"],
  ["Find", () => <FindPatientScreen />, "find-screen"],
  ["Screen tab", () => <ScreenTab />, "screen-screen"],
  ["Tasks", () => <TasksScreen />, "tasks-screen"],
  ["Sync", () => <SyncCenterScreen />, "sync-screen"],
  ["Settings", () => <SettingsScreen onSignedOut={noop} onOpenNetwork={noop} />, "settings-screen"],
  ["Network simulation", () => <NetworkSimulationScreen />, "network-simulation-screen"],
  ["Activity log", () => <ActivityLogScreen />, "activity-log-screen"],
  ["Reset demo", () => <ResetDemoScreen onDone={noop} />, "reset-demo-screen"],
  ["Revoked", () => <RevokedDeviceScreen onRestored={noop} />, "revoked-screen"],
  ["Denied", () => <DeniedScreen onBack={noop} />, "denied-screen"],
  [
    "Patient context",
    (ids) => <PatientContextScreen patientId={ids.patient} />,
    "patient-context-screen",
  ],
  ["Register patient", () => <RegisterPatientScreen />, "register-screen"],
  ["Screening form", (ids) => <ScreeningFormScreen draftId={ids.draft} />, "screening-form-screen"],
  [
    "Screening detail",
    (ids) => <ScreeningDetailScreen screeningId={ids.screening} />,
    "screening-detail-screen",
  ],
  ["Task detail", (ids) => <TaskDetailScreen followUpId={ids.task} />, "task-detail-screen"],
  ["Record attempt", (ids) => <RecordAttemptScreen followUpId={ids.task} />, "attempt-screen"],
  ["Record outcome", (ids) => <RecordOutcomeScreen followUpId={ids.task} />, "outcome-screen"],
];

function px(value: string): number {
  const n = parseFloat(value);
  return Number.isNaN(n) ? 0 : n;
}

function clippedTexts(root: HTMLElement): string[] {
  const out: string[] = [];
  for (const el of Array.from(root.querySelectorAll<HTMLElement>("div, span"))) {
    const text = el.textContent?.trim() ?? "";
    if (text === "" || el.children.length > 0) continue;
    const style = getComputedStyle(el);
    const singleLine = style.whiteSpace === "nowrap" && style.textOverflow === "ellipsis";
    const fixedHeight =
      style.height !== "" && style.height !== "auto" && style.overflow === "hidden";
    if (singleLine || fixedHeight) out.push(text);
  }
  return out;
}

function inaccessiblePressables(root: HTMLElement): string[] {
  const problems: string[] = [];
  for (const role of PRESSABLE_ROLES) {
    for (const el of Array.from(root.querySelectorAll<HTMLElement>(`[role="${role}"]`))) {
      const label = (el.getAttribute("aria-label") ?? el.textContent ?? "").trim();
      const style = getComputedStyle(el);
      const width = Math.max(px(style.minWidth), px(style.width));
      const height = Math.max(px(style.minHeight), px(style.height));
      const id = el.getAttribute("data-testid") ?? label;
      if (label === "") problems.push(`${role} ${id}: no accessible name`);
      if (width < minTouchTarget || height < minTouchTarget) {
        problems.push(`${role} ${id}: ${width}×${height}`);
      }
    }
  }
  return problems;
}

/** Ids of the signed-in worker's first patient / open task, read from a seeded store. */
async function workerIds(): Promise<Ids> {
  const probe = await renderShell(<span data-testid="probe" />, { readyTestId: "probe" });
  const patient = (await probe.store.getAll<{ id: string; facilityId: string }>("patients")).find(
    (p) => p.facilityId === FACILITY_IDS.alpha1,
  )!;
  const task = (
    await probe.store.getAll<{ id: string; assignedWorkerId: string; status: string }>("followUps")
  ).find((f) => f.assignedWorkerId === PERSONA_IDS.chwAlpha1A && f.status === "assigned")!;
  type Row = { id: string; status: string; workerId: string; facilityId: string };
  const screenings = await probe.store.getAll<Row>("screenings");
  const draft = screenings.find(
    (r) => r.status === "draft" && r.workerId === PERSONA_IDS.chwAlpha1A,
  )!;
  const submitted = screenings.find(
    (r) => r.status !== "draft" && r.facilityId === FACILITY_IDS.alpha1,
  )!;
  probe.unmount();
  return { patient: patient.id, task: task.id, draft: draft.id, screening: submitted.id };
}

describe(`font scale ${SCALE}.0 + touch targets + labels (HWM-10 task 7)`, () => {
  let ids: Ids;
  beforeAll(async () => {
    ids = await workerIds();
  });
  beforeEach(() => {
    vi.spyOn(PixelRatio, "getFontScale").mockReturnValue(SCALE);
  });
  afterEach(() => vi.restoreAllMocks());

  it.each(CASES)("%s", async (_name, ui, ready, signedIn = true) => {
    const element = ui(ids);
    const view = await renderShell(signedIn ? <SignedIn>{element}</SignedIn> : element, {
      wrap: (app) => (
        <DisplayPrefsProvider value={{ textScale: SCALE, highContrast: false }}>
          {app}
        </DisplayPrefsProvider>
      ),
    });
    await screen.findAllByTestId(ready, {}, T);
    await waitFor(() => expect(screen.queryAllByTestId("loading-state")).toHaveLength(0), T).catch(
      () => undefined,
    );

    expect(screen.getAllByText(BANNER).length).toBeGreaterThan(0);
    expect(clippedTexts(view.container)).toEqual([]);
    expect(inaccessiblePressables(view.container)).toEqual([]);
    // Status pills (kit StatusChip) announce their full text.
    for (const chip of Array.from(
      view.container.querySelectorAll<HTMLElement>('[role="text"][aria-label^="Status: "]'),
    )) {
      expect(chip.getAttribute("aria-label")).toContain(chip.textContent?.trim() ?? "");
    }
  });
});
