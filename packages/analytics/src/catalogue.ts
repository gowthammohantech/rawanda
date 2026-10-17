/**
 * Metric catalogue (ADM-02 task 8, spec §8 "no fabricated KPIs"). Every number the admin app
 * displays has a definition here: label, numerator, denominator, inclusion and attribution rule,
 * all as `admin:` i18n keys, plus the definitions version `demo-metrics-1`.
 *
 * Pilot KPIs (LAIF MoH proposal p. 17): all six are listed. KPI03 (medicine-history completeness)
 * and KPI05 (patient understanding) have no field in the NCD MVP, so they are `deferred` — BRD §10:
 * mark deferred rather than fabricate. A deferred metric never has a value.
 */
import { METRIC_VERSION } from "./types.ts";

export const PILOT_KPIS = ["KPI01", "KPI02", "KPI03", "KPI04", "KPI05", "KPI06"] as const;
export type PilotKpi = (typeof PILOT_KPIS)[number];

export const METRIC_DEFINITION_IDS = [
  "screened",
  "peopleScreened",
  "flagged",
  "reviewed",
  "dismissed",
  "actioned",
  "referred",
  "followUpCompleted",
  "medianDaysToReview",
  "weeklyScreenedVsFlagged",
  "screeningType",
  "overdueReferrals",
  "overdueFollowUps",
  "pendingReviewAge",
  "openQualityIssues",
  "p90DaysToReview",
  "reviewsPending",
  "medianDaysToReferralCompletion",
  "weeklyMedianDaysToReview",
  "weeklyOverdueTrend",
  "medianDaysByFacility",
  "workloadMinutes",
  "activeWorkers",
  "tasksAssigned",
  "tasksCompleted",
  "tasksUnableToReach",
  "tasksOverdue",
  "minutesPerPatientDayIndex",
  "minutesByActivity",
  "weeklyMinutesPerPatientDay",
  "promptIdReliability",
  "medicineHistoryCompleteness",
  "patientUnderstanding",
] as const;
export type MetricDefinitionId = (typeof METRIC_DEFINITION_IDS)[number];

export type MetricStatus = "measured" | "deferred";

export type MetricDefinition = {
  id: MetricDefinitionId;
  /** `admin:` i18n keys. */
  labelKey: string;
  numerator: string;
  /** Null for a plain count / median. */
  denominator: string | null;
  inclusion: string;
  attribution: string;
  /** Calculation method (e.g. the percentile interpolation), when not a plain count. */
  method?: string;
  version: typeof METRIC_VERSION;
  status: MetricStatus;
  pilotKpi?: PilotKpi;
  /** Phase whose screen shows the figure (later phases fill in their screens). */
  shownIn: "ADM-02" | "ADM-04" | "ADM-05" | "ADM-06" | null;
};

const K = "admin:overview.catalogue" as const;
const INCLUSION = `${K}.inclusion.cohort`;
const INCLUSION_DEFERRED = `${K}.inclusion.deferred`;
const ATTRIBUTION_PERIOD = `${K}.attribution.period`;
const ATTRIBUTION_COHORT = `${K}.attribution.cohort`;
const ATTRIBUTION_SNAPSHOT = `${K}.attribution.snapshot`;
const ATTRIBUTION_NONE = `${K}.attribution.none`;
const ATTRIBUTION_REVIEW_WEEK = `${K}.attribution.reviewWeek`;
const ATTRIBUTION_WEEK_END = `${K}.attribution.weekEnd`;
/** ADM-05: the documented exception — tasks count in the period of their assignment date. */
const ATTRIBUTION_TASK_CREATED = `${K}.attribution.taskCreated`;
const ATTRIBUTION_TIME_ENTRY = `${K}.attribution.timeEntry`;
const INCLUSION_PROXY = `${K}.inclusion.proxy`;
/** ADM-05: pooled minutes per patient-day = Σ minutes ÷ Σ patient-days (ratio of sums). */
const METHOD_RATIO_OF_SUMS = `${K}.method.ratioOfSums`;
const METHOD_BASELINE_INDEX = `${K}.method.baselineIndex`;
/**
 * Percentiles (ADM-04): linear interpolation between closest ranks (type 7 / `PERCENTILE.INC`):
 * rank h = (n − 1) · p / 100, value x[⌊h⌋] + (h − ⌊h⌋) · (x[⌊h⌋+1] − x[⌊h⌋]); hidden when
 * n < k (a percentile of a tiny group can disclose individual timings).
 */
const METHOD_PERCENTILE = `${K}.method.percentile`;

function def(
  id: MetricDefinitionId,
  extra: Partial<Omit<MetricDefinition, "id" | "version">> = {},
): MetricDefinition {
  return {
    id,
    labelKey: `${K}.${id}.label`,
    numerator: `${K}.${id}.numerator`,
    denominator: null,
    inclusion: INCLUSION,
    attribution: ATTRIBUTION_COHORT,
    version: METRIC_VERSION,
    status: "measured",
    shownIn: "ADM-02",
    ...extra,
  };
}

const DEN_SCREENED = `${K}.denominator.screened`;
const DEN_FLAGGED = `${K}.denominator.flagged`;
const DEN_REFERRED = `${K}.denominator.referred`;

