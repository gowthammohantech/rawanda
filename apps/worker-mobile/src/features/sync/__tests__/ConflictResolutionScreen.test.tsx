/**
 * HWM-09 conflict screen (T-05): explanation callout, your version vs the latest with Changed
 * rows, no change (local or server) before a confirmed choice; Re-apply → one new op on the
 * latest version + original superseded; Keep latest → local row refreshed, withdrawn payload
 * kept; both audited `sync.conflict_resolved` with the original op id and mirrored by the
 * server; re-apply disabled with its reason when the task was reassigned.
 */
import type { AuditEvent, FollowUp, SyncOperation } from "@laif/domain";
import { FACILITY_IDS, PERSONA_IDS } from "@laif/mock-data";
import { createMemoryStoreAdapter, type StoreAdapter } from "@laif/repositories";
import { createTestRepository } from "@laif/test-utils";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { useEffect, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useSession } from "../../../session/useSession.ts";
import { routerLog } from "../../../test/router-stub.tsx";
import { renderShell } from "../../../test/shell-harness.tsx";
import { ConflictResolutionScreen } from "../ConflictResolutionScreen.tsx";
import { OpDetailScreen } from "../OpDetail.tsx";

vi.mock("expo-router", () => import("../../../test/router-stub.tsx"));

function SignedIn({ children }: { children: ReactNode }) {
  const { status, signIn } = useSession();
  useEffect(() => {
    if (status === "signed_out") void signIn(PERSONA_IDS.chwAlpha1A, FACILITY_IDS.alpha1);
  }, [status, signIn]);
  return status === "signed_in" ? <>{children}</> : null;
}

/** SCN-09: one follow-up attempt op that the server answers with CONFLICT. */
async function conflictStore(
  remotePatch?: Partial<FollowUp>,
): Promise<{ store: StoreAdapter; op: SyncOperation }> {
  const store = createMemoryStoreAdapter();
  const t = await createTestRepository({
    appId: "worker",
    store,
    scenario: "SCN-09-version-conflict",
  });
  await t.repo.sync.process({ trigger: "manual" });
  const op = (await t.repo.sync.list())[0]!;
  if (remotePatch !== undefined) {
    await store.put("syncOperations", {
      ...op,
      serverSnapshot: { ...(op.serverSnapshot as object), ...remotePatch },
    });
  }
  return { store, op: (await t.repo.sync.list())[0]! };
}

const renderConflict = (store: StoreAdapter, opId: string) =>
  renderShell(
    <SignedIn>
      <ConflictResolutionScreen opId={opId} />
    </SignedIn>,
    { store, readyTestId: "conflict-screen" },
  );

const resolvedAudits = async (store: StoreAdapter, c: "auditEvents" | "remote_auditEvents") =>
  (await store.getAll<AuditEvent>(c)).filter((e) => e.action === "sync.conflict_resolved");

beforeEach(() => {
  routerLog.length = 0;
});

