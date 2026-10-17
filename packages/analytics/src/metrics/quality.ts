/**
 * Data quality (FND-06 task 10), extended in place by ADM-06 (mandatory-field rules, identity
 * mismatch signals, overturned / missed-flag proxies, invariant checks, weekly trend, fairness
 * disaggregation, dismissal-reason distribution and deterministic issue detection — below).
 */
import {
  DATA_QUALITY_RULES,
  MANDATORY_SCREENING_FIELDS,
  type DataQualityIssueStatus,
  type DataQualityIssueType,
  type DataQualitySourceApp,
  type DetectedQualityIssue,
  type MandatoryScreeningField,
} from "@laif/contracts";
import {
  DISMISS_REASON_CODES,
  fnv1a64Hex,
  SEX_VALUES,
  type DistrictId,
  type FacilityId,
  type Review,
  type Screening,
  type Sex,
} from "@laif/domain";

import {
  AGE_BANDS,
  ageBandOf,
  isoWeeksBetween,
  type AgeBand,
  type MetricsDataset,
} from "../dataset.ts";
import { applyMetricsFilter, kigaliDate, kigaliIsoWeekStart } from "../filters.ts";
import type { AnalyticsInput, MetricsFilter, Rate } from "../types.ts";
import { classifyPathway, funnelScreeningSets } from "./funnel.ts";
// Function-only import (cycle-safe): screening-overview imports `dataQuality` from here.
import { countDismissed, countReviewed } from "./screening-overview.ts";
import { isRecorded, rate } from "./shared.ts";

export type DataQuality = {
  /** Submitted screenings with a glucose value but no unit (not evaluable, FND-02). */
  missingGlucoseUnit: number;
  /** Patients in scope with identity status `possible_duplicate`. */
  possibleDuplicateIdentities: number;
  /** Flagged screenings dismissed at review ("flags overturned at review"). */
  flagsOverturnedAtReview: number;
  /** Amendment records on submitted screenings. */
  screeningAmendments: number;
  /** Submitted screenings with at least one amendment. */
  amendedScreenings: number;
};

export function dataQuality(data: AnalyticsInput, filter: MetricsFilter, now: Date): DataQuality {
  void now;
  const d = applyMetricsFilter(data, filter);
  const recorded = d.screenings.filter(isRecorded);
  return {
    missingGlucoseUnit: recorded.filter((s) => s.glucoseValue !== null && s.glucoseUnit === null)
      .length,
    possibleDuplicateIdentities: d.patients.filter((p) => p.identityStatus === "possible_duplicate")
      .length,
    flagsOverturnedAtReview: classifyPathway(d).dismissed.size,
    screeningAmendments: recorded.reduce((n, s) => n + s.amendments.length, 0),
    amendedScreenings: recorded.filter((s) => s.amendments.length > 0).length,
  };
}

// ── ADM-06: safety & quality calculators and deterministic issue detection ──────────────────
//
// Every calculator below takes the ADM-02 `MetricsDataset` (cohort-attributed: a screening
// belongs to the period of its `measuredAt`; reviews to their originating screening). Outputs
// are counts, rates and facility / district / week / field / reason keys only. Issues carry an
// OPAQUE record ref (`SCR-` / `REV-` / `PAT-` + 8 id characters), never a name or identifier.

/** Mono label of the overturned-flag figures (not a clinical-accuracy measure). */
export const OVERTURN_PROXY_LABEL = "PROXY · not clinical accuracy" as const;
/** Mono label of the fairness disaggregation (LAIF MoH p. 13). */
export const FAIRNESS_PROXY_LABEL =
  "PROXY · fairness signal, not a clinical-accuracy measure" as const;

const isBlank = (value: unknown): boolean =>
  value === null || value === undefined || (typeof value === "string" && value.trim() === "");

/**
 * Mandatory fields missing on a screening (`MANDATORY_SCREENING_FIELDS`, FRD §4). Conditional
 * rules: glucose unit + context when a glucose value is present; systolic + diastolic together
 * when either is present. Units are never inferred.
 */
