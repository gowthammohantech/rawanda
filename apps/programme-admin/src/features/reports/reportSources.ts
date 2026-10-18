/**
 * Report sections (ADM-07 task 2, "one shared code path"): every figure of a report is a cell
 * PICKED from the page selector that shows it on screen — `selectOverview`, `selectFunnel`,
 * `selectTimeliness`, `selectQuality`, `selectWorkload` — run over the dataset of the actor's FULL
 * grant scope. Those selectors run the scope-wide suppression pass (`scopeSuppression.ts`), so a
 * CSV cell is suppressed exactly when the dashboard hides it, and differencing a district file
 * against a facility file recovers nothing hidden. Nothing here computes a value.
 *
 * Nodes: `scope_total` = the selected view (programme, a district or a facility); `district` /
 * `facility` = each district / facility inside the view; `week` = the view's weekly series.
 */
import {
  AGE_BANDS,
  FLAG_OUTCOME_COLUMNS,
  FUNNEL_COLUMNS,
  PENDING_AGE_BUCKETS,
  type AggregateCell,
  type MetricsDataset,
  type ReportGranularity,
  type ReportMetricCell,
  type ReportNode,
  type ReportSection,
  type SuppressionReason,
} from "@laif/analytics";
import { MANDATORY_SCREENING_FIELDS } from "@laif/contracts";
import { SEX_VALUES } from "@laif/domain";

import { selectFunnel } from "../funnel/selectFunnel.ts";
import { selectOverview } from "../metrics/selectOverview.ts";
import type { ScopeView } from "../metrics/scopeSuppression.ts";
import { selectQuality } from "../quality/selectQuality.ts";
import { selectTimeliness } from "../timeliness/selectTimeliness.ts";
import { selectWorkload } from "../workload/selectWorkload.ts";
import {
  fairnessAgeMetric,
  fairnessSexMetric,
  missingFieldMetric,
  pendingBucketMetric,
  type ReportTemplateId,
} from "./templates.ts";

export type ReportDatasets = {
  /** The actor's FULL grant scope for the period (shared `adminKeys.dataset` cache). */
  scope: MetricsDataset;
  /** Workload only: the same scope over the DEMO BASELINE window. */
  baseline?: { dataset: MetricsDataset; window: { from: string; to: string } };
};

export type ReportSectionsInput = {
  template: ReportTemplateId;
  granularity: ReportGranularity;
  /** The global filter's district / facility (null = everything in the grant). */
  view: ScopeView;
  threshold: number;
  datasets: ReportDatasets;
};

export type ReportSections = {
  sections: ReportSection[];
  /** Suppression reason of each metric cell, flattened in row order (preview `<k` / "Hidden"). */
  reasons: Array<SuppressionReason | null>;
  rulesetVersions: string[];
  /** District / facility ids the report covers (explicit — never `ALL`). */
  districtIds: string[];
  facilityIds: string[];
};

const m = (
  metricId: string,
  cell: AggregateCell,
  parts: { numerator?: AggregateCell; denominator?: AggregateCell } = {},
): ReportMetricCell => ({ metricId, cell, ...parts });

type NodeView = { node: ReportNode; view: ScopeView };

function viewFacilities(ds: MetricsDataset, view: ScopeView) {
  return ds.cohort.facilities.filter(
    (f) =>
      (view.facility === null || f.id === view.facility) &&
      (view.district === null || f.districtId === view.district),
  );
}

/** The nodes of a (non-week) granularity inside the view. */
function nodesOf(ds: MetricsDataset, view: ScopeView, granularity: ReportGranularity): NodeView[] {
  const facilities = viewFacilities(ds, view);
  if (granularity === "district") {
    const ids = [...new Set(facilities.map((f) => f.districtId as string))];
    return ds.cohort.districts
      .filter((d) => ids.includes(d.id))
      .map((d) => ({
        node: { granularity, districtId: d.id, facilityId: null, weekStart: null },
        view: { district: d.id, facility: null },
      }));
  }
  if (granularity === "facility") {
    return facilities.map((f) => ({
      node: { granularity, districtId: f.districtId, facilityId: f.id, weekStart: null },
      view: { district: f.districtId, facility: f.id },
    }));
  }
  const district =
    view.district ??
    (view.facility === null
      ? null
      : (ds.cohort.facilities.find((f) => f.id === view.facility)?.districtId ?? null));
  return [
    {
      node: { granularity, districtId: district, facilityId: view.facility, weekStart: null },
      view,
    },
  ];
}