describe("ConflictResolutionScreen (HWM-09)", () => {
  it("shows the explanation and your version vs latest; nothing changes before confirming", async () => {
    const { store, op } = await conflictStore();
    expect(op.status).toBe("needs_resolution");
    const remoteBefore = await store.getAll("remote_followUps");
    const localBefore = await store.get("followUps", op.entityId);
    await renderConflict(store, op.id);

    expect((await screen.findByTestId("conflict-explain")).textContent).toBe(
      "This task changed on the server after you saved your update. Nothing has been overwritten.",
    );
    const table = screen.getByTestId("version-compare");
    expect(within(table).getByText("Your version and the latest version")).toBeTruthy();
    expect(within(table).getByTestId("conflict-row-update").textContent).toContain(
      "Contact attempt · Home visit · Reached",
    );
    expect(within(table).getByTestId("conflict-changed-update")).toBeTruthy();
    expect(within(table).getByTestId("conflict-row-version")).toBeTruthy();
    // Free-text notes of the payload are never shown.
    expect(screen.queryByText(/edited offline/u)).toBeNull();

    // Open the choice and cancel: still nothing changed.
    fireEvent.click(screen.getByTestId("choose-reapply"));
    const sheet = await screen.findByTestId("conflict-confirm");
    fireEvent.click(within(sheet).getByRole("button", { name: "Cancel" }));
    expect((await store.get<SyncOperation>("syncOperations", op.id))?.status).toBe(
      "needs_resolution",
    );
    expect(await store.getAll("remote_followUps")).toEqual(remoteBefore);
    expect(await store.get("followUps", op.entityId)).toEqual(localBefore);
    expect(await resolvedAudits(store, "auditEvents")).toHaveLength(0);
  });

  it("Re-apply → confirm with note → one new op on the latest version, original superseded, audit + mirror", async () => {
    const { store, op } = await conflictStore();
    const latest = op.serverSnapshot as unknown as FollowUp;
    await renderConflict(store, op.id);
    fireEvent.click(await screen.findByTestId("choose-reapply"));
    const sheet = await screen.findByTestId("conflict-confirm");
    fireEvent.change(within(sheet).getByTestId("conflict-note"), {
      target: { value: "Visit was real." },
    });
    fireEvent.click(
      within(sheet).getByRole("button", { name: "Re-apply my update on the latest version" }),
    );
    expect(
      await screen.findByText("Your update will be re-applied on the latest version"),
    ).toBeTruthy();

    const ops = await store.getAll<SyncOperation>("syncOperations");
    expect(ops.find((o) => o.id === op.id)?.status).toBe("superseded");
    const created = ops.filter((o) => o.resolvesOpId === op.id);
    expect(created).toHaveLength(1);
    expect(created[0]?.baseVersion).toBe(latest.version);
    const [audit] = await resolvedAudits(store, "auditEvents");
    expect(audit).toMatchObject({
      justification: "Visit was real.",
      changeSummary: { originalOpId: op.id, resolution: "reapply_on_latest" },
    });
    // The after_resolution sync sends it; the server mirrors the decision with the original id.
    await waitFor(
      async () => {
        const [mirror] = await resolvedAudits(store, "remote_auditEvents");
        expect(mirror?.changeSummary).toMatchObject({ originalOpId: op.id, mirrored: true });
      },
      { timeout: 5000 },
    );
    await waitFor(async () =>
      expect((await store.get<SyncOperation>("syncOperations", created[0]!.id))?.status).toBe(
        "acknowledged",
      ),
    );
    expect(routerLog.at(-1)).toEqual({ method: "back", href: null });
  });

  it("Keep latest → local row refreshed, withdrawn payload visible in op detail with the audit", async () => {
    const { store, op } = await conflictStore();
    const view = await renderConflict(store, op.id);
    fireEvent.click(await screen.findByTestId("choose-keep-latest"));
    const sheet = await screen.findByTestId("conflict-confirm");
    fireEvent.click(
      within(sheet).getByRole("button", { name: "Keep the latest and withdraw mine" }),
    );
    expect(
      await screen.findByText("The latest version was kept. Your update is kept in the history."),
    ).toBeTruthy();
    expect(await store.get("followUps", op.entityId)).toEqual(op.serverSnapshot);
    const original = (await store.get<SyncOperation>("syncOperations", op.id))!;
    expect(original).toMatchObject({ status: "superseded", payload: op.payload });
    const [audit] = await resolvedAudits(store, "auditEvents");
    expect(audit?.changeSummary).toMatchObject({ originalOpId: op.id, resolution: "keep_latest" });
    await waitFor(
      async () => expect(await resolvedAudits(store, "remote_auditEvents")).toHaveLength(1),
      { timeout: 5000 },
    );
    view.unmount();

    await renderShell(
      <SignedIn>
        <OpDetailScreen opId={op.id} />
      </SignedIn>,
      { store, readyTestId: "op-detail-card" },
    );
    expect(screen.getByText("Withdrawn update — kept on this device")).toBeTruthy();
    expect(screen.getByTestId("op-detail-payload").textContent).toContain("home_visit");
    expect(screen.getByTestId("op-detail-payload").textContent).toContain("Free text not shown");
    const history = screen.getByTestId("op-history");
    expect(within(history).getByText("Version conflict detected")).toBeTruthy();
    expect(within(history).getByText("Sync conflict resolved")).toBeTruthy();
    expect(screen.getByTestId("op-detail-fields").textContent).toContain(op.idempotencyKey);
  });

  it("task reassigned on the server → Re-apply disabled with the reason; Keep latest still possible", async () => {
    const { store, op } = await conflictStore({ assignedWorkerId: PERSONA_IDS.chwAlpha1B });
    await renderConflict(store, op.id);
    expect((await screen.findByTestId("reapply-blocked-reason")).textContent).toBe(
      "Re-apply is not possible: this task is now assigned to someone else.",
    );
    expect(screen.getByTestId("choose-reapply").getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(screen.getByTestId("choose-reapply"));
    expect(screen.queryByTestId("conflict-confirm")).toBeNull();
    expect(screen.getByTestId("choose-keep-latest").getAttribute("aria-disabled")).not.toBe("true");
  });
});
