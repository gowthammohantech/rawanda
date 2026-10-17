import { createDemoClock } from "@laif/domain";
import {
  ADMIN_METRICS_FIXTURE_NOW,
  ADMIN_METRICS_FIXTURE_PERIOD,
  adminMetricsFixture,
  createSeed,
  FACILITY_IDS,
  PERSONA_IDS,
} from "@laif/mock-data";
import { describe, expect, it } from "vitest";

import { filterDataset } from "../dataset.ts";
import { round } from "./shared.ts";
import {
  activeWorkers,
  minutesByActivity,
  minutesPerPatientDayIndex,
  minutesRatio,
  patientDays,
  STAFF_TIME_PROXY_LABEL,
  staffMinutes,
  staffMinutesPerPatientDay,
  taskCompletionRate,
  tasksAssigned,
  tasksCompleted,
  tasksOverdue,
  tasksUnableToReach,
  weeklyMinutesPerPatientDay,
  WORKLOAD_BASELINE_LABEL,
  WORKLOAD_TASK_STATES,
  workerTaskCounts,
  workerWorkload,
  workloadBaselineWindow,
  workloadTasks,
  workloadTaskState,
} from "./workload.ts";

const seed = createSeed();
const now = createDemoClock().now();

describe("workerWorkload", () => {
  const w = workerWorkload(seed, {}, now);

  it("is labelled as a staff-time proxy (demo)", () => {
    expect(w.label).toBe(STAFF_TIME_PROXY_LABEL);
    expect(w.label).toBe("staff-time proxy (demo)");
    expect(w.labelKey).toBe("admin:metric.staffTimeProxyNote");
  });

  it("keys rows by worker persona id, sorted, without names", () => {
    const ids = w.rows.map((r) => r.workerId);
    expect(ids).toEqual([...ids].sort());
    expect(ids).toContain(PERSONA_IDS.chwAlpha1A);
    const names = seed.personas.map((p) => p.displayName);
    const json = JSON.stringify(w);
    for (const name of names) expect(json).not.toContain(name);
  });

  it("totals equal naive sums over the seed", () => {
    expect(w.totals.followUpsAssigned).toBe(
      seed.followUps.filter((f) => f.assignedWorkerId !== null).length,
    );
    expect(w.totals.followUpsCompleted).toBe(6);
    const minutes = seed.followUps
      .flatMap((f) => f.attempts)
      .reduce((n, a) => n + (a.durationMinutes ?? 0), 0);
    expect(w.totals.contactMinutes).toBe(minutes);
    expect(w.totals.screeningsRecorded).toBe(57);
    const seconds = seed.screenings
      .filter((s) => s.status !== "draft")
      .reduce((n, s) => n + (s.captureDurationSeconds ?? 0), 0);
    expect(w.totals.screeningCaptureSeconds).toBe(seconds);
    expect(w.totals.staffTimeMinutes).toBeCloseTo(minutes + seconds / 60, 1);
  });

  it("per-worker counts for one CHW", () => {
    const row = w.rows.find((r) => r.workerId === PERSONA_IDS.chwAlpha1A)!;
    const mine = seed.followUps.filter((f) => f.assignedWorkerId === PERSONA_IDS.chwAlpha1A);
    expect(row.followUpsAssigned).toBe(mine.length);
    expect(row.followUpsCompleted).toBe(mine.filter((f) => f.status === "completed").length);
    expect(row.staffTimeMinutes).toBe(
      Math.round((row.contactMinutes + row.screeningCaptureSeconds / 60) * 10) / 10,
    );
  });

  it("respects the facility filter", () => {
    const beta = workerWorkload(seed, { facilityIds: [FACILITY_IDS.beta1] }, now);
    expect(beta.rows.map((r) => r.workerId)).not.toContain(PERSONA_IDS.chwAlpha1A);
    expect(beta.totals.screeningsRecorded).toBe(17);
  });
});

// ── ADM-05 calculators on adminMetricsFixture (hand-computed in the fixture header) ──

