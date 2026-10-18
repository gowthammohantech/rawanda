/**
 * `emitAdminAudit()` — thin helper over `repository.recordAuditEvent` (FND-07). The admin app
 * records `session.started`, `session.ended`, `access.denied`, `conflict.resolved` and (ADM-03)
 * `admin.drilldown.viewed` and (ADM-07) `export.requested`; change events (programme actions, exports, reset) come from the
 * repository itself.
 * Every event carries the admin session's `correlationId`, `grantId` and `grantVersion`.
 */
import type { ClientAuditInput } from "@laif/contracts";
import type { AuditEvent, EntityType, JsonValue } from "@laif/domain";
import type { CareRepository } from "@laif/repositories";

import type { AdminSession } from "../auth/sessionStore.ts";

export const ADMIN_AUDIT_ACTIONS = [
  "session.started",
  "session.ended",
  // ADM-09: "Expire session now" (recorded before the session is marked expired).
  "session.expired",
  "access.denied",
  // ADM-03: aggregate drill-down view; the user's choice after a programme-action conflict.
  "admin.drilldown.viewed",
  "conflict.resolved",
  // ADM-07: the user submitted an export (`export.generated` / `.denied` come from the repository).
  "export.requested",
  // ADM-08: governance audit-log view (once per session + filter key) and access simulator runs
  // (grant changes / conflicts / denials come from the repository).
  "admin.audit.viewed",
  "admin.access_simulation.run",
] as const;
export type AdminAuditAction = (typeof ADMIN_AUDIT_ACTIONS)[number];

export type AdminAuditInput = {
  action: AdminAuditAction;
  entityType?: EntityType;
  entityId?: string;
  facilityId?: string;
  districtId?: string;
  outcome?: "success" | "denied";
  changeSummary?: { [key: string]: JsonValue };
  justification?: string;
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
  if (input.facilityId !== undefined) event.facilityId = input.facilityId;
  if (input.districtId !== undefined) event.districtId = input.districtId;
  if (input.justification !== undefined) event.justification = input.justification;
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
