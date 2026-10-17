/**
 * Worker patients (HWM-04): cached, facility-scoped search, the scope-checked patient context,
 * duplicate candidates and offline registration — all through the FND-07 repository (no SQL, no
 * app-local tables; see the HWM INDEX term mapping).
 *
 * - `search()`: patients of the signed-in facility saved on this device; case- and
 *   diacritic-insensitive "contains" on the display name, case-insensitive PREFIX on the
 *   synthetic identifier. The facility filter is applied by the repository AND re-applied here.
 * - `get()`: `repo.getPatient` (audits `patient.viewed`; out of scope → FORBIDDEN + the
 *   repository's `access.denied`). Absent on this device, or another facility → this module
 *   records `access.denied` itself. Callers render nothing of a denied patient.
 * - `findCandidates()`: `repo.findPatientMatches` ≥ `DEMO_MATCH_THRESHOLD` (demo value, not
 *   validated), with the reasons from `explainPatientMatch`. Never merges.
 * - `register()`: `repo.registerPatient` — patient + `patient.register` sync op + audit
 *   (`patient.registered`, `patient.match_flagged` when flagged) in ONE store transaction,
 *   idempotent by the form's draft key.
 */
import {
  DEMO_MATCH_THRESHOLD,
  explainPatientMatch,
  type FacilityId,
  type FollowUp,
  type Patient,
  type PatientMatchReason,
  type Screening,
} from "@laif/domain";
import { RepositoryError, type CareRepository, type RegisterPatientCall } from "@laif/repositories";

import { patientIndex } from "./followUps.ts";

export const PATIENT_SEARCH_LIMIT = 25;
export const PATIENT_SEARCH_MIN_CHARS = 2;
export const PATIENT_SEARCH_DEBOUNCE_MS = 250;

/** Lowercase, accents stripped, whitespace collapsed (the "normalised column"). */
export function normaliseSearchText(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/gu, "").toLowerCase().replace(/\s+/gu, " ").trim();
}

export function matchesPatientQuery(
  patient: Pick<Patient, "displayName" | "syntheticIdentifier">,
  query: string,
): boolean {
  const q = normaliseSearchText(query);
  if (q === "") return false;
  return (
    normaliseSearchText(patient.displayName).includes(q) ||
    normaliseSearchText(patient.syntheticIdentifier).startsWith(q)
  );
}

export type PatientSearchInput = {
  facilityId: FacilityId;
  query: string;
  limit?: number;
  offset?: number;
};

export type PatientSearchResult = { items: Patient[]; total: number };

const byName = (a: Patient, b: Patient) =>
  a.displayName.localeCompare(b.displayName) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export async function search(
  repo: Pick<CareRepository, "listPatients">,
  { facilityId, query, limit = PATIENT_SEARCH_LIMIT, offset = 0 }: PatientSearchInput,
): Promise<PatientSearchResult> {
  if (normaliseSearchText(query).length < PATIENT_SEARCH_MIN_CHARS) return { items: [], total: 0 };
  const all = [...(await patientIndex(repo, facilityId)).values()];
  const hits = all.filter((p) => matchesPatientQuery(p, query)).sort(byName);
  return { items: hits.slice(offset, offset + limit), total: hits.length };
}

/** Patients by id in the given order, skipping ids no longer on this device / in scope. */
export async function listByIds(
  repo: Pick<CareRepository, "listPatients">,
  facilityId: FacilityId,
  ids: readonly string[],
): Promise<Patient[]> {
  const index = await patientIndex(repo, facilityId);
  return ids.flatMap((id) => {
    const patient = index.get(id);
    return patient === undefined ? [] : [patient];
  });
}

export type PatientAccess =
  | { status: "ok"; patient: Patient }
  | { status: "denied"; reason: "SCOPE" | "NOT_ON_DEVICE" | "FORBIDDEN" };