export function missingFieldsFor(
  s: Pick<
    Screening,
    | "patientId"
    | "facilityId"
    | "workerId"
    | "measuredAt"
    | "source"
    | "rulesetVersion"
    | "glucoseValue"
    | "glucoseUnit"
    | "glucoseContext"
    | "systolic"
    | "diastolic"
  >,
): MandatoryScreeningField[] {
  const missing = new Set<MandatoryScreeningField>();
  for (const field of ["patientId", "facilityId", "workerId", "measuredAt", "source"] as const) {
    if (isBlank(s[field])) missing.add(field);
  }
  if (isBlank(s.rulesetVersion)) missing.add("rulesetVersion");
  if (s.glucoseValue !== null) {
    if (isBlank(s.glucoseUnit)) missing.add("glucoseUnit");
    if (isBlank(s.glucoseContext)) missing.add("glucoseContext");
  }
  if (s.systolic !== null && s.diastolic === null) missing.add("diastolic");
  if (s.diastolic !== null && s.systolic === null) missing.add("systolic");
  return MANDATORY_SCREENING_FIELDS.filter((f) => missing.has(f));
}

export type MissingFieldsSummary = {
  n: number;
  /** n / screened; null when nothing was screened. */
  rate: Rate;
  screened: number;
  byField: Record<MandatoryScreeningField, number>;
};

export function screeningsWithMissingFields(ds: MetricsDataset): MissingFieldsSummary {
  const recorded = ds.cohort.screenings.filter(isRecorded);
  const byField = Object.fromEntries(MANDATORY_SCREENING_FIELDS.map((f) => [f, 0])) as Record<
    MandatoryScreeningField,
    number
  >;
  let n = 0;
  for (const s of recorded) {
    const fields = missingFieldsFor(s);
    if (fields.length === 0) continue;
    n += 1;
    for (const f of fields) byField[f] += 1;
  }
  return { n, rate: rate(n, recorded.length), screened: recorded.length, byField };
}

export type IdentityMismatchSignals = {
  /** Groups of more than one patient sharing a synthetic identifier (one per group). */
  duplicateIdentifier: number;
  /** Screenings whose patient has no patient record in scope. */
  orphanScreening: number;
};

export function identityMismatchSignals(ds: MetricsDataset): IdentityMismatchSignals {
  return {
    duplicateIdentifier: (ds.cohort.duplicateIdentifierGroups ?? []).length,
    orphanScreening: (ds.cohort.orphanScreeningIds ?? []).length,
  };
}

export type OverturnedFlagRate = {
  /** Reviewed flags dismissed with a reason (the funnel's `dismissed`). */
  dismissed: number;
  /** Reviewed flags (the funnel's `reviewed`). */
  reviewed: number;
  rate: Rate;
  label: typeof OVERTURN_PROXY_LABEL;
};

/** `countDismissed / countReviewed` — equals the ADM-03 funnel values for the same filters. */
export function overturnedFlagRate(ds: MetricsDataset): OverturnedFlagRate {
  const dismissed = countDismissed(ds);
  const reviewed = countReviewed(ds);
  return { dismissed, reviewed, rate: rate(dismissed, reviewed), label: OVERTURN_PROXY_LABEL };
}

/** Manual-escalation reviews of screenings the rule did not flag (`no_review_required`). */
function manualEscalations(ds: MetricsDataset): Review[] {
  const unflagged = new Set<string>(
    ds.cohort.screenings.filter((s) => s.status === "no_review_required").map((s) => s.id),
  );
  return ds.cohort.reviews.filter(
    (r) => r.origin === "manual_escalation" && unflagged.has(r.screeningId),
  );
}

/** Missed-flag PROXY: manual escalations of `no_review_required` screenings. */
export function missedFlagProxy(ds: MetricsDataset): {
  n: number;
  label: typeof OVERTURN_PROXY_LABEL;
} {
  return { n: manualEscalations(ds).length, label: OVERTURN_PROXY_LABEL };
}

