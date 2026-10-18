/**
 * Report templates (ADM-07 task 1). Each lists the stable English metric ids it may write (the
 * `@laif/analytics` `buildReportRows` guard rejects anything else), its granularities and the
 * catalogue definitions (`METRIC_DEFINITIONS`) its figures come from. The values themselves come
 * from the page selectors (`reportSources.ts`), never from a second calculation.
 *
 * - `programme_summary` — the Overview figures (ADM-02);
 * - `funnel_by_facility` — the funnel stages + dismissed branch (ADM-03);
 * - `timeliness` — median / p90 days to review, overdue snapshot, pending age buckets (ADM-04);
 * - `quality` — missing fields by field, identity mismatch signals, overturned / missed-flag
 *   proxies, duplicates prevented, and the fairness disaggregation by sex and age band (ADM-06);
 * - `workload_facility` — task counts and minutes per patient-day at FACILITY level only
 *   (ADM-05): worker-level export is not offered.
 */
import {
  AGE_BANDS,
  FLAG_OUTCOME_COLUMNS,
  PENDING_AGE_BUCKETS,
  type MetricDefinitionId,
  type ReportGranularity,
  type ReportTemplateSpec,
} from "@laif/analytics";
import { MANDATORY_SCREENING_FIELDS } from "@laif/contracts";
import { SEX_VALUES } from "@laif/domain";

export const REPORT_TEMPLATE_IDS = [
  "programme_summary",
  "funnel_by_facility",
  "timeliness",
  "quality",
  "workload_facility",
] as const;
export type ReportTemplateId = (typeof REPORT_TEMPLATE_IDS)[number];

export function isReportTemplateId(value: string | null | undefined): value is ReportTemplateId {
  return (REPORT_TEMPLATE_IDS as readonly string[]).includes(value ?? "");
}

export type ReportTemplate = ReportTemplateSpec & {
  id: ReportTemplateId;
  /** Catalogue definitions the figures come from (metric info / audit trail). */
  definitions: readonly MetricDefinitionId[];
  /** Page the figures are shown on (same selector, same suppression). */
  sourcePhase: "ADM-02" | "ADM-03" | "ADM-04" | "ADM-05" | "ADM-06";
};

/** Pending-review bucket metric ids (`0-2` → `pending_reviews.0-2`). */
export const pendingBucketMetric = (bucket: string): string => `pending_reviews.${bucket}`;
export const missingFieldMetric = (field: string): string => `missing_field.${field}`;
export const fairnessSexMetric = (sex: string, column: string): string =>
  `fairness.sex.${sex}.${column}`;
export const fairnessAgeMetric = (band: string, column: string): string =>
  `fairness.age.${band}.${column}`;

export const SUMMARY_METRICS = [
  "screened",
  "flagged",
  "reviewed",
  "dismissed",
  "referred",
  "follow_up_completed",
  "median_days_to_review",
] as const;
/** Weekly rows of the summary: the overview's weekly screened vs flagged series. */
export const SUMMARY_WEEKLY_METRICS = ["screened", "flagged"] as const;

export const FUNNEL_METRICS = [
  "funnel.recorded",
  "funnel.flagged",
  "funnel.reviewed",
  "funnel.referred",
  "funnel.completed",
  "funnel.dismissed",
] as const;

export const TIMELINESS_METRICS = [
  "median_days_to_review",
  "p90_days_to_review",
  "reviews_completed",
  "overdue_referrals",
  "overdue_follow_ups",
  ...PENDING_AGE_BUCKETS.map(pendingBucketMetric),
] as const;
export const TIMELINESS_WEEKLY_METRICS = [
  "weekly_median_days_to_review",
  "weekly_reviews_completed",
  "weekly_overdue_referrals",
  "weekly_overdue_follow_ups",
] as const;

export const QUALITY_METRICS = [
  "screened",
  "screenings_missing_fields",
  ...MANDATORY_SCREENING_FIELDS.map(missingFieldMetric),
  "identity_mismatches",
  "duplicate_identifiers",
  "orphan_screenings",
  "overturned_flag_rate",
  "missed_flag_proxy",
  "duplicate_submissions_prevented",
  ...SEX_VALUES.flatMap((s) => FLAG_OUTCOME_COLUMNS.map((c) => fairnessSexMetric(s, c))),
  ...AGE_BANDS.flatMap((b) => FLAG_OUTCOME_COLUMNS.map((c) => fairnessAgeMetric(b, c))),
] as const;

export const WORKLOAD_METRICS = [
  "tasks_assigned",
  "tasks_completed",
  "task_completion_rate",
  "tasks_unable_to_reach",
  "tasks_overdue",
  "patient_days",
  "minutes_per_patient_day",
] as const;

const NODE_GRANULARITIES = ["scope_total", "district", "facility"] as const;
const WITH_WEEK = [...NODE_GRANULARITIES, "week"] as const;

export const REPORT_TEMPLATES: readonly ReportTemplate[] = Object.freeze([
  {
    id: "programme_summary",
    metricIds: SUMMARY_METRICS,
    granularities: WITH_WEEK,
    definitions: [
      "screened",
      "flagged",
      "reviewed",
      "dismissed",
      "referred",
      "followUpCompleted",
      "medianDaysToReview",
      "weeklyScreenedVsFlagged",
    ],
    sourcePhase: "ADM-02",
  },
  {
    id: "funnel_by_facility",
    metricIds: FUNNEL_METRICS,
    granularities: NODE_GRANULARITIES,
    definitions: ["screened", "flagged", "reviewed", "dismissed", "referred", "followUpCompleted"],
    sourcePhase: "ADM-03",
  },
  {
    id: "timeliness",
    metricIds: [...TIMELINESS_METRICS, ...TIMELINESS_WEEKLY_METRICS],
    granularities: WITH_WEEK,
    definitions: [
      "medianDaysToReview",
      "p90DaysToReview",
      "overdueReferrals",
      "overdueFollowUps",
      "pendingReviewAge",
      "weeklyMedianDaysToReview",
      "weeklyOverdueTrend",
    ],
    sourcePhase: "ADM-04",
  },
  {
    id: "quality",
    metricIds: QUALITY_METRICS,
    granularities: NODE_GRANULARITIES,
    definitions: [
      "qualityMissingFields",
      "qualityMissingByField",
      "identityMismatches",
      "overturnedFlagRate",
      "missedFlagProxy",
      "duplicateSubmissionsPrevented",
      "flagReviewOutcomesByGroup",
    ],
    sourcePhase: "ADM-06",
  },
  {
    id: "workload_facility",
    metricIds: WORKLOAD_METRICS,
    granularities: NODE_GRANULARITIES,
    definitions: [
      "tasksAssigned",
      "tasksCompleted",
      "tasksUnableToReach",
      "tasksOverdue",
      "workloadMinutes",
    ],
    sourcePhase: "ADM-05",
  },
]);

export function reportTemplate(id: ReportTemplateId): ReportTemplate {
  const found = REPORT_TEMPLATES.find((t) => t.id === id);
  if (found === undefined) throw new RangeError(`no report template ${id}`);
  return found;
}

export type GranularityOption = { value: ReportGranularity; disabled: boolean };

/**
 * Granularities of a template for the current view. `district` needs a district-level grant and
 * no facility filter (a district row of a facility-only scope would be mislabelled).
 */
export function granularityOptions(
  template: ReportTemplate,
  view: { facility: string | null; districtGrant: boolean },
): GranularityOption[] {
  return template.granularities.map((value) => ({
    value,
    disabled: value === "district" && (view.facility !== null || !view.districtGrant),
  }));
}
