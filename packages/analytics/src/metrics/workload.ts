/**
 * Worker workload (FND-06 task 9; ADM-05 extends it in place below: task counts by assignment
 * date, patient-days, self-reported TimeEntry minutes per patient-day, minutes by activity, the
 * weekly trend and the demo-baseline index). Rows are keyed by worker persona id (pseudonymous;
 * the admin selector joins the `workerCode`), never by name. Every time figure is a STAFF-TIME
 * PROXY (DEMO), not a measured workload and never an individual performance measure.
 */
import { TIME_ENTRY_ACTIVITIES, type TimeEntryActivity } from "@laif/contracts";
import { isFollowUpOverdue, type FollowUp, type PersonaId } from "@laif/domain";

import type { MetricsDataset } from "../dataset.ts";
import {
  addDays,
  applyMetricsFilter,
  isoWeekStartOfDay,
  kigaliDate,
  kigaliIsoWeekStart,
} from "../filters.ts";
import { DEMO_SMALL_CELL_THRESHOLD } from "../suppression.ts";
import type { AnalyticsInput, MetricsFilter } from "../types.ts";
import { isFollowUpCompleted, isRecorded, round } from "./shared.ts";

export const STAFF_TIME_PROXY_LABEL = "staff-time proxy (demo)" as const;
export const STAFF_TIME_PROXY_LABEL_KEY = "admin:metric.staffTimeProxyNote" as const;

export type WorkloadCounts = {
  followUpsAssigned: number;
  followUpsCompleted: number;
  followUpsPastDue: number;
  contactAttempts: number;
  /** Sum of contact-attempt `durationMinutes` recorded by the worker. */
  contactMinutes: number;
  screeningsRecorded: number;
  /** Sum of `captureDurationSeconds` of the worker's submitted screenings. */
  screeningCaptureSeconds: number;
  /** contactMinutes + screeningCaptureSeconds / 60, 1 dp — staff-time proxy (demo). */
  staffTimeMinutes: number;
};

export type WorkerWorkloadRow = WorkloadCounts & { workerId: PersonaId };

export type WorkerWorkload = {
  label: typeof STAFF_TIME_PROXY_LABEL;
  labelKey: typeof STAFF_TIME_PROXY_LABEL_KEY;
  rows: WorkerWorkloadRow[];
  totals: WorkloadCounts;
};

const empty = (): WorkloadCounts => ({
  followUpsAssigned: 0,
  followUpsCompleted: 0,
  followUpsPastDue: 0,
  contactAttempts: 0,
  contactMinutes: 0,
  screeningsRecorded: 0,
  screeningCaptureSeconds: 0,
  staffTimeMinutes: 0,
});

export function workerWorkload(
  data: AnalyticsInput,
  filter: MetricsFilter,
  now: Date,
): WorkerWorkload {
  const d = applyMetricsFilter(data, filter);
  const rows = new Map<PersonaId, WorkloadCounts>();
  const row = (id: PersonaId): WorkloadCounts => {
    let r = rows.get(id);
    if (!r) rows.set(id, (r = empty()));
    return r;
  };

  for (const f of d.followUps) {
    if (f.assignedWorkerId !== null) {
      const r = row(f.assignedWorkerId);
      r.followUpsAssigned += 1;
      if (isFollowUpCompleted(f)) r.followUpsCompleted += 1;
      if (isFollowUpOverdue(f, now)) r.followUpsPastDue += 1;
    }
    for (const a of f.attempts) {
      const r = row(a.recordedBy);
      r.contactAttempts += 1;
      r.contactMinutes += a.durationMinutes ?? 0;
    }
  }
  for (const s of d.screenings) {
    if (!isRecorded(s)) continue;
    const r = row(s.workerId);
    r.screeningsRecorded += 1;
    r.screeningCaptureSeconds += s.captureDurationSeconds ?? 0;
  }

  const totals = empty();
  const out: WorkerWorkloadRow[] = [...rows.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([workerId, r]) => {
      r.staffTimeMinutes = round(r.contactMinutes + r.screeningCaptureSeconds / 60, 1);
      for (const k of Object.keys(totals) as Array<keyof WorkloadCounts>) totals[k] += r[k];
      return { workerId, ...r };
    });
  // From the summed inputs, not the sum of per-row rounded values.
  totals.staffTimeMinutes = round(totals.contactMinutes + totals.screeningCaptureSeconds / 60, 1);

  return { label: STAFF_TIME_PROXY_LABEL, labelKey: STAFF_TIME_PROXY_LABEL_KEY, rows: out, totals };
}

