/**
 * Unfinished screening drafts (HWM-03, read-only here; HWM-05 writes them). Drafts are FND-07
 * screening records with `status: 'draft'` — device-local, never synced. The repository returns
 * only the signed-in author's drafts; the facility + author filters are re-applied defensively.
 */
import type { Screening } from "@laif/domain";
import type { CareRepository } from "@laif/repositories";

import { patientIndex, type WorkerScopeInput } from "./followUps.ts";

export type DraftRow = {
  draft: Screening;
  patientName: string;
  patientIdentifier: string;
};

export async function listDrafts(
  repo: Pick<CareRepository, "listScreenings" | "listPatients">,
  { workerId, facilityId }: WorkerScopeInput,
): Promise<DraftRow[]> {
  const [page, patients] = await Promise.all([
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
      const patient = patients.get(draft.patientId);
      return {
        draft,
        patientName: patient?.displayName ?? "",
        patientIdentifier: patient?.syntheticIdentifier ?? "",
      };
    });
}
