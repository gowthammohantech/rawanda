/**
 * ADM-03 programme actions over the in-memory adapter and Dexie (fake-indexeddb): idempotent
 * create, version conflict, terminal-state immutability, FORBIDDEN outside the grant / without
 * `programme_action.write`, and no clinical record touched.
 */
import type { AuditEvent } from "@laif/domain";
import { FACILITY_IDS, PERSONA_IDS } from "@laif/mock-data";
import { afterEach, describe, expect, it } from "vitest";

import { openDexie, type ReopenableStore } from "../test/adapters.ts";
import { createMemoryStoreAdapter } from "./store/memory-adapter.ts";
import type { StoreAdapter } from "./store/store-adapter.ts";
import { createHarness } from "./testing/harness.ts";

const input = {
  facilityId: FACILITY_IDS.alpha1,
  category: "data_completeness_check" as const,
  title: "Check missing glucose units",
  note: "Aggregate drill-down shows a low completion rate.",
  dueDate: "2026-10-30",
  sourceContext: { page: "funnel_stage" as const, stage: "reviewed", filters: { preset: "90d" } },
  correlationId: "corr-admin-session-1",
};

type Case = [string, () => { store: StoreAdapter; dispose: () => Promise<void> }];

let opened: ReopenableStore | null = null;
const cases: Case[] = [
  ["memory", () => ({ store: createMemoryStoreAdapter(), dispose: () => Promise.resolve() })],
  [
    "dexie",
    () => {
      opened = openDexie();
      return { store: opened.store, dispose: () => opened?.dispose() ?? Promise.resolve() };
    },
  ],
];

const CLINICAL = ["patients", "screenings", "reviews", "referrals", "followUps", "careTasks"];

async function snapshot(store: StoreAdapter) {
  return store.transaction(async (tx) =>
    Promise.all(CLINICAL.map((c) => tx.getAll(c as "patients"))),
  );
}

async function events(store: StoreAdapter, action: string): Promise<AuditEvent[]> {
  return (await store.getAll<AuditEvent>("auditEvents")).filter((e) => e.action === action);
}

