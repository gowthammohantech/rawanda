// @vitest-environment node
/**
 * HWM-02 acceptance cases against the FND-07 sync queue + simulated remote over the FND-08
 * SQLite adapter (`createTestSqliteExecutor`, better-sqlite3), as the worker app runs it
 * (`appId: 'worker'`, one store holding local and `remote_*` collections).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import type { AuditEvent, FollowUp, Patient, Screening, SyncOperation } from "@laif/domain";
import { PERSONA_IDS } from "@laif/mock-data";
import { actorForPersona } from "@laif/auth-demo";
import { createSequentialIdGenerator } from "@laif/domain";
import { createCareRepository, createFaultInjector, type StoreAdapter } from "@laif/repositories";
import { createSqliteStoreAdapter } from "@laif/repositories/sqlite";
import {
  createTestClock,
  createTestRepository,
  testKey,
  type TestRepository,
} from "@laif/test-utils";
import { createTestSqliteExecutor } from "@laif/test-utils/sqlite";
import { describe, expect, it } from "vitest";

import { syncOpLabel } from "../opLabel.ts";

const PERSONA = PERSONA_IDS.chwAlpha1A;

const sqliteStore = (): StoreAdapter => createSqliteStoreAdapter(createTestSqliteExecutor());

const worker = (store: StoreAdapter = sqliteStore(), clockIso?: string) =>
  createTestRepository({
    appId: "worker",
    persona: PERSONA,
    store,
    ...(clockIso === undefined ? {} : { clockIso }),
  });

/** An app relaunch on the same database file: new process → new runtime ids, given device clock. */
const relaunch = (base: TestRepository, clockIso: string, run: string): TestRepository => ({
  ...base,
  repo: createCareRepository({
    store: base.store,
    clock: createTestClock(clockIso),
    ids: createSequentialIdGenerator(`run-${run}`),
    getActor: () => actorForPersona(base.persona(PERSONA)),
    appId: "worker",
    sleep: () => Promise.resolve(),
    faults: createFaultInjector(7, { latencyMs: [0, 0] }),
  }),
});

const localPatient = async (t: TestRepository): Promise<Patient> =>
  (await t.store.getAll<Patient>("patients")).find((p) => p.facilityId === "fac-alpha-1")!;

const submit = async (t: TestRepository, systolic = 126, key = t.key()) =>
  t.repo.createScreening(
    {
      patientId: (await localPatient(t)).id,
      // Before every clock used below (one restart runs with the device clock set back).
      measuredAt: "2026-10-11T05:10:00.000Z",
      systolic,
      diastolic: 80,
    },
    key,
  );

const ops = (t: TestRepository) => t.repo.sync.list();
const audit = async (t: TestRepository, c: "auditEvents" | "remote_auditEvents" = "auditEvents") =>
  t.store.getAll<AuditEvent>(c);
const remoteScreenings = (t: TestRepository) => t.store.getAll<Screening>("remote_screenings");