const weekNode = (view: ScopeView, ds: MetricsDataset, weekStart: string): ReportNode => ({
  ...nodesOf(ds, view, "scope_total")[0]!.node,
  granularity: "week",
  weekStart,
});

function summarySections(
  ds: MetricsDataset,
  view: ScopeView,
  granularity: ReportGranularity,
  k: number,
): ReportSection[] {
  if (granularity === "week") {
    const o = selectOverview(ds, k, { view });
    return o.weekly.map((w) => ({
      node: weekNode(view, ds, w.weekStart),
      metrics: [m("screened", w.screened), m("flagged", w.flagged)],
    }));
  }
  return nodesOf(ds, view, granularity).map(({ node, view: v }) => {
    const o = selectOverview(ds, k, { view: v });
    return {
      node,
      metrics: [
        m("screened", o.totals.screened),
        m("flagged", o.totals.flagged),
        m("reviewed", o.totals.reviewed),
        m("dismissed", o.totals.dismissed),
        m("referred", o.totals.referred),
        m("follow_up_completed", o.totals.followUpCompleted),
        m("median_days_to_review", o.medianDaysToReview),
      ],
    };
  });
}

function funnelSections(
  ds: MetricsDataset,
  view: ScopeView,
  granularity: ReportGranularity,
  k: number,
): ReportSection[] {
  return nodesOf(ds, view, granularity).map(({ node, view: v }) => {
    const f = selectFunnel(ds, v, k);
    return {
      node,
      metrics: FUNNEL_COLUMNS.map((c) => m(`funnel.${c}`, f.node.cells[c])),
    };
  });
}

function timelinessSections(
  ds: MetricsDataset,
  view: ScopeView,
  granularity: ReportGranularity,
  k: number,
): ReportSection[] {
  if (granularity === "week") {
    const tv = selectTimeliness(ds, view, k);
    const byWeek = new Map<string, ReportMetricCell[]>();
    const push = (week: string, cell: ReportMetricCell) => {
      const list = byWeek.get(week);
      if (list) list.push(cell);
      else byWeek.set(week, [cell]);
    };
    for (const w of tv.medianTrend) {
      push(w.weekStart, m("weekly_median_days_to_review", w.median));
      push(w.weekStart, m("weekly_reviews_completed", w.n));
    }
    for (const w of tv.overdueTrend) {
      push(w.weekStart, m("weekly_overdue_referrals", w.referrals));
      push(w.weekStart, m("weekly_overdue_follow_ups", w.followUps));
    }
    return [...byWeek.keys()]
      .sort()
      .map((week) => ({ node: weekNode(view, ds, week), metrics: byWeek.get(week) ?? [] }));
  }
  return nodesOf(ds, view, granularity).map(({ node, view: v }) => {
    const tv = selectTimeliness(ds, v, k);
    return {
      node,
      metrics: [
        m("median_days_to_review", tv.kpis.median),
        m("p90_days_to_review", tv.kpis.p90),
        m("reviews_completed", tv.kpis.reviews),
        m("overdue_referrals", tv.kpis.overdueReferrals),
        m("overdue_follow_ups", tv.kpis.overdueFollowUps),
        ...PENDING_AGE_BUCKETS.map((b) => m(pendingBucketMetric(b), tv.aging[b])),
      ],
    };
  });
}

