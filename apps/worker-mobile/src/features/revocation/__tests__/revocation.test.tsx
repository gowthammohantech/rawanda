/**
 * HWM-10 simulated device revocation (FRD §7, T-09): Settings → Simulate device revocation →
 * `/revoked` with no patient data, nothing sent, pending ops retained as `blocked_revoked`,
 * `device.revoked` audited, EN ⇄ RW on the revoked screen; "Restore device (demo only)" →
 * signed in again, `device.restored`, the kept items synced exactly once. A server-side
 * `DEVICE_REVOKED` (fault) is recorded by the watcher and also leads to `/revoked`.
 */
import type { AuditEvent, Screening, SyncOperation } from "@laif/domain";
import { FACILITY_IDS, PERSONA_IDS } from "@laif/mock-data";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import AppLayout from "../../../../app/(app)/_layout.tsx";
import RevokedRoute from "../../../../app/revoked.tsx";
import { SettingsScreen } from "../../settings/SettingsScreen.tsx";
import { useSession } from "../../../session/useSession.ts";
import { routerLog } from "../../../test/router-stub.tsx";
import { renderShell } from "../../../test/shell-harness.tsx";

vi.mock("expo-router", () => import("../../../test/router-stub.tsx"));

// Full shell renders: generous per-test budget when the machine is loaded.
vi.setConfig({ testTimeout: 30_000 });

const T = { timeout: 10_000 };

/** Mini router: the same decisions as the route tree. */
function Flow() {
  const { status, signIn } = useSession();
  useEffect(() => {
    if (status === "signed_out") void signIn(PERSONA_IDS.chwAlpha1A, FACILITY_IDS.alpha1);
  }, [status, signIn]);
  if (status === "revoked") return <RevokedRoute />;
  if (status !== "signed_in") return null;
  return (
    <>
      <AppLayout />
      <SettingsScreen onSignedOut={() => undefined} onOpenNetwork={() => undefined} />
    </>
  );
}

const screening = (patientId: string, systolic: number) => ({
  patientId,
  measuredAt: "2026-10-14T05:10:00.000Z",
  systolic,
  diastolic: 82,
});

beforeEach(() => {
  routerLog.length = 0;
});

describe("device revocation (HWM-10)", () => {
  it("revoke → no data, nothing sent, ops kept blocked_revoked, audited; restore → synced once", async () => {
    const view = await renderShell(<Flow />, { readyTestId: "settings-screen" });
    const repo = view.repo();
    const patients = (await repo.listPatients({ pageSize: 100 })).items;
    const patient = patients[0]!;
    await repo.demo.setFaults({ offline: true });
    const a = await repo.createScreening(
      screening(patient.id, 121),
      "00000000-0000-4000-8000-0000000a0001",
    );
    const b = await repo.createScreening(
      screening(patient.id, 133),
      "00000000-0000-4000-8000-0000000a0002",
    );
    await repo.demo.setFaults({ offline: false });
    const remoteBefore = (await view.store.getAll<Screening>("remote_screenings")).length;

    fireEvent.click(screen.getByTestId("open-revoke-device"));
    expect(await screen.findByText("Simulate device revocation?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Revoke this device (demo)" }));

    const revoked = await screen.findByTestId("revoked-screen", {}, T);
    expect(within(revoked).getByText("This device has been revoked (simulated)")).toBeTruthy();
    expect(
      await within(revoked).findByText("2 items are kept on this device and were not sent"),
    ).toBeTruthy();
    // No patient data rendered anywhere.
    const text = document.body.textContent ?? "";
    for (const p of patients) expect(text).not.toContain(p.displayName);
    expect(screen.queryByTestId("settings-screen")).toBeNull();

    const ops = await repo.sync.list();
    expect(ops.map((o: SyncOperation) => o.status)).toEqual(["blocked_revoked", "blocked_revoked"]);
    expect((await repo.sync.process({ trigger: "manual" })).attempted).toBe(0);
    expect(await view.store.getAll("remote_screenings")).toHaveLength(remoteBefore);
    await expect(repo.listPatients({ pageSize: 1 })).rejects.toMatchObject({
      code: "FORBIDDEN",
      reason: "SESSION_REVOKED",
    });
    const audits = await view.store.getAll<AuditEvent>("auditEvents");
    expect(audits.filter((e) => e.action === "device.revoked")).toHaveLength(1);
    // Nothing was deleted.
    expect(await view.store.get("screenings", a.data.id)).toBeDefined();
    expect(await view.store.get("screenings", b.data.id)).toBeDefined();

    // Language switch works on the revoked screen.
    fireEvent.click(within(revoked).getAllByRole("radio", { name: "Ikinyarwanda" })[0]!);
    expect(await screen.findByText("Iki gikoresho cyahagaritswe (kwigana)")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("radio", { name: "English" })[0]!);
    await screen.findByText("This device has been revoked (simulated)");

    fireEvent.click(screen.getByTestId("restore-device"));
    await screen.findByTestId("settings-screen", {}, T);
    await waitFor(
      async () =>
        expect((await repo.sync.list()).map((o) => o.status)).toEqual([
          "acknowledged",
          "acknowledged",
        ]),
      T,
    );
    const remote = await view.store.getAll<Screening>("remote_screenings");
    expect(remote).toHaveLength(remoteBefore + 2);
    expect(remote.filter((s) => s.id === a.data.id)).toHaveLength(1);
    expect(remote.filter((s) => s.id === b.data.id)).toHaveLength(1);
    const after = await view.store.getAll<AuditEvent>("auditEvents");
    expect(after.filter((e) => e.action === "device.restored")).toHaveLength(1);
    // The watcher must not re-revoke the restored session from a stale cached status.
    expect(after.filter((e) => e.action === "device.revoked")).toHaveLength(1);
    expect((await repo.sync.getStatus()).deviceRevoked).toBe(false);
    expect(screen.queryByTestId("revoked-screen")).toBeNull();
    expect(after.filter((e) => e.action === "sync.duplicate_suppressed")).toHaveLength(0);
    expect(routerLog).toContainEqual({ method: "replace", href: "/" });
  });

  it("a server-side DEVICE_REVOKED during sync is recorded and leads to /revoked", async () => {
    const view = await renderShell(<Flow />, { readyTestId: "settings-screen" });
    const repo = view.repo();
    const patient = (await repo.listPatients({ pageSize: 1 })).items[0]!;
    await repo.demo.setFaults({ offline: true });
    await repo.createScreening(screening(patient.id, 128), "00000000-0000-4000-8000-0000000a0003");
    await repo.demo.setFaults({ offline: false, deviceRevoked: true });
    await repo.sync.process({ trigger: "manual" });
    await view.services.queryClient.invalidateQueries();
    await screen.findByTestId("revoked-screen", {}, T);
    const audits = await view.store.getAll<AuditEvent>("auditEvents");
    expect(audits.filter((e) => e.action === "device.revoked")).toHaveLength(1);
    expect((await repo.sync.list()).map((o) => o.status)).not.toContain("acknowledged");
  });
});
