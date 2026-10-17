/**
 * Metrics dataset (ADM-02 task 5) — extends the FND-06 `applyMetricsFilter` (filters.ts) with the
 * overview attribution rules. Every ADM-02 calculator takes a `MetricsDataset`.
 *
 * Attribution rules (also documented per metric in `METRIC_DEFINITIONS`):
 * - period membership = Kigali calendar day of `screening.measuredAt`;
 * - reviews, referrals and follow-ups belong to the cohort of their ORIGINATING screening (no
 *   misleading denominators); a follow-up without a review / referral has no originating
 *   screening and is not part of the cohort;
 * - drafts are excluded; an amended screening is one record (amendments are stored on the
 *   original screening), so it counts once under its original id;
 * - patients with `consentState = 'withdrawn'` are excluded with all their records, and the
 *   number of excluded screenings is reported (`excludedConsentWithdrawn`, overview footnote);
 * - `type = 'bp'` keeps screenings with a systolic value, `'glucose'` those with a glucose value
 *   (a screening with both counts in each).
 *
 * Pure: time only from the `now` argument.
 */
import type { TimeEntry } from "@laif/contracts";
import type { Screening } from "@laif/domain";

import { addDays, applyMetricsFilter, isDayInRange, isoWeekStartOfDay } from "./filters.ts";
import type { AnalyticsInput, MetricsFilter } from "./types.ts";

export const SCREENING_TYPE_FILTERS = ["all", "bp", "glucose"] as const;
export type ScreeningTypeFilter = (typeof SCREENING_TYPE_FILTERS)[number];

/** What the dataset loader reads (scoped repository rows). */
export type MetricsRecords = AnalyticsInput & { timeEntries: TimeEntry[] };

export type DatasetFilter = MetricsFilter & { type?: ScreeningTypeFilter };

export type MetricsDataset = {
  /** Cohort records after every attribution rule (inputs of the calculators). */
  cohort: MetricsRecords;
  filter: {
    from: string | null;
    to: string | null;
    districtIds: string[] | null;
    facilityIds: string[] | null;
    type: ScreeningTypeFilter;
  };
  /** Demo-clock instant the dataset was computed for (ISO UTC). */
  nowIso: string;
  /** Submitted in-period screenings excluded because the patient withdrew consent. */
  excludedConsentWithdrawn: number;
  /** Ruleset versions present in the cohort (sorted; `MetricInfo`). */
  rulesetVersions: string[];
};

export const hasBp = (s: Pick<Screening, "systolic">): boolean => s.systolic !== null;
export const hasGlucose = (s: Pick<Screening, "glucoseValue">): boolean => s.glucoseValue !== null;

export function matchesScreeningType(
  s: Pick<Screening, "systolic" | "glucoseValue">,
  type: ScreeningTypeFilter,
): boolean {
  if (type === "bp") return hasBp(s);
  if (type === "glucose") return hasGlucose(s);
  return true;
}

/**
 * Applies scope + period (FND-06 `applyMetricsFilter`), then drafts, consent withdrawal and the
 * screening type, re-attributing downstream records to the remaining cohort. Never mutates input.
 */
export function filterDataset(
  records: MetricsRecords,
  filter: DatasetFilter,
  now: Date,
): MetricsDataset {
  const type = filter.type ?? "all";
  const { type: _type, ...metricsFilter } = filter;
  void _type;
  const scoped = applyMetricsFilter(records, metricsFilter);
  const withdrawn = new Set(
    records.patients.filter((p) => p.consentState === "withdrawn").map((p) => p.id),
  );

  const submitted = scoped.screenings.filter((s) => s.status !== "draft");
  const consented = submitted.filter((s) => !withdrawn.has(s.patientId));
  const screenings = consented.filter((s) => matchesScreeningType(s, type));
  const screeningIds = new Set<string>(screenings.map((s) => s.id));
  const reviews = scoped.reviews.filter((r) => screeningIds.has(r.screeningId));
  const reviewIds = new Set<string>(reviews.map((r) => r.id));
  const referrals = scoped.referrals.filter((r) => reviewIds.has(r.reviewId));
  const referralIds = new Set<string>(referrals.map((r) => r.id));
  const followUps = scoped.followUps.filter(
    (f) =>
      (f.reviewId !== null && reviewIds.has(f.reviewId)) ||
      (f.referralId !== null && referralIds.has(f.referralId)),
  );

  const facilityIds = new Set<string>(scoped.facilities.map((f) => f.id));
  const timeEntries = records.timeEntries.filter(
    (e) => facilityIds.has(e.facilityId) && isDayInRange(e.date, metricsFilter),
  );

  return {
    cohort: {
      patients: scoped.patients.filter((p) => !withdrawn.has(p.id)),
      screenings,
      reviews,
      referrals,
      followUps,
      facilities: scoped.facilities,
      districts: scoped.districts,
      timeEntries,
    },
    filter: {
      from: filter.from ?? null,
      to: filter.to ?? null,
      districtIds: filter.districtIds ? [...filter.districtIds] : null,
      facilityIds: filter.facilityIds ? [...filter.facilityIds] : null,
      type,
    },
    nowIso: now.toISOString(),
    excludedConsentWithdrawn: submitted.length - consented.length,
    rulesetVersions: [
      ...new Set(screenings.map((s) => s.rulesetVersion).filter((v): v is string => v !== null)),
    ].sort(),
  };
}

/** Contiguous Monday-start ISO weeks covering `from…to` (Kigali calendar days). */
export function isoWeeksBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let w = isoWeekStartOfDay(from); w <= to; w = addDays(w, 7)) out.push(w);
  return out;
}
