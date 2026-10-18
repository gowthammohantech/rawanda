/**
 * `evaluateAccess` (ADM-08): the four admin personas × every resource type × the capability
 * matrix, the expired grant, grant role overrides and the no-grant fallback.
 */
import type { DistrictId, FacilityId } from "@laif/domain";
import {
  buildAdminAccessGrants,
  DEMO_PERSONAS,
  DISTRICT_IDS,
  FACILITY_IDS,
  PERSONA_IDS,
} from "@laif/mock-data";
import { describe, expect, it } from "vitest";

import { actorForPersona, checkAccess } from "./check-access.ts";
import {
  ACCESS_REASON_CODES,
  evaluateAccess,
  type AccessReasonCode,
  type AccessResource,
} from "./evaluateAccess.ts";
import { ROLE_PERMISSIONS, roleHasPermission } from "./permissions.ts";

const NOW = "2026-10-14T06:00:00.000Z";
const grants = buildAdminAccessGrants("2026-07-16T06:00:00.000Z");
const grantOf = (personaId: string) => {
  const grant = grants.find((g) => g.personaId === personaId);
  if (!grant) throw new Error(personaId);
  return grant;
};
const personaOf = (personaId: string) => {
  const persona = DEMO_PERSONAS.find((p) => p.id === personaId);
  if (!persona) throw new Error(personaId);
  return persona;
};

const { alpha, beta } = DISTRICT_IDS;
const { alpha1, alpha2, beta1 } = FACILITY_IDS;

const R = {
  dAlpha: { type: "district", id: alpha },
  dBeta: { type: "district", id: beta },
  fAlpha1: { type: "facility", id: alpha1 },
  fAlpha2: { type: "facility", id: alpha2 },
  fBeta1: { type: "facility", id: beta1 },
  pageGovernance: {
    type: "page",
    id: "governance",
    permissions: ["audit.read", "audit.read_scoped"],
  },
  pageFunnelStage: { type: "page", id: "funnelStage", permissions: ["metrics.drilldown"] },
  exportAlpha: { type: "export", id: alpha, districtId: alpha },
  exportBeta: { type: "export", id: beta, districtId: beta },
  drillAlpha1: { type: "drilldown", id: alpha1, facilityId: alpha1 },
} as const satisfies Record<string, AccessResource>;
type Key = keyof typeof R;

const OK: AccessReasonCode = "OK";
const CAP: AccessReasonCode = "MISSING_CAPABILITY";
const OSD: AccessReasonCode = "OUT_OF_SCOPE_DISTRICT";
const OSF: AccessReasonCode = "OUT_OF_SCOPE_FACILITY";

/** Expected reason per persona and resource (seed grants, FND-06 matrix). */
const MATRIX: Record<string, Record<Key, AccessReasonCode>> = {
  [PERSONA_IDS.leadProgramme]: {
    dAlpha: OK,
    dBeta: OK,
    fAlpha1: OK,
    fAlpha2: OK,
    fBeta1: OK,
    pageGovernance: OK,
    pageFunnelStage: OK,
    exportAlpha: OK,
    exportBeta: OK,
    drillAlpha1: OK,
  },
  [PERSONA_IDS.analystAlpha]: {
    dAlpha: OK,
    dBeta: OSD,
    fAlpha1: OK,
    fAlpha2: OK,
    fBeta1: OSF,
    pageGovernance: OK,
    pageFunnelStage: OK,
    exportAlpha: OK,
    exportBeta: OSD,
    drillAlpha1: OK,
  },
  [PERSONA_IDS.fmgrAlpha1]: {
    // Facility scope: a district aggregate also covers other facilities.
    dAlpha: OSD,
    dBeta: OSD,
    fAlpha1: OK,
    fAlpha2: OSF,
    fBeta1: OSF,
    pageGovernance: CAP,
    pageFunnelStage: OK,
    exportAlpha: CAP,
    exportBeta: CAP,
    drillAlpha1: OK,
  },
  [PERSONA_IDS.auditorProgramme]: {
    dAlpha: OK,
    dBeta: OK,
    fAlpha1: OK,
    fAlpha2: OK,
    fBeta1: OK,
    pageGovernance: OK,
    pageFunnelStage: CAP,
    exportAlpha: CAP,
    exportBeta: CAP,
    drillAlpha1: CAP,
  },
};

