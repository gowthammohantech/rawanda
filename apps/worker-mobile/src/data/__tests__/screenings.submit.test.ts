// @vitest-environment node
/**
 * HWM-06 `submitFromDraft` against the FND-07 repository + sync queue on the FND-08 SQLite
 * adapter (better-sqlite3, as the device runs it): atomicity (screening + `screening.submit` op
 * + audit + draft deletion in ONE transaction), idempotent resubmit / double tap (T-04), the
 * dependency on a pending `patient.register` op, survive-restart (tech spec §8), stale drafts.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { actorForPersona } from "@laif/auth-demo";
import {
  createSequentialIdGenerator,
  type AuditEvent,
  type Patient,
  type Screening,
  type SyncOperation,
} from "@laif/domain";
import { FACILITY_IDS, PERSONA_IDS } from "@laif/mock-data";
import {
  createCareRepository,
  createFaultInjector,
  sqliteDbFileName,
  type StoreAdapter,
} from "@laif/repositories";
import { createSqliteStoreAdapter } from "@laif/repositories/sqlite";
import { createTestClock, createTestRepository, type TestRepository } from "@laif/test-utils";
import { createTestSqliteExecutor } from "@laif/test-utils/sqlite";
import { afterEach, describe, expect, it } from "vitest";

import { syncOpLabel } from "../opLabel.ts";
import * as drafts from "../drafts.ts";
import * as screenings from "../screenings.ts";

const WORKER = PERSONA_IDS.chwAlpha1A;
const FACILITY = FACILITY_IDS.alpha1;
const scope = { workerId: WORKER, facilityId: FACILITY };

const sqliteStore = (file?: string): StoreAdapter =>
  createSqliteStoreAdapter(createTestSqliteExecutor(file));

const worker = (store: StoreAdapter = sqliteStore()) =>
  createTestRepository({ appId: "worker", persona: WORKER, store });

const patientOf = async (t: TestRepository): Promise<Patient> =>
  (await t.store.getAll<Patient>("patients")).find((p) => p.facilityId === FACILITY)!;

/** A complete draft (valid for Review). */
async function readyDraft(t: TestRepository, patientId?: string, systolic = 150) {
  const pid = patientId ?? (await patientOf(t)).id;
  const draft = await drafts.create(t.repo, pid, t.key());
  return drafts.save(
    t.repo,
    draft,
    {
      systolic,
      diastolic: 92,
      glucoseValue: 6.1,
      glucoseUnit: "mmol/L",
      glucoseContext: "fasting",
      notes: "private note about the visit",
    },
    t.key(),
  );
}

const now = (t: TestRepository) => t.clock.now();
const opsOf = async (t: TestRepository, id: string) =>
  (await t.repo.sync.list()).filter((op) => op.entityId === id);
const audits = async (t: TestRepository, action: string, entityId?: string) =>
  (await t.store.getAll<AuditEvent>("auditEvents")).filter(
    (e) => e.action === action && (entityId === undefined || e.entityId === entityId),
  );

let dir: string | null = null;
afterEach(() => {
  if (dir !== null) rmSync(dir, { recursive: true, force: true });
  dir = null;
});

