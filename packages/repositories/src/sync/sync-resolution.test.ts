/**
 * HWM-09 additions to the FND-07 sync queue: a per-op server error does not stop the run,
 * `sync.retry_scheduled` / `sync.run_*` audits, the per-op `sync.history`, and the server-side
 * mirror of both conflict resolutions (`sync.conflict_resolved` with the ORIGINAL op id).
 */
import type { AuditEvent, FollowUp, SyncOperation } from "@laif/domain";
import { PERSONA_IDS } from "@laif/mock-data";
import { describe, expect, it } from "vitest";

import { createHarness, type Harness } from "../testing/harness.ts";
import { SYNC_MAX_AUTO_ATTEMPTS } from "./sync-queue.ts";

const worker = () => createHarness({ appId: "worker", personaId: PERSONA_IDS.chwAlpha1A });

const screening = (h: Harness, systolic: number) => ({
  patientId: h.seed.patients.find((p) => p.facilityId === "fac-alpha-1")!.id,
  measuredAt: "2026-10-14T05:10:00.000Z",
  systolic,
  diastolic: 80,
});

const events = async (h: Harness, c: "auditEvents" | "remote_auditEvents" = "auditEvents") =>
  h.store.getAll<AuditEvent>(c);
const named = async (h: Harness, action: string, c?: "auditEvents" | "remote_auditEvents") =>
  (await events(h, c)).filter((e) => e.action === action);

async function conflicted(h: Harness): Promise<SyncOperation> {
  await h.repo.demo.loadScenario("SCN-09-version-conflict");
  await h.repo.sync.process({ trigger: "manual" });
  const op = (await h.repo.sync.list({ statuses: ["needs_resolution"] }))[0];
  if (!op) throw new Error("no conflict");
  return op;
}

describe("retries (HWM-09)", () => {
  it("100% server errors: every op is tried, rescheduled with a growing nextAttemptAt, never removed", async () => {
    const h = await worker();
    await h.repo.createScreening(screening(h, 121), h.key());
    await h.repo.createScreening(screening(h, 131), h.key());
    await h.repo.demo.setFaults({ serverErrorRate: 1, latencyMs: [0, 0] });

    const run = await h.repo.sync.process({ trigger: "manual" });
    expect(run).toMatchObject({ attempted: 2, retryableFailures: 2 });
    const retries = await named(h, "sync.retry_scheduled");
    expect(retries).toHaveLength(2);
    expect(retries[0]?.changeSummary).toMatchObject({ attempt: 1, code: "INTERNAL" });

    const delays: number[] = [];
    for (let i = 0; i < 4; i += 1) {
      const [op] = await h.repo.sync.list();
      delays.push(Date.parse(op!.nextAttemptAt!) - h.clock.now().getTime());
      h.clock.advanceBy(70_000);
      await h.repo.sync.process({ trigger: "interval" });
    }
    expect(delays[1]!).toBeGreaterThan(delays[0]!);
    expect(delays[2]!).toBeGreaterThan(delays[1]!);
    const all = await h.repo.sync.list();
    expect(all).toHaveLength(2);
    expect(all.every((o) => o.status === "retryable_failure")).toBe(true);

    await h.repo.demo.setFaults({ serverErrorRate: 0 });
    h.clock.advanceBy(70_000);
    expect((await h.repo.sync.process({ trigger: "interval" })).acknowledged).toBe(2);
  });

  it("an unreachable server still ends the run at the first failure", async () => {
    const h = await worker();
    await h.repo.createScreening(screening(h, 121), h.key());
    await h.repo.createScreening(screening(h, 131), h.key());
    await h.repo.demo.setFaults({ dependencyUnavailableRate: 1, latencyMs: [0, 0] });
    expect(await h.repo.sync.process()).toMatchObject({ attempted: 1, retryableFailures: 1 });
  });

  it("the last automatic attempt is audited as exhausted (no next attempt)", async () => {
    const h = await worker();
    await h.repo.createScreening(screening(h, 121), h.key());
    await h.repo.demo.setFaults({ serverErrorRate: 1, latencyMs: [0, 0] });
    for (let i = 0; i < SYNC_MAX_AUTO_ATTEMPTS; i += 1) {
      await h.repo.sync.process({ trigger: "interval" });
      h.clock.advanceBy(120_000);
    }
    const last = (await named(h, "sync.retry_scheduled")).at(-1);
    expect(last?.changeSummary).toMatchObject({
      attempt: SYNC_MAX_AUTO_ATTEMPTS,
      nextAttemptAt: null,
      autoRetryExhausted: true,
    });
  });
});