describe.each(cases)("programme actions (%s)", (_name, make) => {
  let dispose: () => Promise<void> = () => Promise.resolve();
  afterEach(async () => {
    await dispose();
    opened = null;
  });

  async function setup(personaId: string = PERSONA_IDS.analystAlpha) {
    const made = make();
    dispose = made.dispose;
    return createHarness({ appId: "admin", personaId, store: made.store });
  }

  it("create is idempotent on the key: one record, one created event", async () => {
    const h = await setup();
    const before = await snapshot(h.store);
    const key = h.key();
    const first = await h.repo.createProgrammeAction(input, key);
    expect(first.replayed).toBe(false);
    expect(first.data).toMatchObject({
      facilityId: FACILITY_IDS.alpha1,
      districtId: "dist-alpha",
      status: "open",
      ownerRole: "facility_manager",
      version: 1,
      idempotencyKey: key,
      createdBy: PERSONA_IDS.analystAlpha,
      updatedBy: PERSONA_IDS.analystAlpha,
      synthetic: true,
    });
    // Double click / timeout + retry with the same key.
    const again = await h.repo.createProgrammeAction(input, key);
    expect(again.replayed).toBe(true);
    expect(again.data).toEqual(first.data);
    expect(await h.store.getAll("programmeActions")).toHaveLength(1);
    const created = await events(h.store, "admin.programme_action.created");
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      actorId: PERSONA_IDS.analystAlpha,
      actorRole: "district_analyst",
      entityType: "programme_action",
      entityId: first.data.id,
      facilityId: FACILITY_IDS.alpha1,
      districtId: "dist-alpha",
      patientId: null,
      correlationId: "corr-admin-session-1",
      outcome: "success",
    });
    // No clinical entity is written.
    expect(await snapshot(h.store)).toEqual(before);
    expect(await h.repo.listProgrammeActions()).toEqual([first.data]);
  });

  it("a timeout after commit + retry with the same key gives exactly one record", async () => {
    const h = await setup();
    const key = h.key();
    await h.repo.demo.setFaults({ timeoutRate: 1 });
    await expect(h.repo.createProgrammeAction(input, key)).rejects.toMatchObject({
      code: "TIMEOUT",
    });
    await h.repo.demo.setFaults({ timeoutRate: 0 });
    const retry = await h.repo.createProgrammeAction(input, key);
    expect(retry.replayed).toBe(true);
    expect(await h.store.getAll("programmeActions")).toHaveLength(1);
    expect(await events(h.store, "admin.programme_action.created")).toHaveLength(1);
  });

  it("validation: field errors with validation keys", async () => {
    const h = await setup();
    await expect(
      h.repo.createProgrammeAction(
        { ...input, title: "abc", dueDate: "2026-10-01", category: undefined as never },
        h.key(),
      ),
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      fieldErrors: {
        title: { key: "tooShort" },
        dueDate: { key: "dateOutOfRange" },
        category: { key: "required" },
      },
    });
  });

  it("status machine, version conflict, terminal immutability", async () => {
    const h = await setup();
    const { data } = await h.repo.createProgrammeAction(input, h.key());
    const started = await h.repo.updateProgrammeAction(
      { id: data.id, expectedVersion: 1, status: "in_progress" },
      h.key(),
    );
    expect(started.data).toMatchObject({ status: "in_progress", version: 2 });

    // Stale version → CONFLICT with the latest, nothing written.
    const stale = h.repo.updateProgrammeAction(
      { id: data.id, expectedVersion: 1, status: "done" },
      h.key(),
    );
    await expect(stale).rejects.toMatchObject({
      code: "CONFLICT",
      conflict: { expectedVersion: 1, currentVersion: 2, latest: { status: "in_progress" } },
    });
    const conflicts = await events(h.store, "conflict.detected");
    expect(conflicts.at(-1)).toMatchObject({
      entityType: "programme_action",
      entityId: data.id,
      changeSummary: { expectedVersion: 1, currentVersion: 2 },
    });

    // Simulated `conflict` fault (conflictOnce) on the next write.
    await h.repo.demo.setFaults({
      conflictOnce: [{ entityType: "programmeAction", entityId: data.id }],
    });
    await expect(
      h.repo.updateProgrammeAction({ id: data.id, expectedVersion: 2, status: "done" }, h.key()),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    // Re-applying on the latest version succeeds and is audited.
    const done = await h.repo.updateProgrammeAction(
      { id: data.id, expectedVersion: 2, status: "done", reapplied: true },
      h.key(),
    );
    expect(done.data).toMatchObject({ status: "done", version: 3 });
    const changed = await events(h.store, "admin.programme_action.status_changed");
    expect(changed.map((e) => e.changeSummary)).toEqual([
      expect.objectContaining({ fromStatus: "open", toStatus: "in_progress", reapplied: false }),
      expect.objectContaining({
        fromStatus: "in_progress",
        toStatus: "done",
        fromVersion: 2,
        toVersion: 3,
        reapplied: true,
      }),
    ]);

    // Terminal: no further edit or transition.
    await expect(
      h.repo.updateProgrammeAction({ id: data.id, expectedVersion: 3, note: "late" }, h.key()),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR", reason: "INVALID_TRANSITION" });
    expect((await h.repo.listProgrammeActions())[0]).toMatchObject({ status: "done", version: 3 });
  });

  it("cancel needs a reason, recorded as the justification", async () => {
    const h = await setup();
    const { data } = await h.repo.createProgrammeAction(input, h.key());
    await expect(
      h.repo.updateProgrammeAction(
        { id: data.id, expectedVersion: 1, status: "cancelled_with_reason" },
        h.key(),
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR", fieldErrors: { statusReason: {} } });
    const reason = "Duplicate of an existing supervision plan";
    const cancelled = await h.repo.updateProgrammeAction(
      { id: data.id, expectedVersion: 1, status: "cancelled_with_reason", statusReason: reason },
      h.key(),
    );
    expect(cancelled.data).toMatchObject({ status: "cancelled_with_reason", statusReason: reason });
    const [event] = await events(h.store, "admin.programme_action.status_changed");
    expect(event?.justification).toBe(reason);
    // open → done is not a legal transition.
    const other = await h.repo.createProgrammeAction(input, h.key());
    await expect(
      h.repo.updateProgrammeAction(
        { id: other.data.id, expectedVersion: 1, status: "done" },
        h.key(),
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR", reason: "INVALID_TRANSITION" });
  });

  it("FORBIDDEN outside the grant (scope) and without programme_action.write (role)", async () => {
    const h = await setup();
    await expect(
      h.repo.createProgrammeAction({ ...input, facilityId: FACILITY_IDS.beta1 }, h.key()),
    ).rejects.toMatchObject({ code: "FORBIDDEN", reason: "SCOPE" });
    const denied = await events(h.store, "access.denied");
    expect(denied.at(-1)).toMatchObject({ entityType: "programme_action", outcome: "denied" });
    expect(await h.store.getAll("programmeActions")).toHaveLength(0);

    const { data } = await h.repo.createProgrammeAction(input, h.key());
    // The facility manager can see the action in their facility but not assign / update.
    h.as(PERSONA_IDS.fmgrAlpha1);
    expect((await h.repo.listProgrammeActions()).map((a) => a.id)).toEqual([data.id]);
    await expect(h.repo.createProgrammeAction(input, h.key())).rejects.toMatchObject({
      code: "FORBIDDEN",
      reason: "ROLE",
    });
    await expect(
      h.repo.updateProgrammeAction(
        { id: data.id, expectedVersion: 1, status: "in_progress" },
        h.key(),
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN", reason: "ROLE" });
    // A Beta persona does not see Alpha actions.
    h.as(PERSONA_IDS.clinBeta1);
    await expect(h.repo.listProgrammeActions()).rejects.toMatchObject({ code: "FORBIDDEN" });
    h.as(PERSONA_IDS.leadProgramme);
    expect(await h.repo.listProgrammeActions({ districtIds: ["dist-beta"] })).toEqual([]);
  });
});
