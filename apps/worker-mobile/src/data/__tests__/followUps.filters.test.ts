// @vitest-environment node
/**
 * HWM-07 data layer: Due / Overdue / Completed filters, counts (= list lengths = Today), scope
 * (only my follow-ups in my facility), derived overdue that moves with the demo clock without
 * any write, search, ordering, the audited scope-checked detail and per-attempt sync state.
 */
import type { AuditEvent, FollowUp, SyncOperation } from "@laif/domain";
import { FACILITY_IDS, PERSONA_IDS } from "@laif/mock-data";
import { createTestRepository, type TestRepository } from "@laif/test-utils";
import { describe, expect, it } from "vitest";

import { computeTodaySummary } from "../../features/home/todaySummary.ts";
import * as followUps from "../followUps.ts";

const WORKER = PERSONA_IDS.chwAlpha1A;
const FACILITY = FACILITY_IDS.alpha1;
const SCOPE = { workerId: WORKER, facilityId: FACILITY };
const DAY_MS = 24 * 60 * 60 * 1000;

const worker = (offline = false) =>
  createTestRepository({
    appId: "worker",
    persona: WORKER,
    ...(offline ? { faults: { offline: true } } : {}),
  });

const audits = async (t: TestRepository, action: string) =>
  (await t.store.getAll<AuditEvent>("auditEvents")).filter((e) => e.action === action);

const writeCount = async (t: TestRepository) =>
  (await t.store.getAll<SyncOperation>("syncOperations")).length +
  (await t.store.getAll<AuditEvent>("auditEvents")).length;

const ids = (list: followUps.TaskList) => list.items.map((row) => row.followUp.id);