/** `sync.duplicate_suppressed` events in the period (repository idempotency). */
export function duplicateSubmissionsPrevented(ds: MetricsDataset): number {
  return (ds.cohort.duplicateSubmissions ?? []).length;
}

/** Invariant check: completed referrals lacking `completedAt` or `completionEvidence` (must be 0). */
export function completedWithoutEvidence(ds: MetricsDataset): number {
  return ds.cohort.referrals.filter(
    (r) => r.status === "completed" && (r.completedAt === null || r.completionEvidence === null),
  ).length;
}

export type WeeklyQualityPoint = { weekStart: string; missingFields: number; mismatches: number };

/** Detection time of a duplicate-identifier group: the latest member registration. */
function groupDetectedAt(ds: MetricsDataset, group: readonly string[]): string {
  const created = new Map<string, string>(ds.cohort.patients.map((p) => [p.id, p.createdAt]));
  let latest = "";
  for (const id of group) {
    const at = created.get(id);
    if (at !== undefined && at > latest) latest = at;
  }
  return latest === "" ? ds.nowIso : latest;
}

function periodWeeks(ds: MetricsDataset): string[] {
  const days = ds.cohort.screenings.filter(isRecorded).map((s) => kigaliDate(s.measuredAt));
  days.sort();
  const from = ds.filter.from ?? days[0];
  const to = ds.filter.to ?? days[days.length - 1];
  return from === undefined || to === undefined ? [] : isoWeeksBetween(from, to);
}

/**
 * Weekly missing-field screenings (week of `measuredAt`) and identity mismatches (orphan
 * screenings by `measuredAt`, duplicate groups by detection week). Each series sums to its KPI.
 */
export function weeklyQualityTrend(ds: MetricsDataset): WeeklyQualityPoint[] {
  const weeks = periodWeeks(ds);
  const missing = new Map<string, number>();
  const mismatches = new Map<string, number>();
  const bump = (m: Map<string, number>, w: string) => m.set(w, (m.get(w) ?? 0) + 1);
  const orphans = new Set(ds.cohort.orphanScreeningIds ?? []);
  for (const s of ds.cohort.screenings.filter(isRecorded)) {
    const w = kigaliIsoWeekStart(s.measuredAt);
    if (missingFieldsFor(s).length > 0) bump(missing, w);
    if (orphans.has(s.id)) bump(mismatches, w);
  }
  for (const group of ds.cohort.duplicateIdentifierGroups ?? []) {
    bump(mismatches, kigaliIsoWeekStart(groupDetectedAt(ds, group)));
  }
  return weeks.map((weekStart) => ({
    weekStart,
    missingFields: missing.get(weekStart) ?? 0,
    mismatches: mismatches.get(weekStart) ?? 0,
  }));
}

// ── Fairness disaggregation + dismissal reasons (LAIF MoH p. 13) ──

export const FAIRNESS_SEX_GROUPS = SEX_VALUES;
export type FairnessSexGroup = Sex;
export const FLAG_OUTCOME_COLUMNS = ["flagged", "overturned", "manualEscalation"] as const;
export type FlagOutcomeColumn = (typeof FLAG_OUTCOME_COLUMNS)[number];
export type FlagOutcomeCounts = Record<FlagOutcomeColumn, number>;

export type FlagReviewOutcomesByGroup = {
  label: typeof FAIRNESS_PROXY_LABEL;
  total: FlagOutcomeCounts;
  sex: Record<FairnessSexGroup, FlagOutcomeCounts>;
  age: Record<AgeBand, FlagOutcomeCounts>;
};

const zeroOutcomes = (): FlagOutcomeCounts => ({ flagged: 0, overturned: 0, manualEscalation: 0 });

/**
 * Flagged / overturned (dismissed) / manual-escalation counts by sex and age band (18–39, 40–59,
 * 60+, not recorded). Raw aggregate counts: the admin selector suppresses them in its single
 * scope-wide pass (each dimension's groups sum to the total).
 */
