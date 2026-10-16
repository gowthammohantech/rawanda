/**
 * UI-originated access audit events (CLN-01 §6) through `repository.recordAuditEvent()`; the
 * repository fills id, actorId / actorRole (current persona), occurredAt (UTC, demo clock) and the
 * correlationId. Audit failures never block the demo flow (they are logged in dev only).
 */
import type { CareRepository } from "@laif/repositories";

import type { ClinicalCapability } from "./capabilities.ts";
import type { ClinicalSessionState } from "./session-store.ts";

function swallow(error: unknown): void {
  if (import.meta.env.DEV) console.warn("[clinical] audit event not recorded", error);
}

/** `session.started` — call AFTER the session store holds the new persona. */
export async function recordSessionStarted(
  repo: CareRepository,
  state: ClinicalSessionState,
): Promise<void> {
  await repo
    .recordAuditEvent({
      action: "session.started",
      facilityId: state.activeFacilityId,
      changeSummary: {
        personaId: state.persona.id,
        role: state.persona.role,
        facilityId: state.activeFacilityId,
        demoOnly: true,
      },
    })
    .then(() => undefined, swallow);
}

/** `session.ended` — call BEFORE the session store forgets the persona. */
export async function recordSessionEnded(
  repo: CareRepository,
  state: ClinicalSessionState,
  reason: "sign_out" | "persona_switch",
): Promise<void> {
  await repo
    .recordAuditEvent({
      action: "session.ended",
      facilityId: state.activeFacilityId,
      changeSummary: {
        personaId: state.persona.id,
        role: state.persona.role,
        facilityId: state.activeFacilityId,
        reason,
      },
    })
    .then(() => undefined, swallow);
}

/** `access.denied` for a route guard (resource = route). */
export async function recordRouteDenied(
  repo: CareRepository,
  state: ClinicalSessionState,
  route: string,
  capability: ClinicalCapability,
  reason: string,
): Promise<void> {
  await repo
    .recordAuditEvent({
      action: "access.denied",
      outcome: "denied",
      entityType: "audit_event",
      entityId: route,
      facilityId: state.activeFacilityId,
      changeSummary: {
        resource: "route",
        route,
        capability,
        reason,
        personaId: state.persona.id,
        role: state.persona.role,
        facilityId: state.activeFacilityId,
      },
    })
    .then(() => undefined, swallow);
}
