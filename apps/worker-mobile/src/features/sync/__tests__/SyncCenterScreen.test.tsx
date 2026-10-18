/**
 * HWM-09 Sync center: CONNECTION card (simulated, pill, Network simulation link), empty state,
 * Sync now tapped 5× → one `syncRuns` row and one server apply per op (T-04) with the result
 * toast + audits, offline → disabled with reason, server errors → Waiting with plain-language
 * error and "Retrying in Ns" + Retry now, conflicts first, rejected → Not accepted.
 */
import type { AuditEvent, FollowUp, Screening, SyncOperation } from "@laif/domain";
import { FACILITY_IDS, PERSONA_IDS } from "@laif/mock-data";
import { createMemoryStoreAdapter, type StoreAdapter } from "@laif/repositories";
import { createTestRepository } from "@laif/test-utils";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { useEffect, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useNetwork } from "../../../network/NetworkProvider.tsx";
import { useSession } from "../../../session/useSession.ts";
import { routerLog } from "../../../test/router-stub.tsx";
import { renderShell } from "../../../test/shell-harness.tsx";
import { SyncCenterScreen } from "../SyncCenterScreen.tsx";

vi.mock("expo-router", () => import("../../../test/router-stub.tsx"));

function SignedIn({ children }: { children: ReactNode }) {
  const { status, signIn } = useSession();
  useEffect(() => {
    if (status === "signed_out") void signIn(PERSONA_IDS.chwAlpha1A, FACILITY_IDS.alpha1);
  }, [status, signIn]);
  return status === "signed_in" ? <>{children}</> : null;
}

function GoOffline() {
  const { setFaults } = useNetwork();
  return (
    <button
      type="button"
      data-testid="go-offline"
      onClick={() => void setFaults({ offline: true })}
    >
      offline
    </button>
  );
}

const render = (store?: StoreAdapter) =>
  renderShell(
    <SignedIn>
      <SyncCenterScreen />
    </SignedIn>,
    { readyTestId: "sync-screen", ...(store === undefined ? {} : { store }) },
  );

async function scenarioStore(scenario: string): Promise<StoreAdapter> {
  const store = createMemoryStoreAdapter();
  await createTestRepository({ appId: "worker", persona: PERSONA_IDS.chwAlpha1A, store, scenario });
  return store;
}

const screeningInput = (patientId: string, systolic: number) => ({
  patientId,
  measuredAt: "2026-10-14T05:10:00.000Z",
  systolic,
  diastolic: 82,
});

beforeEach(() => {
  routerLog.length = 0;
});