export function flagReviewOutcomesByGroup(ds: MetricsDataset): FlagReviewOutcomesByGroup {
  const patients = new Map(ds.cohort.patients.map((p) => [p.id as string, p]));
  const bandOf = (patientId: string): AgeBand => {
    const stored = ds.cohort.patientAgeBands?.[patientId];
    if (stored !== undefined) return stored;
    const p = patients.get(patientId);
    return p === undefined ? "unknown" : ageBandOf(p, ds.nowIso);
  };
  const sexOf = (patientId: string): Sex => patients.get(patientId)?.sexOptional ?? "not_recorded";
  const out: FlagReviewOutcomesByGroup = {
    label: FAIRNESS_PROXY_LABEL,
    total: zeroOutcomes(),
    sex: Object.fromEntries(FAIRNESS_SEX_GROUPS.map((g) => [g, zeroOutcomes()])) as Record<
      Sex,
      FlagOutcomeCounts
    >,
    age: Object.fromEntries(AGE_BANDS.map((g) => [g, zeroOutcomes()])) as Record<
      AgeBand,
      FlagOutcomeCounts
    >,
  };
  const add = (patientId: string, column: FlagOutcomeColumn) => {
    out.total[column] += 1;
    out.sex[sexOf(patientId)][column] += 1;
    out.age[bandOf(patientId)][column] += 1;
  };
  const sets = funnelScreeningSets(ds);
  for (const s of ds.cohort.screenings) {
    if (sets.flagged.has(s.id)) add(s.patientId, "flagged");
    if (sets.dismissed.has(s.id)) add(s.patientId, "overturned");
  }
  for (const r of manualEscalations(ds)) add(r.patientId, "manualEscalation");
  return out;
}

/** Dismissal reason buckets: the FND-02 codes + `not_recorded` (sums to `dismissed`). */
export const DISMISSAL_REASON_BUCKETS = [...DISMISS_REASON_CODES, "not_recorded"] as const;
export type DismissalReasonBucket = (typeof DISMISSAL_REASON_BUCKETS)[number];

/** Structured dismissal reasons (CLN-07 `reasonCode`) of the dismissed flags — never free text. */
export function dismissalReasonDistribution(
  ds: MetricsDataset,
): Record<DismissalReasonBucket, number> {
  const out = Object.fromEntries(DISMISSAL_REASON_BUCKETS.map((c) => [c, 0])) as Record<
    DismissalReasonBucket,
    number
  >;
  const dismissed = funnelScreeningSets(ds).dismissed;
  for (const r of ds.cohort.reviews) {
    if (r.status !== "dismissed_with_reason" || !dismissed.has(r.screeningId)) continue;
    const code = r.decision?.reasonCode;
    out[code === undefined ? "not_recorded" : code] += 1;
  }
  return out;
}

// ── Issue detection ──

/** `dqi_` + 16 hex (FNV-1a 64 of `type:subjectRef`) — stable across runs and devices. */
export function qualityIssueId(type: DataQualityIssueType, subjectRef: string): string {
  return `dqi_${fnv1a64Hex(`${type}:${subjectRef}`)}`;
}

/**
 * Opaque record ref: prefix + the first 8 characters of the record uuid. Readable seed / fixture
 * ids (not uuid-shaped) use the first 8 hex of their FNV-1a hash instead, so refs stay unique.
 */
export function subjectRefOf(prefix: "SCR" | "REV" | "PAT", id: string): string {
  const lower = id.toLowerCase();
  const compact = /^[0-9a-f]{8}-/.test(lower) ? lower.slice(0, 8) : fnv1a64Hex(lower).slice(0, 8);
  return `${prefix}-${compact}`;
}

const SOURCE_APP: Record<Screening["source"], DataQualitySourceApp> = {
  worker_mobile: "worker",
  clinical_web: "clinical",
  imported: "import",
};

