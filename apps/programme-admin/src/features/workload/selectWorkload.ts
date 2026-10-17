/**
 * Workload selector (ADM-05): `MetricsDataset` of the actor's FULL grant scope (+ the same scope
 * over the DEMO BASELINE window) → the view's `WorkloadView`, made only of `AggregateCell`s keyed
 * by worker code / facility / week / activity ids. No worker persona id, name or patient
 * identifier leaves this module (`WorkerRow` has only `workerCode`).
 *
 * Privacy (binding pattern, as `selectTimeliness`): ONE scope-wide `suppressOverScope` pass, then
 * the selected district / facility picks its cells.
 * - Additive nodes per facility / district / programme: the task states (`completed`,
 *   `inProgress`, `unableToReach`, `overdue`; lines states → `assigned`), patient-days (`pd`,
 *   with the weekly patient-days `wpd:i` → `pd`), and the same measures per worker
 *   (`w:<id>:<m>`), each worker line summing to the node total (complementary suppression across
 *   the row total). The lines are part of the pass for every role, so the auditor's aggregates
 *   are hidden exactly as the programme lead's.
 * - Minutes are self-reported staff time, not patient counts, so minute totals are shown; every
 *   minutes-per-patient-day value is a ratio that follows its patient-day cell — hidden with it
 *   (patient-days < k or complementary), `null` ("—") when there were no patient contacts.
 */
import {
  activeWorkers,
  minutesByActivity,
  minutesPerPatientDayIndex,
  minutesRatio,
  patientDays,
  rateCell,
  staffMinutes,
  weeklyMinutesPerPatientDay,
  WORKLOAD_TASK_STATES,
  workerTaskCounts,
  workloadWeeks,
  type AggregateCell,
  type MetricsDataset,
  type SuppressionLine,
  type WorkloadTaskState,
} from "@laif/analytics";
import { TIME_ENTRY_ACTIVITIES, type TimeEntryActivity } from "@laif/contracts";

import { restrictDataset } from "../metrics/restrictDataset.ts";
import {
  facilityNode,
  ROOT_NODE,
  suppressOverScope,
  viewNodeOf,
  type NodeKey,
  type ScopeView,
} from "../metrics/scopeSuppression.ts";

/** Additive measures of one node (task states sum to `assigned`). */
const TASK_MEASURES = ["assigned", ...WORKLOAD_TASK_STATES] as const;
type TaskMeasure = (typeof TASK_MEASURES)[number];

export type WorkerRow = {
  /** Stable row key: `${workerCode}@${facilityId}` (no persona id). */
  key: string;
  /** Pseudonymous staff code (`HW-014`); null for staff missing from the directory. */
  workerCode: string | null;
  facilityId: string;
  districtId: string;
  assigned: AggregateCell;
  completed: AggregateCell;
  /** completed / assigned in [0, 1]; hidden when either count is. */
  completionRate: AggregateCell;
  overdue: AggregateCell;
  unableToReach: AggregateCell;
  /** Hidden with the worker's patient-days; null when no patient contact was recorded. */
  minutesPerPatientDay: AggregateCell;
  /** No patient contact recorded in the period (minutes show "—"). */
  noContacts: boolean;
};

export type WeeklyMinutesPoint = {
  weekStart: string;
  value: AggregateCell;
  patientDays: AggregateCell;
};

export type WorkloadView = {
  threshold: number;
  computedAt: string;
  rulesetVersions: string[];
  excludedConsentWithdrawn: number;
  /** No follow-up task assigned in the view's period. */
  noTasks: boolean;
  kpis: {
    activeWorkers: AggregateCell;
    assigned: AggregateCell;
    completed: AggregateCell;
    completionRate: AggregateCell;
    unableToReach: AggregateCell;
    overdue: AggregateCell;
    inProgress: AggregateCell;
    patientDays: AggregateCell;
    minutesPerPatientDay: AggregateCell;
    /** Current ÷ DEMO BASELINE minutes per patient-day; null when either side has < k. */
    index: AggregateCell;
  };
  taskStates: Record<WorkloadTaskState, AggregateCell>;
  minutesByActivity: Record<TimeEntryActivity, AggregateCell>;
  weekly: WeeklyMinutesPoint[];
  /** Null when the viewer lacks `metrics.drilldown` (never computed for them). */
  workers: WorkerRow[] | null;
  baseline: { from: string; to: string };
};