function qualitySections(
  ds: MetricsDataset,
  view: ScopeView,
  granularity: ReportGranularity,
  k: number,
): ReportSection[] {
  return nodesOf(ds, view, granularity).map(({ node, view: v }) => {
    const q = selectQuality(ds, v, k);
    return {
      node,
      metrics: [
        m("screened", q.kpis.screened),
        m("screenings_missing_fields", q.kpis.missing),
        ...MANDATORY_SCREENING_FIELDS.map((f) => m(missingFieldMetric(f), q.byField[f])),
        m("identity_mismatches", q.kpis.mismatches),
        m("duplicate_identifiers", q.kpis.duplicateIdentifier),
        m("orphan_screenings", q.kpis.orphanScreening),
        m("overturned_flag_rate", q.kpis.overturnedRate, {
          numerator: q.kpis.overturned,
          denominator: q.kpis.reviewed,
        }),
        m("missed_flag_proxy", q.kpis.missedFlagProxy),
        m("duplicate_submissions_prevented", q.kpis.duplicateSubmissions),
        ...SEX_VALUES.flatMap((s) =>
          FLAG_OUTCOME_COLUMNS.map((c) => m(fairnessSexMetric(s, c), q.fairness.sex[s][c])),
        ),
        ...AGE_BANDS.flatMap((b) =>
          FLAG_OUTCOME_COLUMNS.map((c) => m(fairnessAgeMetric(b, c), q.fairness.age[b][c])),
        ),
      ],
    };
  });
}

function workloadSections(
  ds: MetricsDataset,
  view: ScopeView,
  granularity: ReportGranularity,
  k: number,
  baseline: NonNullable<ReportDatasets["baseline"]>,
): ReportSection[] {
  return nodesOf(ds, view, granularity).map(({ node, view: v }) => {
    // Facility level only: worker rows are never computed for an export.
    const w = selectWorkload(ds, v, k, {
      includeWorkers: false,
      baseline: baseline.dataset,
      baselineWindow: baseline.window,
    });
    return {
      node,
      metrics: [
        m("tasks_assigned", w.kpis.assigned),
        m("tasks_completed", w.kpis.completed),
        m("task_completion_rate", w.kpis.completionRate, {
          numerator: w.kpis.completed,
          denominator: w.kpis.assigned,
        }),
        m("tasks_unable_to_reach", w.kpis.unableToReach),
        m("tasks_overdue", w.kpis.overdue),
        m("patient_days", w.kpis.patientDays),
        m("minutes_per_patient_day", w.kpis.minutesPerPatientDay, {
          denominator: w.kpis.patientDays,
        }),
      ],
    };
  });
}

const reasonOf = (metric: ReportMetricCell): SuppressionReason | null => {
  for (const c of [metric.cell, metric.numerator, metric.denominator]) {
    if (c?.suppressed) return c.reason ?? "COMPLEMENTARY";
  }
  return null;
};

export function buildReportSections(input: ReportSectionsInput): ReportSections {
  const { template, granularity, view, threshold: k, datasets } = input;
  const ds = datasets.scope;
  let sections: ReportSection[];
  switch (template) {
    case "programme_summary":
      sections = summarySections(ds, view, granularity, k);
      break;
    case "funnel_by_facility":
      sections = funnelSections(ds, view, granularity, k);
      break;
    case "timeliness":
      sections = timelinessSections(ds, view, granularity, k);
      break;
    case "quality":
      sections = qualitySections(ds, view, granularity, k);
      break;
    case "workload_facility": {
      if (datasets.baseline === undefined) throw new Error("workload report needs the baseline");
      sections = workloadSections(ds, view, granularity, k, datasets.baseline);
      break;
    }
  }
  const facilities = viewFacilities(ds, view);
  return {
    sections,
    reasons: sections.flatMap((s) => s.metrics.map(reasonOf)),
    rulesetVersions: ds.rulesetVersions,
    districtIds:
      view.district !== null
        ? [view.district]
        : [...new Set(facilities.map((f) => f.districtId as string))].filter((d) =>
            ds.cohort.districts.some((x) => x.id === d),
          ),
    facilityIds: facilities.map((f) => f.id as string),
  };
}
