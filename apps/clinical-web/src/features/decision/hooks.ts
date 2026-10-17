/**
 * Decision data (CLN-07).
 *
 * - `useDecideReview({ initialKey })` → `repository.decideReview(variables, key)` through
 *   `useIdempotentMutation`: the draft's form-session key, re-entry blocked while pending (a double
 *   click on Confirm = one call), same-key retry after TIMEOUT / OFFLINE / DEPENDENCY_UNAVAILABLE.
 *   The repository writes review + referral / follow-up + audit (one correlation id) in ONE
 *   transaction, checks `expectedVersion` (`CONFLICT` with `latest`), `ALREADY_DECIDED`,
 *   `REFERRAL_ALREADY_OPEN` and the authorised worker; a replayed key returns the stored result.
 *   Success invalidates reviews / counts / review / referrals / follow-ups / patient timeline.
 * - `useDemoNow()` → the demo clock (dueAt must be later; attribution time).
 * - `useWorkers(facilityId)` → `listWorkers` (authorised CHWs of the facility only, CL-07).
 * - `useNextPendingCase(currentId)` → first open review of the last queue view (else the default
 *   queue filter), excluding this one.
 */
import type { WriteResult } from "@laif/contracts";
import { isReviewOpen, type Review } from "@laif/domain";
import { useQuery } from "@tanstack/react-query";

import type { ClinicalError } from "../../data/errors.ts";
import { clinicalInvalidations, clinicalKeys } from "../../data/queryKeys.ts";
import { useIdempotentMutation } from "../../data/useIdempotentMutation.ts";
import { useRepository } from "../../data/useRepository.ts";
import { useSession } from "../../session/useSession.ts";
import { demoNowIso } from "../patients/hooks.ts";
import { lastQueueSearch } from "../queue/lastSearch.ts";
import { parseQueueParams, scopeOf, toRepositoryFilter } from "../queue/model.ts";
import type { DecisionVariables } from "./form.ts";

export type UseDecideReviewOptions = {
  initialKey: string;
  onSuccess?: (result: WriteResult<Review>, variables: DecisionVariables) => void;
  onError?: (error: ClinicalError, variables: DecisionVariables) => void;
};

export function useDecideReview({ initialKey, onSuccess, onError }: UseDecideReviewOptions) {
  const repo = useRepository();
  const { activeFacilityId } = useSession();
  const fac = activeFacilityId ?? "none";
  return useIdempotentMutation<DecisionVariables, Review>({
    initialKey,
    mutationFn: (variables, key) => repo.decideReview(variables, key),
    invalidate: clinicalInvalidations(fac, "decideReview"),
    ...(onSuccess === undefined ? {} : { onSuccess }),
    ...(onError === undefined ? {} : { onError }),
  });
}

export function useDemoNow() {
  const repo = useRepository();
  const { activeFacilityId } = useSession();
  return useQuery({
    queryKey: ["clinical", activeFacilityId ?? "none", "demoNow"],
    queryFn: () => demoNowIso(repo),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}

export function useWorkers(facilityId: string | null) {
  const repo = useRepository();
  const { activeFacilityId } = useSession();
  return useQuery({
    queryKey: clinicalKeys.workers(activeFacilityId ?? "none"),
    queryFn: () => repo.listWorkers(facilityId ?? ""),
    enabled: facilityId !== null,
    staleTime: 60_000,
  });
}

export function useNextPendingCase(currentId: string, enabled: boolean) {
  const repo = useRepository();
  const { activeFacilityId, persona, permittedFacilityIds } = useSession();
  const fac = activeFacilityId ?? "none";
  const search = lastQueueSearch();
  return useQuery({
    queryKey: clinicalKeys.reviews(fac, { next: currentId, search }),
    enabled: enabled && activeFacilityId !== null,
    queryFn: async (): Promise<string | null> => {
      const { filter } = parseQueueParams(new URLSearchParams(search), permittedFacilityIds);
      const page = await repo.listReviews({
        ...toRepositoryFilter(scopeOf(filter), { facilityId: fac, personaId: persona?.id ?? null }),
        tab: filter.tab,
        sort: filter.sort,
        page: 1,
        pageSize: 50,
      });
      const next = page.items.find((r) => r.id !== currentId && isReviewOpen(r));
      return next?.id ?? null;
    },
  });
}
