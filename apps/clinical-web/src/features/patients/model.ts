/**
 * Pure helpers of the patient screens (CLN-03): URL search-param parsing (Zod, per-field
 * fallback to defaults), age at the demo clock, the "open" status sets shared by the results
 * table and the KPI strip, and the `PatientSummary` row builder.
 */
import {
  PATIENT_SEARCH_PAGE_SIZE,
  PatientSearchSchema,
  type Page,
  type PatientSummary,
} from "@laif/contracts";
import type {
  FacilityId,
  FollowUp,
  FollowUpStatus,
  Patient,
  Referral,
  ReferralStatus,
  Review,
  ReviewStatus,
  Screening,
} from "@laif/domain";
import { KIGALI_UTC_OFFSET_MS } from "@laif/i18n";

/** Undecided reviews. */
export const OPEN_REVIEW_STATUSES = ["pending", "in_review"] as const satisfies ReviewStatus[];
/** Same predicate as the repository's `countReferrals().open`. */
export const OPEN_REFERRAL_STATUSES = [
  "created",
  "accepted",
  "scheduled",
] as const satisfies ReferralStatus[];
/** Same predicate as the repository's `countFollowUps().open` (everything but completed). */
export const OPEN_FOLLOW_UP_STATUSES = [
  "assigned",
  "contacted",
  "unable_to_reach",
  "reassigned",
] as const satisfies FollowUpStatus[];

export type PatientSearchState = {
  /** Trimmed, ≥ 2 characters; undefined = recent-in-facility list. */
  q: string | undefined;
  /** A permitted facility named in the URL (`?facility=`), else undefined. */
  facilityId: FacilityId | undefined;
  page: number;
};

/** `?q=&facility=&page=` → search state; any invalid param falls back to its default. */
export function parsePatientSearchParams(
  params: URLSearchParams,
  permittedFacilityIds: readonly string[],
): PatientSearchState {
  const field = <K extends "q" | "facilityId" | "page">(key: K, value: string | null) => {
    if (value === null) return undefined;
    const parsed = PatientSearchSchema.safeParse({ [key]: value });
    return parsed.success ? parsed.data[key] : undefined;
  };
  const q = field("q", params.get("q"));
  const facility = field("facilityId", params.get("facility"));
  const page = field("page", params.get("page")) ?? 1;
  return {
    q,
    facilityId:
      facility !== undefined && permittedFacilityIds.includes(facility) ? facility : undefined,
    page,
  };
}

/** Kigali calendar date (`YYYY-MM-DD`) of a UTC instant. */
function kigaliDate(iso: string): string {
  return new Date(Date.parse(iso) + KIGALI_UTC_OFFSET_MS).toISOString().slice(0, 10);
}

/** Whole years between a `YYYY-MM-DD` birth date and the demo clock (Kigali calendar). */
export function ageInYears(dateOfBirth: string, nowIso: string): number {
  const [by, bm, bd] = dateOfBirth.split("-").map(Number) as [number, number, number];
  const [ny, nm, nd] = kigaliDate(nowIso).split("-").map(Number) as [number, number, number];
  const birthdayPassed = nm > bm || (nm === bm && nd >= bd);
  return Math.max(0, ny - by - (birthdayPassed ? 0 : 1));
}

export function patientAge(
  patient: Pick<Patient, "dateOfBirth" | "estimatedAgeYears">,
  nowIso: string,
): { ageYears: number | null; ageEstimated: boolean } {
  if (patient.dateOfBirth !== null) {
    return { ageYears: ageInYears(patient.dateOfBirth, nowIso), ageEstimated: false };
  }
  if (patient.estimatedAgeYears !== undefined) {
    return { ageYears: patient.estimatedAgeYears, ageEstimated: true };
  }
  return { ageYears: null, ageEstimated: false };
}

/** Loads every page of a list method (pages of 200). */
export async function fetchAllPages<T>(
  load: (page: number, pageSize: number) => Promise<Page<T>>,
): Promise<T[]> {
  const pageSize = 200;
  const items: T[] = [];
  for (let page = 1; ; page += 1) {
    const result = await load(page, pageSize);
    items.push(...result.items);
    if (result.items.length === 0 || items.length >= result.total) return items;
  }
}

export type FacilityActivity = {
  screenings: readonly Screening[];
  openReviews: readonly Review[];
  openReferrals: readonly Referral[];
  openFollowUps: readonly FollowUp[];
};

/** Results-table rows: identity columns + age, latest screening and open items per patient. */
export function toPatientSummaries(
  patients: readonly Patient[],
  activity: FacilityActivity,
  nowIso: string,
): PatientSummary[] {
  const latest = new Map<string, string>();
  for (const s of activity.screenings) {
    const current = latest.get(s.patientId);
    if (current === undefined || s.measuredAt > current) latest.set(s.patientId, s.measuredAt);
  }
  const open = new Map<string, number>();
  for (const item of [
    ...activity.openReviews,
    ...activity.openReferrals,
    ...activity.openFollowUps,
  ]) {
    open.set(item.patientId, (open.get(item.patientId) ?? 0) + 1);
  }
  return patients.map((p) => ({
    id: p.id,
    syntheticIdentifier: p.syntheticIdentifier,
    displayName: p.displayName,
    ...patientAge(p, nowIso),
    sexOptional: p.sexOptional,
    facilityId: p.facilityId,
    lastScreeningAt: latest.get(p.id) ?? null,
    openItems: open.get(p.id) ?? 0,
  }));
}

/** "Registered by" of the provenance card, from the synthetic identifier's issuing prefix. */
export function registrationSource(syntheticIdentifier: string): "worker" | "seed" {
  return syntheticIdentifier.startsWith("DEMO-R-") ? "worker" : "seed";
}

export { PATIENT_SEARCH_PAGE_SIZE };
