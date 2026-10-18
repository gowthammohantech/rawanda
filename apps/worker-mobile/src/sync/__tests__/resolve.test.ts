/**
 * HWM-09 tasks 7–8: both conflict choices through `resolveConflict` (FND-07 transaction),
 * invalid re-apply (completed / reassigned / outcome already recorded), and the audit contents
 * (`sync.conflict_resolved` with the original op id, local and mirrored on the server).
 */
import type { AuditEvent, FollowUp, SyncOperation } from "@laif/domain";
import { PERSONA_IDS } from "@laif/mock-data";
import type { StoreAdapter } from "@laif/repositories";
import { createTestRepository } from "@laif/test-utils";
import { describe, expect, it } from "vitest";

import { reapplyBlock, resolveConflict } from "../resolve.ts";

const ME = PERSONA_IDS.chwAlpha1A;

async function conflicted() {
  const t = await createTestRepository({ appId: "worker", scenario: "SCN-09-version-conflict" });
  await t.repo.sync.process({ trigger: "manual" });
  const op = (await t.repo.sync.list({ statuses: ["needs_resolution"] }))[0]!;
  return { ...t, op };
}

const audits = async (t: { store: StoreAdapter }, c: "auditEvents" | "remote_auditEvents") =>
  (await t.store.getAll<AuditEvent>(c)).filter((e) => e.action === "sync.conflict_resolved");

const withLatest = (op: SyncOperation, patch: Partial<FollowUp>): SyncOperation => ({
  ...op,
  serverSnapshot: { ...(op.serverSnapshot as object), ...patch },
});

describe("resolveConflict (HWM-09)", () => {
  it("re-apply: one new op on the latest version, original superseded, audit + server mirror", async () => {
    const t = await conflicted();
    const latest = t.op.serverSnapshot as unknown as FollowUp;
    const key = t.key();
    const result = await resolveConflict(t.repo, t.op, "reapply_on_latest", key, {
      actorId: ME,
      note: "  Visit happened before the clinician change.  ",
    });
    expect(result.op).toMatchObject({
      status: "queued",
      resolvesOpId: t.op.id,
      baseVersion: latest.version,
      idempotencyKey: key,
      payload: {
        ...(t.op.payload as object),
        idempotencyKey: key,
        expectedVersion: latest.version,
      },
    });
    expect(result.op.idempotencyKey).not.toBe(t.op.idempotencyKey);
    const ops = await t.repo.sync.list();
    expect(ops.find((o) => o.id === t.op.id)?.status).toBe("superseded");
    expect(ops.filter((o) => o.status !== "superseded")).toHaveLength(1);

    const [local] = await audits(t, "auditEvents");
    expect(local).toMatchObject({
      actorId: ME,
      justification: "Visit happened before the clinician change.",
      changeSummary: {
        originalOpId: t.op.id,
        resolution: "reapply_on_latest",
        newOpId: result.op.id,
        latestVersion: latest.version,
      },
    });
    // No server change until the next sync.
    expect(await audits(t, "remote_auditEvents")).toHaveLength(0);
    expect((await t.repo.sync.process({ trigger: "after_resolution" })).acknowledged).toBe(1);
    const [mirror] = await audits(t, "remote_auditEvents");
    expect(mirror?.changeSummary).toMatchObject({ originalOpId: t.op.id, mirrored: true });
  });

  it("keep latest: local row refreshed, withdrawn payload kept, audit + server mirror", async () => {
    const t = await conflicted();
    await resolveConflict(t.repo, t.op, "keep_latest", t.key(), { actorId: ME });
    expect(await t.store.get("followUps", t.op.entityId)).toEqual(t.op.serverSnapshot);
    const original = (await t.repo.sync.list()).find((o) => o.id === t.op.id)!;
    expect(original).toMatchObject({ status: "superseded", payload: t.op.payload });
    const [local] = await audits(t, "auditEvents");
    expect(local?.changeSummary).toMatchObject({
      originalOpId: t.op.id,
      resolution: "keep_latest",
      newOpId: null,
    });
    await t.repo.sync.process({ trigger: "after_resolution" });
    const [mirror] = await audits(t, "remote_auditEvents");
    expect(mirror?.changeSummary).toMatchObject({
      originalOpId: t.op.id,
      resolution: "keep_latest",
      mirrored: true,
    });
  });

  it("invalid re-apply: completed / reassigned / outcome recorded → refused, nothing changes", async () => {
    const t = await conflicted();
    expect(reapplyBlock(t.op, ME)).toBeNull();
    expect(reapplyBlock(withLatest(t.op, { status: "completed" }), ME)).toBe("completed");
    expect(reapplyBlock(withLatest(t.op, { assignedWorkerId: PERSONA_IDS.chwAlpha1B }), ME)).toBe(
      "reassigned",
    );
    expect(reapplyBlock(withLatest(t.op, { status: "reassigned" }), ME)).toBe("reassigned");
    const outcomeOp = {
      ...withLatest(t.op, {
        outcome: {
          kind: "attended",
          occurredAt: "x",
          evidenceType: null,
          reasonCode: null,
          note: "",
          recordedBy: ME,
        },
      }),
      payload: { ...(t.op.payload as object), action: "record_outcome" },
    } as SyncOperation;
    expect(reapplyBlock(outcomeOp, ME)).toBe("outcome_recorded");
    expect(reapplyBlock({ ...t.op, serverSnapshot: null }, ME)).toBe("no_latest");

    await expect(
      resolveConflict(
        t.repo,
        withLatest(t.op, { status: "completed" }),
        "reapply_on_latest",
        t.key(),
        {
          actorId: ME,
        },
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR", details: { reapplyBlock: "completed" } });
    expect((await t.repo.sync.list()).map((o) => o.status)).toEqual(["needs_resolution"]);
    expect(await audits(t, "auditEvents")).toHaveLength(0);
  });

  it("a confirmed decision replays with the same key and cannot be made twice", async () => {
    const t = await conflicted();
    const key = t.key();
    await resolveConflict(t.repo, t.op, "keep_latest", key, { actorId: ME });
    const again = await resolveConflict(t.repo, t.op, "keep_latest", key, { actorId: ME });
    expect(again.replayed).toBe(true);
    await expect(
      resolveConflict(t.repo, t.op, "keep_latest", t.key(), { actorId: ME }),
    ).rejects.toMatchObject({ reason: "INVALID_TRANSITION" });
    expect(await audits(t, "auditEvents")).toHaveLength(1);
  });
});