describe("evaluateAccess", () => {
  const cases = Object.entries(MATRIX).flatMap(([personaId, row]) =>
    (Object.keys(R) as Key[]).map((key) => [personaId, key, row[key]] as const),
  );

  it.each(cases)("%s × %s → %s", (personaId, key, expected) => {
    const result = evaluateAccess(grantOf(personaId), ROLE_PERMISSIONS, R[key], {
      persona: personaOf(personaId),
      now: NOW,
    });
    expect(result.reasonCode).toBe(expected);
    expect(result.allowed).toBe(expected === "OK");
    expect(result.role).toBe(grantOf(personaId).role);
  });

  it("agrees with checkAccess on the same actor (simulator cannot drift from enforcement)", () => {
    for (const [personaId, row] of Object.entries(MATRIX)) {
      const persona = personaOf(personaId);
      const actor = actorForPersona(persona, { grant: grantOf(personaId), now: NOW });
      for (const key of Object.keys(R) as Key[]) {
        const resource: AccessResource = R[key];
        const permissions = resource.permissions ?? [];
        if (resource.type === "page") {
          const allowed = permissions.some((p) => checkAccess(actor, p).allowed);
          expect(allowed, `${personaId} ${key}`).toBe(row[key] === "OK");
        }
        if (resource.type === "district") {
          expect(
            checkAccess(actor, "metrics.read", { districtId: resource.id as DistrictId }).allowed,
            `${personaId} ${key}`,
          ).toBe(row[key] === "OK");
        }
        if (resource.type === "facility") {
          expect(
            checkAccess(actor, "metrics.read", { facilityId: resource.id as FacilityId }).allowed,
            `${personaId} ${key}`,
          ).toBe(row[key] === "OK");
        }
      }
    }
  });

  it("an expired grant denies everything with GRANT_EXPIRED (checked first)", () => {
    const grant = { ...grantOf(PERSONA_IDS.leadProgramme), validTo: "2026-10-01T00:00:00.000Z" };
    for (const key of Object.keys(R) as Key[]) {
      const result = evaluateAccess(grant, ROLE_PERMISSIONS, R[key], { now: NOW });
      expect(result).toMatchObject({ allowed: false, reasonCode: "GRANT_EXPIRED" });
    }
    // validTo is exclusive: at the instant itself the grant is over; before it, it applies.
    expect(
      evaluateAccess({ ...grant, validTo: NOW }, ROLE_PERMISSIONS, R.dAlpha, { now: NOW })
        .reasonCode,
    ).toBe("GRANT_EXPIRED");
    expect(
      evaluateAccess(
        { ...grant, validTo: "2026-12-31T00:00:00.000Z" },
        ROLE_PERMISSIONS,
        R.dAlpha,
        { now: NOW },
      ).reasonCode,
    ).toBe("OK");
    // The actor of an expired grant has an empty scope (fails closed).
    const actor = actorForPersona(personaOf(PERSONA_IDS.leadProgramme), { grant, now: NOW });
    expect(actor.scope).toEqual({ kind: "facility", facilityIds: [] });
  });

  it("the grant role wins over the persona role (role configuration)", () => {
    const analyst = personaOf(PERSONA_IDS.analystAlpha);
    const asManager = { ...grantOf(PERSONA_IDS.analystAlpha), role: "facility_manager" as const };
    expect(
      evaluateAccess(asManager, ROLE_PERMISSIONS, R.exportAlpha, { persona: analyst }).reasonCode,
    ).toBe("MISSING_CAPABILITY");
    expect(actorForPersona(analyst, { grant: asManager }).role).toBe("facility_manager");
  });

  it("a narrowed facility list takes effect at once; unknown ids are out of scope", () => {
    const narrowed = { ...grantOf(PERSONA_IDS.analystAlpha), facilityIds: [alpha2] };
    expect(evaluateAccess(narrowed, ROLE_PERMISSIONS, R.fAlpha1).reasonCode).toBe(OSF);
    expect(evaluateAccess(narrowed, ROLE_PERMISSIONS, R.fAlpha2).reasonCode).toBe(OK);
    expect(evaluateAccess(narrowed, ROLE_PERMISSIONS, R.dAlpha).reasonCode).toBe(OSD);
    expect(
      evaluateAccess(grantOf(PERSONA_IDS.analystAlpha), ROLE_PERMISSIONS, {
        type: "facility",
        id: "fac-zeta",
      }).reasonCode,
    ).toBe(OSF);
  });

  it("without a grant it falls back to the persona; with neither, capability is missing", () => {
    const lead = personaOf(PERSONA_IDS.leadProgramme);
    expect(evaluateAccess(null, ROLE_PERMISSIONS, R.dBeta, { persona: lead }).reasonCode).toBe(OK);
    expect(evaluateAccess(null, ROLE_PERMISSIONS, R.dBeta).reasonCode).toBe(CAP);
  });

  it("a custom matrix is honoured and every reason code is reachable", () => {
    const lead = grantOf(PERSONA_IDS.leadProgramme);
    const matrix = { ...ROLE_PERMISSIONS, programme_lead: [] };
    expect(evaluateAccess(lead, matrix, R.dAlpha).reasonCode).toBe(CAP);
    expect(roleHasPermission("programme_lead", "metrics.read")).toBe(true);
    const seen = new Set(cases.map(([, , code]) => code));
    seen.add("GRANT_EXPIRED");
    expect([...seen].sort()).toEqual([...ACCESS_REASON_CODES].sort());
  });
});
