/**
 * HWM-08 hooks: the task a form is opened on (scope re-checked; a denial is audited, a normal
 * open is not — the task detail open already audited `followup.viewed`) and the two writes
 * (`recordAttempt` / `recordOutcome`), each followed by `invalidateAfterWrite` and, when the
 * simulated network is online, one fire-and-forget sync pass.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import * as writes from "../../data/followUpWrites.ts";
import { getDetail } from "../../data/followUps.ts";
import { invalidateAfterWrite, workerKeys } from "../../data/queryKeys.ts";
import { useNetwork } from "../../network/NetworkProvider.tsx";
import { useRepository } from "../../providers.tsx";
import { useRequiredScope } from "../../session/useScope.ts";
import { syncAfterWrite } from "../screening/useScreenings.ts";
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
  const { offline } = useNetwork();
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
        if (!outcome.replayed) syncAfterWrite(repo, queryClient, offline);
      }
      return outcome;
    },
    [repo, queryClient, offline, personaId, facilityId],
  );
}

export function useRecordOutcome() {
  const repo = useRepository();
  const queryClient = useQueryClient();
  const { offline } = useNetwork();
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
        if (!outcome.replayed) syncAfterWrite(repo, queryClient, offline);
      }
      return outcome;
    },
    [repo, queryClient, offline, personaId, facilityId],
  );
}
