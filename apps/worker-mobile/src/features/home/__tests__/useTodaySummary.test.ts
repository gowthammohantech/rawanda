// @vitest-environment node
/**
 * HWM-03 Today summary: counts equal the store's records for the signed-in worker + facility at
 * the pinned demo date, derived overdue moves with the demo clock without any write, the
 * facility filter is defensive, and priority ordering is by due date only.
 */
import {
  asId,
  dueBucket,
  isSameZonedDay,
  type FacilityId,
  type FollowUp,
  type Screening,
} from "@laif/domain";
import { FACILITY_IDS, PERSONA_IDS } from "@laif/mock-data";
import type { CareRepository } from "@laif/repositories";
import { createTestRepository, type TestRepository } from "@laif/test-utils";
import { describe, expect, it } from "vitest";

import { listDrafts } from "../../../data/drafts.ts";
import {
  listForWorker,
  prioritiseFollowUps,
  type WorkerFollowUp,
} from "../../../data/followUps.ts";
import { computeTodaySummary, loadTodaySummary } from "../todaySummary.ts";

const WORKER = PERSONA_IDS.chwAlpha1A;
const FACILITY: FacilityId = FACILITY_IDS.alpha1;
const SCOPE = { workerId: WORKER, facilityId: FACILITY };
const DAY = 24 * 60 * 60 * 1000;

const worker = () => createTestRepository({ appId: "worker", persona: WORKER });

/** Ground truth straight from the store (not through the app selectors). */
async function expectedCounts(t: TestRepository, nowIso: string) {
  const now = new Date(nowIso);
  const rows = (await t.store.getAll<FollowUp>("followUps")).filter(
    (fu) => fu.facilityId === FACILITY && fu.assignedWorkerId === WORKER,
  );
  return {
    overdue: rows.filter((fu) => dueBucket(fu, now) === "overdue").length,
    dueToday: rows.filter((fu) => dueBucket(fu, now) === "due_today").length,
    completedToday: rows.filter(
      (fu) => fu.completedAt !== null && isSameZonedDay(fu.completedAt, now),
    ).length,
    open: rows.filter((fu) => fu.status !== "completed").length,
    drafts: (await t.store.getAll<Screening>("screenings")).filter(
      (s) => s.status === "draft" && s.workerId === WORKER && s.facilityId === FACILITY,
    ).length,
  };
}

describe("loadTodaySummary (seed, pinned demo date)", () => {
  it("counts equal the store's records for the worker + facility on 14 Oct 2026 (Kigali)", async () => {
    const t = await worker();
    const summary = await loadTodaySummary(t.repo, SCOPE);
    expect(summary.nowIso).toBe("2026-10-14T06:00:00.000Z");
    expect(summary.demoDate).toBe("2026-10-14");
    const expected = await expectedCounts(t, summary.nowIso);
    expect(summary).toMatchObject({
      overdue: expected.overdue,
      dueToday: expected.dueToday,
      completedToday: expected.completedToday,
      todaysWork: expected.overdue + expected.dueToday + expected.completedToday,
      openCount: expected.open,
      draftCount: expected.drafts,
    });
    // Seed shape for this worker (sanity: the fixture really has overdue work and a draft).
    expect(summary.overdue).toBe(2);
    expect(summary.dueToday).toBe(0);
    expect(summary.draftCount).toBe(1);
    expect(summary.next.length).toBeLessThanOrEqual(5);
    expect(summary.next.every((row) => row.patientName !== "")).toBe(true);
    expect(summary.next.map((row) => row.bucket)).toEqual(
      [...summary.next.map((row) => row.bucket)].sort(
        (a, b) =>
          ["overdue", "due_today", "upcoming"].indexOf(a) -
          ["overdue", "due_today", "upcoming"].indexOf(b),
      ),
    );
  });

  it("moving the demo clock re-buckets due-today items into overdue without any DB write", async () => {
    const t = await worker();
    // +3 days: the follow-up due 17 Oct 08:00 Kigali is due today.
    await t.repo.demo.advanceClock(3 * DAY);
    const before = await loadTodaySummary(t.repo, SCOPE);
    expect(before.demoDate).toBe("2026-10-17");
    expect(before.dueToday).toBe(1);
    const dueTodayId = before.next.find((row) => row.bucket === "due_today")!.followUp.id;
    const snapshot = JSON.stringify(await t.store.getAll("followUps"));
    const opsBefore = (await t.repo.sync.list()).length;

    await t.repo.demo.advanceClock(DAY);
    const after = await loadTodaySummary(t.repo, SCOPE);
    expect(after.demoDate).toBe("2026-10-18");
    expect(after.dueToday).toBe(0);
    expect(after.overdue).toBe(before.overdue + 1);
    expect(after.next.find((row) => row.followUp.id === dueTodayId)).toMatchObject({
      bucket: "overdue",
      daysOverdue: 1,
    });
    expect(JSON.stringify(await t.store.getAll("followUps"))).toBe(snapshot);
    expect((await t.repo.sync.list()).length).toBe(opsBefore);
    expect(await expectedCounts(t, after.nowIso)).toMatchObject({
      overdue: after.overdue,
      dueToday: after.dueToday,
    });
  });

  it("never shows a follow-up of another facility even if it is in the worker store", async () => {
    const t = await worker();
    const own = (await t.store.getAll<FollowUp>("followUps")).find(
      (fu) => fu.assignedWorkerId === WORKER && fu.status !== "completed",
    )!;
    const foreign: FollowUp = {
      ...own,
      id: asId("fu-foreign-beta"),
      facilityId: asId(FACILITY_IDS.beta1),
      dueAt: "2026-10-14T10:00:00.000Z",
    };
    await t.store.put("followUps", foreign);
    const before = await loadTodaySummary(t.repo, SCOPE);
    expect(before.next.map((row) => row.followUp.id)).not.toContain(foreign.id);
    expect(before.dueToday).toBe(0);
  });

  it("defensive filter: listForWorker drops rows of other facilities / workers the repository returned", async () => {
    const t = await worker();
    const rows = (await t.store.getAll<FollowUp>("followUps")).filter(
      (fu) => fu.assignedWorkerId === WORKER,
    );
    const leaky = {
      listFollowUps: () =>
        Promise.resolve({
          items: [
            ...rows,
            { ...rows[0]!, id: asId("fu-leak-1"), facilityId: asId(FACILITY_IDS.beta1) },
            { ...rows[0]!, id: asId("fu-leak-2"), assignedWorkerId: asId(PERSONA_IDS.chwAlpha1B) },
          ],
          total: rows.length + 2,
          page: 1,
          pageSize: 200,
        }),
      listPatients: t.repo.listPatients.bind(t.repo),
    } as unknown as Pick<CareRepository, "listFollowUps" | "listPatients">;
    const result = await listForWorker(leaky, SCOPE);
    expect(result.map((row) => row.followUp.id).sort()).toEqual(rows.map((fu) => fu.id).sort());
  });

  it("drafts: only the worker's own drafts of the facility, newest first", async () => {
    const t = await worker();
    const drafts = await listDrafts(t.repo, SCOPE);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.draft).toMatchObject({
      status: "draft",
      workerId: WORKER,
      facilityId: FACILITY,
    });
    expect(drafts[0]!.patientName).not.toBe("");
  });

  it("pending ops: a new write shows on the row's sync state (no summary write)", async () => {
    const t = await worker();
    const target = (await loadTodaySummary(t.repo, SCOPE)).next[0]!;
    await t.repo.updateFollowUp(
      {
        followUpId: target.followUp.id,
        expectedVersion: target.followUp.version,
        action: "add_note",
        note: "Called the household (demo note).",
      },
      t.key(),
    );
    const after = await loadTodaySummary(t.repo, SCOPE);
    expect(after.next.find((row) => row.followUp.id === target.followUp.id)!.syncState).toBe(
      "saved_locally",
    );
  });
});

