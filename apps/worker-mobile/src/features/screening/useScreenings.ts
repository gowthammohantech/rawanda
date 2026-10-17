/**
 * HWM-06 hooks over `src/data/screenings.ts`: the draft under review (+ stored-ruleset preview),
 * submit (then, only after the commit and only when the simulated network is online, one
 * fire-and-forget sync pass — the phase's `engine.drainOnce('after_submit')`; FND-07
 * `SyncTrigger` has no `after_submit`, so it is `auto`), a submitted screening with its sync
 * view, and amendments. Scope always comes from the signed-in device session.
 */
import type { Screening } from "@laif/domain";
import type { CareRepository } from "@laif/repositories";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import * as drafts from "../../data/drafts.ts";
import { invalidateAfterWrite, invalidateDrafts, workerKeys } from "../../data/queryKeys.ts";
import * as screenings from "../../data/screenings.ts";
import { useNetwork } from "../../network/NetworkProvider.tsx";
import { useRepository } from "../../providers.tsx";
import { useRequiredScope } from "../../session/useScope.ts";

/** One sync pass after a committed write when online (fire-and-forget), then refresh. */
export function syncAfterWrite(repo: CareRepository, queryClient: QueryClient, offline: boolean) {
  if (offline) return;
  void repo.sync
    .process({ trigger: "auto" })
    .catch(() => undefined)
    .finally(() => void invalidateAfterWrite(queryClient));
}

export type ReviewData =
  | {
      status: "ok";
      access: Extract<drafts.DraftAccess, { status: "ok" }>;
      ruleset: Awaited<ReturnType<CareRepository["getActiveRuleset"]>>;
    }
  /** The draft was already submitted (second visit / restart): show the result. */
  | { status: "submitted"; screening: Screening }
  | { status: "missing" }
  | { status: "denied" };

/** The draft under review, scope re-checked, with the stored ruleset (fresh on every mount). */
export function useReviewDraft(draftId: string) {
  const repo = useRepository();
  const { personaId, facilityId } = useRequiredScope();
  return useQuery({
    queryKey: workerKeys.screeningReview(draftId),
    queryFn: async (): Promise<ReviewData> => {
      const access = await drafts.get(repo, { workerId: personaId, facilityId }, draftId);
      if (access.status === "missing") {
        const submitted = await screenings.get(repo, { facilityId }, draftId);
        if (submitted.status === "ok")
          return { status: "submitted", screening: submitted.screening };
        return { status: submitted.status === "denied" ? "denied" : "missing" };
      }
      if (access.status !== "ok") return access;
      return { status: "ok", access, ruleset: await repo.getActiveRuleset() };
    },
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  });
}

export function useSubmitScreening() {
  const repo = useRepository();
  const queryClient = useQueryClient();
  const { offline } = useNetwork();
  const { personaId, facilityId } = useRequiredScope();
  return useCallback(
    async (draftId: string, now: Date) => {
      const outcome = await screenings.submitFromDraft(
        repo,
        { workerId: personaId, facilityId },
        draftId,
        now,
      );
      if (outcome.status === "submitted") {
        queryClient.removeQueries({ queryKey: workerKeys.draft(draftId) });
        await Promise.all([invalidateDrafts(queryClient), invalidateAfterWrite(queryClient)]);
        if (!outcome.replayed) syncAfterWrite(repo, queryClient, offline);
      }
      return outcome;
    },
    [repo, queryClient, offline, personaId, facilityId],
  );
}

/** A submitted screening + patient (scope-checked). */
export function useScreening(screeningId: string) {
  const repo = useRepository();
  const { facilityId } = useRequiredScope();
  return useQuery({
    queryKey: workerKeys.screening(screeningId),
    queryFn: () => screenings.get(repo, { facilityId }, screeningId),
    retry: false,
  });
}

/** Live sync view of one screening (refreshed by every write / sync pass). */
export function useScreeningSync(screening: Screening | null) {
  const repo = useRepository();
  const id = screening?.id ?? "";
  const query = useQuery({
    queryKey: workerKeys.screeningOps(id),
    queryFn: () => repo.sync.list({ entityId: id }),
    enabled: screening !== null,
  });
  return screening === null || query.data === undefined
    ? null
    : screenings.screeningSyncView(screening, query.data);
}

export function useAmendScreening() {
  const repo = useRepository();
  const queryClient = useQueryClient();
  const { offline } = useNetwork();
  return useCallback(
    async (
      screening: Pick<Screening, "id" | "version">,
      call: screenings.AmendCall,
      key: string,
    ) => {
      const amended = await screenings.amend(repo, screening, call, key);
      await invalidateAfterWrite(queryClient);
      syncAfterWrite(repo, queryClient, offline);
      return amended;
    },
    [repo, queryClient, offline],
  );
}
