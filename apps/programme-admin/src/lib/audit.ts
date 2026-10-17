/**
 * `emitAdminAudit()` — thin helper over `repository.recordAuditEvent` (FND-07). Only the
 * canonical cross-cutting names are used from the admin app here: `session.started`,
 * `session.ended`, `access.denied` (export / reset events come from the repository itself).
 * Every event carries the admin session's `correlationId`, `grantId` and `grantVersion`.
 */
import type { ClientAuditInput } from "@laif/contracts";
import type { AuditEvent, EntityType, JsonValue } from "@laif/domain";
import type { CareRepository } from "@laif/repositories";

import type { AdminSession } from "../auth/sessionStore.ts";

export const ADMIN_AUDIT_ACTIONS = ["session.started", "session.ended", "access.denied"] as const;
export type AdminAuditAction = (typeof ADMIN_AUDIT_ACTIONS)[number];

export type AdminAuditInput = {
  action: AdminAuditAction;
  entityType?: EntityType;
  entityId?: string;
  outcome?: "success" | "denied";
  changeSummary?: { [key: string]: JsonValue };
};

export function emitAdminAudit(
  repo: Pick<CareRepository, "recordAuditEvent">,
  session: AdminSession,
  input: AdminAuditInput,
): Promise<AuditEvent> {
  const event: ClientAuditInput = {
    action: input.action,
    outcome: input.outcome ?? "success",
    correlationId: session.correlationId,
    changeSummary: {
      grantId: session.grantId,
      grantVersion: session.grantVersion,
      ...input.changeSummary,
    },
  };
  if (input.entityType !== undefined) event.entityType = input.entityType;
  if (input.entityId !== undefined) event.entityId = input.entityId;
  return repo.recordAuditEvent(event);
}

export type DeniedAccess = {
  pathname: string;
  search: string;
  reason: "SCOPE" | "ROLE";
  /** The denied scope resource (scope denials) — null for capability denials. */
  resource: { kind: "district" | "facility"; id: string } | null;
  requested: { district: string | null; facility: string | null };
  permission?: string;
};

/**
 * `access.denied` of a route guard: entityType = the denied district / facility (or `persona`
 * for a missing capability), entityId = the pathname, facilityId / districtId null, and
 * `changeSummary { requested, grant, reason }` (ADM-01 §6).
 */
export function emitAccessDenied(
  repo: Pick<CareRepository, "recordAuditEvent">,
  session: AdminSession,
  denied: DeniedAccess,
): Promise<AuditEvent> {
  return emitAdminAudit(repo, session, {
    action: "access.denied",
    outcome: "denied",
    entityType: denied.resource?.kind ?? "persona",
    entityId: denied.pathname,
    changeSummary: {
      requested: denied.requested,
      grant: session.grantId,
      reason: denied.reason,
      search: denied.search,
      ...(denied.permission === undefined ? {} : { permission: denied.permission }),
    },
  });
}
