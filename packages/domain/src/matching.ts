/**
 * Minimal deterministic patient-identity matcher (FND-07 `findPatientMatches`; HWM-04 may refine
 * the weights). It never merges records — a score only suggests a *possible* duplicate that a
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
import type { Sex } from "./enums.ts";

/** ★ PO decision 11: a candidate at or above this score is a possible duplicate. */
export const PATIENT_MATCH_THRESHOLD = 0.75;

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

/** Deterministic match score of a registration candidate against an existing patient. */
export function scorePatientMatch(
  candidate: PatientMatchCandidate,
  patient: Pick<Patient, "displayName" | "dateOfBirth" | "estimatedAgeYears" | "sexOptional">,
  now: Date,
): number {
  const existing: PatientMatchCandidate = {
    name: patient.displayName,
    dateOfBirth: patient.dateOfBirth,
    estimatedAgeYears: patient.estimatedAgeYears,
    sex: patient.sexOptional,
  };
  return round4(
    0.6 * nameSimilarity(candidate.name, existing.name) +
      0.3 * birthSimilarity(candidate, existing, now) +
      0.1 * sexSimilarity(candidate.sex, existing.sex),
  );
}