// ── ADM-05 workload calculators over a `MetricsDataset` (pure; time only from `ds.nowIso`/`now`) ──
//
// Attribution EXCEPTION (documented in the catalogue): a follow-up task belongs to the period of
// its `createdAt` (assignment date) — workload is about when work happened, not about the cohort
// of the screening it came from (`ds.cohort.taskFollowUps`, see `filterDataset`).
// Every figure here is a PROXY from synthetic self-reported time entries, not a measured workload
// and never an individual performance measure.

/** Mutually exclusive task states of the workload view (they sum to `assigned`). */
export const WORKLOAD_TASK_STATES = [
  "completed",
  "inProgress",
  "unableToReach",
  "overdue",
] as const;
export type WorkloadTaskState = (typeof WORKLOAD_TASK_STATES)[number];

export type TaskCounts = { assigned: number } & Record<WorkloadTaskState, number>;

export type WorkerTaskCounts = { total: TaskCounts; byWorker: Map<PersonaId, TaskCounts> };

/** Per-worker and total values of one count. */
export type PerWorker = { total: number; byWorker: Map<PersonaId, number> };

const emptyTasks = (): TaskCounts => ({
  assigned: 0,
  completed: 0,
  inProgress: 0,
  unableToReach: 0,
  overdue: 0,
});

const nowOfDs = (ds: MetricsDataset, now?: Date): Date => now ?? new Date(ds.nowIso);

const inPeriod = (ds: MetricsDataset, day: string): boolean =>
  (ds.filter.from === null || day >= ds.filter.from) &&
  (ds.filter.to === null || day <= ds.filter.to);

/**
 * State of a task as of `now`:
 * - `completed` — status `completed` with `completedAt`;
 * - `unableToReach` — status `unable_to_reach` or `reassigned` (closed without contact);
 * - `overdue` — still open (`assigned` / `contacted`) and FND-02 `isFollowUpOverdue`;
 * - `inProgress` — every other open task.
 */
export function workloadTaskState(
  f: Pick<FollowUp, "status" | "completedAt" | "dueAt">,
  now: Date,
): WorkloadTaskState {
  if (f.status === "completed") return f.completedAt !== null ? "completed" : "inProgress";
  if (f.status === "unable_to_reach" || f.status === "reassigned") return "unableToReach";
  return isFollowUpOverdue(f, now) ? "overdue" : "inProgress";
}

/** Tasks assigned in the period (Kigali day of `createdAt`) to a worker. */
export function workloadTasks(ds: MetricsDataset): FollowUp[] {
  return (ds.cohort.taskFollowUps ?? []).filter(
    (f) => f.assignedWorkerId !== null && inPeriod(ds, kigaliDate(f.createdAt)),
  );
}

/** Task counts per worker and in total (per-worker counts sum to the total). */
export function workerTaskCounts(ds: MetricsDataset, now?: Date): WorkerTaskCounts {
  const at = nowOfDs(ds, now);
  const total = emptyTasks();
  const byWorker = new Map<PersonaId, TaskCounts>();
  for (const f of workloadTasks(ds)) {
    const id = f.assignedWorkerId as PersonaId;
    let row = byWorker.get(id);
    if (!row) byWorker.set(id, (row = emptyTasks()));
    const state = workloadTaskState(f, at);
    for (const c of [row, total]) {
      c.assigned += 1;
      c[state] += 1;
    }
  }
  return { total, byWorker };
}

const pick = (counts: WorkerTaskCounts, k: keyof TaskCounts): PerWorker => ({
  total: counts.total[k],
  byWorker: new Map([...counts.byWorker].map(([id, c]) => [id, c[k]])),
});

/** Follow-ups created in the period, per worker and total. */
export const tasksAssigned = (ds: MetricsDataset): PerWorker =>
  pick(workerTaskCounts(ds), "assigned");
