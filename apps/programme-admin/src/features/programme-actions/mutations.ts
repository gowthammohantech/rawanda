/**
 * Programme action queries + mutations (ADM-03 tasks 7–9):
 * - `useProgrammeActions` — `adminKeys.programmeActions(scopeKey)` (the grant scope);
 * - `useCreateProgrammeAction` / `useUpdateProgrammeAction` — call the repository with the
 *   caller's idempotency key (created once per dialog / change and reused on retry) and the
 *   admin session's correlation id; success invalidates `adminKeys.programmeActions`. A
 *   CONFLICT never invalidates: nothing changes on screen until the user chooses.
 * - `useAssignAvailability` — `programme_action.write` for a facility (role + scope, FND-06
 *   `checkAccess`), with the translated reason when not allowed. The repository re-checks.
 */
import { checkAccess } from "@laif/auth-demo";
import type { ProgrammeAction, WriteResult } from "@laif/contracts";
import { FACILITY_TO_DISTRICT } from "@laif/mock-data";
import {
  isRepositoryError,
  type ProgrammeActionCall,
  type ProgrammeActionUpdateCall,
} from "@laif/repositories";
import { useTx } from "@laif/ui-web";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { useAdminSession, useRepository, useSessionStore } from "../../app/providers.tsx";
import { adminKeys } from "../../lib/queryKeys.ts";
import type { AssignAvailability } from "../funnel/StageBreakdownTable.tsx";
import { useAccess } from "../metrics/queries.ts";

export function useProgrammeActions() {
  const repo = useRepository();
  const { access, scopeKey } = useAccess();
  return useQuery({
    queryKey: adminKeys.programmeActions(scopeKey),
    queryFn: () => repo.listProgrammeActions(),
    enabled: access !== null,
    retry: false,
  });
}

type CreateVars = { input: Omit<ProgrammeActionCall, "correlationId">; key: string };
type UpdateVars = { input: Omit<ProgrammeActionUpdateCall, "correlationId">; key: string };

export function useCreateProgrammeAction() {
  const repo = useRepository();
  const client = useQueryClient();
  const { scopeKey } = useAccess();
  const correlationId = useAdminSession((s) => s.session?.correlationId);
  return useMutation<WriteResult<ProgrammeAction>, Error, CreateVars>({
    mutationFn: ({ input, key }) =>
      repo.createProgrammeAction(
        { ...input, ...(correlationId === undefined ? {} : { correlationId }) },
        key,
      ),
    onSuccess: () => client.invalidateQueries({ queryKey: adminKeys.programmeActions(scopeKey) }),
  });
}

export function useUpdateProgrammeAction() {
  const repo = useRepository();
  const client = useQueryClient();
  const { scopeKey } = useAccess();
  const correlationId = useAdminSession((s) => s.session?.correlationId);
  return useMutation<WriteResult<ProgrammeAction>, Error, UpdateVars>({
    mutationFn: ({ input, key }) =>
      repo.updateProgrammeAction(
        { ...input, ...(correlationId === undefined ? {} : { correlationId }) },
        key,
      ),
    onSuccess: () => client.invalidateQueries({ queryKey: adminKeys.programmeActions(scopeKey) }),
  });
}

/** Drops the cached list (the user chose "Use latest" after a conflict). */
export function useRefreshProgrammeActions(): () => Promise<void> {
  const client = useQueryClient();
  const { scopeKey } = useAccess();
  return () => client.invalidateQueries({ queryKey: adminKeys.programmeActions(scopeKey) });
}

export function useAssignAvailability(): (facilityId: string) => AssignAvailability {
  const store = useSessionStore();
  const t = useTx();
  // Re-evaluate when the persona or its grant changes.
  useAdminSession((s) => s.grant);
  return useCallback(
    (facilityId: string): AssignAvailability => {
      const actor = store.actor();
      if (actor === null) return { allowed: false, reason: t("admin:actions.denied.role") };
      const decision = checkAccess(
        actor,
        "programme_action.write",
        { facilityId: facilityId as never },
        { facilityToDistrict: FACILITY_TO_DISTRICT },
      );
      if (decision.allowed) return { allowed: true };
      return {
        allowed: false,
        reason:
          decision.reason === "SCOPE"
            ? t("admin:actions.denied.scope")
            : t("admin:actions.denied.role"),
      };
    },
    [store, t],
  );
}

/** Errors after which a retry with the SAME key is safe ("Not saved — retry"). */
export function isRetryableWriteError(error: unknown): boolean {
  return isRepositoryError(error) && error.retryable;
}
