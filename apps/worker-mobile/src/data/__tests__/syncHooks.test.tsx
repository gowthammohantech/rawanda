/**
 * Worker sync hooks (HWM-02): pending count (Sync tab badge), sync status, per-entity state
 * labels, and the op label mapping onto FND `entityType` + `opType` + payload `action`.
 */
import type { SyncOperation } from "@laif/domain";
import { FACILITY_IDS, PERSONA_IDS } from "@laif/mock-data";
import { useTx } from "@laif/ui-native";
import { useQueryClient } from "@tanstack/react-query";
import { act, screen, waitFor } from "@testing-library/react";
import { useEffect, useState, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import TabsLayout from "../../../app/(app)/(tabs)/_layout.tsx";
import { useRepository } from "../../providers.tsx";
import { useSession } from "../../session/useSession.ts";
import { renderShell } from "../../test/shell-harness.tsx";
import { useEntitySyncState } from "../hooks/useEntitySyncState.ts";
import { usePendingCount } from "../hooks/usePendingCount.ts";
import { useSyncStatus } from "../hooks/useSyncStatus.ts";
import { describeSyncOp, syncOpLabel } from "../opLabel.ts";
import { invalidateAfterWrite } from "../queryKeys.ts";

vi.mock("expo-router", () => import("../../test/router-stub.tsx"));

function SignedIn({ children }: { children: ReactNode }) {
  const { status, signIn } = useSession();
  useEffect(() => {
    if (status === "signed_out") void signIn(PERSONA_IDS.chwAlpha1A, FACILITY_IDS.alpha1);
  }, [status, signIn]);
  return status === "signed_in" ? <>{children}</> : null;
}

const harness: { write?: () => Promise<string>; sync?: () => Promise<void> } = {};

function EntityState({ id }: { id: string }) {
  const t = useTx();
  const { labelKey } = useEntitySyncState(id);
  return <span data-testid="entity-state">{t(labelKey)}</span>;
}

function Probe() {
  const repo = useRepository();
  const queryClient = useQueryClient();
  const pending = usePendingCount();
  const status = useSyncStatus();
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    harness.write = async () => {
      const patient = (await repo.listPatients({ pageSize: 1 })).items[0]!;
      const result = await repo.createScreening(
        {
          patientId: patient.id,
          measuredAt: "2026-10-14T05:10:00.000Z",
          systolic: 128,
          diastolic: 82,
        },
        "00000000-0000-4000-8000-0000000000bb",
      );
      await invalidateAfterWrite(queryClient);
      setId(result.data.id);
      return result.data.id;
    };
    harness.sync = async () => {
      await repo.sync.process({ trigger: "manual" });
      await invalidateAfterWrite(queryClient);
    };
  }, [repo, queryClient]);
  return (
    <>
      <span data-testid="pending">{pending}</span>
      <span data-testid="last-synced">{status.lastSyncedAt ?? "never"}</span>
      {id === null ? null : <EntityState id={id} />}
    </>
  );
}

describe("worker sync hooks (HWM-02)", () => {
  it("pending count, Sync tab badge and entity state follow the queue", async () => {
    await renderShell(
      <SignedIn>
        <TabsLayout />
        <Probe />
      </SignedIn>,
      { readyTestId: "pending" },
    );
    expect(screen.getByTestId("pending").textContent).toBe("0");
    expect(screen.getByRole("button", { name: "Sync" })).toBeTruthy();
    // The probe's effect (which installs the helpers) may run just after the first paint.
    await waitFor(() => expect(harness.write).toBeTypeOf("function"));

    await act(async () => {
      await harness.write!();
    });
    await waitFor(() => expect(screen.getByTestId("pending").textContent).toBe("1"));
    expect(screen.getByRole("button", { name: "Sync, 1 item waiting to sync" })).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByTestId("entity-state").textContent).toBe("Saved on this device"),
    );
    expect(screen.getByTestId("last-synced").textContent).toBe("never");

    await act(async () => {
      await harness.sync!();
    });
    await waitFor(() => expect(screen.getByTestId("pending").textContent).toBe("0"));
    await waitFor(() => expect(screen.getByTestId("entity-state").textContent).toBe("Synced"));
    expect(screen.getByTestId("last-synced").textContent).not.toBe("never");
    expect(screen.getByRole("button", { name: "Sync" })).toBeTruthy();
  });
});

describe("syncOpLabel (HWM-02 task 3)", () => {
  const op = (
    entityType: SyncOperation["entityType"],
    opType: SyncOperation["opType"],
    payload: SyncOperation["payload"] = {},
    resolvesOpId: SyncOperation["resolvesOpId"] = null,
  ) => ({ entityType, opType, payload, resolvesOpId });

  it.each([
    [op("patient", "create"), "patient.register"],
    [op("screening", "create"), "screening.submit"],
    [op("screening", "update"), "screening.amend"],
    [op("follow_up", "update", { action: "record_attempt" }), "followup.attempt"],
    [op("follow_up", "update", { action: "record_outcome" }), "followup.outcome"],
    [op("follow_up", "update", { action: "add_note" }), "followup.update"],
    [op("care_task", "create", { targetType: "screening" }), "correction.request"],
    [op("review", "command"), "other"],
  ] as const)("%o → %s", (input, label) => {
    expect(syncOpLabel(input)).toBe(label);
  });

  it("marks conflict-resolution ops", () => {
    expect(
      describeSyncOp(op("follow_up", "update", { action: "record_attempt" }, "op-1" as never)),
    ).toEqual({ label: "followup.attempt", resolution: true });
  });
});