/** Of those, status `completed` with `completedAt`. */
export const tasksCompleted = (ds: MetricsDataset): PerWorker =>
  pick(workerTaskCounts(ds), "completed");
/** Of those, `unable_to_reach` or `reassigned`. */
export const tasksUnableToReach = (ds: MetricsDataset): PerWorker =>
  pick(workerTaskCounts(ds), "unableToReach");
/** Of those, still open and past the person-set `dueAt` (FND-02 `isFollowUpOverdue`). */
export const tasksOverdue = (ds: MetricsDataset, now?: Date): PerWorker =>
  pick(workerTaskCounts(ds, now), "overdue");

/** completed / assigned (4 dp); null when nothing was assigned. */
export function taskCompletionRate(ds: MetricsDataset, workerId?: PersonaId): number | null {
  const c = workerTaskCounts(ds);
  const row = workerId === undefined ? c.total : (c.byWorker.get(workerId) ?? emptyTasks());
  return row.assigned === 0 ? null : round(row.completed / row.assigned, 4);
}

/**
 * Workers with ≥1 time entry, screening or task in the period (a contact attempt recorded in the
 * period is task work and counts too). Sorted ids.
 */
export function activeWorkers(ds: MetricsDataset): PersonaId[] {
  const ids = new Set<PersonaId>();
  for (const e of ds.cohort.timeEntries) ids.add(e.workerId);
  for (const s of ds.cohort.screenings) ids.add(s.workerId);
  for (const f of workloadTasks(ds)) ids.add(f.assignedWorkerId as PersonaId);
  for (const f of ds.cohort.taskFollowUps ?? []) {
    for (const a of f.attempts) if (inPeriod(ds, kigaliDate(a.at))) ids.add(a.recordedBy);
  }
  return [...ids].sort();
}

/** Distinct `(patientId, Kigali day)` contacts of one worker → keys `patient|day`. */
function contactKeys(ds: MetricsDataset, workerId: PersonaId): Set<string> {
  const keys = new Set<string>();
  for (const s of ds.cohort.screenings) {
    if (s.workerId === workerId) keys.add(`${s.patientId}|${kigaliDate(s.measuredAt)}`);
  }
  for (const f of ds.cohort.taskFollowUps ?? []) {
    for (const a of f.attempts) {
      if (a.recordedBy !== workerId) continue;
      const day = kigaliDate(a.at);
      if (inPeriod(ds, day)) keys.add(`${f.patientId}|${day}`);
    }
  }
  return keys;
}

/**
 * Patient-days: distinct `(patientId, Kigali day)` pairs from the worker's screenings
 * (`measuredAt`) and follow-up contact attempts (`attempts[].at`) in the period. Without a worker,
 * the POOLED patient-days = Σ over workers (a patient seen by two workers on one day is one
 * patient-day of each), so the pooled ratio is a ratio of sums.
 */
export function patientDays(ds: MetricsDataset, workerId?: PersonaId): number {
  if (workerId !== undefined) return contactKeys(ds, workerId).size;
  return activeWorkers(ds).reduce((n, id) => n + contactKeys(ds, id).size, 0);
}

/** Σ self-reported `TimeEntry.minutes` in the period (one worker or pooled). */
export function staffMinutes(ds: MetricsDataset, workerId?: PersonaId): number {
  return ds.cohort.timeEntries
    .filter((e) => workerId === undefined || e.workerId === workerId)
    .reduce((n, e) => n + e.minutes, 0);
}

/**
 * Staff minutes per patient-day (KPI 04 proxy) = Σ minutes ÷ patient-days, 1 dp; null when
 * patient-days = 0. Pooled = Σ minutes ÷ Σ patient-days (ratio of sums, NOT the mean of the
 * per-worker ratios).
 */
export function staffMinutesPerPatientDay(ds: MetricsDataset, workerId?: PersonaId): number | null {
  return minutesRatio(staffMinutes(ds, workerId), patientDays(ds, workerId));
}

/** `minutes / patientDays` to 1 dp; null when patientDays = 0. */
export function minutesRatio(minutes: number, days: number): number | null {
  return days === 0 ? null : round(minutes / days, 1);
}