describe("followUps.listByFilter / counts (HWM-07 tasks 1–2)", () => {
  it("splits my follow-ups into due / overdue / completed; counts equal list lengths", async () => {
    const t = await worker();
    const due = await followUps.listByFilter(t.repo, SCOPE, { filter: "due" });
    const overdue = await followUps.listByFilter(t.repo, SCOPE, { filter: "overdue" });
    const completed = await followUps.listByFilter(t.repo, SCOPE, { filter: "completed" });

    expect(due.counts).toEqual({ due: 3, overdue: 2, completed: 2 });
    expect(due.counts.due).toBe(due.items.length);
    expect(due.counts.overdue).toBe(overdue.items.length);
    expect(due.counts.completed).toBe(completed.items.length);
    expect(await followUps.counts(t.repo, SCOPE)).toEqual(due.counts);

    // Every row is mine, in my facility.
    for (const row of [...due.items, ...overdue.items, ...completed.items]) {
      expect(row.followUp.assignedWorkerId).toBe(WORKER);
      expect(row.followUp.facilityId).toBe(FACILITY);
      expect(row.patientName).not.toBe("");
    }
    // Sorted: due/overdue by due date ascending, completed by completion (newest first).
    const dueAts = (l: followUps.TaskList) => l.items.map((r) => r.followUp.dueAt);
    expect(dueAts(due)).toEqual([...dueAts(due)].sort());
    expect(dueAts(overdue)).toEqual([...dueAts(overdue)].sort());
    const done = completed.items.map((r) => r.followUp.completedAt!);
    expect(done).toEqual([...done].sort().reverse());
    expect(overdue.items.map((r) => r.daysOverdue)).toEqual([5, 2]);
    expect(completed.items.every((r) => r.followUp.status === "completed")).toBe(true);
  });

  it("tab counts equal Today's numbers for the same demo date (shared overdue rule)", async () => {
    const t = await worker();
    const { counts, nowIso } = await followUps.listByFilter(t.repo, SCOPE, { filter: "due" });
    const rows = await followUps.listForWorker(t.repo, SCOPE);
    const today = computeTodaySummary({
      followUps: rows,
      drafts: [],
      ops: [],
      now: new Date(nowIso),
    });
    expect(counts.overdue).toBe(today.overdue);
    expect(counts.due).toBe(today.openCount - today.overdue);
    expect(counts.due).toBeGreaterThanOrEqual(today.dueToday);
  });

  it("never shows another worker's follow-ups that are on the device", async () => {
    const t = await worker();
    const others = (await t.store.getAll<FollowUp>("followUps")).filter(
      (f) => f.assignedWorkerId !== WORKER,
    );
    expect(others.length).toBeGreaterThan(0);
    const all = await Promise.all(
      followUps.TASK_FILTERS.map((filter) => followUps.listByFilter(t.repo, SCOPE, { filter })),
    );
    const seen = new Set(all.flatMap(ids));
    for (const other of others) expect(seen.has(other.id)).toBe(false);
  });

  it("overdue membership changes when the demo clock advances, with no DB writes", async () => {
    const t = await worker();
    const before = await followUps.listByFilter(t.repo, SCOPE, { filter: "overdue" });
    expect(before.counts.overdue).toBe(2);
    const writesBefore = await writeCount(t);
    const statusesBefore = (await t.store.getAll<FollowUp>("followUps")).map((f) => f.status);

    t.advance(5 * DAY_MS); // demo clock 14 Oct → 19 Oct (Kigali)
    const after = await followUps.listByFilter(t.repo, SCOPE, { filter: "overdue" });
    expect(after.counts.overdue).toBe(3); // + the follow-up due 17 Oct
    expect(after.counts.due).toBe(2);
    expect(ids(after)).toEqual(expect.arrayContaining(ids(before)));

    expect(await writeCount(t)).toBe(writesBefore);
    expect((await t.store.getAll<FollowUp>("followUps")).map((f) => f.status)).toEqual(
      statusesBefore,
    );
    expect(Object.keys((await t.store.getAll<FollowUp>("followUps"))[0]!)).not.toContain("overdue");
  });

  it("a follow-up due earlier today is due (with its time), not overdue", () => {
    const now = new Date("2026-10-14T10:00:00.000Z");
    const base = { status: "assigned" as const };
    expect(followUps.taskFilterOf({ ...base, dueAt: "2026-10-14T06:00:00.000Z" }, now)).toBe("due");
    expect(followUps.taskFilterOf({ ...base, dueAt: "2026-10-13T21:59:00.000Z" }, now)).toBe(
      "overdue",
    );
    expect(
      followUps.taskFilterOf({ status: "unable_to_reach", dueAt: "2026-10-10T06:00:00.000Z" }, now),
    ).toBe("overdue");
    expect(
      followUps.taskFilterOf({ status: "completed", dueAt: "2026-10-10T06:00:00.000Z" }, now),
    ).toBe("completed");
  });

  it("search within tasks: patient name (contains, accents) and identifier (prefix)", async () => {
    const t = await worker();
    const all = await followUps.listByFilter(t.repo, SCOPE, { filter: "due" });
    const first = all.items[0]!;
    const byName = await followUps.listByFilter(t.repo, SCOPE, {
      filter: "due",
      query: first.patientName.slice(1, 5).toUpperCase(),
    });
    expect(ids(byName)).toContain(first.followUp.id);
    const byId = await followUps.listByFilter(t.repo, SCOPE, {
      filter: "due",
      query: first.patientIdentifier,
    });
    expect(ids(byId)).toEqual(
      all.items
        .filter((r) => r.patientIdentifier === first.patientIdentifier)
        .map((r) => r.followUp.id),
    );
    const none = await followUps.listByFilter(t.repo, SCOPE, { filter: "due", query: "zzzz" });
    expect(none.items).toEqual([]);
    // Counts are for the whole tab, not the search.
    expect(none.counts).toEqual(all.counts);
  });

  it("parseTaskFilter falls back to due", () => {
    expect(followUps.parseTaskFilter("overdue")).toBe("overdue");
    expect(followUps.parseTaskFilter("nope")).toBe("due");
    expect(followUps.parseTaskFilter(undefined)).toBe("due");
  });
});

describe("seed invariant (HWM-07 §6)", () => {
  it("completed follow-ups always carry an outcome with evidence", async () => {
    const t = await worker();
    const completed = (await t.store.getAll<FollowUp>("followUps")).filter(
      (f) => f.status === "completed",
    );
    expect(completed.length).toBeGreaterThan(0);
    for (const f of completed) {
      expect(f.outcome).not.toBeNull();
      expect(f.outcome!.evidenceType).not.toBeNull();
      expect(f.completedAt).not.toBeNull();
    }
  });
});

