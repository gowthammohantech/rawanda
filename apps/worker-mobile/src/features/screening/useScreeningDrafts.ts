/**
 * HWM-05 draft hooks (TanStack Query over `src/data/drafts.ts`). Author + facility always come
 * from the signed-in device session (`useRequiredScope`), never from route params.
 */
import type { Screening } from "@laif/domain";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import * as drafts from "../../data/drafts.ts";
import { invalidateDrafts, workerKeys } from "../../data/queryKeys.ts";
import { platform } from "../../platform";
import { useRepository } from "../../providers.tsx";
import { useRequiredScope } from "../../session/useScope.ts";
import { formValuesToDraftPatch, type ScreeningFormValues } from "./screeningSchema.ts";

export function useDraftList() {
  const repo = useRepository();
  const { personaId, facilityId } = useRequiredScope();
  return useQuery({
    queryKey: workerKeys.draftList(personaId, facilityId),
    queryFn: () => drafts.listForWorker(repo, { workerId: personaId, facilityId }),
  });
}

/**
 * Draft + scope-checked patient for the form. Fresh on every mount (`gcTime: 0`), never
 * refetched while the form is open (autosave owns the values).
 */
export function useDraftAccess(draftId: string) {
  const repo = useRepository();
  const { personaId, facilityId } = useRequiredScope();
  return useQuery({
    queryKey: workerKeys.draft(draftId),
    queryFn: () => drafts.get(repo, { workerId: personaId, facilityId }, draftId),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  });
}

export function useDraftActions() {
  const repo = useRepository();
  const queryClient = useQueryClient();
  const { personaId, facilityId } = useRequiredScope();

  const latestForPatient = useCallback(
    (patientId: string) =>
      drafts.latestForPatient(repo, { workerId: personaId, facilityId }, patientId),
    [repo, personaId, facilityId],
  );

  const create = useCallback(
    async (patientId: string, key: string): Promise<Screening> => {
      const draft = await drafts.create(repo, patientId, key);
      await invalidateDrafts(queryClient);
      return draft;
    },
    [repo, queryClient],
  );

  /** Autosave target: a fresh idempotency key per write; resolves with `updatedAt`. */
  const save = useCallback(
    async (draft: Pick<Screening, "id" | "patientId">, values: ScreeningFormValues) => {
      const saved = await drafts.save(
        repo,
        draft,
        formValuesToDraftPatch(values),
        platform.createIds()(),
      );
      void invalidateDrafts(queryClient);
      return saved.updatedAt;
    },
    [repo, queryClient],
  );

  const discard = useCallback(
    async (draftId: string, key: string) => {
      await drafts.discard(repo, draftId, key);
      queryClient.removeQueries({ queryKey: workerKeys.draft(draftId) });
      await invalidateDrafts(queryClient);
    },
    [repo, queryClient],
  );

  return { latestForPatient, create, save, discard };
}