async function recordDenied(
  repo: Pick<CareRepository, "recordAuditEvent">,
  facilityId: FacilityId,
  patientId: string,
  reason: "SCOPE" | "NOT_ON_DEVICE",
): Promise<void> {
  await repo
    .recordAuditEvent({
      action: "access.denied",
      entityType: "patient",
      entityId: patientId.trim() === "" ? "unknown" : patientId,
      facilityId,
      outcome: "denied",
      changeSummary: { reason, route: "patient_context" },
    })
    .catch(() => undefined);
}

/** Scope-checked read for the context screen. Denials are audited exactly once. */
export async function get(
  repo: Pick<CareRepository, "getPatient" | "recordAuditEvent">,
  facilityId: FacilityId,
  patientId: string,
): Promise<PatientAccess> {
  let patient: Patient | null;
  try {
    patient = await repo.getPatient(patientId);
  } catch (error) {
    // The repository already wrote `access.denied` for its own refusal.
    if (error instanceof RepositoryError && error.code === "FORBIDDEN") {
      return { status: "denied", reason: "FORBIDDEN" };
    }
    throw error;
  }
  if (patient === null) {
    await recordDenied(repo, facilityId, patientId, "NOT_ON_DEVICE");
    return { status: "denied", reason: "NOT_ON_DEVICE" };
  }
  if (patient.facilityId !== facilityId) {
    await recordDenied(repo, facilityId, patientId, "SCOPE");
    return { status: "denied", reason: "SCOPE" };
  }
  return { status: "ok", patient };
}

export const RECENT_SCREENINGS_LIMIT = 5;
const OPEN_FOLLOW_UP_STATUSES = ["assigned", "contacted"] as const;

export type PatientHistory = { screenings: Screening[]; openFollowUps: FollowUp[] };

/** Submitted screenings (newest first, drafts excluded) + open follow-ups of one patient. */
export async function history(
  repo: Pick<CareRepository, "listScreenings" | "listFollowUps">,
  facilityId: FacilityId,
  patientId: string,
): Promise<PatientHistory> {
  const [screenings, followUps] = await Promise.all([
    repo.listScreenings({ patientId, facilityIds: [facilityId], pageSize: 200 }),
    repo.listFollowUps({
      patientId,
      facilityIds: [facilityId],
      statuses: [...OPEN_FOLLOW_UP_STATUSES],
      pageSize: 200,
    }),
  ]);
  return {
    screenings: screenings.items
      .filter((s) => s.status !== "draft" && s.facilityId === facilityId)
      .sort((a, b) => b.measuredAt.localeCompare(a.measuredAt) || a.id.localeCompare(b.id))
      .slice(0, RECENT_SCREENINGS_LIMIT),
    openFollowUps: followUps.items
      .filter((f) => f.facilityId === facilityId)
      .sort((a, b) => a.dueAt.localeCompare(b.dueAt) || a.id.localeCompare(b.id)),
  };
}

export type MatchCandidate = {
  patient: Patient;
  score: number;
  reasons: PatientMatchReason[];
};

/** Possible duplicates on this device (same facility), best first. Read-only. */
export async function findCandidates(
  repo: Pick<CareRepository, "findPatientMatches">,
  input: RegisterPatientCall,
  now: Date,
): Promise<MatchCandidate[]> {
  const candidate = {
    name: `${input.givenName} ${input.familyName}`,
    dateOfBirth: input.dateOfBirth ?? null,
    estimatedAgeYears: input.estimatedAgeYears,
    sex: input.sex,
  };
  const matches = await repo.findPatientMatches(input);
  return matches
    .filter((m) => m.patient.facilityId === input.facilityId && m.score >= DEMO_MATCH_THRESHOLD)
    .map((m) => ({
      patient: m.patient,
      score: m.score,
      reasons: explainPatientMatch(candidate, m.patient, now).reasons,
    }));
}

/** One atomic registration (entity + sync op + audit); same `key` → same patient. */
export async function register(
  repo: Pick<CareRepository, "registerPatient">,
  input: RegisterPatientCall,
  key: string,
): Promise<Patient> {
  return (await repo.registerPatient(input, key)).data;
}
