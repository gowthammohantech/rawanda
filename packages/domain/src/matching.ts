/**
 * Deterministic patient-identity matcher (FND-07 `findPatientMatches`; refined by HWM-04 with a
 * per-component breakdown and reason codes for the "possible matches" sheet). It never merges records — a score only suggests a *possible* duplicate that a
 * human confirms (PO decision 11: threshold 0.75, "register anyway" flags `needs_match_review`).
 *
 * Score in [0, 1] = 0.6 · name similarity + 0.3 · birth similarity + 0.1 · sex agreement.
 * - name: Sørensen–Dice coefficient over character bigrams of the normalised full name
 *   (lowercase, accents stripped, whitespace collapsed); token order is ignored.
 * - birth: same date of birth → 1; otherwise ages (years, at `now`) within 1 → 0.8, within 2 →
 *   0.5, else 0; unknown on either side → 0.
 * - sex: equal (and recorded) → 1; `not_recorded` on either side → 0.5; different → 0.
 */
import type { Patient } from "./entities/patient.ts";
import { zonedDay } from "./due-bucket.ts";
import type { Sex } from "./enums.ts";

/** ★ PO decision 11: a candidate at or above this score is a possible duplicate. */
export const PATIENT_MATCH_THRESHOLD = 0.75;

/**
 * HWM-04 name for the same threshold. DEMO VALUE — NOT VALIDATED: the 0.75 cut-off is a
 * placeholder (HWM INDEX open question 9) and must never be presented as a clinical or
 * identity-assurance standard.
 */
export const DEMO_MATCH_THRESHOLD = PATIENT_MATCH_THRESHOLD;

/** Name similarity at or above this counts as a "similar name" reason. */
export const SIMILAR_NAME_MIN = 0.7;

/**
 * Why a candidate looks like an existing patient (shown to the worker as plain words, e.g.
 * "same date of birth, similar name"). Order = display order.
 */
export const PATIENT_MATCH_REASONS = [
  "same_name",
  "similar_name",
  "same_date_of_birth",
  "similar_age",
  "same_sex",
] as const;
export type PatientMatchReason = (typeof PATIENT_MATCH_REASONS)[number];

export type PatientMatchBreakdown = {
  /** Weighted total in [0, 1] (= `scorePatientMatch`). */
  score: number;
  /** Component similarities in [0, 1] before weighting. */
  name: number;
  birth: number;
  sex: number;
  reasons: PatientMatchReason[];
};

export type PatientMatchCandidate = {
  /** Full display name (given + family). */
  name: string;
  dateOfBirth: string | null;
  estimatedAgeYears?: number | undefined;
  sex: Sex | null;
};

const YEAR_MS = 365.25 * 86_400_000;

function normaliseName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/gu, " ")
    .split(/\s+/u)
    .filter((token) => token.length > 0)
    .sort()
    .join(" ");
}

function bigrams(value: string): string[] {
  const grams: string[] = [];
  for (let i = 0; i < value.length - 1; i += 1) grams.push(value.slice(i, i + 2));
  return grams;
}

/** Sørensen–Dice similarity of two names (order-insensitive), in [0, 1]. */
export function nameSimilarity(a: string, b: string): number {
  const x = normaliseName(a);
  const y = normaliseName(b);
  if (x.length === 0 || y.length === 0) return 0;
  if (x === y) return 1;
  const gx = bigrams(x);
  const gy = bigrams(y);
  if (gx.length === 0 || gy.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const g of gx) counts.set(g, (counts.get(g) ?? 0) + 1);
  let overlap = 0;
  for (const g of gy) {
    const n = counts.get(g) ?? 0;
    if (n > 0) {
      overlap += 1;
      counts.set(g, n - 1);
    }
  }
  return (2 * overlap) / (gx.length + gy.length);
}

function ageYears(candidate: PatientMatchCandidate, now: Date): number | null {
  if (candidate.dateOfBirth !== null) {
    const born = Date.parse(`${candidate.dateOfBirth}T00:00:00.000Z`);
    if (!Number.isNaN(born)) return (now.getTime() - born) / YEAR_MS;
  }
  return candidate.estimatedAgeYears ?? null;
}

function birthSimilarity(a: PatientMatchCandidate, b: PatientMatchCandidate, now: Date): number {
  if (a.dateOfBirth !== null && a.dateOfBirth === b.dateOfBirth) return 1;
  const ageA = ageYears(a, now);
  const ageB = ageYears(b, now);
  if (ageA === null || ageB === null) return 0;
  const diff = Math.abs(ageA - ageB);
  if (diff <= 1) return 0.8;
  if (diff <= 2) return 0.5;
  return 0;
}

function sexSimilarity(a: Sex | null, b: Sex | null): number {
  if (a === null || b === null || a === "not_recorded" || b === "not_recorded") return 0.5;
  return a === b ? 1 : 0;
}

const round4 = (value: number): number => Math.round(value * 10_000) / 10_000;

type MatchablePatient = Pick<
  Patient,
  "displayName" | "dateOfBirth" | "estimatedAgeYears" | "sexOptional"
>;

/**
 * Score + component breakdown + reasons of a registration candidate against an existing
 * patient. Deterministic; never merges anything.
 */
export function explainPatientMatch(
  candidate: PatientMatchCandidate,
  patient: MatchablePatient,
  now: Date,
): PatientMatchBreakdown {
  const existing: PatientMatchCandidate = {
    name: patient.displayName,
    dateOfBirth: patient.dateOfBirth,
    estimatedAgeYears: patient.estimatedAgeYears,
    sex: patient.sexOptional,
  };
  const name = round4(nameSimilarity(candidate.name, existing.name));
  const birth = birthSimilarity(candidate, existing, now);
  const sex = sexSimilarity(candidate.sex, existing.sex);
  const reasons: PatientMatchReason[] = [];
  if (name === 1) reasons.push("same_name");
  else if (name >= SIMILAR_NAME_MIN) reasons.push("similar_name");
  if (birth === 1) reasons.push("same_date_of_birth");
  else if (birth > 0) reasons.push("similar_age");
  if (sex === 1) reasons.push("same_sex");
  return { score: round4(0.6 * name + 0.3 * birth + 0.1 * sex), name, birth, sex, reasons };
}

/** Deterministic match score of a registration candidate against an existing patient. */
export function scorePatientMatch(
  candidate: PatientMatchCandidate,
  patient: MatchablePatient,
  now: Date,
): number {
  return explainPatientMatch(candidate, patient, now).score;
}

/**
 * Whole years of age at `now` from a date of birth (`YYYY-MM-DD`, calendar-exact), or the
 * estimated age when no date of birth is recorded; null when neither is known.
 */
export function patientAgeYears(
  patient: { dateOfBirth: string | null; estimatedAgeYears?: number | undefined },
  now: Date,
): number | null {
  if (patient.dateOfBirth !== null) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(patient.dateOfBirth);
    if (match === null) return null;
    const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
    const today = zonedDay(now);
    const [ty, tm, td] = today.date.split("-").map(Number) as [number, number, number];
    let age = ty - year;
    if (tm < month || (tm === month && td < day)) age -= 1;
    return age;
  }
  return patient.estimatedAgeYears ?? null;
}
