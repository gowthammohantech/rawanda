/**
 * Triage mutations + capabilities (ADM-06 task 5):
 * - `useTriageIssue` — `repo.triageQualityIssue` with the caller's idempotency key (created once
 *   per action and reused by "Not saved — retry") and the admin session's correlation id.
 *   Success invalidates the whole grant scope (dataset, quality view, queue pages, overview,
 *   programme actions): the overview's open-issue count reads the same triage state. A CONFLICT
 *   invalidates nothing — the ConflictNotice shows the latest triage state until the user picks.
 * - `useTriageCapabilities` — `quality.triage` (act) and `programme_action.write` (send to the
 *   facility) for an issue's facility (role + scope, FND-06 `checkAccess`). The repository
 *   re-checks both.
 */
import { checkAccess } from "@laif/auth-demo";
import type { DataQualityIssue, WriteResult } from "@laif/contracts";
import { FACILITY_TO_DISTRICT } from "@laif/mock-data";
import { isRepositoryError, type TriageQualityIssueCall } from "@laif/repositories";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { useAdminSession, useRepository, useSessionStore } from "../../app/providers.tsx";
import { adminKeys } from "../../lib/queryKeys.ts";
import { useAccess } from "../metrics/queries.ts";

/** `Omit` over each member of the action union. */
type WithoutCorrelation<T> = T extends unknown ? Omit<T, "correlationId"> : never;
export type TriageVars = { input: WithoutCorrelation<TriageQualityIssueCall>; key: string };

export function useTriageIssue() {
  const repo = useRepository();
  const client = useQueryClient();
  const { scopeKey } = useAccess();
  const correlationId = useAdminSession((s) => s.session?.correlationId);
  return useMutation<WriteResult<DataQualityIssue>, Error, TriageVars>({
    mutationFn: ({ input, key }) =>
      repo.triageQualityIssue(
        { ...input, ...(correlationId === undefined ? {} : { correlationId }) },
        key,
      ),
    onSuccess: () => client.invalidateQueries({ queryKey: adminKeys.scope(scopeKey) }),
  });
}

/** Drops the cached queue + views (the user chose "Use latest" after a conflict). */
export function useRefreshQuality(): () => Promise<void> {
  const client = useQueryClient();
  const { scopeKey } = useAccess();
  return () => client.invalidateQueries({ queryKey: adminKeys.scope(scopeKey) });
}

export type TriageCapabilities = { triage: boolean; send: boolean };

export function useTriageCapabilities(): (facilityId: string) => TriageCapabilities {
  const store = useSessionStore();
  // Re-evaluate when the persona or its grant changes.
  useAdminSession((s) => s.grant);
  useAdminSession((s) => s.persona);
  return useCallback(
    (facilityId: string): TriageCapabilities => {
      const actor = store.actor();
      if (actor === null) return { triage: false, send: false };
      const resource = { facilityId: facilityId as never };
      const options = { facilityToDistrict: FACILITY_TO_DISTRICT };
      const triage = checkAccess(actor, "quality.triage", resource, options).allowed;
      return {
        triage,
        send: triage && checkAccess(actor, "programme_action.write", resource, options).allowed,
      };
    },
    [store],
  );
}

/** Role-level `quality.triage` (the read-only note for the auditor). */
export function useCanTriage(): boolean {
  const store = useSessionStore();
  useAdminSession((s) => s.persona);
  const actor = store.actor();
  return actor !== null && checkAccess(actor, "quality.triage").allowed;
}

/** Errors after which a retry with the SAME key is safe ("Not saved — retry"). */
export function isRetryableWriteError(error: unknown): boolean {
  return isRepositoryError(error) && error.retryable;
}
