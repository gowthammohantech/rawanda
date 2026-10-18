/**
 * `evaluateAccess` (ADM-08): ONE pure decision over (grant, capability matrix, resource) with a
 * reason code. The admin ScopeGuard, `RequireCapability`, `assertScope` and the governance
 * access simulator all call it, so the simulator cannot drift from enforcement.
 *
 * Order of checks: expired grant → capability (role from the grant, else the persona) → scope.
 * Demo-only — DEMO ROLE SWITCH, NOT AUTHENTICATION.
 */
import type { DistrictId, FacilityId, Role } from "@laif/domain";

import type { Permission } from "./permissions.ts";
import {
  isGrantExpired,
  isResourceInScope,
  scopeForPersona,
  type AccessGrantLike,
  type FacilityToDistrict,
  type ScopePersona,
  type ScopedResource,
} from "./scope.ts";

export const ACCESS_REASON_CODES = [
  "OK",
  "MISSING_CAPABILITY",
  "GRANT_EXPIRED",
  "OUT_OF_SCOPE_DISTRICT",
  "OUT_OF_SCOPE_FACILITY",
] as const;
export type AccessReasonCode = (typeof ACCESS_REASON_CODES)[number];

/** Resource kinds the simulator offers (ADM-08 task 5). */
export const ACCESS_RESOURCE_TYPES = [
  "district",
  "facility",
  "page",
  "export",
  "drilldown",
] as const;
export type AccessResourceType = (typeof ACCESS_RESOURCE_TYPES)[number];

/** Default capability (any-of) per resource type; a `page` names its own. */
export const RESOURCE_TYPE_CAPABILITIES: Readonly<
  Record<Exclude<AccessResourceType, "page">, readonly Permission[]>
> = {
  district: ["metrics.read"],
  facility: ["metrics.read"],
  export: ["export.aggregate"],
  drilldown: ["metrics.drilldown"],
};

export type AccessResource = {
  type: AccessResourceType;
  /** District / facility id, a page (route) id, or an export / drill-down target id. */
  id: string;
  /** Capabilities, any one of which suffices (default: `RESOURCE_TYPE_CAPABILITIES`). */
  permissions?: readonly Permission[];
  /** Location of a page / export / drill-down (a `district` / `facility` uses `id`). */
  districtId?: string | null;
  facilityId?: string | null;
};

/** Role → permissions (FND-06 `ROLE_PERMISSIONS`, or a variant in a test). */
export type CapabilityMatrix = Readonly<Record<Role, readonly Permission[]>>;

export type EvaluateAccessOptions = {
  /** Persona fallback for the role / scope when there is no grant (and the citizen rule). */
  persona?: ScopePersona | null;
  /** Demo-clock instant for the validity window (omitted = never expired). */
  now?: Date | string;
  facilityToDistrict?: FacilityToDistrict;
};

export type AccessEvaluation = {
  allowed: boolean;
  reasonCode: AccessReasonCode;
  /** The capability that was required (first of the any-of list). */
  permission: Permission | null;
  /** The role the decision used (grant role, else persona role). */
  role: Role | null;
};

function locate(resource: AccessResource): ScopedResource {
  if (resource.type === "district") return { districtId: resource.id as DistrictId };
  if (resource.type === "facility") return { facilityId: resource.id as FacilityId };
  const located: ScopedResource = {};
  if (resource.districtId) located.districtId = resource.districtId as DistrictId;
  if (resource.facilityId) located.facilityId = resource.facilityId as FacilityId;
  return located;
}

export function evaluateAccess(
  grant: AccessGrantLike | null | undefined,
  matrix: CapabilityMatrix,
  resource: AccessResource,
  options: EvaluateAccessOptions = {},
): AccessEvaluation {
  const role = grant?.role ?? options.persona?.role ?? null;
  const permissions =
    resource.permissions ??
    (resource.type === "page" ? [] : RESOURCE_TYPE_CAPABILITIES[resource.type]);
  const permission = permissions[0] ?? null;
  const decide = (reasonCode: AccessReasonCode): AccessEvaluation => ({
    allowed: reasonCode === "OK",
    reasonCode,
    permission,
    role,
  });

  if (grant && options.now !== undefined && isGrantExpired(grant, options.now)) {
    return decide("GRANT_EXPIRED");
  }
  if (role === null) return decide("MISSING_CAPABILITY");
  const held = matrix[role];
  if (permissions.length > 0 && !permissions.some((p) => held.includes(p))) {
    return decide("MISSING_CAPABILITY");
  }

  const located = locate(resource);
  if (located.districtId === undefined && located.facilityId === undefined) return decide("OK");
  const persona: ScopePersona = {
    facilityIds: [],
    districtIds: [],
    programmeWide: false,
    linkedPatientIds: [],
    ...(options.persona ?? {}),
    role,
  };
  const scope = scopeForPersona(persona, grant);
  if (isResourceInScope(scope, located, options.facilityToDistrict)) return decide("OK");
  return decide(located.facilityId ? "OUT_OF_SCOPE_FACILITY" : "OUT_OF_SCOPE_DISTRICT");
}
