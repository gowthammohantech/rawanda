/**
 * HWM-08 hooks: the task a form is opened on (scope re-checked; a denial is audited, a normal
 * open is not — the task detail open already audited `followup.viewed`) and the two writes
 * (`recordAttempt` / `recordOutcome`), each followed by `invalidateAfterWrite` and, when the
 * simulated network is online, the debounced HWM-09 `after_write` sync trigger.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import * as writes from "../../data/followUpWrites.ts";
import { getDetail } from "../../data/followUps.ts";
import { invalidateAfterWrite, workerKeys } from "../../data/queryKeys.ts";
import { useSyncTriggers } from "../../sync/SyncTriggersProvider.tsx";
import { useRepository } from "../../providers.tsx";
import { useRequiredScope } from "../../session/useScope.ts";
import type { AttemptFormValues } from "./attemptSchema.ts";
import type { OutcomeFormValues } from "./outcomeSchema.ts";

/** Loaded once per form mount (the form keeps the version it was opened on). */
export function useFollowUpForForm(followUpId: string) {
  const repo = useRepository();
  const { personaId, facilityId } = useRequiredScope();
  return useQuery({
    queryKey: workerKeys.taskForm(facilityId, followUpId),
    queryFn: () =>
      getDetail(repo, { workerId: personaId, facilityId }, followUpId, { audit: "denied" }),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  });
}

export function useRecordAttempt() {
  const repo = useRepository();
  const queryClient = useQueryClient();
  const triggers = useSyncTriggers();
  const { personaId, facilityId } = useRequiredScope();
  return useCallback(
    async (target: writes.FollowUpTarget, values: AttemptFormValues, key: string, now: Date) => {
      const outcome = await writes.recordAttempt(
        repo,
        { workerId: personaId, facilityId },
        target,
        values,
        key,
        now,
      );
      if (outcome.status === "saved") {
        await invalidateAfterWrite(queryClient);
        if (!outcome.replayed) triggers.afterWrite();
      }
      return outcome;
    },
    [repo, queryClient, triggers, personaId, facilityId],
  );
}

export function useRecordOutcome() {
  const repo = useRepository();
  const queryClient = useQueryClient();
  const triggers = useSyncTriggers();
  const { personaId, facilityId } = useRequiredScope();
  return useCallback(
    async (target: writes.FollowUpTarget, values: OutcomeFormValues, key: string, now: Date) => {
      const outcome = await writes.recordOutcome(
        repo,
        { workerId: personaId, facilityId },
        target,
        values,
        key,
        now,
      );
      if (outcome.status === "saved") {
        await invalidateAfterWrite(queryClient);
        if (!outcome.replayed) triggers.afterWrite();
      }
      return outcome;
    },
    [repo, queryClient, triggers, personaId, facilityId],
  );
}