describe("computeTodaySummary / prioritiseFollowUps (fixtures)", () => {
  const now = new Date("2026-10-14T06:00:00.000Z");
  const row = (id: string, dueAt: string, extra: Partial<FollowUp> = {}): WorkerFollowUp => ({
    followUp: {
      id: asId(id),
      dueAt,
      status: "assigned",
      completedAt: null,
      facilityId: FACILITY,
      assignedWorkerId: asId(WORKER),
      purpose: "planned_review",
      ...extra,
    } as FollowUp,
    patientName: `Patient ${id}`,
    patientIdentifier: `DEMO-${id}`,
  });

  it("orders overdue (oldest first) → due today (earliest) → upcoming; ties by id", () => {
    const ordered = prioritiseFollowUps(
      [
        row("u1", "2026-10-20T06:00:00.000Z"),
        row("t2", "2026-10-14T12:00:00.000Z"),
        row("o2", "2026-10-12T06:00:00.000Z"),
        row("t1", "2026-10-14T05:00:00.000Z"),
        row("o1b", "2026-10-09T06:00:00.000Z"),
        row("o1a", "2026-10-09T06:00:00.000Z"),
        row("c1", "2026-10-01T06:00:00.000Z", { status: "completed" }),
      ],
      now,
    );
    expect(ordered.map((r) => r.followUp.id)).toEqual(["o1a", "o1b", "o2", "t1", "t2", "u1"]);
    expect(ordered.map((r) => r.daysOverdue)).toEqual([5, 5, 2, 0, 0, 0]);
  });

  it("counts completed today by Kigali day of completedAt; top 5; drafts first 3", () => {
    const summary = computeTodaySummary({
      now,
      ops: [],
      followUps: [
        row("o1", "2026-10-10T06:00:00.000Z"),
        row("t1", "2026-10-14T09:00:00.000Z"),
        row("c-today", "2026-10-13T06:00:00.000Z", {
          status: "completed",
          completedAt: "2026-10-13T22:30:00.000Z", // 00:30 Kigali on the 14th
        }),
        row("c-yesterday", "2026-10-13T06:00:00.000Z", {
          status: "completed",
          completedAt: "2026-10-13T21:30:00.000Z", // 23:30 Kigali on the 13th
        }),
        ...["a", "b", "c", "d", "e"].map((id) => row(`u-${id}`, "2026-10-21T06:00:00.000Z")),
      ],
      drafts: ["d1", "d2", "d3", "d4"].map((id) => ({
        draft: { id } as Screening,
        patientName: id,
        patientIdentifier: id,
      })),
    });
    expect(summary).toMatchObject({
      overdue: 1,
      dueToday: 1,
      completedToday: 1,
      todaysWork: 3,
      openCount: 7,
      draftCount: 4,
    });
    expect(summary.next).toHaveLength(5);
    expect(summary.drafts.map((d) => d.draft.id)).toEqual(["d1", "d2", "d3"]);
  });
});
