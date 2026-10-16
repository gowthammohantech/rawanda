/**
 * Demo scope model (FND-06 task 3). Demo-only — not security.
 */
import type { DemoPersona, DistrictId, FacilityId, PatientId, PersonaId } from "@laif/domain";
import { FACILITY_TO_DISTRICT } from "@laif/mock-data";

export type Scope =
  | { kind: "facility"; facilityIds: readonly FacilityId[] }
  | { kind: "district"; districtIds: readonly DistrictId[] }
  | { kind: "programme" }
  /** Own record(s); several ids cover a legal representative (CTZ-P4). */
  | { kind: "self"; patientIds: readonly PatientId[] };

export type ScopeKind = Scope["kind"];

/**
 * Structural view of the ADM-01 `AccessGrant` (`AccessGrantSchema` lands in @laif/contracts in
 * ADM-01). Only the fields scope derivation needs.
 */
export type AccessGrantLike = {
  personaId: PersonaId;
  districtIds: readonly DistrictId[];
  facilityIds: readonly FacilityId[] | "ALL_IN_DISTRICTS";
};

export type ScopePersona = Pick<
  DemoPersona,
  "role" | "facilityIds" | "districtIds" | "programmeWide" | "linkedPatientIds"
>;

/**
 * Derives the actor scope. When an AccessGrant exists for the persona it wins (ADM-01/08), so a
 * grant edit takes effect on the next check:
 * - `facilityIds: 'ALL_IN_DISTRICTS'` (or an empty list) → district scope over `districtIds`;
 * - an explicit facility list → facility scope.
 * Without a grant: citizen → self (linked patients); `programmeWide` → programme; district ids →
 * district; otherwise facility scope over the persona facilities.
 */
export function scopeForPersona(persona: ScopePersona, grant?: AccessGrantLike | null): Scope {
  if (persona.role === "citizen") {
    return { kind: "self", patientIds: [...persona.linkedPatientIds] };
  }
  if (grant) {
    if (grant.facilityIds === "ALL_IN_DISTRICTS" || grant.facilityIds.length === 0) {
      return { kind: "district", districtIds: [...grant.districtIds] };
    }
    return { kind: "facility", facilityIds: [...grant.facilityIds] };
  }
  if (persona.programmeWide) return { kind: "programme" };
  if (persona.districtIds.length > 0) {
    return { kind: "district", districtIds: [...persona.districtIds] };
  }
  return { kind: "facility", facilityIds: [...persona.facilityIds] };
}

/** What a scope check looks at. Every given field must be in scope. */
export type ScopedResource = {
  facilityId?: FacilityId | null;
  districtId?: DistrictId | null;
  patientId?: PatientId | null;
  /**
   * Follow-up assignee. Only consulted by `checkAccess` for assignment-limited roles (CHW); a
   * present-but-null value (unassigned) does not match anyone.
   */
  assignedWorkerId?: PersonaId | null;
};

export type FacilityToDistrict = Readonly<Record<string, DistrictId>>;

/**
 * True when the resource lies inside the scope.
 * - `programme`: always.
 * - `facility`: the resource's facility must be listed; a district-only resource is out of scope
 *   (a district aggregate includes facilities outside the grant).
 * - `district`: the resource's district (given, or derived from its facility) must be listed; an
 *   unknown facility is out of scope.
 * - `self`: the resource must name one of the linked patients.
 * A resource with no locating field is unbound and in scope (role-only check).
 * A given `districtId` that contradicts the facility's district is out of scope.
 */
export function isResourceInScope(
  scope: Scope,
  resource: ScopedResource,
  facilityToDistrict: FacilityToDistrict = FACILITY_TO_DISTRICT,
): boolean {
  const facilityId = resource.facilityId ?? null;
  const districtId = resource.districtId ?? null;
  const patientId = resource.patientId ?? null;

  if (facilityId !== null && districtId !== null) {
    const actual = facilityToDistrict[facilityId];
    if (actual !== undefined && actual !== districtId) return false;
  }

  switch (scope.kind) {
    case "programme":
      return true;
    case "self":
      if (patientId === null) return facilityId === null && districtId === null;
      return scope.patientIds.includes(patientId);
    case "facility":
      if (facilityId !== null) return scope.facilityIds.includes(facilityId);
      return districtId === null;
    case "district": {
      const resolved = facilityId !== null ? facilityToDistrict[facilityId] : districtId;
      if (facilityId === null && districtId === null) return true;
      if (resolved === undefined || resolved === null) return false;
      return scope.districtIds.includes(resolved);
    }
  }
}

/** Facilities of `facilities` inside the scope (e.g. CLN-01 `permittedFacilityIds`). */
export function facilityIdsInScope(
  scope: Scope,
  facilities: ReadonlyArray<{ id: FacilityId; districtId: DistrictId }>,
): FacilityId[] {
  if (scope.kind === "self") return [];
  const map: FacilityToDistrict = Object.fromEntries(facilities.map((f) => [f.id, f.districtId]));
  return facilities
    .filter((f) => isResourceInScope(scope, { facilityId: f.id }, map))
    .map((f) => f.id);
}

/** Districts of `districts` inside the scope (district-level aggregates only). */
export function districtIdsInScope(
  scope: Scope,
  districts: ReadonlyArray<{ id: DistrictId }>,
): DistrictId[] {
  if (scope.kind === "programme") return districts.map((d) => d.id);
  if (scope.kind === "district")
    return districts.filter((d) => scope.districtIds.includes(d.id)).map((d) => d.id);
  return [];
}
