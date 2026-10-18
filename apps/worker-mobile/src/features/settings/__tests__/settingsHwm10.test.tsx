/**
 * HWM-10 Settings: final sections (LANGUAGE · CONNECTION · DEMO CONTROLS · SIGNED IN AS ·
 * ABOUT incl. "not encrypted in this demo"), language change audited, offline switch mirrored;
 * Reset demo (counts, typed RESET gate, progress → sign-in, toast, language kept); Activity log
 * (baseline `demo.reset` only after a reset, type filter, metadata only); reassignment while
 * offline → Not accepted with explanation and the record kept; clock drift warning + audit.
 */
import type { AuditEvent, FollowUp, Patient } from "@laif/domain";
import { FACILITY_IDS, PERSONA_IDS } from "@laif/mock-data";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { useEffect, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useSession } from "../../../session/useSession.ts";
import { routerLog } from "../../../test/router-stub.tsx";
import { renderShell } from "../../../test/shell-harness.tsx";
import { SyncCenterScreen } from "../../sync/SyncCenterScreen.tsx";
import { ActivityLogScreen } from "../ActivityLogScreen.tsx";
import { NetworkSimulationScreen } from "../NetworkSimulationScreen.tsx";
import { ResetDemoScreen } from "../ResetDemoScreen.tsx";
import { SettingsScreen } from "../SettingsScreen.tsx";

vi.mock("expo-router", () => import("../../../test/router-stub.tsx"));

// Full shell renders: generous per-test budget when the machine is loaded.
vi.setConfig({ testTimeout: 30_000 });

const T = { timeout: 10_000 };
const WORKER = PERSONA_IDS.chwAlpha1A;

function SignedIn({ children }: { children: ReactNode }) {
  const { status, signIn } = useSession();
  useEffect(() => {
    if (status === "signed_out") void signIn(WORKER, FACILITY_IDS.alpha1);
  }, [status, signIn]);
  return status === "signed_in" ? <>{children}</> : null;
}

const radio = (group: string, name: string) =>
  within(screen.getByTestId(group)).getByRole("radio", { name });

const screening = (patientId: string, systolic: number) => ({
  patientId,
  measuredAt: "2026-10-14T05:10:00.000Z",
  systolic,
  diastolic: 82,
  notes: "Visit note with private free text",
});

beforeEach(() => {
  routerLog.length = 0;
});

describe("Settings (HWM-10)", () => {
  it("shows the final sections; language change audited; offline switch mirrored", async () => {
    const view = await renderShell(
      <SignedIn>
        <SettingsScreen onSignedOut={() => undefined} onOpenNetwork={() => undefined} />
      </SignedIn>,
      { readyTestId: "settings-screen" },
    );
    // Section titles render as mono caps micro-labels (CSS uppercase).
    for (const title of ["Language", "Connection", "Demo controls", "Signed in as", "About"]) {
      expect(screen.getByText(title)).toBeTruthy();
    }
    expect(screen.getByText("Saved on this device")).toBeTruthy();
    expect(screen.getByText("Not encrypted in this demo")).toBeTruthy();
    expect(screen.getByText("Not for clinical use")).toBeTruthy();
    expect(within(screen.getByTestId("about-details")).getByText("Demo rule set")).toBeTruthy();
    for (const id of ["open-revoke-device", "open-activity-log", "open-reset-demo"]) {
      expect(screen.getByTestId(id)).toBeTruthy();
    }

    fireEvent.click(screen.getByRole("switch", { name: "Offline (simulated)" }));
    await waitFor(async () => expect((await view.repo().demo.getFaults()).offline).toBe(true));

    fireEvent.click(
      within(screen.getByTestId("settings-language-switcher")).getByRole("radio", {
        name: "Ikinyarwanda",
      }),
    );
    expect(await screen.findByText("Byabitswe kuri iki gikoresho")).toBeTruthy();
    await waitFor(async () => {
      const events = await view.store.getAll<AuditEvent>("auditEvents");
      const changed = events.filter((e) => e.action === "worker.settings.language_changed");
      expect(changed).toHaveLength(1);
      expect(changed[0]?.changeSummary).toMatchObject({ from: "en", to: "rw" });
    });
  });
});

