/**
 * Network simulation (HWM-02): labelled SIMULATION, every control maps onto the FND-07
 * `FaultConfig` (persisted, survives a relaunch), the header badge follows the offline switch,
 * remote edits / conflictOnce; going back online syncs automatically (HWM-09 — the "Run one sync
 * pass" dev button moved to the Sync center).
 */
import type { FollowUp, SyncOperation } from "@laif/domain";
import { FACILITY_IDS, PERSONA_IDS } from "@laif/mock-data";
import type { StoreAdapter } from "@laif/repositories";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { useEffect, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { NetworkBadge } from "../../../components/NetworkBadge.tsx";
import { useSession } from "../../../session/useSession.ts";
import { renderShell } from "../../../test/shell-harness.tsx";
import { NetworkSimulationScreen } from "../NetworkSimulationScreen.tsx";

vi.mock("expo-router", () => import("../../../test/router-stub.tsx"));

/** Signs the default CHW in on first render (the sign-in UI is covered by the shell tests). */
function SignedIn({ children }: { children: ReactNode }) {
  const { status, signIn } = useSession();
  useEffect(() => {
    if (status === "signed_out") void signIn(PERSONA_IDS.chwAlpha1A, FACILITY_IDS.alpha1);
  }, [status, signIn]);
  return status === "signed_in" ? <>{children}</> : null;
}

const renderScreen = (store?: StoreAdapter) =>
  renderShell(
    <SignedIn>
      <NetworkSimulationScreen />
    </SignedIn>,
    { readyTestId: "network-simulation-screen", ...(store === undefined ? {} : { store }) },
  );

const radio = (group: string, name: string) =>
  within(screen.getByTestId(group)).getByRole("radio", { name });

describe("NetworkSimulationScreen (HWM-02)", () => {
  it("is labelled SIMULATION and explains the on-device sync server", async () => {
    await renderScreen();
    expect(screen.getByTestId("simulation-pill").textContent).toContain("SIMULATION");
    expect(screen.getByText("Simulated sync server (on this device)")).toBeTruthy();
    expect(
      screen.getByText("This sync server runs inside the app. No data leaves the device."),
    ).toBeTruthy();
    expect(within(screen.getAllByTestId("network-badge")[0]!).getByText("Online")).toBeTruthy();
  });

  it("Offline switch → FaultConfig.offline, badge 'Offline (simulated)', persists across relaunch", async () => {
    const view = await renderScreen();
    fireEvent.click(screen.getByRole("switch", { name: "Work offline (simulated)" }));
    expect(
      within(screen.getAllByTestId("network-badge")[0]!).getByText("Offline (simulated)"),
    ).toBeTruthy();
    await waitFor(async () => expect((await view.repo().demo.getFaults()).offline).toBe(true));
    expect(await screen.findByText("Simulation updated")).toBeTruthy();
    view.unmount();

    await renderShell(<NetworkBadge />, { store: view.store, readyTestId: "network-badge" });
    await waitFor(() => expect(screen.getByText("Offline (simulated)")).toBeTruthy());
  });

  it("delay and failure controls map onto latencyMs / timeoutRate / serverErrorRate", async () => {
    const view = await renderScreen();
    const faults = () => view.repo().demo.getFaults();

    fireEvent.click(radio("netsim-latency", "Slow"));
    await waitFor(async () => expect((await faults()).latencyMs).toEqual([1500, 3000]));

    fireEvent.click(radio("netsim-failure-mode", "Lost reply"));
    fireEvent.click(radio("netsim-failure-rate", "100%"));
    await waitFor(async () =>
      expect(await faults()).toMatchObject({
        timeoutRate: 1,
        serverErrorRate: 0,
        dependencyUnavailableRate: 0,
      }),
    );

    fireEvent.click(radio("netsim-failure-mode", "Server error"));
    await waitFor(async () =>
      expect(await faults()).toMatchObject({ timeoutRate: 0, serverErrorRate: 1 }),
    );

    fireEvent.click(radio("netsim-failure-rate", "Off"));
    await waitFor(async () =>
      expect(await faults()).toMatchObject({
        timeoutRate: 0,
        serverErrorRate: 0,
        dependencyUnavailableRate: 0,
      }),
    );
  });

  it("HWM-09: no dev sync button; offline → online syncs by itself while in the foreground", async () => {
    const view = await renderScreen();
    const repo = view.repo();
    expect(screen.queryByTestId("netsim-run-pass")).toBeNull();
    fireEvent.click(screen.getByRole("switch", { name: "Work offline (simulated)" }));
    await waitFor(async () => expect((await repo.demo.getFaults()).offline).toBe(true));
    const patient = (await repo.listPatients({ pageSize: 1 })).items[0]!;
    await repo.createScreening(
      {
        patientId: patient.id,
        measuredAt: "2026-10-14T05:10:00.000Z",
        systolic: 128,
        diastolic: 82,
      },
      "00000000-0000-4000-8000-0000000000aa",
    );
    expect((await repo.sync.list()).map((o: SyncOperation) => o.status)).toEqual(["queued"]);

    fireEvent.click(screen.getByRole("switch", { name: "Work offline (simulated)" }));
    await waitFor(
      async () =>
        expect((await repo.sync.list()).map((o: SyncOperation) => o.status)).toEqual([
          "acknowledged",
        ]),
      { timeout: 5000 },
    );
    const runs = await view.store.getAll<{ trigger: string }>("syncRuns");
    expect(runs.map((r) => r.trigger)).toEqual(["online"]);
  });

  it("clinician update and next-sync conflict act on the chosen follow-up", async () => {
    const view = await renderScreen();
    const repo = view.repo();
    const followUp = (await repo.listFollowUps({ pageSize: 100 })).items[0]!;
    const before = (await view.store.get<FollowUp>("remote_followUps", followUp.id))!;

    fireEvent.click(await screen.findByTestId("netsim-follow-up"));
    const options = await screen.findAllByRole("radio");
    const option = options.find((el) => (el.textContent ?? "").includes("due"))!;
    fireEvent.click(option);

    fireEvent.click(screen.getByTestId("netsim-clinician-update"));
    expect(
      await screen.findByText("A clinician update was simulated on the sync server."),
    ).toBeTruthy();
    const remote = (await view.store.get<FollowUp>("remote_followUps", followUp.id))!;
    expect(remote.version).toBe(before.version + 1);
    expect(Date.parse(remote.dueAt) - Date.parse(before.dueAt)).toBe(86_400_000);

    fireEvent.click(screen.getByTestId("netsim-conflict-next"));
    await waitFor(async () =>
      expect((await repo.demo.getFaults()).conflictOnce).toEqual([
        { entityType: "follow_up", entityId: followUp.id },
      ]),
    );
    expect(await screen.findByText("1 conflict armed")).toBeTruthy();
  });
});