const shownCell = (key: string, value: number | null): AggregateCell => ({
  key,
  value,
  suppressed: false,
});

/** A ratio shown only with its basis count: hidden with it, "—" when the basis is 0. */
function ratioCell(key: string, value: number | null, basis: AggregateCell): AggregateCell {
  if (basis.suppressed) {
    return { key, value: null, suppressed: true, reason: basis.reason ?? "COMPLEMENTARY" };
  }
  return shownCell(key, basis.value === 0 ? null : value);
}

const wm = (id: string, m: string): string => `w:${id}:${m}`;

export type SelectWorkloadOptions = {
  /** `metrics.drilldown`: worker rows are produced only for these roles. */
  includeWorkers: boolean;
  /** The same grant scope over the DEMO BASELINE window. */
  baseline: MetricsDataset;
  baselineWindow: { from: string; to: string };
};

export function selectWorkload(
  ds: MetricsDataset,
  view: ScopeView,
  threshold: number,
  options: SelectWorkloadOptions,
): WorkloadView {
  const weeks = workloadWeeks(ds);
  const workers = activeWorkers(ds);
  const measures = [
    ...TASK_MEASURES,
    "pd",
    ...weeks.map((_, i) => `wpd:${i}`),
    ...workers.flatMap((id) => [...TASK_MEASURES, "pd"].map((m) => wm(id, m))),
  ];

  const nodeLines = (node: string, key: NodeKey): SuppressionLine[] => {
    const lines: SuppressionLine[] = [
      { members: WORKLOAD_TASK_STATES.map((s) => key(node, s)), total: key(node, "assigned") },
    ];
    if (weeks.length > 0) {
      lines.push({ members: weeks.map((_, i) => key(node, `wpd:${i}`)), total: key(node, "pd") });
    }
    for (const id of workers) {
      lines.push({
        members: WORKLOAD_TASK_STATES.map((s) => key(node, wm(id, s))),
        total: key(node, wm(id, "assigned")),
      });
    }
    if (workers.length > 0) {
      for (const m of [...TASK_MEASURES, "pd"]) {
        lines.push({ members: workers.map((id) => key(node, wm(id, m))), total: key(node, m) });
      }
    }
    return lines;
  };

  const pass = suppressOverScope(
    ds,
    {
      measures,
      facilityMeasures: (fds) => {
        const out = new Map<string, number>();
        const counts = workerTaskCounts(fds);
        for (const m of TASK_MEASURES) out.set(m, counts.total[m]);
        for (const [id, c] of counts.byWorker)
          for (const m of TASK_MEASURES) out.set(wm(id, m), c[m]);
        let pd = 0;
        for (const id of activeWorkers(fds)) {
          const n = patientDays(fds, id);
          out.set(wm(id, "pd"), n);
          pd += n;
        }
        out.set("pd", pd);
        weeklyMinutesPerPatientDay(fds, weeks).forEach((w, i) =>
          out.set(`wpd:${i}`, w.patientDays),
        );
        return out;
      },
      nodeLines,
    },
    threshold,
  );
  const { cellOf } = pass;

  const viewNode = viewNodeOf(view);
  const narrow = (base: MetricsDataset): MetricsDataset =>
    viewNode === ROOT_NODE
      ? base
      : restrictDataset(base, {
          ...(view.district === null ? {} : { districtIds: [view.district] }),
          ...(view.facility === null ? {} : { facilityIds: [view.facility] }),
        });
  const viewDs = narrow(ds);
  const baseDs = narrow(options.baseline);

  const task = (m: TaskMeasure, node = viewNode): AggregateCell => cellOf(node, m, m);
  const pdCell = cellOf(viewNode, "pd", "patientDays");
  const minutes = staffMinutes(viewDs);
  const viewPd = patientDays(viewDs);
  const mppd = ratioCell("minutesPerPatientDay", minutesRatio(minutes, viewPd), pdCell);
  const indexValue = minutesPerPatientDayIndex(
    { minutes, patientDays: viewPd },
    { minutes: staffMinutes(baseDs), patientDays: patientDays(baseDs) },
    threshold,
  );
  const weekly = weeklyMinutesPerPatientDay(viewDs, weeks);
  const activity = minutesByActivity(viewDs);
  const assigned = task("assigned");
  const completed = task("completed");

  return {
    threshold,
    computedAt: ds.nowIso,
    rulesetVersions: viewDs.rulesetVersions,
    excludedConsentWithdrawn: viewDs.excludedConsentWithdrawn,
    noTasks: !assigned.suppressed && assigned.value === 0,
    kpis: {
      activeWorkers: shownCell("activeWorkers", activeWorkers(viewDs).length),
      assigned,
      completed,
      completionRate: rateCell("completionRate", completed, assigned),
      unableToReach: task("unableToReach"),
      overdue: task("overdue"),
      inProgress: task("inProgress"),
      patientDays: pdCell,
      minutesPerPatientDay: mppd,
      index: mppd.suppressed ? ratioCell("index", null, pdCell) : shownCell("index", indexValue),
    },
    taskStates: Object.fromEntries(WORKLOAD_TASK_STATES.map((s) => [s, task(s)])) as Record<
      WorkloadTaskState,
      AggregateCell
    >,
    minutesByActivity: Object.fromEntries(
      TIME_ENTRY_ACTIVITIES.map((a) => [a, shownCell(a, activity[a])]),
    ) as Record<TimeEntryActivity, AggregateCell>,
    weekly: weeks.map((weekStart, i) => {
      const n = cellOf(viewNode, `wpd:${i}`, weekStart);
      return {
        weekStart,
        patientDays: n,
        value: ratioCell(weekStart, weekly[i]?.value ?? null, n),
      };
    }),
    workers: options.includeWorkers ? workerRows(ds, view, cellOf) : null,
    baseline: options.baselineWindow,
  };
}

