// @vitest-environment node
/**
 * HWM-05 "interrupted" state on the real SQLite adapter (better-sqlite3 FILE database, as the
 * device runs it): a draft saved by autosave survives closing the database and relaunching the
 * app on the same file, and is never queued for sync.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { actorForPersona } from "@laif/auth-demo";
import { createSequentialIdGenerator, type Screening, type SyncOperation } from "@laif/domain";
import { FACILITY_IDS, PERSONA_IDS } from "@laif/mock-data";
import {
  createCareRepository,
  createFaultInjector,
  sqliteDbFileName,
  type StoreAdapter,
} from "@laif/repositories";
import { createSqliteStoreAdapter } from "@laif/repositories/sqlite";
import { createTestClock, createTestRepository } from "@laif/test-utils";
import { createTestSqliteExecutor } from "@laif/test-utils/sqlite";
import { afterEach, describe, expect, it } from "vitest";

import * as drafts from "../drafts.ts";

const WORKER = PERSONA_IDS.chwAlpha1A;
const FACILITY = FACILITY_IDS.alpha1;
const scope = { workerId: WORKER, facilityId: FACILITY };

let dir: string | null = null;
afterEach(() => {
  if (dir !== null) rmSync(dir, { recursive: true, force: true });
  dir = null;
});

describe("screening drafts on SQLite (HWM-05)", () => {
  it("a saved draft survives closing and reopening the database file", async () => {
    dir = mkdtempSync(join(tmpdir(), "hwm05-"));
    const file = join(dir, sqliteDbFileName("worker"));

    const first = createTestSqliteExecutor(file);
    const t = await createTestRepository({
      appId: "worker",
      persona: WORKER,
      store: createSqliteStoreAdapter(first),
    });
    const patient = (await t.store.getAll<{ id: string; facilityId: string }>("patients")).find(
      (p) => p.facilityId === FACILITY,
    )!;
    const draft = await drafts.create(t.repo, patient.id, t.key());
    await drafts.save(
      t.repo,
      draft,
      { systolic: 141, diastolic: null, glucoseValue: 7.8, glucoseUnit: "mmol/L" },
      t.key(),
    );
    first.db.close(); // the app is killed

    const reopened: StoreAdapter = createSqliteStoreAdapter(createTestSqliteExecutor(file));
    const repo = createCareRepository({
      store: reopened,
      clock: createTestClock("2026-10-14T08:00:00.000Z"),
      ids: createSequentialIdGenerator("relaunch"),
      getActor: () => actorForPersona(t.persona(WORKER)),
      appId: "worker",
      sleep: () => Promise.resolve(),
      faults: createFaultInjector(7, { latencyMs: [0, 0] }),
    });

    const access = await drafts.get(repo, scope, draft.id);
    expect(access.status).toBe("ok");
    const restored = (access as { draft: Screening }).draft;
    expect(restored).toMatchObject({
      status: "draft",
      systolic: 141,
      diastolic: null,
      glucoseValue: 7.8,
      glucoseUnit: "mmol/L",
      glucoseContext: null,
    });
    expect((await drafts.listForWorker(repo, scope)).map((r) => r.draft.id)).toContain(draft.id);
    const ops = await reopened.getAll<SyncOperation>("syncOperations");
    expect(ops.filter((op) => op.entityId === draft.id)).toEqual([]);
  });
});
