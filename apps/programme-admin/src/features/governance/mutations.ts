/**
 * Governance mutations (ADM-08 tasks 5–6):
 * - `useUpdateGrant` — `repository.updateAccessGrant` with the caller's idempotency key (one per
 *   dialog opening / conflict re-apply) and the session correlation id. Success invalidates
 *   `adminKeys.all` (grants, audit pages and counts; if the edited grant is the signed-in
 *   persona's, RequireSession re-validates on the refetch and the view refreshes). A CONFLICT
 *   invalidates nothing: the dialog shows the latest grant until the user chooses.
 * - `useSimulationAudit` — records `admin.access_simulation.run` (persona, resource, decision).
 * - `useTryAsPersona` — the simulator's "Try it": switches the demo session to the simulated
 *   persona (remembering the original for "Return to …") and opens the forbidden URL, where the
 *   real ScopeGuard renders the 403 and writes exactly one `access.denied`.
 */
import type { AccessEvaluation, AccessResource } from "@laif/auth-demo";
import type { AccessGrant, WriteResult } from "@laif/contracts";
import { DISTRICT_IDS } from "@laif/mock-data";
import type { AccessGrantUpdateCall } from "@laif/repositories";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useNavigate } from "react-router";

import { paths } from "../../app/nav.ts";
import { useAdminSession, useServices } from "../../app/providers.tsx";
import { findAdminPersona } from "../../auth/personas.ts";
import { defaultReportingDistrict, switchAdminSession } from "../../auth/signIn.ts";
import { emitAdminAudit } from "../../lib/audit.ts";
import { adminKeys } from "../../lib/queryKeys.ts";

type UpdateVars = { input: Omit<AccessGrantUpdateCall, "correlationId">; key: string };

export function useUpdateGrant() {
  const { repo } = useServices();
  const client = useQueryClient();
  const correlationId = useAdminSession((s) => s.session?.correlationId);
  return useMutation<WriteResult<AccessGrant>, Error, UpdateVars>({
    mutationFn: ({ input, key }) =>
      repo.updateAccessGrant(
        { ...input, ...(correlationId === undefined ? {} : { correlationId }) },
        key,
      ),
    onSuccess: () => client.invalidateQueries({ queryKey: adminKeys.all }),
  });
}

/** Drops cached grants (the user kept the latest version after a conflict). */
export function useRefreshGrants(): () => Promise<void> {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: adminKeys.grants() });
}

export function useSimulationAudit(): (
  personaId: string,
  resource: AccessResource,
  result: AccessEvaluation,
) => Promise<void> {
  const services = useServices();
  return useCallback(
    async (personaId, resource, result) => {
      const session = services.session.getState().session;
      if (session === null) return;
      await emitAdminAudit(services.repo, session, {
        action: "admin.access_simulation.run",
        entityType: "persona",
        entityId: personaId,
        changeSummary: {
          persona: personaId,
          resource: { type: resource.type, id: resource.id },
          decision: result.allowed ? "allowed" : "denied",
          reasonCode: result.reasonCode,
          role: result.role,
        },
      });
    },
    [services],
  );
}

/** The forbidden URL of the "Try it" flow (District Beta overview). */
export const TRY_IT_PATH = `${paths.overview}?district=${DISTRICT_IDS.beta}`;

export function useTryAsPersona(): (personaId: string, path?: string) => Promise<void> {
  const services = useServices();
  const navigate = useNavigate();
  return useCallback(
    async (personaId, path = TRY_IT_PATH) => {
      const current = services.session.getState().session;
      const persona = findAdminPersona(personaId);
      const grant = (await services.repo.listAccessGrants()).find((g) => g.personaId === personaId);
      if (persona === null || grant === undefined) throw new Error(`no grant for ${personaId}`);
      await switchAdminSession(services, {
        persona,
        grant,
        reportingDistrictId: defaultReportingDistrict(persona, grant),
        returnToPersonaId: current?.returnToPersonaId ?? current?.personaId ?? null,
      });
      await navigate(path);
    },
    [services, navigate],
  );
}

/** "Return to {original persona}" of the Try-it banner. */
export function useReturnToPersona(): (personaId: string) => Promise<void> {
  const services = useServices();
  const navigate = useNavigate();
  return useCallback(
    async (personaId) => {
      const persona = findAdminPersona(personaId);
      const grant = (await services.repo.listAccessGrants()).find((g) => g.personaId === personaId);
      if (persona === null || grant === undefined) throw new Error(`no grant for ${personaId}`);
      await switchAdminSession(services, {
        persona,
        grant,
        reportingDistrictId: defaultReportingDistrict(persona, grant),
      });
      await navigate(`${paths.governance}?tab=access`);
    },
    [services, navigate],
  );
}