describe("run audits (HWM-09)", () => {
  it("manual runs are audited even when idle; idle automatic runs are not", async () => {
    const h = await worker();
    await h.repo.sync.process({ trigger: "interval" });
    expect(await named(h, "sync.run_started")).toHaveLength(0);
    const run = await h.repo.sync.process({ trigger: "manual" });
    const started = await named(h, "sync.run_started");
    const finished = await named(h, "sync.run_finished");
    expect(started).toHaveLength(1);
    expect(started[0]).toMatchObject({
      entityId: run.id,
      changeSummary: { runId: run.id, trigger: "manual" },
    });
    expect(finished[0]?.changeSummary).toMatchObject({ runId: run.id, attempted: 0 });
    expect(await h.store.getAll("syncRuns")).toHaveLength(2);
  });

  it("an automatic run with ops to send is audited with its counts", async () => {
    const h = await worker();
    await h.repo.createScreening(screening(h, 121), h.key());
    await h.repo.sync.process({ trigger: "after_write" });
    const [finished] = await named(h, "sync.run_finished");
    expect(finished?.changeSummary).toMatchObject({ trigger: "after_write", acknowledged: 1 });
  });
});

describe("conflict resolution mirror (HWM-09, WF-02 step 5)", () => {
  it("keep_latest: local row refreshed, notice op synced, server mirrors with the original op id", async () => {
    const h = await worker();
    const op = await conflicted(h);
    const key = h.key();
    await h.repo.sync.resolveConflict(op.id, "keep_latest", key, "Clinician already called.");
    expect(await h.store.get<FollowUp>("followUps", op.entityId)).toEqual(op.serverSnapshot);

    const [local] = await named(h, "sync.conflict_resolved");
    const notice = (await h.repo.sync.list()).find((o) => o.entityType === "sync_operation")!;
    expect(local?.changeSummary).toMatchObject({
      originalOpId: op.id,
      resolution: "keep_latest",
      newOpId: null,
      noticeOpId: notice.id,
      latestVersion: (op.serverSnapshot as { version: number }).version,
    });
    expect(notice).toMatchObject({ entityId: op.id, opType: "command", idempotencyKey: key });
    // Nothing reached the server before the next run.
    expect(await named(h, "sync.conflict_resolved", "remote_auditEvents")).toHaveLength(0);

    const remoteBefore = await h.store.get<FollowUp>("remote_followUps", op.entityId);
    const run = await h.repo.sync.process({ trigger: "after_resolution" });
    expect(run.acknowledged).toBe(1);
    const mirrored = await named(h, "sync.conflict_resolved", "remote_auditEvents");
    expect(mirrored).toHaveLength(1);
    expect(mirrored[0]).toMatchObject({
      entityId: op.entityId,
      changeSummary: { originalOpId: op.id, resolution: "keep_latest", mirrored: true },
    });
    // The server copy is untouched; the local entity is not overwritten by the receipt.
    expect(await h.store.get("remote_followUps", op.entityId)).toEqual(remoteBefore);
    expect(await h.store.get("followUps", op.entityId)).toEqual(op.serverSnapshot);
    expect((await h.repo.sync.list()).find((o) => o.id === op.id)).toMatchObject({
      status: "superseded",
      payload: op.payload,
    });

    const history = (await h.repo.sync.history(op.id)).map((e) => e.action);
    expect(history).toEqual(["conflict.detected", "sync.conflict_resolved"]);
  });

  it("reapply_on_latest: the server mirrors once, when it applies the re-applied op", async () => {
    const h = await worker();
    const op = await conflicted(h);
    const resolved = await h.repo.sync.resolveConflict(op.id, "reapply_on_latest", h.key());
    const ops = await h.repo.sync.list();
    expect(ops.filter((o) => o.entityId === op.entityId && o.status !== "superseded")).toHaveLength(
      1,
    );
    await h.repo.sync.process({ trigger: "after_resolution" });
    const mirrored = await named(h, "sync.conflict_resolved", "remote_auditEvents");
    expect(mirrored).toHaveLength(1);
    expect(mirrored[0]?.changeSummary).toMatchObject({
      originalOpId: op.id,
      newOpId: resolved.data.id,
      resolution: "reapply_on_latest",
      mirrored: true,
    });
    const history = (await h.repo.sync.history(resolved.data.id)).map((e) => e.action);
    expect(history).toEqual(["sync.conflict_resolved", "sync.op_acknowledged"]);
  });
});

describe("sync.history (HWM-09)", () => {
  it("returns the op's audit trail (several ops at once) with the server event id of the ack", async () => {
    const h = await worker();
    const a = await h.repo.createScreening(screening(h, 121), h.key());
    const b = await h.repo.createScreening(screening(h, 131), h.key());
    await h.repo.sync.process({ trigger: "manual" });
    const [opA, opB] = await h.repo.sync.list();
    expect([opA?.entityId, opB?.entityId]).toEqual([a.data.id, b.data.id]);
    const one = await h.repo.sync.history(opA!.id);
    expect(one.map((e) => e.action)).toEqual(["sync.op_acknowledged"]);
    expect(one[0]?.changeSummary).toMatchObject({
      opId: opA!.id,
      serverEventId: expect.any(String) as unknown,
    });
    expect(await h.repo.sync.history([opA!.id, opB!.id])).toHaveLength(2);
  });
});