export const METRIC_DEFINITIONS: readonly MetricDefinition[] = Object.freeze([
  def("screened", { attribution: ATTRIBUTION_PERIOD }),
  def("peopleScreened", { attribution: ATTRIBUTION_PERIOD }),
  def("flagged", { denominator: DEN_SCREENED, attribution: ATTRIBUTION_PERIOD }),
  def("reviewed", { denominator: DEN_FLAGGED }),
  def("dismissed", { denominator: DEN_FLAGGED }),
  def("actioned", { denominator: DEN_FLAGGED }),
  def("referred", { denominator: DEN_FLAGGED }),
  def("followUpCompleted", { denominator: DEN_REFERRED, pilotKpi: "KPI01" }),
  def("medianDaysToReview", { pilotKpi: "KPI02", method: METHOD_PERCENTILE }),
  def("weeklyScreenedVsFlagged", { attribution: ATTRIBUTION_PERIOD }),
  def("screeningType", { denominator: DEN_SCREENED, attribution: ATTRIBUTION_PERIOD }),
  def("overdueReferrals", { attribution: ATTRIBUTION_SNAPSHOT }),
  def("overdueFollowUps", { attribution: ATTRIBUTION_SNAPSHOT }),
  def("pendingReviewAge", { attribution: ATTRIBUTION_SNAPSHOT }),
  def("openQualityIssues", { attribution: ATTRIBUTION_SNAPSHOT }),
  def("p90DaysToReview", { method: METHOD_PERCENTILE, shownIn: "ADM-04" }),
  def("reviewsPending", { attribution: ATTRIBUTION_SNAPSHOT, shownIn: "ADM-04" }),
  def("medianDaysToReferralCompletion", {
    pilotKpi: "KPI02",
    method: METHOD_PERCENTILE,
    shownIn: "ADM-04",
  }),
  def("weeklyMedianDaysToReview", {
    method: METHOD_PERCENTILE,
    attribution: ATTRIBUTION_REVIEW_WEEK,
    shownIn: "ADM-04",
  }),
  def("weeklyOverdueTrend", { attribution: ATTRIBUTION_WEEK_END, shownIn: "ADM-04" }),
  def("medianDaysByFacility", { method: METHOD_PERCENTILE, shownIn: "ADM-04" }),
  def("workloadMinutes", {
    pilotKpi: "KPI04",
    denominator: `${K}.denominator.patientDays`,
    inclusion: INCLUSION_PROXY,
    attribution: ATTRIBUTION_TIME_ENTRY,
    method: METHOD_RATIO_OF_SUMS,
    shownIn: "ADM-05",
  }),
  def("activeWorkers", {
    inclusion: INCLUSION_PROXY,
    attribution: ATTRIBUTION_TIME_ENTRY,
    shownIn: "ADM-05",
  }),
  def("tasksAssigned", { attribution: ATTRIBUTION_TASK_CREATED, shownIn: "ADM-05" }),
  def("tasksCompleted", {
    denominator: `${K}.denominator.tasksAssigned`,
    attribution: ATTRIBUTION_TASK_CREATED,
    shownIn: "ADM-05",
  }),
  def("tasksUnableToReach", { attribution: ATTRIBUTION_TASK_CREATED, shownIn: "ADM-05" }),
  def("tasksOverdue", { attribution: ATTRIBUTION_TASK_CREATED, shownIn: "ADM-05" }),
  def("minutesPerPatientDayIndex", {
    inclusion: INCLUSION_PROXY,
    attribution: ATTRIBUTION_TIME_ENTRY,
    method: METHOD_BASELINE_INDEX,
    shownIn: "ADM-05",
  }),
  def("minutesByActivity", {
    inclusion: INCLUSION_PROXY,
    attribution: ATTRIBUTION_TIME_ENTRY,
    shownIn: "ADM-05",
  }),
  def("weeklyMinutesPerPatientDay", {
    denominator: `${K}.denominator.patientDays`,
    inclusion: INCLUSION_PROXY,
    attribution: ATTRIBUTION_TIME_ENTRY,
    method: METHOD_RATIO_OF_SUMS,
    shownIn: "ADM-05",
  }),
  def("promptIdReliability", { pilotKpi: "KPI06", shownIn: "ADM-06" }),
  def("medicineHistoryCompleteness", {
    pilotKpi: "KPI03",
    status: "deferred",
    inclusion: INCLUSION_DEFERRED,
    attribution: ATTRIBUTION_NONE,
    shownIn: null,
  }),
  def("patientUnderstanding", {
    pilotKpi: "KPI05",
    status: "deferred",
    inclusion: INCLUSION_DEFERRED,
    attribution: ATTRIBUTION_NONE,
    shownIn: null,
  }),
]);

export function metricDefinition(id: MetricDefinitionId): MetricDefinition {
  const found = METRIC_DEFINITIONS.find((d) => d.id === id);
  if (found === undefined) throw new RangeError(`no metric definition ${id}`);
  return found;
}

/** The six pilot KPIs in order, each with its (primary) definition. */
export function pilotKpis(): Array<{ kpi: PilotKpi; definition: MetricDefinition }> {
  return PILOT_KPIS.map((kpi) => {
    const definition = METRIC_DEFINITIONS.find((d) => d.pilotKpi === kpi);
    if (definition === undefined) throw new RangeError(`no definition for ${kpi}`);
    return { kpi, definition };
  });
}

/** Every i18n key the catalogue references (coverage test). */
export function catalogueKeys(): string[] {
  const keys = new Set<string>();
  for (const d of METRIC_DEFINITIONS) {
    for (const k of [
      d.labelKey,
      d.numerator,
      d.denominator,
      d.inclusion,
      d.attribution,
      d.method,
    ]) {
      if (k !== null && k !== undefined) keys.add(k);
    }
  }
  return [...keys].sort();
}
