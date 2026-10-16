/**
 * Worker workload (FND-06 task 9). Rows are keyed by worker persona id (pseudonymous; ADM-05
 * joins the `workerCode`), never by name. ADM-05 extends this file in place (TimeEntry minutes,
 * workload index). The time figure is a STAFF-TIME PROXY (DEMO), not a measured workload.
 */
import { isFollowUpOverdue, type PersonaId } from "@laif/domain";

import { applyMetricsFilter } from "../filters.ts";
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