describe("screenings.submitFromDraft (HWM-06)", () => {
  it("offline: one screening (draft id), one screening.submit op, audit, draft deleted", async () => {
    const t = await worker();
    await t.repo.demo.setFaults({ offline: true });
    const draft = await readyDraft(t);

    const outcome = await screenings.submitFromDraft(t.repo, scope, draft.id, now(t));
    expect(outcome).toMatchObject({ status: "submitted", replayed: false });
    const screening = (outcome as { screening: Screening }).screening;
    expect(screening).toMatchObject({
      id: draft.id,
      systolic: 150,
      diastolic: 92,
      glucoseValue: 6.1,
      glucoseUnit: "mmol/L",
      glucoseContext: "fasting",
      amendments: [],
    });
    expect(typeof screening.rulesetVersion).toBe("string");
    expect(screening.flag?.displayDisclaimer).toBe("DEMO_RULE_NOT_CLINICALLY_VALIDATED");

    const rows = (await t.store.getAll<Screening>("screenings")).filter((s) => s.id === draft.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).not.toBe("draft");
    expect((await drafts.listForWorker(t.repo, scope)).map((r) => r.draft.id)).not.toContain(
      draft.id,
    );
    const ops = await opsOf(t, draft.id);
    expect(ops).toHaveLength(1);
    expect(syncOpLabel(ops[0]!)).toBe("screening.submit");
    expect(ops[0]?.status).toBe("queued");
    expect(ops[0]?.idempotencyKey).toBe(screenings.submitKeyFor(draft.id));

    const [submitted] = await audits(t, "screening.submitted", draft.id);
    expect(submitted?.entityId).toBe(draft.id);
    expect(submitted?.changeSummary).toMatchObject({
      rulesetVersion: screening.rulesetVersion,
      reasonCodes: screening.flag?.reasonCodes,
    });
    // Values + units in the audit summary, never the free-text notes.
    expect(JSON.stringify(submitted?.changeSummary)).not.toContain("private note");

    // Offline: a sync pass sends nothing.
    const run = await t.repo.sync.process({ trigger: "auto" });
    expect(run.offline).toBe(true);
    expect((await opsOf(t, draft.id))[0]?.status).toBe("queued");
  });

  it("a failing transaction leaves the draft and writes no screening, op or audit (atomic)", async () => {
    const base = sqliteStore();
    let fail = false;
    const failing: StoreAdapter = {
      ...base,
      transaction: (fn) =>
        base.transaction((tx) =>
          fn({
            ...tx,
            put: (c, v) =>
              fail && c === "syncOperations"
                ? Promise.reject(new Error("disk full (simulated)"))
                : tx.put(c, v),
          }),
        ),
    };
    const t = await worker(failing);
    const draft = await readyDraft(t);
    const submittedBefore = (await audits(t, "screening.submitted")).length;
    fail = true;
    await expect(screenings.submitFromDraft(t.repo, scope, draft.id, now(t))).rejects.toBeDefined();
    fail = false;
    expect(await t.store.get<Screening>("screenings", draft.id)).toMatchObject({ status: "draft" });
    expect(await opsOf(t, draft.id)).toEqual([]);
    expect(await audits(t, "screening.submitted")).toHaveLength(submittedBefore);
    // Retry after the failure works normally.
    const retry = await screenings.submitFromDraft(t.repo, scope, draft.id, now(t));
    expect(retry.status).toBe("submitted");
    expect(await opsOf(t, draft.id)).toHaveLength(1);
  });

  it("double tap / resubmit → one screening and one op (T-04)", async () => {
    const t = await worker();
    const draft = await readyDraft(t);
    const [a, b] = await Promise.all([
      screenings.submitFromDraft(t.repo, scope, draft.id, now(t)),
      screenings.submitFromDraft(t.repo, scope, draft.id, now(t)),
    ]);
    expect(a).toEqual(b);
    const again = await screenings.submitFromDraft(t.repo, scope, draft.id, now(t));
    expect(again).toMatchObject({ status: "submitted", replayed: true });
    expect((again as { screening: Screening }).screening.id).toBe(draft.id);
    expect(
      (await t.store.getAll<Screening>("screenings")).filter((s) => s.id === draft.id),
    ).toHaveLength(1);
    expect(await opsOf(t, draft.id)).toHaveLength(1);
    expect(await audits(t, "screening.submitted", draft.id)).toHaveLength(1);

    // Even the raw repository call with the same key is a replay (no second op).
    const input = await t.store.get<Screening>("screenings", draft.id);
    const replay = await t.repo.createScreening(
      (await t.repo.sync.list({ entityId: draft.id }))[0]!.payload as never,
      screenings.submitKeyFor(draft.id),
      { fromDraftId: draft.id },
    );
    expect(replay.replayed).toBe(true);
    expect(replay.data.id).toBe(input?.id);
    expect(await opsOf(t, draft.id)).toHaveLength(1);
  });

  it("depends on the patient's pending patient.register op; synced in order", async () => {
    const t = await worker();
    await t.repo.demo.setFaults({ offline: true });
    const registered = await t.repo.registerPatient(
      {
        givenName: "Aline",
        familyName: "Testera",
        estimatedAgeYears: 44,
        sex: "female",
        facilityId: FACILITY,
      },
      t.key(),
    );
    const draft = await readyDraft(t, registered.data.id, 128);
    await screenings.submitFromDraft(t.repo, scope, draft.id, now(t));
    const patientOp = (await opsOf(t, registered.data.id))[0]!;
    const screeningOp = (await opsOf(t, draft.id))[0]!;
    expect(syncOpLabel(patientOp)).toBe("patient.register");
    expect(screeningOp.dependsOnOpId).toBe(patientOp.id);

    await t.repo.demo.setFaults({ offline: false });
    await t.repo.sync.process({ trigger: "manual" });
    const after = await t.repo.sync.list();
    expect(after.find((o) => o.id === patientOp.id)?.status).toBe("acknowledged");
    expect(after.find((o) => o.id === screeningOp.id)?.status).toBe("acknowledged");
    expect(await t.store.get("remote_screenings", draft.id)).toBeDefined();
  });

  it("after sync: server-derived status replaces the preview (preview → confirmed)", async () => {
    const t = await worker();
    await t.repo.demo.setFaults({ offline: true });
    const draft = await readyDraft(t, undefined, 160);
    const outcome = await screenings.submitFromDraft(t.repo, scope, draft.id, now(t));
    const local = (outcome as { screening: Screening }).screening;
    const pending = screenings.screeningSyncView(local, await t.repo.sync.list());
    expect(pending).toMatchObject({
      state: "saved_locally",
      serverConfirmed: false,
      serverStatus: null,
      preview: true,
      syncedAt: null,
    });

    await t.repo.demo.setFaults({ offline: false });
    await t.repo.sync.process({ trigger: "manual" });
    const row = (await t.repo.getScreening(draft.id))!;
    const synced = screenings.screeningSyncView(row, await t.repo.sync.list());
    expect(synced).toMatchObject({
      state: "synced",
      serverConfirmed: true,
      serverStatus: "review_required",
      preview: false,
      attempts: 1,
    });
    expect(synced.syncedAt).not.toBeNull();
    expect(synced.flag?.requiresReview).toBe(true);
  });

  it("survives an app kill: pending screening + op on the reopened SQLite file", async () => {
    dir = mkdtempSync(join(tmpdir(), "hwm06-"));
    const file = join(dir, sqliteDbFileName("worker"));
    const first = createTestSqliteExecutor(file);
    const t = await worker(createSqliteStoreAdapter(first));
    await t.repo.demo.setFaults({ offline: true });
    const draft = await readyDraft(t);
    await screenings.submitFromDraft(t.repo, scope, draft.id, now(t));
    first.db.close(); // killed

    const reopened = sqliteStore(file);
    const repo = createCareRepository({
      store: reopened,
      clock: createTestClock("2026-10-14T08:00:00.000Z"),
      ids: createSequentialIdGenerator("relaunch"),
      getActor: () => actorForPersona(t.persona(WORKER)),
      appId: "worker",
      sleep: () => Promise.resolve(),
      faults: createFaultInjector(7, { latencyMs: [0, 0] }),
    });
    const access = await screenings.get(repo, scope, draft.id);
    expect(access.status).toBe("ok");
    expect((await repo.sync.getStatus()).pending).toBe(1);
    const ops = await reopened.getAll<SyncOperation>("syncOperations");
    expect(ops.filter((op) => op.entityId === draft.id)).toHaveLength(1);
    // Re-submitting after the restart is a no-op.
    const clockNow = new Date((await repo.demo.getDemoState()).clockIso);
    const again = await screenings.submitFromDraft(repo, scope, draft.id, clockNow);
    expect(again).toMatchObject({ status: "submitted", replayed: true });
    expect((await repo.sync.getStatus()).pending).toBe(1);
  });

  it("stale / invalid draft → invalid fields, nothing written; other author → missing", async () => {
    const t = await worker();
    const patient = await patientOf(t);
    const draft = await drafts.create(t.repo, patient.id, t.key());
    await drafts.save(t.repo, draft, { systolic: 150, diastolic: null }, t.key());
    const outcome = await screenings.submitFromDraft(t.repo, scope, draft.id, now(t));
    expect(outcome).toEqual({ status: "invalid", fields: ["diastolic"] });
    expect(await opsOf(t, draft.id)).toEqual([]);

    const ready = await readyDraft(t);
    t.as(PERSONA_IDS.chwAlpha1B);
    const other = await screenings.submitFromDraft(
      t.repo,
      { workerId: PERSONA_IDS.chwAlpha1B, facilityId: FACILITY },
      ready.id,
      now(t),
    );
    expect(other.status).toBe("missing");
    expect(await t.store.get<Screening>("screenings", ready.id)).toMatchObject({ status: "draft" });
  });
});
