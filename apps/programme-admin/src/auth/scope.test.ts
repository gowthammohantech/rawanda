/**
 * Grant × district × facility matrix (ADM-01 §10) on the seeded AccessGrants, unknown id →
 * not-found, and the repository defence in depth `assertScope`.
 */
import type { AccessGrant } from "@laif/contracts";
import { buildAdminAccessGrants, DISTRICT_IDS, FACILITY_IDS, PERSONA_IDS } from "@laif/mock-data";
import { RepositoryError } from "@laif/repositories";
import { describe, expect, it } from "vitest";

import { findAdminPersona, type AdminPersona } from "./personas.ts";
import {
  assertScope,
  checkScopeRequest,
  grantDistrictIds,
  grantFacilityIds,
  isDistrictInGrant,
  isFacilityInGrant,
  resolveScopeFromSearch,
} from "./scope.ts";

const grants = buildAdminAccessGrants("2026-07-16T06:00:00.000Z");
const subject = (personaId: string): [AdminPersona, AccessGrant] => {
  const persona = findAdminPersona(personaId);
  const grant = grants.find((g) => g.personaId === personaId);
  if (persona === null || grant === undefined) throw new Error(personaId);
  return [persona, grant];
};

const { alpha, beta } = DISTRICT_IDS;
const { alpha1, alpha2, beta1 } = FACILITY_IDS;

describe("grant matrix", () => {
  it.each([
    // persona, alpha, beta, alpha-1, alpha-2, beta-1
    [PERSONA_IDS.leadProgramme, true, true, true, true, true],
    [PERSONA_IDS.analystAlpha, true, false, true, true, false],
    // Facility scope: a district aggregate also covers other facilities → out of scope.
    [PERSONA_IDS.fmgrAlpha1, false, false, true, false, false],
    [PERSONA_IDS.auditorProgramme, true, true, true, true, true],
  ] as const)("%s", (personaId, dAlpha, dBeta, fA1, fA2, fB1) => {
    const [persona, grant] = subject(personaId);
    expect(isDistrictInGrant(persona, grant, alpha)).toBe(dAlpha);
    expect(isDistrictInGrant(persona, grant, beta)).toBe(dBeta);
    expect(isFacilityInGrant(persona, grant, alpha1)).toBe(fA1);
    expect(isFacilityInGrant(persona, grant, alpha2)).toBe(fA2);
    expect(isFacilityInGrant(persona, grant, beta1)).toBe(fB1);
  });

  it("lists the districts / facilities of a grant in reference order", () => {
    expect(grantDistrictIds(...subject(PERSONA_IDS.leadProgramme))).toEqual([alpha, beta]);
    expect(grantDistrictIds(...subject(PERSONA_IDS.fmgrAlpha1))).toEqual([]);
    expect(grantFacilityIds(...subject(PERSONA_IDS.fmgrAlpha1))).toEqual([alpha1]);
    expect(grantFacilityIds(...subject(PERSONA_IDS.analystAlpha))).toEqual([alpha1, alpha2]);
  });

  it("a grant edit (narrower facility list) takes effect on the next check", () => {
    const [persona, grant] = subject(PERSONA_IDS.analystAlpha);
    const narrowed = { ...grant, facilityIds: [alpha2], version: 2 };
    expect(isFacilityInGrant(persona, narrowed, alpha1)).toBe(false);
    expect(isFacilityInGrant(persona, narrowed, alpha2)).toBe(true);
  });
});

describe("resolveScopeFromSearch", () => {
  it("reads district / facility and ignores empty values", () => {
    expect(resolveScopeFromSearch("?district=dist-beta&facility=")).toEqual({
      districtId: "dist-beta",
      facilityId: null,
    });
    expect(resolveScopeFromSearch(new URLSearchParams("facility=fac-alpha-1"))).toEqual({
      districtId: null,
      facilityId: "fac-alpha-1",
    });
  });
});

describe("checkScopeRequest", () => {
  const [analyst, analystGrant] = subject(PERSONA_IDS.analystAlpha);
  const check = (search: string) =>
    checkScopeRequest(analyst, analystGrant, resolveScopeFromSearch(search));

  it("ok inside the grant (or without a scope in the URL)", () => {
    expect(check("")).toEqual({ status: "ok" });
    expect(check("?district=dist-alpha")).toEqual({ status: "ok" });
    expect(check("?district=dist-alpha&facility=fac-alpha-2")).toEqual({ status: "ok" });
  });

  it("forbidden for a known district / facility outside the grant", () => {
    expect(check("?district=dist-beta")).toEqual({
      status: "forbidden",
      kind: "district",
      id: beta,
    });
    expect(check("?facility=fac-beta-1")).toEqual({
      status: "forbidden",
      kind: "facility",
      id: beta1,
    });
  });

  it("not found for unknown ids or a facility outside the given district", () => {
    expect(check("?district=dist-gamma")).toEqual({
      status: "not_found",
      kind: "district",
      id: "dist-gamma",
    });
    expect(check("?facility=fac-zeta")).toMatchObject({ status: "not_found", kind: "facility" });
    expect(check("?district=dist-alpha&facility=fac-beta-1")).toMatchObject({
      status: "not_found",
      kind: "facility",
    });
  });

  it("facility manager: own facility only", () => {
    const [fmgr, grant] = subject(PERSONA_IDS.fmgrAlpha1);
    const own = (search: string) => checkScopeRequest(fmgr, grant, resolveScopeFromSearch(search));
    expect(own("?facility=fac-alpha-1").status).toBe("ok");
    expect(own("?facility=fac-alpha-2").status).toBe("forbidden");
    expect(own("?district=dist-alpha").status).toBe("forbidden");
  });
});

describe("assertScope (repository defence in depth)", () => {
  it("throws RepositoryError FORBIDDEN SCOPE for any out-of-grant district / facility", () => {
    const [persona, grant] = subject(PERSONA_IDS.analystAlpha);
    expect(() => assertScope(persona, grant, { districtIds: [alpha] })).not.toThrow();
    expect(() => assertScope(persona, grant, {})).not.toThrow();
    let caught: unknown;
    try {
      assertScope(persona, grant, { districtIds: [alpha, beta] });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(RepositoryError);
    expect(caught).toMatchObject({
      code: "FORBIDDEN",
      reason: "SCOPE",
      details: { entityType: "district", entityId: beta },
    });
    expect(() => assertScope(persona, grant, { facilityIds: [beta1] })).toThrow(RepositoryError);
    // Manipulated in-memory state: a grant without districts covers nothing.
    expect(() =>
      assertScope(persona, { ...grant, districtIds: [] }, { districtIds: [alpha] }),
    ).toThrow(RepositoryError);
  });
});