describe("ResetDemoScreen (HWM-10)", () => {
  it("lists the counts, needs RESET typed exactly, restores and signs out keeping the language", async () => {
    const onDone = vi.fn();
    const view = await renderShell(
      <SignedIn>
        <ResetDemoScreen onDone={onDone} />
      </SignedIn>,
      { readyTestId: "reset-demo-screen" },
    );
    const repo = view.repo();
    const original = view.services.session.current()!;
    const patient = (await repo.listPatients({ pageSize: 1 })).items[0] as Patient;
    await repo.demo.setFaults({ offline: true });
    await repo.createScreening(screening(patient.id, 121), "00000000-0000-4000-8000-0000000b0001");
    await repo.createScreening(screening(patient.id, 133), "00000000-0000-4000-8000-0000000b0002");
    await repo.createScreening(screening(patient.id, 141), "00000000-0000-4000-8000-0000000b0003");
    await view.services.queryClient.invalidateQueries();

    const summary = await screen.findByTestId("reset-summary", {}, T);
    await waitFor(() =>
      expect(summary.textContent).toMatch(/^3 waiting to sync, 0 need decision, /u),
    );
    expect(summary.textContent).toMatch(/drafts? will be permanently removed$/u);
    const button = screen.getByTestId("reset-confirm");
    expect(button.getAttribute("aria-disabled")).toBe("true");

    fireEvent.change(screen.getByTestId("reset-confirm-input"), { target: { value: "reset" } });
    expect(await screen.findByText("Type RESET exactly to enable the button.")).toBeTruthy();
    expect(screen.getByTestId("reset-confirm").getAttribute("aria-disabled")).toBe("true");

    // RW before resetting: the language preference survives the reset.
    fireEvent.click(screen.getAllByRole("radio", { name: "Ikinyarwanda" })[0]!);
    await screen.findByText("Andika RESET kugira ngo wemeze");
    fireEvent.change(screen.getByTestId("reset-confirm-input"), { target: { value: "RESET" } });
    await waitFor(() =>
      expect(screen.getByTestId("reset-confirm").getAttribute("aria-disabled")).not.toBe("true"),
    );
    fireEvent.click(screen.getByTestId("reset-confirm"));

    expect(await screen.findByText("Amakuru y'igerageza yasubijweho", {}, T)).toBeTruthy();
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce());
    // Signed out: the old device session is gone and a new device id exists (the test wrapper
    // signs in again afterwards, on a fresh session).
    const sessions = await view.store.getAll<{ id: string; deviceId: string }>("deviceSessions");
    expect(sessions.map((x) => x.id)).not.toContain(original.deviceSessionId);
    expect(await view.store.getMeta("device_id")).not.toBe(original.deviceId);
    expect((await repo.sync.getStatus()).pending).toBe(0);
    expect((await repo.demo.getFaults()).offline).toBe(false);
    expect(view.services.i18n.language).toBe("rw");
  });
});