describe("followUps.getDetail (HWM-07 task 5)", () => {
  it("own task: detail with patient, latest reading, referral, attempts; one followup.viewed", async () => {
    const t = await worker();
    const target = (await followUps.listByFilter(t.repo, SCOPE, { filter: "due" })).items.find(
      (r) => r.followUp.attempts.length > 0,
    )!;
    const access = await followUps.getDetail(t.repo, SCOPE, target.followUp.id);
    expect(access.status).toBe("ok");
    if (access.status !== "ok") return;
    const { detail } = access;
    expect(detail.patient?.id).toBe(target.followUp.patientId);
    expect(detail.referral?.id).toBe(target.followUp.referralId);
    expect(detail.assignedByName).not.toBeNull();
    expect(detail.latestScreening?.patientId).toBe(target.followUp.patientId);
    expect(detail.attempts.map((a) => a.syncState)).toEqual(detail.attempts.map(() => "synced"));

    const viewed = await audits(t, "followup.viewed");
    expect(viewed).toHaveLength(1);
    expect(viewed[0]).toMatchObject({ entityType: "follow_up", entityId: target.followUp.id });
    expect(await audits(t, "patient.viewed")).toHaveLength(0);

    // The silent re-read does not audit.
    await followUps.getDetail(t.repo, SCOPE, target.followUp.id, { audit: false });
    expect(await audits(t, "followup.viewed")).toHaveLength(1);
  });

  it("another worker's task / unknown id → denied + access.denied, no patient data (T-02)", async () => {
    const t = await worker();
    const other = (await t.store.getAll<FollowUp>("followUps")).find(
      (f) => f.assignedWorkerId !== WORKER,
    )!;
    const denied = await followUps.getDetail(t.repo, SCOPE, other.id);
    expect(denied).toEqual({ status: "denied" });
    const missing = await followUps.getDetail(t.repo, SCOPE, "no-such-task");
    expect(missing).toEqual({ status: "denied" });

    const events = await audits(t, "access.denied");
    expect(events.map((e) => e.entityId)).toEqual(
      expect.arrayContaining([other.id, "no-such-task"]),
    );
    expect(events.every((e) => e.outcome === "denied" && e.entityType === "follow_up")).toBe(true);
    expect(await audits(t, "followup.viewed")).toHaveLength(0);
  });

  it("attempts newest first; a new offline attempt is 'saved on this device'", async () => {
    const t = await worker(true);
    const target = (await followUps.listByFilter(t.repo, SCOPE, { filter: "due" })).items.find(
      (r) => r.followUp.attempts.length > 0,
    )!.followUp;
    await t.repo.updateFollowUp(
      {
        followUpId: target.id,
        expectedVersion: target.version,
        action: "record_attempt",
        at: "2026-10-14T05:30:00.000Z",
        method: "phone",
        result: "not_reached",
        note: "No answer (demo).",
      },
      t.key(),
    );
    const access = await followUps.getDetail(t.repo, SCOPE, target.id);
    if (access.status !== "ok") throw new Error("expected ok");
    const { attempts } = access.detail;
    expect(attempts).toHaveLength(target.attempts.length + 1);
    expect(attempts.map((a) => a.at)).toEqual([...attempts.map((a) => a.at)].sort().reverse());
    expect(attempts[0]).toMatchObject({ method: "phone", syncState: "saved_locally" });
    expect(attempts.slice(1).every((a) => a.syncState === "synced")).toBe(true);
    expect(access.detail.syncState).toBe("saved_locally");

    const list = await followUps.listByFilter(t.repo, SCOPE, { filter: "due" });
    expect(list.items.find((r) => r.followUp.id === target.id)?.syncState).toBe("saved_locally");
  });

  it("attemptSyncStates maps the last N attempts to this device's N attempt ops", () => {
    const fu = {
      id: "fu-1" as FollowUp["id"],
      attempts: [{ id: "a1" }, { id: "a2" }, { id: "a3" }] as FollowUp["attempts"],
      outcome: null,
    };
    const op = (localSeq: number, status: SyncOperation["status"], action: string) => ({
      entityId: "fu-1",
      localSeq,
      status,
      payload: { action },
    });
    expect(
      followUps.attemptSyncStates(fu, [
        op(1, "acknowledged", "record_attempt"),
        op(2, "conflict", "record_attempt"),
        op(3, "queued", "add_note"),
      ]),
    ).toEqual({ attempts: ["synced", "synced", "conflict"], outcome: null });
  });
});
