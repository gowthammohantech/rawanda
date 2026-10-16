/**
 * Restart persistence (FND-08 task 5; tech spec §8 "survives app restart"): write → close →
 * reopen → data present, for Dexie (reload) and SQLite (app restart).
 */
import type { AuditEvent, Screening, SyncOperation } from "@laif/domain";
import { PERSONA_IDS } from "@laif/mock-data";
import { afterEach, describe, expect, it } from "vitest";

import { openDexie, openSqliteFile, type ReopenableStore } from "../../test/adapters.ts";
import { createHarness, uuid } from "../testing/harness.ts";

const cases: [string, () => ReopenableStore][] = [
  ["dexie", openDexie],
  ["sqlite", openSqliteFile],
];

describe.each(cases)("restart persistence: %s", (_name, open) => {
  let opened: ReopenableStore | null = null;
  afterEach(async () => {
    await opened?.dispose();
    opened = null;
  });

  it("raw documents and meta survive close + reopen", async () => {
    opened = open();
    await opened.store.put("patients", { id: "p1", n: 1 });
    await opened.store.setMeta("k", "v");
    const again = await opened.reopen();
    expect(await again.get("patients", "p1")).toEqual({ id: "p1", n: 1 });
    expect(await again.getMeta("k")).toBe("v");
  });

  it("queued sync ops (localSeq order), a draft screening, idempotency, audit and demo meta persist", async () => {
    opened = open();
    const h = await createHarness({
      appId: "worker",
      personaId: PERSONA_IDS.chwAlpha1A,
      store: opened.store,
    });
    const patient = h.seed.patients.find((p) => p.facilityId === "fac-alpha-1")!;
    const firstKey = h.key();
    const first = await h.repo.createScreening(
      {
        patientId: patient.id,
        measuredAt: "2026-10-14T05:10:00.000Z",
        systolic: 126,
        diastolic: 80,
      },
      firstKey,
    );
    await h.repo.createScreening(
      {
        patientId: patient.id,
        measuredAt: "2026-10-14T05:20:00.000Z",
        systolic: 151,
        diastolic: 82,
      },
      h.key(),
    );
    const draft = await h.repo.saveScreeningDraft(
      { patientId: patient.id, systolic: 118 },
      h.key(),
    );
    await h.repo.demo.setFaults({ offline: true, latencyMs: [0, 0] });
    const opsBefore = await h.repo.sync.list();
    const auditBefore = await h.store.getAll<AuditEvent>("auditEvents");

    // Reload / app restart: a new adapter over the same database, a new repository.
    const store = await opened.reopen();
    const after = await createHarness({
      appId: "worker",
      personaId: PERSONA_IDS.chwAlpha1A,
      store,
      idPrefix: "restarted",
    });
    const ops = await after.repo.sync.list();
    expect(ops).toEqual(opsBefore);
    expect(ops.map((o: SyncOperation) => [o.localSeq, o.status])).toEqual([
      [1, "queued"],
      [2, "queued"],
    ]);
    expect(await store.get<Screening>("screenings", draft.data.id)).toMatchObject({
      status: "draft",
      systolic: 118,
    });
    expect(await store.getAll<AuditEvent>("auditEvents")).toEqual(auditBefore);
    expect((await after.repo.demo.getFaults()).offline).toBe(true);

    // Idempotency survives: replaying the first key returns the stored result.
    const replay = await after.repo.createScreening(
      {
        patientId: patient.id,
        measuredAt: "2026-10-14T05:10:00.000Z",
        systolic: 126,
        diastolic: 80,
      },
      firstKey,
    );
    expect(replay).toMatchObject({ replayed: true, data: { id: first.data.id } });

    // localSeq keeps increasing after the restart.
    await after.repo.createScreening(
      {
        patientId: patient.id,
        measuredAt: "2026-10-14T05:30:00.000Z",
        systolic: 122,
        diastolic: 78,
      },
      uuid(500), // the new harness's key counter restarts; use a key never used before
    );
    expect((await after.repo.sync.list()).map((o) => o.localSeq)).toEqual([1, 2, 3]);

    // Back online the persisted queue drains.
    await after.repo.demo.setFaults({ offline: false });
    expect(await after.repo.sync.process()).toMatchObject({ attempted: 3, acknowledged: 3 });
  });

  it("a transaction that throws mid-way leaves zero partial writes, also after reopen", async () => {
    opened = open();
    await opened.store.put("patients", { id: "keep", v: 1 });
    await expect(
      opened.store.transaction(async (tx) => {
        await tx.put("patients", { id: "keep", v: 2 });
        await tx.put("syncOperations", { id: "op-x" });
        await tx.setMeta("sync.localSeq", "99");
        throw new Error("mid-transaction failure");
      }),
    ).rejects.toThrow("mid-transaction failure");
    const again = await opened.reopen();
    expect(await again.get("patients", "keep")).toEqual({ id: "keep", v: 1 });
    expect(await again.getAll("syncOperations")).toEqual([]);
    expect(await again.getMeta("sync.localSeq")).toBeUndefined();
  });
});