describe("worker sync on the FND queue (HWM-02, SQLite)", () => {
  it("a write whose transaction throws leaves neither the entity nor the sync op", async () => {
    const base = sqliteStore();
    let failOps = false;
    // Fails the sync-op insert inside the repository's write transaction.
    const failing: StoreAdapter = {
      ...base,
      transaction: (fn) =>
        base.transaction((tx) =>
          fn({
            ...tx,
            put: (c, v) =>
              failOps && c === "syncOperations"
                ? Promise.reject(new Error("disk full (simulated)"))
                : tx.put(c, v),
          }),
        ),
    };
    const t = await worker(failing);
    const before = (await t.store.getAll<Screening>("screenings")).length;
    const auditBefore = (await audit(t)).length;
    failOps = true;
    await expect(submit(t)).rejects.toBeDefined();
    failOps = false;
    expect(await t.store.getAll<Screening>("screenings")).toHaveLength(before);
    expect(await ops(t)).toHaveLength(0);
    expect(await audit(t)).toHaveLength(auditBefore);
  });

  it("localSeq strictly increases across restarts and ignores device time", async () => {
    const store = sqliteStore();
    const first = await worker(store);
    await submit(first, 126, testKey(101));
    // Restart with the device clock set two days BACK.
    const second = relaunch(first, "2026-10-12T06:00:00.000Z", "2");
    await submit(second, 131, testKey(102));
    const third = relaunch(first, "2026-10-14T06:00:00.000Z", "3");
    await submit(third, 140, testKey(103));
    const all = await ops(third);
    expect(all.map((o) => o.localSeq)).toEqual([1, 2, 3]);
    expect(Date.parse(all[1]!.deviceTimestamp)).toBeLessThan(Date.parse(all[0]!.deviceTimestamp));
    expect(new Set(all.map((o) => o.idempotencyKey)).size).toBe(3);
    expect(all.map(syncOpLabel)).toEqual([
      "screening.submit",
      "screening.submit",
      "screening.submit",
    ]);
  });

  it("two concurrent process() calls → one syncRuns row and one remote apply per op", async () => {
    const t = await worker();
    const a = await submit(t, 121);
    const b = await submit(t, 160);
    const remoteBefore = (await remoteScreenings(t)).length;
    const [r1, r2] = await Promise.all([
      t.repo.sync.process({ trigger: "manual" }),
      t.repo.sync.process({ trigger: "manual_dev" }),
    ]);
    expect(r1).toEqual(r2);
    expect(await t.store.getAll("syncRuns")).toHaveLength(1);
    expect((await ops(t)).map((o) => [o.status, o.attempts])).toEqual([
      ["acknowledged", 1],
      ["acknowledged", 1],
    ]);
    const remote = await remoteScreenings(t);
    expect(remote).toHaveLength(remoteBefore + 2);
    expect(remote.filter((s) => s.id === a.data.id)).toHaveLength(1);
    expect(remote.filter((s) => s.id === b.data.id)).toHaveLength(1);
    expect((await t.repo.sync.getStatus()).pending).toBe(0);
  });

  it("timeoutRate=1 then 0: the same op is sent twice, the remote holds one entity, replayed", async () => {
    const t = await worker();
    const created = await submit(t);
    await t.repo.demo.setFaults({ timeoutRate: 1 });
    expect((await t.repo.sync.process()).retryableFailures).toBe(1);
    await t.repo.demo.setFaults({ timeoutRate: 0 });
    t.advance(10_000);
    const run = await t.repo.sync.process();
    expect(run).toMatchObject({ acknowledged: 1, duplicates: 1 });
    const [op] = await ops(t);
    expect(op).toMatchObject({ status: "acknowledged", attempts: 2 });
    expect((await remoteScreenings(t)).filter((s) => s.id === created.data.id)).toHaveLength(1);
    const ack = (await audit(t)).find((e) => e.action === "sync.op_acknowledged");
    expect(ack?.changeSummary).toMatchObject({ replayed: true });
    expect((await audit(t, "remote_auditEvents")).map((e) => e.action)).toContain(
      "sync.duplicate_suppressed",
    );
  });

  it("offline: ops stay queued and remote_* is unchanged", async () => {
    const t = await worker();
    await t.repo.demo.setFaults({ offline: true });
    await submit(t);
    const remoteBefore = await remoteScreenings(t);
    const remoteAuditBefore = await audit(t, "remote_auditEvents");
    const run = await t.repo.sync.process();
    expect(run).toMatchObject({ offline: true, attempted: 0 });
    expect((await ops(t)).map((o) => o.status)).toEqual(["queued"]);
    expect(await remoteScreenings(t)).toEqual(remoteBefore);
    expect(await audit(t, "remote_auditEvents")).toEqual(remoteAuditBefore);
  });

  it("cross-facility op → remote FORBIDDEN + access.denied; op rejected, not deleted", async () => {
    const t = await worker();
    const beta = (await t.store.getAll<Patient>("remote_patients")).find(
      (p) => p.facilityId === "fac-beta-1",
    )!;
    await submit(t);
    const [op] = await ops(t);
    await t.store.put<SyncOperation>("syncOperations", {
      ...op!,
      payload: { ...(op!.payload as object), patientId: beta.id },
    });
    await t.repo.sync.process();
    const [after] = await ops(t);
    expect(after).toMatchObject({ status: "rejected", lastError: { code: "FORBIDDEN" } });
    const denied = (await audit(t, "remote_auditEvents")).filter(
      (e) => e.action === "access.denied",
    );
    expect(denied).toHaveLength(1);
    expect((await audit(t)).map((e) => e.action)).toContain("sync.op_rejected");
  });

  it("conflictOnce → CONFLICT with a latest snapshot; op ends needs_resolution, not deleted", async () => {
    const t = await worker();
    const followUp = (
      await t.repo.listFollowUps({ assignedWorkerId: PERSONA, pageSize: 100 })
    ).items.find((f: FollowUp) => f.completedAt === null && f.outcome === null)!;
    await t.repo.updateFollowUp(
      {
        followUpId: followUp.id,
        expectedVersion: followUp.version,
        action: "record_attempt",
        at: "2026-10-14T05:30:00.000Z",
        method: "home_visit",
        result: "not_reached",
        durationMinutes: 15,
      },
      t.key(),
    );
    const [queued] = await ops(t);
    expect(syncOpLabel(queued!)).toBe("followup.attempt");
    await t.repo.demo.setFaults({
      conflictOnce: [{ entityType: "followUp", entityId: followUp.id }],
    });
    const run = await t.repo.sync.process();
    expect(run.conflicts).toBe(1);
    const [op] = await ops(t);
    const latest = await t.store.get<FollowUp>("remote_followUps", followUp.id);
    expect(op).toMatchObject({ status: "needs_resolution", lastError: { code: "CONFLICT" } });
    expect(op!.serverSnapshot).toEqual(latest);
    expect((await t.repo.sync.getStatus()).needsDecision).toBe(1);
  });

  it("killed while `sending` → next launch resets it to queued; one remote entity after sync", async () => {
    const store = sqliteStore();
    const t = await worker(store);
    const created = await submit(t);
    const [op] = await ops(t);
    await store.put<SyncOperation>("syncOperations", { ...op!, status: "sending" });
    const relaunched = await worker(store);
    expect((await ops(relaunched)).map((o) => o.status)).toEqual(["queued"]);
    expect((await relaunched.repo.sync.process()).acknowledged).toBe(1);
    expect(
      (await remoteScreenings(relaunched)).filter((s) => s.id === created.data.id),
    ).toHaveLength(1);
  });

  it("network simulation settings persist across restart (store meta demo.faults)", async () => {
    const store = sqliteStore();
    const t = await worker(store);
    await t.repo.demo.setFaults({ offline: true, serverErrorRate: 1, latencyMs: [1500, 3000] });
    const restarted = await worker(store);
    expect(await restarted.repo.demo.getFaults()).toMatchObject({
      offline: true,
      serverErrorRate: 1,
      latencyMs: [1500, 3000],
    });
  });
});

describe("one sync design (HWM-02)", () => {
  it("apps/worker-mobile contains no SQL schema, outbox table or second database file", () => {
    const root = fileURLToPath(new URL("../../../", import.meta.url));
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        if (["node_modules", "dist", ".expo", ".turbo", ".expo-export-check"].includes(name)) {
          continue;
        }
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else files.push(path);
      }
    };
    walk(join(root, "src"));
    walk(join(root, "app"));
    const self = fileURLToPath(import.meta.url);
    const offenders = files
      .filter((file) => file !== self && /\.(ts|tsx|sql|db)$/u.test(file))
      .filter((file) => {
        if (/\.(sql|db)$/u.test(file)) return true;
        const text = readFileSync(file, "utf8");
        return /CREATE\s+TABLE|outbox_|["'][^"'\n]*\.db["']|openDatabase/iu.test(text);
      })
      .map((file) => relative(root, file));
    expect(offenders).toEqual([]);
  });
});
