/**
 * HWM-06 hooks over `src/data/screenings.ts`: the draft under review (+ stored-ruleset preview),
 * submit (then, only after the commit, the HWM-09 `after_write` sync trigger — debounced, and
 * skipped while the simulated network is offline; the phase's `engine.drainOnce('after_submit')`),
 * a submitted screening with its sync view, and amendments. Scope always comes from the
 * signed-in device session.
 */
import type { Screening } from "@laif/domain";
import type { CareRepository } from "@laif/repositories";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import * as drafts from "../../data/drafts.ts";
import { invalidateAfterWrite, invalidateDrafts, workerKeys } from "../../data/queryKeys.ts";
import * as screenings from "../../data/screenings.ts";
import { useRepository } from "../../providers.tsx";
import { useRequiredScope } from "../../session/useScope.ts";
import { useSyncTriggers } from "../../sync/SyncTriggersProvider.tsx";

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
  const triggers = useSyncTriggers();
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
        if (!outcome.replayed) triggers.afterWrite();
      }
      return outcome;
    },
    [repo, queryClient, triggers, personaId, facilityId],
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
  const triggers = useSyncTriggers();
  return useCallback(
    async (
      screening: Pick<Screening, "id" | "version">,
      call: screenings.AmendCall,
      key: string,
    ) => {
      const amended = await screenings.amend(repo, screening, call, key);
      await invalidateAfterWrite(queryClient);
      triggers.afterWrite();
      return amended;
    },
    [repo, queryClient, triggers],
  );
}
