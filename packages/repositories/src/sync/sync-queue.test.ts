import type {
  AuditEvent,
  CareTask,
  FollowUp,
  Patient,
  Screening,
  SyncOperation,
} from "@laif/domain";
import { PERSONA_IDS, SEED_ANCHORS } from "@laif/mock-data";
import { describe, expect, it } from "vitest";

import { createHarness, type Harness } from "../testing/harness.ts";
import { backoffMs, SYNC_BACKOFF_MAX_MS, SYNC_MAX_AUTO_ATTEMPTS } from "./sync-queue.ts";

const worker = (opts: Parameters<typeof createHarness>[0] = {}) =>
  createHarness({ appId: "worker", personaId: PERSONA_IDS.chwAlpha1A, ...opts });

const localPatient = (h: Harness) => h.seed.patients.find((p) => p.facilityId === "fac-alpha-1")!;

const screeningInput = (h: Harness, systolic = 126) => ({
  patientId: localPatient(h).id,
  measuredAt: "2026-10-14T05:10:00.000Z",
  systolic,
  diastolic: 80,
});

const ops = (h: Harness) => h.repo.sync.list();
const remoteRows = <T>(
  h: Harness,
  c: "remote_screenings" | "remote_patients" | "remote_followUps" | "remote_auditEvents",
) => h.store.getAll<T>(c);
const actions = async (h: Harness, c: "auditEvents" | "remote_auditEvents" = "auditEvents") =>
  (await h.store.getAll<AuditEvent>(c)).map((e) => e.action);

describe("sync queue — enqueue", () => {
  it("local writes commit immediately and enqueue an op in the same transaction; drafts never", async () => {
    const h = await worker();
    const key = h.key();
    const created = await h.repo.createScreening(screeningInput(h), key);
    expect(await h.store.get("screenings", created.data.id)).toBeDefined();
    const [op] = await ops(h);
    expect(op).toMatchObject({
      status: "queued",
      localSeq: 1,
      idempotencyKey: key,
      entityType: "screening",
      entityId: created.data.id,
      opType: "create",
      baseVersion: null,
      attempts: 0,
    });
    await h.repo.saveScreeningDraft({ patientId: localPatient(h).id, systolic: 120 }, h.key());
    expect(await ops(h)).toHaveLength(1);
    const status = await h.repo.sync.getStatus();
    expect(status).toMatchObject({ pending: 1, total: 1, offline: false, lastRun: null });
    expect(status.byStatus.queued).toBe(1);
  });

  it("localSeq comes from a meta counter and keeps increasing across restarts", async () => {
    const h = await worker();
    await h.repo.createScreening(screeningInput(h), h.key());
    const again = h.restart();
    await again.repo.createScreening(screeningInput(h, 131), again.key());
    expect((await ops(h)).map((o) => o.localSeq)).toEqual([1, 2]);
  });
});

