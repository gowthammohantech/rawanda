/**
 * `checkAccess` (FND-06 task 4): the one decision function every app, route guard and the FND-07
 * repository use. Demo-only — not security. FND-07 audits every denial (`access.denied`).
 */
import type {
  DemoPersona,
  DeviceSession,
  DeviceSessionId,
  DeviceSessionStatus,
  PersonaId,
  Role,
} from "@laif/domain";
import type { ErrorReason } from "@laif/contracts";

import {
  ASSIGNMENT_LIMITED_PERMISSIONS,
  ASSIGNMENT_LIMITED_ROLES,
  DEMO_TOOLING_PERMISSIONS,
  roleHasPermission,
  type Permission,
} from "./permissions.ts";
import {
  isResourceInScope,
  scopeForPersona,
  type AccessGrantLike,
  type FacilityToDistrict,
  type Scope,
  type ScopedResource,
} from "./scope.ts";

export type ActorContext = {
  personaId: PersonaId;
  role: Role;
  scope: Scope;
  deviceSessionId?: DeviceSessionId | null;
  /** Status of `deviceSessionId` as last read from the store; `revoked` denies (HW-08). */
  deviceSessionStatus?: DeviceSessionStatus | null;
};

export const ACCESS_DENIAL_REASONS = [
  "ROLE",
  "SCOPE",
  "SESSION_REVOKED",
] as const satisfies readonly ErrorReason[];
export type AccessDenialReason = (typeof ACCESS_DENIAL_REASONS)[number];

export type AccessDecision = { allowed: true } | { allowed: false; reason: AccessDenialReason };

export type CheckAccessOptions = {
  /** facilityId → districtId (defaults to the seed reference map). */
  facilityToDistrict?: FacilityToDistrict;
};

const ALLOWED: AccessDecision = Object.freeze({ allowed: true });

/**
 * Order of checks: revoked device session → role → scope.
 * - Demo tooling (`demo.*`) is never blocked by a revoked session so a demo can always recover.
 * - Without a `resource` only the role is checked (e.g. "may this persona see the queue?").
 * - Community health workers are additionally limited to follow-ups assigned to them: for the
 *   assignment-limited permissions a resource MUST carry `assignedWorkerId` equal to the actor
 *   (fails closed: a missing key or `null` = unassigned denies with `SCOPE`, FND-07 fix).
 */
export function checkAccess(
  actor: ActorContext,
  permission: Permission,
  resource?: ScopedResource,
  options: CheckAccessOptions = {},
): AccessDecision {
  const tooling = (DEMO_TOOLING_PERMISSIONS as readonly Permission[]).includes(permission);
  if (!tooling && actor.deviceSessionStatus === "revoked") {
    return { allowed: false, reason: "SESSION_REVOKED" };
  }
  if (!roleHasPermission(actor.role, permission)) return { allowed: false, reason: "ROLE" };
  if (resource === undefined || tooling) return ALLOWED;

  if (!isResourceInScope(actor.scope, resource, options.facilityToDistrict)) {
    return { allowed: false, reason: "SCOPE" };
  }
  if (
    (ASSIGNMENT_LIMITED_ROLES as readonly Role[]).includes(actor.role) &&
    (ASSIGNMENT_LIMITED_PERMISSIONS as readonly Permission[]).includes(permission) &&
    (!("assignedWorkerId" in resource) || resource.assignedWorkerId !== actor.personaId)
  ) {
    return { allowed: false, reason: "SCOPE" };
  }
  return ALLOWED;
}

/** Boolean shorthand for UI affordances (disabled nav items etc.). */
export function can(
  actor: ActorContext,
  permission: Permission,
  resource?: ScopedResource,
  options?: CheckAccessOptions,
): boolean {
  return checkAccess(actor, permission, resource, options).allowed;
}

export type ActorForPersonaOptions = {
  grant?: AccessGrantLike | null;
  deviceSession?: Pick<DeviceSession, "id" | "status"> | null;
};

/** Builds the `ActorContext` of a persona (scope from its AccessGrant when given). */
export function actorForPersona(
  persona: Pick<
    DemoPersona,
    "id" | "role" | "facilityIds" | "districtIds" | "programmeWide" | "linkedPatientIds"
  >,
  options: ActorForPersonaOptions = {},
): ActorContext {
  const actor: ActorContext = {
    personaId: persona.id,
    role: persona.role,
    scope: scopeForPersona(persona, options.grant),
  };
  if (options.deviceSession) {
    actor.deviceSessionId = options.deviceSession.id;
    actor.deviceSessionStatus = options.deviceSession.status;
  }
  return actor;
}