/** Σ minutes per activity (every activity present, zero when none). */
export function minutesByActivity(
  ds: MetricsDataset,
  workerId?: PersonaId,
): Record<TimeEntryActivity, number> {
  const out = Object.fromEntries(TIME_ENTRY_ACTIVITIES.map((a) => [a, 0])) as Record<
    TimeEntryActivity,
    number
  >;
  for (const e of ds.cohort.timeEntries) {
    if (workerId === undefined || e.workerId === workerId) out[e.activity] += e.minutes;
  }
  return out;
}

export type WeeklyMinutes = {
  /** Monday `YYYY-MM-DD` (Kigali) of the week. */
  weekStart: string;
  /** Pooled minutes per patient-day of the week (1 dp); null without patient-days. */
  value: number | null;
  patientDays: number;
  minutes: number;
};

/** Contiguous ISO weeks of the period (or of the data's days when unbounded). */
export function workloadWeeks(ds: MetricsDataset): string[] {
  const days = [
    ...ds.cohort.timeEntries.map((e) => e.date),
    ...ds.cohort.screenings.map((s) => kigaliDate(s.measuredAt)),
  ].sort();
  const from = ds.filter.from ?? days[0];
  const to = ds.filter.to ?? days[days.length - 1];
  if (from === undefined || to === undefined) return [];
  const out: string[] = [];
  for (let w = isoWeekStartOfDay(from); w <= to; w = addDays(w, 7)) out.push(w);
  return out;
}

/** Pooled minutes per patient-day per Kigali ISO week (weekly patient-days sum to the total). */
export function weeklyMinutesPerPatientDay(
  ds: MetricsDataset,
  weeks: readonly string[] = workloadWeeks(ds),
): WeeklyMinutes[] {
  const days = new Map<string, number>();
  for (const id of activeWorkers(ds)) {
    for (const key of contactKeys(ds, id)) {
      const week = isoWeekStartOfDay(key.slice(key.lastIndexOf("|") + 1));
      days.set(week, (days.get(week) ?? 0) + 1);
    }
  }
  const minutes = new Map<string, number>();
  for (const e of ds.cohort.timeEntries) {
    const week = isoWeekStartOfDay(e.date);
    minutes.set(week, (minutes.get(week) ?? 0) + e.minutes);
  }
  return weeks.map((weekStart) => {
    const pd = days.get(weekStart) ?? 0;
    const m = minutes.get(weekStart) ?? 0;
    return { weekStart, value: minutesRatio(m, pd), patientDays: pd, minutes: m };
  });
}

/** Weeks of the demo baseline window (the first 4 of the 12 seeded overlay weeks). */
export const WORKLOAD_BASELINE_WEEKS = 4;
/** Seeded history weeks before the demo week (ADM-01 overlay). */
export const WORKLOAD_HISTORY_WEEKS = 12;
export const WORKLOAD_BASELINE_LABEL = "DEMO BASELINE — not an approved baseline" as const;

/**
 * DEMO BASELINE window — not an approved baseline: the first 4 Kigali ISO weeks of the 12 seeded
 * weeks before the week of `now` (Monday … Sunday, inclusive days).
 */
export function workloadBaselineWindow(now: Date): { from: string; to: string } {
  const from = addDays(kigaliIsoWeekStart(now), -7 * WORKLOAD_HISTORY_WEEKS);
  return { from, to: addDays(from, 7 * WORKLOAD_BASELINE_WEEKS - 1) };
}

export type MinutesBasis = { minutes: number; patientDays: number };

/**
 * KPI 04 "minutes per patient-day indexed against baseline" (LAIF MoH p. 17): current ratio ÷
 * baseline ratio, 2 dp (e.g. 1.08); null when either side has fewer than k patient-days.
 */
export function minutesPerPatientDayIndex(
  current: MinutesBasis,
  baseline: MinutesBasis,
  k: number = DEMO_SMALL_CELL_THRESHOLD,
): number | null {
  if (current.patientDays < k || baseline.patientDays < k) return null;
  const cur = current.minutes / current.patientDays;
  const base = baseline.minutes / baseline.patientDays;
  return base === 0 ? null : round(cur / base, 2);
}
