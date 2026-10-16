/**
 * `getProgrammeMetrics` — every programme number in one deterministic call (FND-06), plus the
 * count-metric registry and grouped tables that feed suppression and the aggregate CSV.
 */
import { applyMetricsFilter } from "../filters.ts";
import type { CountMetricKey } from "../metric-keys.ts";
import { type CountTable } from "../suppression.ts";
import { METRIC_VERSION, type AnalyticsInput, type MetricsFilter } from "../types.ts";
import { funnelCount, pathwayFunnel, type PathwayFunnel } from "./funnel.ts";
import { dataQuality, type DataQuality } from "./quality.ts";
import { screeningOverview, type ScreeningOverview } from "./screening-overview.ts";
import { timeliness, type Timeliness } from "./timeliness.ts";
import { workerWorkload, type WorkerWorkload } from "./workload.ts";

export type ProgrammeMetrics = {
  metricVersion: typeof METRIC_VERSION;
  /** Demo-clock instant the metrics were computed for (ISO UTC). */
  computedAt: string;
  filter: {
    from: string | null;
    to: string | null;
    districtIds: string[] | null;
    facilityIds: string[] | null;
  };
  overview: ScreeningOverview;
  funnel: PathwayFunnel;
  timeliness: Timeliness;
  workload: WorkerWorkload;
  quality: DataQuality;
};

export function getProgrammeMetrics(
  data: AnalyticsInput,
  filter: MetricsFilter,
  now: Date,
): ProgrammeMetrics {
  return {
    metricVersion: METRIC_VERSION,
    computedAt: now.toISOString(),
    filter: {
      from: filter.from ?? null,
      to: filter.to ?? null,
      districtIds: filter.districtIds ? [...filter.districtIds] : null,
      facilityIds: filter.facilityIds ? [...filter.facilityIds] : null,
    },
    overview: screeningOverview(data, filter, now),
    funnel: pathwayFunnel(data, filter, now),
    timeliness: timeliness(data, filter, now),
    workload: workerWorkload(data, filter, now),
    quality: dataQuality(data, filter, now),
  };
}

/** Value of one additive count metric. */
export function countMetric(
  key: CountMetricKey,
  data: AnalyticsInput,
  filter: MetricsFilter,
  now: Date,
): number {
  switch (key) {
    case "screenings_recorded":
      return screeningOverview(data, filter, now).screeningsRecorded;
    case "distinct_patients_screened":
      return screeningOverview(data, filter, now).distinctPatientsScreened;
    case "screenings_flagged":
      return screeningOverview(data, filter, now).screeningsFlagged;
    case "reviews_pending":
      return screeningOverview(data, filter, now).reviewsPending;
    case "reviews_completed":
      return funnelCount(pathwayFunnel(data, filter, now), "reviewed");
    case "reviews_dismissed":
      return pathwayFunnel(data, filter, now).dismissed.count;
    case "pathway_referred":
      return funnelCount(pathwayFunnel(data, filter, now), "referred");
    case "pathway_completed":
      return funnelCount(pathwayFunnel(data, filter, now), "completed");
    case "referrals_completed":
      return screeningOverview(data, filter, now).referralsCompleted;
    case "follow_ups_completed":
      return screeningOverview(data, filter, now).followUpsCompleted;
    case "overdue_referrals":
      return timeliness(data, filter, now).overdueReferrals;
    case "overdue_follow_ups":
      return timeliness(data, filter, now).overdueFollowUps;
    case "missing_glucose_unit":
      return dataQuality(data, filter, now).missingGlucoseUnit;
    case "possible_duplicate_identities":
      return dataQuality(data, filter, now).possibleDuplicateIdentities;
    case "flags_overturned_at_review":
      return dataQuality(data, filter, now).flagsOverturnedAtReview;
    case "screening_amendments":
      return dataQuality(data, filter, now).screeningAmendments;
  }
}

export type MetricTableOptions = {
  groupBy: "facility" | "district";
  metricKeys: readonly CountMetricKey[];
  /** Publish a total per column (default true). */
  columnTotals?: boolean;
  /** Publish a total per row (default false — metrics are not additive across columns). */
  rowTotals?: boolean;
};

/**
 * Groups × count metrics as a `CountTable` (rows = facility / district ids in the filtered
 * scope, columns = metric keys), ready for `suppressCells`. Each cell is the metric computed
 * with the filter narrowed to that group.
 */
export function metricTable(
  data: AnalyticsInput,
  filter: MetricsFilter,
  now: Date,
  options: MetricTableOptions,
): CountTable {
  const scoped = applyMetricsFilter(data, filter);
  const groups =
    options.groupBy === "facility"
      ? scoped.facilities.map((f) => ({ id: f.id, filter: { ...filter, facilityIds: [f.id] } }))
      : scoped.districts.map((d) => ({ id: d.id, filter: { ...filter, districtIds: [d.id] } }));
  return {
    rowDimension: options.groupBy === "facility" ? "facility_id" : "district_id",
    columnDimension: "metric_id",
    rowKeys: groups.map((g) => g.id),
    columnKeys: [...options.metricKeys],
    cells: groups.map((g) => options.metricKeys.map((k) => countMetric(k, data, g.filter, now))),
    columnTotals: options.columnTotals ?? true,
    rowTotals: options.rowTotals ?? false,
  };
}