describe("ADM-05 workload calculators (adminMetricsFixture)", () => {
  const fxNow = new Date(ADMIN_METRICS_FIXTURE_NOW);
  const fx = () => filterDataset(adminMetricsFixture(), ADMIN_METRICS_FIXTURE_PERIOD, fxNow);
  const A = PERSONA_IDS.chwAlpha1A;
  const B = PERSONA_IDS.chwAlpha1B;
  const C = PERSONA_IDS.chwAlpha2A;

  it("assigned / completed / unable to reach / overdue per worker and in total", () => {
    const ds = fx();
    expect(tasksAssigned(ds).total).toBe(8);
    expect(Object.fromEntries(tasksAssigned(ds).byWorker)).toEqual({ [A]: 2, [B]: 5, [C]: 1 });
    expect(tasksCompleted(ds).total).toBe(3);
    expect(Object.fromEntries(tasksCompleted(ds).byWorker)).toEqual({ [A]: 1, [B]: 1, [C]: 1 });
    expect(tasksUnableToReach(ds).total).toBe(2);
    expect(tasksUnableToReach(ds).byWorker.get(B)).toBe(2);
    expect(tasksOverdue(ds, fxNow).total).toBe(2);
    expect(Object.fromEntries(tasksOverdue(ds, fxNow).byWorker)).toEqual({
      [A]: 1,
      [B]: 1,
      [C]: 0,
    });
    expect(workerTaskCounts(ds).total).toEqual({
      assigned: 8,
      completed: 3,
      inProgress: 1,
      unableToReach: 2,
      overdue: 2,
    });
    expect(taskCompletionRate(ds)).toBe(0.375);
    expect(taskCompletionRate(ds, B)).toBe(0.2);
  });

  it("per-worker assigned sums to the total; states partition assigned", () => {
    const c = workerTaskCounts(fx());
    const sum = [...c.byWorker.values()].reduce((n, r) => n + r.assigned, 0);
    expect(sum).toBe(c.total.assigned);
    for (const r of c.byWorker.values()) {
      expect(WORKLOAD_TASK_STATES.reduce((n, s) => n + r[s], 0)).toBe(r.assigned);
    }
  });

  it("attributes tasks to the Kigali day of createdAt (not the screening cohort)", () => {
    const ds = fx();
    const ids = workloadTasks(ds).map((f) => f.id);
    // Created 2026-09-30T23:00Z = 1 Oct 01:00 Kigali → in the period.
    expect(ids).toContain("fx-task-03");
    // Created 20 Sep → not assigned in the period (its in-period attempt still counts as contact).
    expect(ids).not.toContain("fx-task-02");
    // Workload-only tasks are not part of the ADM-02 cohort.
    expect(ds.cohort.followUps.map((f) => f.id)).toEqual(["fx-followup-02"]);
    const late = filterDataset(
      adminMetricsFixture(),
      { from: "2026-10-02", to: "2026-10-14" },
      fxNow,
    );
    expect(workloadTasks(late).map((f) => f.id)).not.toContain("fx-task-03");
  });

  it("overdue uses FND-02 isFollowUpOverdue on open tasks only (derived from now)", () => {
    const ds = fx();
    expect(tasksOverdue(ds, new Date("2026-10-09T00:00:00.000Z")).total).toBe(0);
    expect(tasksOverdue(ds, new Date("2026-10-10T08:00:00.001Z")).total).toBe(1);
    // unable_to_reach / reassigned are never "overdue" even past dueAt.
    expect(
      workloadTaskState(
        { status: "unable_to_reach", completedAt: null, dueAt: "2026-01-01T00:00:00.000Z" },
        fxNow,
      ),
    ).toBe("unableToReach");
  });

  it("patient-days dedupe two contacts with the same patient on the same Kigali day", () => {
    const ds = fx();
    expect(patientDays(ds, A)).toBe(8);
    expect(patientDays(ds, B)).toBe(3);
    expect(patientDays(ds, C)).toBe(3);
    expect(patientDays(ds)).toBe(14);
  });

  it("minutes per patient-day: per worker, pooled as a ratio of sums, null when 0", () => {
    const ds = fx();
    expect(staffMinutes(ds, A)).toBe(240);
    expect(staffMinutes(ds, B)).toBe(90);
    expect(staffMinutes(ds, C)).toBe(150);
    expect(staffMinutesPerPatientDay(ds, A)).toBe(30);
    expect(staffMinutesPerPatientDay(ds, B)).toBe(30);
    expect(staffMinutesPerPatientDay(ds, C)).toBe(50);
    const pooled = staffMinutesPerPatientDay(ds);
    expect(pooled).toBe(34.3);
    expect(pooled).toBe(round(staffMinutes(ds) / patientDays(ds), 1));
    expect(pooled).not.toBe(round((30 + 30 + 50) / 3, 1));
    expect(staffMinutesPerPatientDay(ds, PERSONA_IDS.chwBeta1A)).toBeNull();
    expect(minutesRatio(100, 0)).toBeNull();
  });

  it("minutes by activity, weekly trend and active workers", () => {
    const ds = fx();
    expect(minutesByActivity(ds)).toEqual({
      screening: 180,
      follow_up: 160,
      travel: 80,
      admin: 60,
    });
    expect(weeklyMinutesPerPatientDay(ds)).toEqual([
      { weekStart: "2026-09-28", value: 39, patientDays: 5, minutes: 195 },
      { weekStart: "2026-10-05", value: 28.3, patientDays: 9, minutes: 255 },
      { weekStart: "2026-10-12", value: null, patientDays: 0, minutes: 30 },
    ]);
    expect(activeWorkers(ds)).toEqual([A, B, C].sort());
  });

  it("demo baseline window and index", () => {
    expect(workloadBaselineWindow(fxNow)).toEqual({ from: "2026-07-20", to: "2026-08-16" });
    expect(WORKLOAD_BASELINE_LABEL).toBe("DEMO BASELINE — not an approved baseline");
    expect(
      minutesPerPatientDayIndex(
        { minutes: 540, patientDays: 10 },
        { minutes: 500, patientDays: 10 },
      ),
    ).toBe(1.08);
    expect(
      minutesPerPatientDayIndex({ minutes: 540, patientDays: 10 }, { minutes: 50, patientDays: 4 }),
    ).toBeNull();
    expect(
      minutesPerPatientDayIndex({ minutes: 40, patientDays: 4 }, { minutes: 500, patientDays: 10 }),
    ).toBeNull();
  });

  it("selector inputs carry no worker names or patient identifiers", () => {
    const ds = fx();
    const out = JSON.stringify({
      a: [...tasksAssigned(ds).byWorker],
      m: minutesByActivity(ds),
      w: weeklyMinutesPerPatientDay(ds),
    });
    expect(out).not.toMatch(/fx-patient|Fixture Person/);
  });
});