function workerRows(
  ds: MetricsDataset,
  view: ScopeView,
  cellOf: (node: string, measure: string, cellKey?: string) => AggregateCell,
): WorkerRow[] {
  const codes = new Map((ds.cohort.workers ?? []).map((w) => [w.id as string, w.workerCode]));
  const rows: WorkerRow[] = [];
  for (const f of ds.cohort.facilities) {
    if (view.facility !== null && f.id !== view.facility) continue;
    if (view.district !== null && f.districtId !== view.district) continue;
    const fds = restrictDataset(ds, { facilityIds: [f.id] });
    const node = facilityNode(f.id);
    for (const id of activeWorkers(fds)) {
      const code = codes.get(id) ?? null;
      const key = `${code ?? "unlisted"}@${f.id}`;
      const cell = (m: string) => cellOf(node, wm(id, m), key);
      const assigned = cell("assigned");
      const completed = cell("completed");
      const pd = cell("pd");
      rows.push({
        key,
        workerCode: code,
        facilityId: f.id,
        districtId: f.districtId,
        assigned,
        completed,
        completionRate: rateCell(key, completed, assigned),
        overdue: cell("overdue"),
        unableToReach: cell("unableToReach"),
        minutesPerPatientDay: ratioCell(
          key,
          minutesRatio(staffMinutes(fds, id), patientDays(fds, id)),
          pd,
        ),
        noContacts: !pd.suppressed && pd.value === 0,
      });
    }
  }
  // Default order: worker code (never by performance).
  return rows.sort(
    (a, b) =>
      (a.workerCode ?? "~").localeCompare(b.workerCode ?? "~") ||
      a.facilityId.localeCompare(b.facilityId),
  );
}
