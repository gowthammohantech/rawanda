import {
  asId,
  type DistrictId,
  type FacilityId,
  type PatientId,
  type PersonaId,
} from "@laif/domain";
import {
  createSeed,
  DEMO_PERSONAS,
  DISTRICT_IDS,
  FACILITY_IDS,
  FACILITY_TO_DISTRICT,
  PERSONA_IDS,
} from "@laif/mock-data";
import { describe, expect, it } from "vitest";

import {
  districtIdsInScope,
  facilityIdsInScope,
  isResourceInScope,
  scopeForPersona,
  type Scope,
} from "./scope.ts";

const seed = createSeed();
const spec = (id: PersonaId) => DEMO_PERSONAS.find((p) => p.id === id)!;
const { alpha1, alpha2, beta1 } = FACILITY_IDS;
const { alpha, beta } = DISTRICT_IDS;

describe("scopeForPersona", () => {
  it("derives a scope kind for each of the 18 personas", () => {
    const kinds = Object.fromEntries(DEMO_PERSONAS.map((p) => [p.id, scopeForPersona(p).kind]));
    expect(kinds).toEqual({
      [PERSONA_IDS.clinAlpha1]: "facility",
      [PERSONA_IDS.nurseAlpha2]: "facility",
      [PERSONA_IDS.coordAlpha]: "facility",
      [PERSONA_IDS.clinBeta1]: "facility",
      [PERSONA_IDS.chwAlpha1A]: "facility",
      [PERSONA_IDS.chwAlpha1B]: "facility",
      [PERSONA_IDS.chwAlpha2A]: "facility",
      [PERSONA_IDS.chwBeta1A]: "facility",
      [PERSONA_IDS.supAlpha]: "facility",
      [PERSONA_IDS.leadProgramme]: "programme",
      [PERSONA_IDS.analystAlpha]: "district",
      [PERSONA_IDS.fmgrAlpha1]: "facility",
      [PERSONA_IDS.auditorProgramme]: "programme",
      [PERSONA_IDS.citizen1]: "self",
      [PERSONA_IDS.citizen2]: "self",
      [PERSONA_IDS.citizenWithdrawn]: "self",
      [PERSONA_IDS.citizenRep]: "self",
      [PERSONA_IDS.citizenPending]: "self",
    });
    expect(scopeForPersona(spec(PERSONA_IDS.supAlpha))).toEqual({
      kind: "facility",
      facilityIds: [alpha1, alpha2],
    });
    expect(scopeForPersona(spec(PERSONA_IDS.analystAlpha))).toEqual({
      kind: "district",
      districtIds: [alpha],
    });
    expect(scopeForPersona(spec(PERSONA_IDS.citizenPending))).toEqual({
      kind: "self",
      patientIds: [],
    });
  });

  it("an AccessGrant overrides the persona defaults (grant edits apply on the next check)", () => {
    const analyst = spec(PERSONA_IDS.analystAlpha);
    const grant = {
      personaId: analyst.id,
      districtIds: [alpha],
      facilityIds: "ALL_IN_DISTRICTS" as const,
    };
    expect(scopeForPersona(analyst, grant)).toEqual({ kind: "district", districtIds: [alpha] });
    const widened = { ...grant, districtIds: [alpha, beta] };
    expect(isResourceInScope(scopeForPersona(analyst, widened), { districtId: beta })).toBe(true);
    const narrowed = { ...grant, facilityIds: [alpha2] };
    expect(scopeForPersona(analyst, narrowed)).toEqual({ kind: "facility", facilityIds: [alpha2] });
    // Programme lead with an "all districts" grant.
    const lead = spec(PERSONA_IDS.leadProgramme);
    const leadScope = scopeForPersona(lead, {
      personaId: lead.id,
      districtIds: [alpha, beta],
      facilityIds: [],
    });
    expect(leadScope).toEqual({ kind: "district", districtIds: [alpha, beta] });
    // Citizens are always self-scoped.
    const citizen = spec(PERSONA_IDS.citizen1);
    expect(scopeForPersona(citizen, grant).kind).toBe("self");
  });
});

describe("isResourceInScope", () => {
  const facility: Scope = { kind: "facility", facilityIds: [alpha1] };
  const district: Scope = { kind: "district", districtIds: [alpha] };
  const self: Scope = { kind: "self", patientIds: [asId<PatientId>("pat-1")] };

  it.each([
    [facility, { facilityId: alpha1 }, true],
    [facility, { facilityId: alpha2 }, false],
    [facility, { districtId: alpha }, false],
    [facility, { facilityId: alpha1, districtId: alpha }, true],
    [facility, { facilityId: alpha1, districtId: beta }, false],
    [facility, {}, true],
    [district, { districtId: alpha }, true],
    [district, { districtId: beta }, false],
    [district, { facilityId: alpha2 }, true],
    [district, { facilityId: beta1 }, false],
    [district, { facilityId: asId<FacilityId>("fac-unknown") }, false],
    [district, { facilityId: beta1, districtId: alpha }, false],
    [{ kind: "programme" }, { districtId: beta }, true],
    [self, { patientId: asId<PatientId>("pat-1") }, true],
    [self, { patientId: asId<PatientId>("pat-2") }, false],
    [self, { facilityId: alpha1 }, false],
    [self, {}, true],
  ] as const)("%o · %o → %s", (scope, resource, expected) => {
    expect(isResourceInScope(scope, resource)).toBe(expected);
  });

  it("uses the injected facility → district map", () => {
    const map = { "fac-x": asId<DistrictId>("dist-x") };
    const scope: Scope = { kind: "district", districtIds: [asId<DistrictId>("dist-x")] };
    expect(isResourceInScope(scope, { facilityId: asId<FacilityId>("fac-x") }, map)).toBe(true);
    expect(isResourceInScope(scope, { facilityId: alpha1 }, map)).toBe(false);
  });

  it("every seed facility resolves through FACILITY_TO_DISTRICT", () => {
    for (const f of seed.facilities) expect(FACILITY_TO_DISTRICT[f.id]).toBe(f.districtId);
  });
});

describe("scope helpers", () => {
  it("lists facilities and districts in scope", () => {
    expect(facilityIdsInScope({ kind: "district", districtIds: [alpha] }, seed.facilities)).toEqual(
      [alpha1, alpha2],
    );
    expect(facilityIdsInScope({ kind: "programme" }, seed.facilities)).toHaveLength(3);
    expect(facilityIdsInScope({ kind: "self", patientIds: [] }, seed.facilities)).toEqual([]);
    expect(districtIdsInScope({ kind: "programme" }, seed.districts)).toEqual([alpha, beta]);
    expect(districtIdsInScope({ kind: "district", districtIds: [beta] }, seed.districts)).toEqual([
      beta,
    ]);
    expect(districtIdsInScope({ kind: "facility", facilityIds: [alpha1] }, seed.districts)).toEqual(
      [],
    );
  });
});
