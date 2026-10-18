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
 *   (a screening with both counts in each);
 * - workload (ADM-05) is the documented EXCEPTION to cohort attribution: follow-up tasks are
 *   attributed to the period of their `createdAt` (when the work was assigned), so
 *   `cohort.taskFollowUps` holds every in-scope, consented follow-up created in the period or with
 *   a contact attempt in it, whatever screening it came from.
 *
 * Pure: time only from the `now` argument.
 */
import type { DataQualityIssueStatus, TimeEntry } from "@laif/contracts";
import type { FacilityId, FollowUp, PersonaId, Screening } from "@laif/domain";

import {
  addDays,
  applyMetricsFilter,
  isDayInRange,
  isoWeekStartOfDay,
  kigaliDate,
} from "./filters.ts";
import type { AnalyticsInput, MetricsFilter } from "./types.ts";

export const SCREENING_TYPE_FILTERS = ["all", "bp", "glucose"] as const;
export type ScreeningTypeFilter = (typeof SCREENING_TYPE_FILTERS)[number];

/**
 * Staff directory entry (ADM-05): pseudonymous code and facilities only — never a name. `id`
 * joins the records and never reaches a page.
 */
export type WorkerRef = { id: PersonaId; workerCode: string; facilityIds: FacilityId[] };

/** What the dataset loader reads (scoped repository rows). */
export type MetricsRecords = AnalyticsInput & {
  timeEntries: TimeEntry[];
  /**
   * ADM-05: follow-up tasks by assignment date (`createdAt`) — NOT cohort-attributed. Optional:
   * when absent, `followUps` is used as the source.
   */
  taskFollowUps?: FollowUp[];
  /** ADM-05: workers of the in-scope facilities (codes only). */
  workers?: WorkerRef[];
  /**
   * ADM-06: groups of patient ids (sorted, ≥ 2) sharing one synthetic identifier. Computed by
   * the repository (the identifiers themselves never leave it); when absent, derived from
   * `patients[].syntheticIdentifier`. In a dataset: only groups detected in the period (latest
   * member registration) whose anchor (first id) is in the cohort.
   */
  duplicateIdentifierGroups?: string[][];
  /**
   * ADM-06: submitted screenings whose patient has no patient record in the READ scope. Computed
   * once on the first filter (so a narrower restriction never turns a patient registered at
   * another in-scope facility into an orphan).
   */
  orphanScreeningIds?: string[];
  /** ADM-06: age band per patient id at read time (dates of birth never leave the repository). */
  patientAgeBands?: Record<string, AgeBand>;
  /** ADM-06: `sync.duplicate_suppressed` audit events — facility and time only. */
  duplicateSubmissions?: Array<{ facilityId: string; occurredAt: string }>;
  /** ADM-06: stored triage status per data-quality issue id (absent = never triaged = open). */
  qualityIssueStatus?: Record<string, DataQualityIssueStatus>;
};

/** ADM-06 fairness disaggregation (LAIF MoH p. 13): adult age bands + not recorded. */
export const AGE_BANDS = ["18-39", "40-59", "60+", "unknown"] as const;
export type AgeBand = (typeof AGE_BANDS)[number];

/** Age band at `nowIso` from a date of birth, else the estimated age; under 18 → `unknown`. */
export function ageBandOf(
  patient: { dateOfBirth: string | null; estimatedAgeYears?: number },
  nowIso: string,
): AgeBand {
  let age: number | null = null;
  if (patient.dateOfBirth !== null && patient.dateOfBirth !== "") {
    const today = kigaliDate(nowIso);
    const [y, m, d] = patient.dateOfBirth.split("-").map(Number) as [number, number, number];
    const [ty, tm, td] = today.split("-").map(Number) as [number, number, number];
    age = ty - y - (tm < m || (tm === m && td < d) ? 1 : 0);
  } else if (patient.estimatedAgeYears !== undefined) {
    age = patient.estimatedAgeYears;
  }
  if (age === null || Number.isNaN(age) || age < 18) return "unknown";
  if (age < 40) return "18-39";
  if (age < 60) return "40-59";
  return "60+";
}

/** Patient-id groups sharing a non-empty synthetic identifier (sorted ids, sorted groups). */
export function duplicateIdentifierGroupsOf(
  patients: ReadonlyArray<{ id: string; syntheticIdentifier: string }>,
): string[][] {
  const byIdentifier = new Map<string, string[]>();
  for (const p of patients) {
    const k = p.syntheticIdentifier.trim();
    if (k === "") continue;
    const list = byIdentifier.get(k);
    if (list) list.push(p.id);
    else byIdentifier.set(k, [p.id]);
  }
  return [...byIdentifier.values()]
    .filter((ids) => ids.length > 1)
    .map((ids) => [...ids].sort())
    .sort((a, b) => ((a[0] as string) < (b[0] as string) ? -1 : 1));
}

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
  // Workload exception (ADM-05): tasks by assignment date, plus tasks with an in-period attempt
  // (patient-days); scope + consent only, never the screening cohort.
  const taskFollowUps = (records.taskFollowUps ?? records.followUps).filter(
    (f) =>
      facilityIds.has(f.facilityId) &&
      !withdrawn.has(f.patientId) &&
      (isDayInRange(kigaliDate(f.createdAt), metricsFilter) ||
        f.attempts.some((a) => isDayInRange(kigaliDate(a.at), metricsFilter))),
  );
  // ADM-06 quality sources.
  const knownPatients = new Map<string, { createdAt: string }>(
    records.patients.map((p) => [p.id, p]),
  );
  const orphanScreeningIds =
    records.orphanScreeningIds ??
    submitted
      .filter((s) => s.patientId.trim() !== "" && !knownPatients.has(s.patientId))
      .map((s) => s.id);
  const cohortPatients = records.patients.filter((p) => !withdrawn.has(p.id));
  const cohortPatientIds = new Set<string>(
    applyMetricsFilter({ ...records, patients: cohortPatients }, metricsFilter).patients.map(
      (p) => p.id,
    ),
  );
  const duplicateIdentifierGroups = (
    records.duplicateIdentifierGroups ?? duplicateIdentifierGroupsOf(records.patients)
  ).filter((group) => {
    const anchor = group[0];
    if (anchor === undefined || group.length < 2 || !cohortPatientIds.has(anchor)) return false;
    const detected = group.reduce(
      (latest, id) => {
        const at = knownPatients.get(id)?.createdAt;
        return at !== undefined && (latest === null || at > latest) ? at : latest;
      },
      null as string | null,
    );
    return detected !== null && isDayInRange(kigaliDate(detected), metricsFilter);
  });
  const duplicateSubmissions = (records.duplicateSubmissions ?? []).filter(
    (e) => facilityIds.has(e.facilityId) && isDayInRange(kigaliDate(e.occurredAt), metricsFilter),
  );
  const workers = (records.workers ?? [])
    .map((w) => ({ ...w, facilityIds: w.facilityIds.filter((id) => facilityIds.has(id)) }))
    .filter((w) => w.facilityIds.length > 0);

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
      taskFollowUps,
      workers,
      duplicateIdentifierGroups,
      orphanScreeningIds: orphanScreeningIds.filter((id) => screeningIds.has(id)),
      ...(records.patientAgeBands === undefined
        ? {}
        : { patientAgeBands: records.patientAgeBands }),
      duplicateSubmissions,
      ...(records.qualityIssueStatus === undefined
        ? {}
        : { qualityIssueStatus: records.qualityIssueStatus }),
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
