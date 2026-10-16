/**
 * Metric key vocabulary (snake case). Labels: `admin:metric.<key>.label|description` (EN + RW).
 * Scenario anchors (`SCN-12 metricKey: 'follow_ups_completed'`) and CSV `column_id`s use these.
 */
export const METRIC_KEYS = [
  "screenings_recorded",
  "distinct_patients_screened",
  "screenings_flagged",
  "reviews_pending",
  "reviews_completed",
  "reviews_dismissed",
  "pathway_referred",
  "pathway_completed",
  "referrals_completed",
  "follow_ups_completed",
  "median_days_to_review",
  "overdue_referrals",
  "overdue_follow_ups",
  "missing_glucose_unit",
  "possible_duplicate_identities",
  "flags_overturned_at_review",
  "screening_amendments",
  "staff_time_minutes",
] as const;
export type MetricKey = (typeof METRIC_KEYS)[number];

/** Additive count metrics: groupable into tables and subject to small-cell suppression. */
export const COUNT_METRIC_KEYS = [
  "screenings_recorded",
  "distinct_patients_screened",
  "screenings_flagged",
  "reviews_pending",
  "reviews_completed",
  "reviews_dismissed",
  "pathway_referred",
  "pathway_completed",
  "referrals_completed",
  "follow_ups_completed",
  "overdue_referrals",
  "overdue_follow_ups",
  "missing_glucose_unit",
  "possible_duplicate_identities",
  "flags_overturned_at_review",
  "screening_amendments",
] as const satisfies readonly MetricKey[];
export type CountMetricKey = (typeof COUNT_METRIC_KEYS)[number];

export function isMetricKey(value: unknown): value is MetricKey {
  return typeof value === "string" && (METRIC_KEYS as readonly string[]).includes(value);
}

export function isCountMetricKey(value: unknown): value is CountMetricKey {
  return typeof value === "string" && (COUNT_METRIC_KEYS as readonly string[]).includes(value);
}

export const metricLabelKey = (key: MetricKey): `admin:metric.${MetricKey}.label` =>
  `admin:metric.${key}.label`;
export const metricDescriptionKey = (key: MetricKey): `admin:metric.${MetricKey}.description` =>
  `admin:metric.${key}.description`;