describe("SyncCenterScreen (HWM-09)", () => {
  it("connection card, empty state with last sync, Network simulation link", async () => {
    await render();
    const card = await screen.findByTestId("connection-card");
    expect(within(card).getByText("CONNECTION")).toBeTruthy();
    expect(within(card).getByText("Online (simulated)")).toBeTruthy();
    expect(within(card).getByText("SIMULATED SYNC SERVER")).toBeTruthy();
    expect(within(card).getByText("Not synced yet")).toBeTruthy();
    expect(await screen.findByText("Everything on this device is synced")).toBeTruthy();
    fireEvent.click(screen.getByTestId("open-network-simulation-from-sync"));
    expect(routerLog.at(-1)).toEqual({ method: "push", href: "/settings/network" });
  });

  it("Sync now ×5 → one run, one server apply per op, toast, audits; rows move to Synced recently", async () => {
    const view = await render();
    const repo = view.repo();
    const patient = (await repo.listPatients({ pageSize: 1 })).items[0]!;
    await repo.demo.setFaults({ offline: true });
    const a = await repo.createScreening(
      screeningInput(patient.id, 121),
      "00000000-0000-4000-8000-0000000000d1",
    );
    const b = await repo.createScreening(
      screeningInput(patient.id, 133),
      "00000000-0000-4000-8000-0000000000d2",
    );
    const remoteBefore = (await view.store.getAll<Screening>("remote_screenings")).length;
    await view.repo().demo.setFaults({ offline: false });
    await view.services.queryClient.invalidateQueries();
    // Wait until the screen shows the two waiting items (online again, before any run).
    const waiting = await screen.findByTestId("sync-section-waiting");
    await waitFor(() =>
      expect(within(waiting).getByTestId("sync-section-waiting-count").textContent).toBe("2"),
    );

    const button = screen.getByTestId("sync-now");
    for (let i = 0; i < 5; i += 1) fireEvent.click(button);
    expect(await screen.findByText("2 synced", {}, { timeout: 5000 })).toBeTruthy();

    // The `online` trigger may have queued its own debounced run; the 5 taps were one run.
    const runs = await view.store.getAll<{ trigger: string }>("syncRuns");
    expect(runs.filter((r) => r.trigger === "manual")).toHaveLength(1);
    const remote = await view.store.getAll<Screening>("remote_screenings");
    expect(remote).toHaveLength(remoteBefore + 2);
    expect(remote.filter((s) => s.id === a.data.id || s.id === b.data.id)).toHaveLength(2);
    const ops = await repo.sync.list();
    expect(ops.map((o: SyncOperation) => [o.status, o.attempts])).toEqual([
      ["acknowledged", 1],
      ["acknowledged", 1],
    ]);
    const actions = (await view.store.getAll<AuditEvent>("auditEvents")).map((e) => e.action);
    expect(actions.filter((x) => x === "worker.sync.manual_requested")).toHaveLength(1);
    expect(actions).toContain("sync.run_started");
    expect(actions).toContain("sync.run_finished");

    const synced = await screen.findByTestId("sync-section-synced");
    await waitFor(() =>
      expect(within(synced).getByTestId("sync-section-synced-count").textContent).toBe("2"),
    );
    expect(within(synced).getAllByText(/^Server event [0-9A-F]{8}$/u)).toHaveLength(2);
    expect(screen.queryByTestId("sync-section-waiting")).toBeNull();
  });

  it("offline: Sync now disabled with the reason; nothing is sent", async () => {
    const view = await renderShell(
      <SignedIn>
        <GoOffline />
        <SyncCenterScreen />
      </SignedIn>,
      { readyTestId: "sync-screen" },
    );
    fireEvent.click(await screen.findByTestId("go-offline"));
    const reason = await screen.findByTestId("sync-now-offline-reason");
    expect(reason.textContent).toBe("Offline (simulated) — items are safe on this device");
    expect(screen.getByTestId("sync-now").getAttribute("aria-disabled")).toBe("true");
    expect(
      within(screen.getByTestId("connection-card")).getByText("Offline (simulated)"),
    ).toBeTruthy();
    fireEvent.click(screen.getByTestId("sync-now"));
    expect(await view.store.getAll("syncRuns")).toHaveLength(0);
  });

  it("100% server errors → Waiting with error words, 'Retrying in Ns' and Retry now; nothing removed", async () => {
    const view = await render();
    const repo = view.repo();
    const patient = (await repo.listPatients({ pageSize: 1 })).items[0]!;
    await repo.demo.setFaults({ offline: true });
    await repo.createScreening(
      screeningInput(patient.id, 121),
      "00000000-0000-4000-8000-0000000000e1",
    );
    await repo.demo.setFaults({ offline: false, serverErrorRate: 1, latencyMs: [0, 0] });
    await view.services.queryClient.invalidateQueries();
    await screen.findByTestId("sync-section-waiting");
    fireEvent.click(screen.getByTestId("sync-now"));
    expect(await screen.findByText("1 will retry", {}, { timeout: 5000 })).toBeTruthy();
    const [op] = await repo.sync.list();
    expect(op).toMatchObject({ status: "retryable_failure", attempts: 1 });
    const row = await screen.findByTestId(`op-row-${op!.id}`);
    await waitFor(() => expect(within(row).getByText(/Sync server error/u)).toBeTruthy());
    expect(within(row).getByTestId(`op-waiting-${op!.id}`).textContent).toMatch(
      /^Retrying in \d+s$|^Will retry on the next sync$/u,
    );

    await repo.demo.setFaults({ serverErrorRate: 0 });
    fireEvent.click(within(row).getByTestId(`retry-now-${op!.id}`));
    await waitFor(async () => expect((await repo.sync.list())[0]?.status).toBe("acknowledged"), {
      timeout: 5000,
    });
    expect(await repo.sync.list()).toHaveLength(1);
  });

  it("conflict → Needs your decision first; opening it goes to the conflict screen", async () => {
    const store = await scenarioStore("SCN-09-version-conflict");
    const view = await render(store);
    await view.repo().sync.process({ trigger: "manual" });
    await view.services.queryClient.invalidateQueries();
    const decision = await screen.findByTestId("sync-section-decision");
    const [op] = await view.repo().sync.list();
    expect(op?.status).toBe("needs_resolution");
    expect(within(decision).getByText("Contact attempt")).toBeTruthy();
    // Decision is the first queue section.
    const sections = screen.getAllByTestId(/^sync-section-(decision|waiting|notAccepted|synced)$/u);
    expect(sections[0]).toBe(decision);
    fireEvent.click(within(decision).getByTestId(`op-open-${op!.id}`));
    expect(routerLog.at(-1)).toEqual({
      method: "push",
      href: { pathname: "/sync/conflicts/[opId]", params: { opId: op!.id } },
    });
  });

  it("Synced recently: a re-applied original reads 'Replaced', a kept-latest one 'Withdrawn'", async () => {
    const store = await scenarioStore("SCN-09-version-conflict");
    const view = await render(store);
    const repo = view.repo();
    await repo.sync.process({ trigger: "manual" });
    const [op] = await repo.sync.list({ statuses: ["needs_resolution"] });
    await repo.sync.resolveConflict(op!.id, "reapply_on_latest", crypto.randomUUID());
    await repo.sync.process({ trigger: "after_resolution" });
    await view.services.queryClient.invalidateQueries();
    const synced = await screen.findByTestId("sync-section-synced");
    await waitFor(() =>
      expect(
        within(within(synced).getByTestId(`op-row-${op!.id}`)).getByText(
          "Replaced by your re-applied update",
        ),
      ).toBeTruthy(),
    );
    expect(within(synced).queryByText("Withdrawn — the latest version was kept")).toBeNull();
  });

  it("reassigned task → Not accepted with explanation, kept on device, Copy details", async () => {
    const view = await render();
    const repo = view.repo();
    const fu = (await view.store.getAll<FollowUp>("followUps")).find(
      (f) => f.assignedWorkerId === PERSONA_IDS.chwAlpha1A && f.status === "assigned",
    )!;
    await repo.demo.setFaults({ offline: true });
    await repo.updateFollowUp(
      {
        followUpId: fu.id,
        expectedVersion: fu.version,
        action: "record_attempt",
        at: "2026-10-14T05:00:00.000Z",
        method: "phone",
        result: "not_reached",
      },
      "00000000-0000-4000-8000-0000000000f1",
    );
    await repo.sync.simulateRemoteEdit("follow_up", fu.id, {
      assignedWorkerId: PERSONA_IDS.chwAlpha1B,
    });
    await repo.demo.setFaults({ offline: false });
    await repo.sync.process({ trigger: "manual" });
    await view.services.queryClient.invalidateQueries();
    const section = await screen.findByTestId("sync-section-notAccepted");
    const [op] = await repo.sync.list();
    expect(op?.status).toBe("rejected");
    expect(
      within(section).getByText(
        "This task was reassigned to someone else before your update arrived. Your update is kept on this device.",
      ),
    ).toBeTruthy();
    expect(within(section).getByText("Kept on this device")).toBeTruthy();
    expect(within(section).getByTestId(`copy-details-${op!.id}`)).toBeTruthy();
  });
});