/**
 * Deterministic data-quality issues of the dataset (one per subject and type; ids stable, so
 * re-running never duplicates). Types: `missing_field` (per screening), `orphan_screening`,
 * `duplicate_identifier` (per identifier group), `overturned_flag` (per dismissed review),
 * `manual_escalation` (per escalation review). Sorted by `detectedAt`, then id.
 */
export function detectQualityIssues(ds: MetricsDataset): DetectedQualityIssue[] {
  const out: DetectedQualityIssue[] = [];
  const districtOf = new Map<string, DistrictId>(
    ds.cohort.facilities.map((f) => [f.id as string, f.districtId]),
  );
  const screenings = new Map(ds.cohort.screenings.map((s) => [s.id as string, s]));
  const push = (
    type: DataQualityIssueType,
    subjectRef: string,
    facilityId: FacilityId,
    detectedAt: string,
    sourceApp: DataQualitySourceApp,
    details: Partial<DetectedQualityIssue["details"]>,
  ) => {
    const districtId = districtOf.get(facilityId);
    if (districtId === undefined) return;
    out.push({
      id: qualityIssueId(type, subjectRef),
      type,
      subjectRef,
      facilityId,
      districtId,
      detectedAt,
      sourceApp,
      details: {
        rule: DATA_QUALITY_RULES[type],
        fields: [],
        rulesetVersion: null,
        records: 1,
        ...details,
      },
    });
  };
  const orphans = new Set(ds.cohort.orphanScreeningIds ?? []);
  for (const s of ds.cohort.screenings.filter(isRecorded)) {
    const fields = missingFieldsFor(s);
    const ref = subjectRefOf("SCR", s.id);
    if (fields.length > 0) {
      push("missing_field", ref, s.facilityId, s.createdAt, SOURCE_APP[s.source], {
        fields,
        rulesetVersion: s.rulesetVersion,
      });
    }
    if (orphans.has(s.id)) {
      push("orphan_screening", ref, s.facilityId, s.createdAt, SOURCE_APP[s.source], {
        rulesetVersion: s.rulesetVersion,
      });
    }
  }
  const patients = new Map(ds.cohort.patients.map((p) => [p.id as string, p]));
  for (const group of ds.cohort.duplicateIdentifierGroups ?? []) {
    const anchor = patients.get(group[0] ?? "");
    if (anchor === undefined) continue;
    push(
      "duplicate_identifier",
      subjectRefOf("PAT", anchor.id),
      anchor.facilityId,
      groupDetectedAt(ds, group),
      "registry",
      { records: group.length },
    );
  }
  const dismissed = funnelScreeningSets(ds).dismissed;
  for (const r of ds.cohort.reviews) {
    if (r.status !== "dismissed_with_reason" || !dismissed.has(r.screeningId)) continue;
    push(
      "overturned_flag",
      subjectRefOf("REV", r.id),
      r.facilityId,
      r.reviewedAt ?? r.updatedAt,
      "clinical",
      { rulesetVersion: screenings.get(r.screeningId)?.rulesetVersion ?? null },
    );
  }
  for (const r of manualEscalations(ds)) {
    push("manual_escalation", subjectRefOf("REV", r.id), r.facilityId, r.createdAt, "clinical", {
      rulesetVersion: screenings.get(r.screeningId)?.rulesetVersion ?? null,
    });
  }
  return out.sort((a, b) =>
    a.detectedAt === b.detectedAt ? (a.id < b.id ? -1 : 1) : a.detectedAt < b.detectedAt ? -1 : 1,
  );
}

/** Stored triage status of a detected issue (never triaged → `open`). */
export function qualityIssueStatusOf(ds: MetricsDataset, id: string): DataQualityIssueStatus {
  return ds.cohort.qualityIssueStatus?.[id] ?? "open";
}

/**
 * Open (untriaged) data-quality issues — the single source of the overview's "open quality
 * issues" and the Safety & quality "Open" tab: detected issues whose stored status is `open`.
 */
export function openQualityIssueCount(ds: MetricsDataset): number {
  return detectQualityIssues(ds).filter((i) => qualityIssueStatusOf(ds, i.id) === "open").length;
}