describe("ActivityLogScreen (HWM-10)", () => {
  it("baseline demo.reset only after a reset; filters by type; no free text", async () => {
    const view = await renderShell(
      <SignedIn>
        <ActivityLogScreen />
      </SignedIn>,
      { readyTestId: "activity-log-screen" },
    );
    const repo = view.repo();
    await repo.demo.resetDemo();
    await repo.device.startSession({
      personaId: WORKER,
      facilityId: FACILITY_IDS.alpha1,
      deviceId: await repo.device.getOrCreateDeviceId(),
    });
    // Sign the store back in on the new session (the reset removed the old one).
    const record = (await view.store.getAll<{ id: string }>("deviceSessions"))[0]!;
    view.services.session.save(WORKER, {
      facilityId: FACILITY_IDS.alpha1,
      deviceSessionId: record.id as never,
      deviceId: await repo.device.getOrCreateDeviceId(),
    });
    const patient = (await repo.listPatients({ pageSize: 1 })).items[0] as Patient;
    await repo.createScreening(screening(patient.id, 127), "00000000-0000-4000-8000-0000000c0001");
    await repo.sync.process({ trigger: "manual" });
    await view.services.queryClient.invalidateQueries();

    const list = await screen.findByTestId("activity-list", {}, T);
    await waitFor(() => expect(within(list).getByText("Demo reset to baseline")).toBeTruthy());
    expect(within(list).getAllByText("Simulated server").length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toContain("private free text");

    fireEvent.click(
      within(screen.getByTestId("activity-filter")).getByRole("tab", { name: /Sync/u }),
    );
    await waitFor(() => expect(within(list).queryByText("Demo reset to baseline")).toBeNull());
    expect(within(list).getAllByText(/sync|Sync/u).length).toBeGreaterThan(0);

    fireEvent.click(
      within(screen.getByTestId("activity-filter")).getByRole("tab", { name: /Settings/u }),
    );
    expect(await within(list).findByText("Demo reset to baseline")).toBeTruthy();
  });
});

describe("Reassignment while offline (HWM-10 task 4)", () => {
  it("outcome synced after a server reassignment → Not accepted with explanation, record kept", async () => {
    const view = await renderShell(
      <SignedIn>
        <NetworkSimulationScreen />
        <SyncCenterScreen />
      </SignedIn>,
      { readyTestId: "network-simulation-screen" },
    );
    const repo = view.repo();
    const fu = (await view.store.getAll<FollowUp>("followUps")).find(
      (f) => f.assignedWorkerId === WORKER && f.status === "assigned",
    )!;
    fireEvent.click(screen.getByRole("switch", { name: "Work offline (simulated)" }));
    await waitFor(async () => expect((await repo.demo.getFaults()).offline).toBe(true));
    await repo.updateFollowUp(
      {
        followUpId: fu.id,
        expectedVersion: fu.version,
        action: "record_outcome",
        outcome: "attended",
        evidenceType: "facility_register_checked",
        occurredAt: "2026-10-14T05:30:00.000Z",
      },
      "00000000-0000-4000-8000-0000000d0001",
    );
    await view.services.queryClient.invalidateQueries();

    fireEvent.click(await screen.findByTestId("netsim-follow-up"));
    const options = await screen.findAllByRole("radio");
    fireEvent.click(options.find((el) => (el.textContent ?? "").includes("due"))!);
    // Pick the task we updated (options are listed in the repository order).
    const remoteBefore = (await view.store.get<FollowUp>("remote_followUps", fu.id))!;
    fireEvent.click(screen.getByTestId("netsim-reassign"));
    await screen.findByText(/The sync server reassigned this follow-up to /u);
    const reassigned = (await view.store.getAll<FollowUp>("remote_followUps")).filter(
      (f) => f.assignedWorkerId === PERSONA_IDS.chwAlpha1B,
    );
    expect(reassigned.length).toBeGreaterThan(0);
    // Make sure the updated task itself is the reassigned one.
    if (
      (await view.store.get<FollowUp>("remote_followUps", fu.id))!.version === remoteBefore.version
    ) {
      await repo.sync.simulateRemoteEdit("follow_up", fu.id, {
        assignedWorkerId: PERSONA_IDS.chwAlpha1B,
      });
    }

    fireEvent.click(screen.getByRole("switch", { name: "Work offline (simulated)" }));
    await waitFor(async () => expect((await repo.demo.getFaults()).offline).toBe(false));
    await repo.sync.process({ trigger: "manual" });
    await view.services.queryClient.invalidateQueries();

    const section = await screen.findByTestId("sync-section-notAccepted", {}, T);
    expect(
      within(section).getByText(
        "This task was reassigned to someone else before your update arrived. Your update is kept on this device.",
      ),
    ).toBeTruthy();
    const op = (await repo.sync.list()).find((o) => o.entityId === fu.id)!;
    expect(op.status).toBe("rejected");
    // The worker's record is retained on the device.
    const local = (await view.store.get<FollowUp>("followUps", fu.id))!;
    expect(local.outcome).toMatchObject({ kind: "attended" });
    expect((await view.store.get<FollowUp>("remote_followUps", fu.id))!.outcome ?? null).toBeNull();
  });
});

describe("Clock drift (HWM-10 task 5)", () => {
  it("device clock −30 min → warning after the next acknowledged sync, audited once", async () => {
    const view = await renderShell(
      <SignedIn>
        <NetworkSimulationScreen />
        <SyncCenterScreen />
      </SignedIn>,
      { readyTestId: "sync-screen" },
    );
    const repo = view.repo();
    fireEvent.click(radio("netsim-device-clock", "−30 min"));
    expect(view.services.deviceClock.store.getState().offsetMinutes).toBe(-30);
    expect(screen.queryByTestId("sync-clock-drift")).toBeNull();

    const patient = (await repo.listPatients({ pageSize: 1 })).items[0] as Patient;
    await repo.demo.setFaults({ offline: true });
    await repo.createScreening(screening(patient.id, 125), "00000000-0000-4000-8000-0000000e0001");
    await repo.demo.setFaults({ offline: false });
    await view.services.queryClient.invalidateQueries();
    fireEvent.click(await screen.findByTestId("sync-now"));

    const warning = await screen.findByTestId("sync-clock-drift", {}, T);
    expect(warning.textContent).toBe(
      "Device clock differs from server by 30 min — times you enter are still saved",
    );
    await waitFor(async () => {
      const events = await view.store.getAll<AuditEvent>("auditEvents");
      const drift = events.filter((e) => e.action === "worker.sync.clock_drift_detected");
      expect(drift).toHaveLength(1);
      expect(drift[0]?.changeSummary).toMatchObject({ driftMinutes: -30 });
    });

    // Clock corrected → the next acknowledged run clears the warning.
    fireEvent.click(radio("netsim-device-clock", "Correct"));
    await repo.demo.setFaults({ offline: true });
    await repo.createScreening(screening(patient.id, 126), "00000000-0000-4000-8000-0000000e0002");
    await repo.demo.setFaults({ offline: false });
    await view.services.queryClient.invalidateQueries();
    fireEvent.click(screen.getByTestId("sync-now"));
    await waitFor(() => expect(screen.queryByTestId("sync-clock-drift")).toBeNull(), T);
  });
});
