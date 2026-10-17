/**
 * Screening drafts (HWM-03 read, HWM-05 write). Drafts are FND-07 screening records with
 * `status: 'draft'` — device-local, NEVER synced (`saveScreeningDraft` / `discardScreeningDraft`
 * return `sync: null`; no `syncOperations` row). The repository returns only the signed-in
 * author's drafts; the facility + author filters are re-applied defensively.
 *
 * Audit (FND-07 registry): the first save writes `screening.draft_saved` with `before: null`
 * (= the phase's `screening.draft_created`); discard writes `screening.draft_discarded`.
 * Updates go through the domain `updateScreeningDraft` inside the repository.
 */
import type { FacilityId, Patient, Screening } from "@laif/domain";
import type { CareRepository, ScreeningDraftCall } from "@laif/repositories";
import { RepositoryError } from "@laif/repositories";

import { patientIndex, type WorkerScopeInput } from "./followUps.ts";
import * as patients from "./patients.ts";

export type DraftRow = {
  draft: Screening;
  patientName: string;
  patientIdentifier: string;
};

/** `listForWorker`: the signed-in worker's drafts at the facility, last edited first. */
export async function listDrafts(
  repo: Pick<CareRepository, "listScreenings" | "listPatients">,
  { workerId, facilityId }: WorkerScopeInput,
): Promise<DraftRow[]> {
  const [page, patientsById] = await Promise.all([
    repo.listScreenings({
      statuses: ["draft"],
      facilityIds: [facilityId],
      pageSize: 200,
    }),
    patientIndex(repo, facilityId),
  ]);
  return page.items
    .filter((s) => s.status === "draft" && s.facilityId === facilityId && s.workerId === workerId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id))
    .map((draft) => {
      const patient = patientsById.get(draft.patientId);
      return {
        draft,
        patientName: patient?.displayName ?? "",
        patientIdentifier: patient?.syntheticIdentifier ?? "",
      };
    });
}

export const listForWorker = listDrafts;

/** The most recently edited draft of one patient (resume prompt), or null. */
export async function latestForPatient(
  repo: Pick<CareRepository, "listScreenings" | "listPatients">,
  scope: WorkerScopeInput,
  patientId: string,
): Promise<Screening | null> {
  const rows = await listDrafts(repo, scope);
  return rows.find((row) => row.draft.patientId === patientId)?.draft ?? null;
}

/** New empty draft (`measuredAt` = demo now, UTC). Same `key` → same draft (idempotent). */
export async function create(
  repo: Pick<CareRepository, "saveScreeningDraft">,
  patientId: string,
  key: string,
): Promise<Screening> {
  return (await repo.saveScreeningDraft({ idempotencyKey: key, patientId }, key)).data;
}

export type DraftPatch = Omit<ScreeningDraftCall, "idempotencyKey" | "patientId" | "screeningId">;

/** Overwrites a draft with the form's current values (no validation needed). */
export async function save(
  repo: Pick<CareRepository, "saveScreeningDraft">,
  draft: Pick<Screening, "id" | "patientId">,
  patch: DraftPatch,
  key: string,
): Promise<Screening> {
  return (
    await repo.saveScreeningDraft(
      { ...patch, idempotencyKey: key, screeningId: draft.id, patientId: draft.patientId },
      key,
    )
  ).data;
}

export async function discard(
  repo: Pick<CareRepository, "discardScreeningDraft">,
  draftId: string,
  key: string,
): Promise<void> {
  await repo.discardScreeningDraft(draftId, key);
}

export type DraftAccess =
  | { status: "ok"; draft: Screening; patient: Patient }
  | { status: "missing" }
  | { status: "denied" };

/**
 * Loads a draft for the form and RE-CHECKS the patient scope (`patients.get`: another facility /
 * not on this device → denied, audited). A draft that is gone (discarded / submitted / another
 * author's) → missing.
 */
export async function get(
  repo: Pick<CareRepository, "getScreening" | "getPatient" | "recordAuditEvent">,
  { workerId, facilityId }: { workerId: string; facilityId: FacilityId },
  draftId: string,
): Promise<DraftAccess> {
  let draft: Screening | null;
  try {
    draft = await repo.getScreening(draftId);
  } catch (error) {
    if (error instanceof RepositoryError && error.code === "FORBIDDEN") return { status: "denied" };
    throw error;
  }
  if (draft === null || draft.status !== "draft" || draft.workerId !== workerId) {
    return { status: "missing" };
  }
  if (draft.facilityId !== facilityId) return { status: "denied" };
  const access = await patients.get(repo, facilityId, draft.patientId);
  if (access.status !== "ok") return { status: "denied" };
  return { status: "ok", draft, patient: access.patient };
}