describe("sync queue — WF-02 end to end", () => {
  it("offline keeps ops queued; back online two concurrent process() ack each op exactly once", async () => {
    const h = await worker();
    const remoteBefore = (await remoteRows<Screening>(h, "remote_screenings")).length;
    await h.repo.demo.setFaults({ offline: true, latencyMs: [0, 0] });
    const a = await h.repo.createScreening(screeningInput(h, 121), h.key());
    const b = await h.repo.createScreening(screeningInput(h, 160), h.key());
    const offlineRun = await h.repo.sync.process({ trigger: "manual" });
    expect(offlineRun).toMatchObject({ offline: true, attempted: 0 });
    expect((await ops(h)).map((o) => o.status)).toEqual(["queued", "queued"]);
    expect(await remoteRows(h, "remote_screenings")).toHaveLength(remoteBefore);

    await h.repo.demo.setFaults({ offline: false });
    const p1 = h.repo.sync.process({ trigger: "online" });
    const p2 = h.repo.sync.process({ trigger: "manual" });
    expect(p1).toBe(p2);
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toBe(r2);
    expect(r1).toMatchObject({ attempted: 2, acknowledged: 2, duplicates: 0, offline: false });
    expect(await h.store.getAll("syncRuns")).toHaveLength(2); // the offline run + this one
    expect((await ops(h)).map((o) => [o.status, o.attempts])).toEqual([
      ["acknowledged", 1],
      ["acknowledged", 1],
    ]);
    const remote = await remoteRows<Screening>(h, "remote_screenings");
    expect(remote).toHaveLength(remoteBefore + 2);
    expect(remote.filter((s) => s.id === a.data.id)).toHaveLength(1);
    // The remote evaluates with its stored ruleset; the ack snapshot replaces the local row.
    const remoteB = remote.find((s) => s.id === b.data.id)!;
    expect(remoteB.status).toBe("review_required");
    expect(await h.store.get("screenings", b.data.id)).toEqual(remoteB);
    expect((await actions(h)).filter((x) => x === "sync.op_acknowledged")).toHaveLength(2);
    const status = await h.repo.sync.getStatus();
    expect(status.pending).toBe(0);
    expect(status.lastSyncedAt).toBe(r1.finishedAt);
  });

  it("dropped ack (timeout after commit) then retry → remote holds one entity, replayed", async () => {
    const h = await worker();
    const created = await h.repo.createScreening(screeningInput(h), h.key());
    await h.repo.demo.setFaults({ timeoutRate: 1, latencyMs: [0, 0] });
    const run1 = await h.repo.sync.process();
    expect(run1).toMatchObject({ attempted: 1, retryableFailures: 1 });
    const [failed] = await ops(h);
    expect(failed).toMatchObject({
      status: "retryable_failure",
      attempts: 1,
      lastError: { code: "TIMEOUT" },
    });
    expect(failed?.nextAttemptAt).not.toBeNull();
    // Not due yet: nothing is sent.
    await h.repo.demo.setFaults({ timeoutRate: 0 });
    expect((await h.repo.sync.process()).attempted).toBe(0);
    h.clock.advanceBy(10_000);
    const run2 = await h.repo.sync.process();
    expect(run2).toMatchObject({ acknowledged: 1, duplicates: 1 });
    const remote = (await remoteRows<Screening>(h, "remote_screenings")).filter(
      (s) => s.id === created.data.id,
    );
    expect(remote).toHaveLength(1);
    expect(await actions(h, "remote_auditEvents")).toContain("sync.duplicate_suppressed");
  });

  it("SCN-07 duplicate submission: one remote screening, second op acked as a duplicate", async () => {
    const h = await worker();
    await h.repo.demo.loadScenario("SCN-07-duplicate-submission");
    expect((await ops(h)).map((o) => o.status)).toEqual(["queued", "queued"]);
    const run = await h.repo.sync.process();
    expect(run).toMatchObject({ acknowledged: 2, duplicates: 1 });
    const id = (await ops(h))[0]!.entityId;
    expect(
      (await remoteRows<Screening>(h, "remote_screenings")).filter((s) => s.id === id),
    ).toHaveLength(1);
    expect(
      (await actions(h, "remote_auditEvents")).filter((a) => a === "sync.duplicate_suppressed"),
    ).toHaveLength(1);
  });

  it("SCN-08 offline sync + chain rule: a later amend created on the local version is rewritten", async () => {
    const h = await worker();
    await h.repo.demo.loadScenario("SCN-08-offline-sync");
    const [first] = await ops(h);
    const local = (await h.store.get<Screening>("screenings", first!.entityId))!;
    expect(local.version).toBe(3);
    await h.repo.amendScreening(
      {
        screeningId: local.id,
        expectedVersion: local.version,
        field: "systolic",
        after: 119,
        reason: "Typo corrected after re-reading the cuff.",
      },
      h.key(),
    );
    const queued = await ops(h);
    expect(queued.map((o) => [o.entityId === local.id, o.opType, o.baseVersion])).toEqual([
      [true, "create", null],
      [false, "create", null],
      [true, "update", 3],
    ]);
    const run = await h.repo.sync.process();
    expect(run).toMatchObject({ attempted: 3, acknowledged: 3, conflicts: 0 });
    const amend = (await ops(h)).find((o) => o.opType === "update")!;
    expect(amend.baseVersion).toBe(1);
    const remote = (await h.store.get<Screening>("remote_screenings", local.id))!;
    expect(remote.version).toBe(2);
    expect(remote.amendments).toHaveLength(1);
    expect(await h.store.get("screenings", local.id)).toEqual(remote);
  });

  it("SCN-09 version conflict → needs_resolution; re-apply on latest creates a new op that syncs", async () => {
    const h = await worker();
    await h.repo.demo.loadScenario("SCN-09-version-conflict");
    const run = await h.repo.sync.process();
    expect(run.conflicts).toBe(1);
    const [op] = await ops(h);
    const remoteFu = (await h.store.get<FollowUp>("remote_followUps", op!.entityId))!;
    expect(op).toMatchObject({ status: "needs_resolution", lastError: { code: "CONFLICT" } });
    expect(op?.serverSnapshot).toEqual(remoteFu);
    expect(await actions(h)).toContain("conflict.detected");
    expect((await h.repo.sync.getStatus()).needsDecision).toBe(1);

    const key = h.key();
    const resolved = await h.repo.sync.resolveConflict(
      op!.id,
      "reapply_on_latest",
      key,
      "Keep my visit note.",
    );
    expect(resolved.data).toMatchObject({
      status: "queued",
      resolvesOpId: op!.id,
      idempotencyKey: key,
      baseVersion: remoteFu.version,
    });
    const all = await ops(h);
    expect(all[0]?.status).toBe("superseded");
    const audit = (await h.store.getAll<AuditEvent>("auditEvents")).find(
      (e) => e.action === "sync.conflict_resolved",
    );
    expect(audit).toMatchObject({
      changeSummary: { originalOpId: op!.id, resolution: "reapply_on_latest" },
      justification: "Keep my visit note.",
    });
    const run2 = await h.repo.sync.process();
    expect(run2.acknowledged).toBe(1);
    const after = (await h.store.get<FollowUp>("remote_followUps", op!.entityId))!;
    expect(after.version).toBe(remoteFu.version + 1);
    expect(after.attempts).toHaveLength(remoteFu.attempts.length + 1);
    // Replaying the resolution with the same key is idempotent.
    const replay = await h.repo.sync.resolveConflict(
      op!.id,
      "reapply_on_latest",
      key,
      "Keep my visit note.",
    );
    expect(replay.replayed).toBe(true);
  });

  it("keep_latest refreshes the local entity from the server snapshot, keeps the withdrawn payload", async () => {
    const h = await worker();
    await h.repo.demo.loadScenario("SCN-09-version-conflict");
    await h.repo.sync.process();
    const [op] = await ops(h);
    await h.repo.sync.resolveConflict(op!.id, "keep_latest", h.key());
    const [superseded, ...rest] = await ops(h);
    // HWM-09: no new op for the entity — only the resolution notice for the server.
    expect(rest.map((o) => [o.entityType, o.entityId, o.opType])).toEqual([
      ["sync_operation", op!.id, "command"],
    ]);
    expect(superseded).toMatchObject({ status: "superseded", payload: op!.payload });
    expect(await h.store.get("followUps", op!.entityId)).toEqual(op!.serverSnapshot);
    await expect(h.repo.sync.resolveConflict(op!.id, "keep_latest", h.key())).rejects.toMatchObject(
      {
        code: "VALIDATION_ERROR",
        reason: "INVALID_TRANSITION",
      },
    );
  });

  it("remote edit before sending (another actor) → CONFLICT on the queued op", async () => {
    const h = await worker();
    const fu = (await h.store.get<FollowUp>(
      "followUps",
      SEED_ANCHORS.WF02_FOLLOWUP_CONFLICT.followUpId,
    ))!;
    await h.repo.updateFollowUp(
      {
        followUpId: fu.id,
        expectedVersion: fu.version,
        action: "add_note",
        note: "Visited today.",
      },
      h.key(),
    );
    const edited = await h.repo.sync.simulateRemoteEdit("followUp", fu.id, {
      dueAt: "2026-10-22T06:00:00.000Z",
    });
    expect(edited.version).toBe(fu.version + 1);
    expect(await actions(h, "remote_auditEvents")).toContain("demo.concurrent_update_simulated");
    const run = await h.repo.sync.process();
    expect(run.conflicts).toBe(1);
  });

  it("reassignment on the remote → FORBIDDEN TASK_REASSIGNED → rejected and kept", async () => {
    const h = await worker();
    const fu = (await h.store.get<FollowUp>(
      "followUps",
      SEED_ANCHORS.WF02_FOLLOWUP_CONFLICT.followUpId,
    ))!;
    await h.repo.updateFollowUp(
      {
        followUpId: fu.id,
        expectedVersion: fu.version,
        action: "record_attempt",
        at: "2026-10-14T05:00:00.000Z",
        method: "home_visit",
        result: "reached",
      },
      h.key(),
    );
    await h.repo.sync.simulateRemoteEdit("follow_up", fu.id, {
      assignedWorkerId: PERSONA_IDS.chwAlpha1B,
    });
    await h.repo.sync.process();
    const [op] = await ops(h);
    expect(op).toMatchObject({
      status: "rejected",
      lastError: { code: "FORBIDDEN", reason: "TASK_REASSIGNED" },
    });
    expect(await actions(h)).toContain("sync.op_rejected");
    expect(await h.store.get("followUps", fu.id)).toBeDefined();
  });

  it("cross-facility op → remote FORBIDDEN + access.denied; op rejected, not deleted", async () => {
    const h = await worker();
    const beta = h.seed.patients.find((p) => p.facilityId === "fac-beta-1")!;
    const crafted: SyncOperation = {
      ...(await (async () => {
        await h.repo.createScreening(screeningInput(h), h.key());
        return (await ops(h))[0]!;
      })()),
    };
    await h.store.put("syncOperations", {
      ...crafted,
      payload: { ...(crafted.payload as object), patientId: beta.id },
    });
    await h.repo.sync.process();
    const [op] = await ops(h);
    expect(op).toMatchObject({
      status: "rejected",
      lastError: { code: "FORBIDDEN", reason: "SCOPE" },
    });
    const denied = (await h.store.getAll<AuditEvent>("remote_auditEvents")).filter(
      (e) => e.action === "access.denied",
    );
    expect(denied).toHaveLength(1);
    expect(denied[0]).toMatchObject({ outcome: "denied", facilityId: "fac-beta-1" });
  });

  it("a correction request created offline keeps its id on the remote; ack adds no duplicate", async () => {
    const h = await worker();
    const patient = localPatient(h);
    const before = (await h.store.getAll<CareTask>("careTasks")).length;
    const created = await h.repo.requestCorrection(
      {
        patientId: patient.id,
        targetType: "patient",
        targetId: patient.id,
        description: "Date of birth looks wrong",
      },
      h.key(),
    );
    const run = await h.repo.sync.process();
    expect(run).toMatchObject({ attempted: 1, acknowledged: 1 });
    const local = await h.store.getAll<CareTask>("careTasks");
    expect(local).toHaveLength(before + 1);
    expect(await h.store.get("remote_careTasks", created.data.id)).toBeDefined();
    const [op] = await ops(h);
    expect((op?.serverSnapshot as { id: string } | null)?.id).toBe(created.data.id);
  });

  it("dependsOnOpId: a screening for a newly registered patient waits for the patient ack", async () => {
    const h = await worker();
    const patient = await h.repo.registerPatient(
      {
        givenName: "Demo",
        familyName: "Newperson",
        sex: "female",
        facilityId: "fac-alpha-1",
        estimatedAgeYears: 50,
      },
      h.key(),
    );
    await h.repo.createScreening({ ...screeningInput(h), patientId: patient.data.id }, h.key());
    const [patientOp, screeningOp] = await ops(h);
    expect(screeningOp?.dependsOnOpId).toBe(patientOp?.id);

    await h.repo.demo.setFaults({ serverErrorRate: 1, latencyMs: [0, 0] });
    const run = await h.repo.sync.process();
    expect(run).toMatchObject({ attempted: 1, retryableFailures: 1 });
    expect((await ops(h)).map((o) => o.status)).toEqual(["retryable_failure", "queued"]);

    await h.repo.demo.setFaults({ serverErrorRate: 0 });
    await h.repo.sync.retryNow(patientOp!.id);
    const run2 = await h.repo.sync.process();
    expect(run2.acknowledged).toBe(2);
    expect(await h.store.get<Patient>("remote_patients", patient.data.id)).toBeDefined();
    expect(await h.store.get<Screening>("remote_screenings", screeningOp!.entityId)).toBeDefined();
  });

  it("device revoked → waiting ops blocked_revoked until restoreDevice()", async () => {
    const h = await worker();
    await h.attachDevice();
    await h.repo.createScreening(screeningInput(h), h.key());
    await h.repo.sync.revokeDevice();
    expect((await ops(h)).map((o) => o.status)).toEqual(["blocked_revoked"]);
    expect((await h.repo.sync.process()).attempted).toBe(0);
    await expect(h.repo.sync.retryNow((await ops(h))[0]!.id)).rejects.toMatchObject({
      reason: "DEVICE_REVOKED",
    });
    expect(await actions(h)).toContain("device.revoked");
    await h.repo.sync.restoreDevice();
    expect((await ops(h)).map((o) => o.status)).toEqual(["queued"]);
    expect((await h.repo.sync.process()).acknowledged).toBe(1);
    expect(await actions(h)).toContain("device.restored");
  });

  it("deviceRevoked fault → remote answers FORBIDDEN DEVICE_REVOKED → blocked_revoked", async () => {
    const h = await worker();
    await h.repo.createScreening(screeningInput(h), h.key());
    await h.repo.createScreening(screeningInput(h, 133), h.key());
    await h.repo.demo.setFaults({ deviceRevoked: true });
    const run = await h.repo.sync.process();
    expect(run).toMatchObject({ attempted: 1, blocked: 1 });
    expect((await ops(h)).map((o) => o.status)).toEqual(["blocked_revoked", "blocked_revoked"]);
    expect((await h.repo.sync.getStatus()).deviceRevoked).toBe(true);
    await h.repo.sync.restoreDevice();
    expect((await h.repo.sync.process()).acknowledged).toBe(2);
  });

  it("crash recovery: a `sending` op is reset to `queued` on startup and synced once", async () => {
    const h = await worker();
    await h.repo.createScreening(screeningInput(h), h.key());
    const [op] = await ops(h);
    await h.store.put("syncOperations", { ...op!, status: "sending" });
    const restarted = h.restart();
    expect((await restarted.repo.sync.list()).map((o) => o.status)).toEqual(["queued"]);
    expect((await restarted.repo.sync.process()).acknowledged).toBe(1);
  });

  it("validation failure on the remote → rejected; retryNow refuses settled ops", async () => {
    const h = await worker();
    await h.repo.createScreening(screeningInput(h), h.key());
    const [op] = await ops(h);
    await h.store.put("syncOperations", {
      ...op!,
      payload: { ...(op!.payload as object), systolic: 999 },
    });
    await h.repo.sync.process();
    const [rejected] = await ops(h);
    expect(rejected).toMatchObject({ status: "rejected", lastError: { code: "VALIDATION_ERROR" } });
    await expect(h.repo.sync.retryNow(rejected!.id)).rejects.toMatchObject({
      reason: "INVALID_TRANSITION",
    });
  });

  it("unroutable ops are rejected", async () => {
    const h = await worker();
    await h.repo.createScreening(screeningInput(h), h.key());
    const [op] = await ops(h);
    await h.store.put("syncOperations", { ...op!, entityType: "district", opType: "command" });
    await h.repo.sync.process();
    expect((await ops(h))[0]).toMatchObject({
      status: "rejected",
      lastError: { reason: "INVALID_TRANSITION" },
    });
  });

  it("auto-retry stops after 8 attempts; retryNow still works", async () => {
    const h = await worker();
    await h.repo.createScreening(screeningInput(h), h.key());
    await h.repo.demo.setFaults({ dependencyUnavailableRate: 1, latencyMs: [0, 0] });
    for (let i = 0; i < SYNC_MAX_AUTO_ATTEMPTS + 2; i += 1) {
      await h.repo.sync.process({ trigger: "auto" });
      h.clock.advanceBy(SYNC_BACKOFF_MAX_MS * 2);
    }
    const [op] = await ops(h);
    expect(op).toMatchObject({ status: "retryable_failure", attempts: SYNC_MAX_AUTO_ATTEMPTS });
    await h.repo.demo.setFaults({ dependencyUnavailableRate: 0 });
    expect((await h.repo.sync.process()).attempted).toBe(0);
    await h.repo.sync.retryNow(op!.id);
    expect((await h.repo.sync.process()).acknowledged).toBe(1);
  });

  it("backoff = min(60 s, 2 s·2^(n−1)) ± 20 %, deterministic", () => {
    for (let attempt = 1; attempt <= 10; attempt += 1) {
      const base = Math.min(60_000, 2_000 * 2 ** (attempt - 1));
      const value = backoffMs(attempt, "op-1");
      expect(value).toBeGreaterThanOrEqual(base * 0.8);
      expect(value).toBeLessThanOrEqual(base * 1.2);
      expect(backoffMs(attempt, "op-1")).toBe(value);
    }
  });

  it("web apps have an empty queue and no simulated remote", async () => {
    const h = await createHarness({ personaId: PERSONA_IDS.clinAlpha1 });
    expect(await h.repo.sync.process()).toMatchObject({ attempted: 0 });
    await expect(h.repo.sync.simulateRemoteEdit("patient", "x", {})).rejects.toMatchObject({
      code: "DEPENDENCY_UNAVAILABLE",
    });
    expect(await h.repo.sync.list({ statuses: ["queued"] })).toEqual([]);
  });
});
