/**
 * Scope checks of the admin app (ADM-01 tasks 6–7). All decisions go through FND-06
 * `scopeForPersona(persona, grant)` + `isResourceInScope`, so the route guard, the nav and the
 * repository agree. DEMO ROLE SWITCH — NOT AUTHENTICATION.
 */
import { isResourceInScope, scopeForPersona, type Scope, type ScopePersona } from "@laif/auth-demo";
import type { AccessGrant } from "@laif/contracts";
import type { DistrictId, FacilityId } from "@laif/domain";
import { DISTRICTS_REFERENCE, FACILITIES_REFERENCE } from "@laif/mock-data";
import { RepositoryError } from "@laif/repositories";

export type ReferenceData = {
  districts: ReadonlyArray<{ id: string }>;
  facilities: ReadonlyArray<{ id: string; districtId: string }>;
};

export const SEED_REFERENCE: ReferenceData = {
  districts: DISTRICTS_REFERENCE,
  facilities: FACILITIES_REFERENCE,
};

/** Scope part of an admin URL: `?district=<id>&facility=<id>` (empty values ignored). */
export type ScopeRequest = { districtId: string | null; facilityId: string | null };

export function resolveScopeFromSearch(search: string | URLSearchParams): ScopeRequest {
  const params = typeof search === "string" ? new URLSearchParams(search) : search;
  const value = (name: string): string | null => {
    const raw = params.get(name)?.trim() ?? "";
    return raw === "" ? null : raw;
  };
  return { districtId: value("district"), facilityId: value("facility") };
}

function facilityMap(reference: ReferenceData): Record<string, DistrictId> {
  return Object.fromEntries(reference.facilities.map((f) => [f.id, f.districtId as DistrictId]));
}

export function grantScope(persona: ScopePersona, grant: AccessGrant | null): Scope {
  return scopeForPersona(persona, grant);
}

/** True when a district-level aggregate of `districtId` lies inside the grant. */
export function isDistrictInGrant(
  persona: ScopePersona,
  grant: AccessGrant | null,
  districtId: string,
  reference: ReferenceData = SEED_REFERENCE,
): boolean {
  return isResourceInScope(
    grantScope(persona, grant),
    { districtId: districtId as DistrictId },
    facilityMap(reference),
  );
}

/** True when `facilityId` lies inside the grant (an unknown facility never does). */
export function isFacilityInGrant(
  persona: ScopePersona,
  grant: AccessGrant | null,
  facilityId: string,
  reference: ReferenceData = SEED_REFERENCE,
): boolean {
  if (!reference.facilities.some((f) => f.id === facilityId)) return false;
  return isResourceInScope(
    grantScope(persona, grant),
    { facilityId: facilityId as FacilityId },
    facilityMap(reference),
  );
}

export type ScopeCheck =
  | { status: "ok" }
  | { status: "not_found"; kind: "district" | "facility"; id: string }
  | { status: "forbidden"; kind: "district" | "facility"; id: string };

/**
 * Validates the URL scope against the grant: an unknown id (or a facility outside the given
 * district) is `not_found`; a known id outside the grant is `forbidden`.
 */
export function checkScopeRequest(
  persona: ScopePersona,
  grant: AccessGrant | null,
  request: ScopeRequest,
  reference: ReferenceData = SEED_REFERENCE,
): ScopeCheck {
  const { districtId, facilityId } = request;
  if (districtId !== null && !reference.districts.some((d) => d.id === districtId)) {
    return { status: "not_found", kind: "district", id: districtId };
  }
  if (facilityId !== null) {
    const facility = reference.facilities.find((f) => f.id === facilityId);
    if (!facility || (districtId !== null && facility.districtId !== districtId)) {
      return { status: "not_found", kind: "facility", id: facilityId };
    }
    if (!isFacilityInGrant(persona, grant, facilityId, reference)) {
      return { status: "forbidden", kind: "facility", id: facilityId };
    }
    // A facility inside the grant also covers its own district in the same URL.
    return { status: "ok" };
  }
  if (districtId !== null && !isDistrictInGrant(persona, grant, districtId, reference)) {
    return { status: "forbidden", kind: "district", id: districtId };
  }
  return { status: "ok" };
}

/** Filter shape the admin query functions (ADM-02 on) receive. */
export type ScopedFilter = {
  districtIds?: readonly string[] | null;
  facilityIds?: readonly string[] | null;
};

/**
 * Defence in depth (task 7): every admin query calls this before reading. Throws
 * `RepositoryError('FORBIDDEN', reason 'SCOPE')` when any district / facility of the filter is
 * outside the grant — covers manipulated in-memory state as well as URLs.
 */
export function assertScope(
  persona: ScopePersona,
  grant: AccessGrant | null,
  filter: ScopedFilter,
  reference: ReferenceData = SEED_REFERENCE,
): void {
  const deny = (entityType: "district" | "facility", entityId: string): never => {
    throw new RepositoryError("FORBIDDEN", {
      reason: "SCOPE",
      details: { entityType, entityId, grantId: grant?.id ?? null },
    });
  };
  for (const id of filter.districtIds ?? []) {
    if (!isDistrictInGrant(persona, grant, id, reference)) deny("district", id);
  }
  for (const id of filter.facilityIds ?? []) {
    if (!isFacilityInGrant(persona, grant, id, reference)) deny("facility", id);
  }
}

/** Districts of the grant, in reference order (for scope pickers and labels). */
export function grantDistrictIds(
  persona: ScopePersona,
  grant: AccessGrant | null,
  reference: ReferenceData = SEED_REFERENCE,
): string[] {
  return reference.districts
    .map((d) => d.id)
    .filter((id) => isDistrictInGrant(persona, grant, id, reference));
}

/** Facilities of the grant, in reference order. */
export function grantFacilityIds(
  persona: ScopePersona,
  grant: AccessGrant | null,
  reference: ReferenceData = SEED_REFERENCE,
): string[] {
  return reference.facilities
    .map((f) => f.id)
    .filter((id) => isFacilityInGrant(persona, grant, id, reference));
}
