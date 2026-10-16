import {
  asId,
  ROLES,
  type DemoPersona,
  type PatientId,
  type PersonaId,
  type Role,
} from "@laif/domain";
import { createSeed, DISTRICT_IDS, FACILITY_IDS, getScenario, PERSONA_IDS } from "@laif/mock-data";
import { describe, expect, it } from "vitest";

import { actorForPersona, can, checkAccess, type ActorContext } from "./check-access.ts";
import {
  DEMO_TOOLING_PERMISSIONS,
  PERMISSIONS,
  permissionMatrixRows,
  ROLE_PERMISSIONS,
  rolesWithPermission,
  type Permission,
} from "./permissions.ts";

const seed = createSeed();
const persona = (id: PersonaId): DemoPersona => {
  const p = seed.personas.find((x) => x.id === id);
  if (!p) throw new Error(`persona ${id} missing`);
  return p;
};
const actor = (id: PersonaId): ActorContext => actorForPersona(persona(id));

/**
 * The full role × permission matrix (demo matrix, requires approval), written out independently
 * of ROLE_PERMISSIONS. Column order = PERMISSIONS. Y = granted.
 */
// prettier-ignore
const EXPECTED: Record<Role, string> = {
  //                       pr pg sc sa rr rd rm rc fr fu ta tr ar as ae mr md pa qt ea rc sp sr sm sq dr dt
  clinician:               "Y  .  .  Y  Y  Y  Y  Y  .  Y  Y  Y  Y  .  .  .  .  .  .  .  .  .  .  .  .  Y  Y",
  nurse_reviewer:          "Y  .  .  Y  Y  Y  Y  Y  .  Y  Y  Y  Y  .  .  .  .  .  .  .  .  .  .  .  .  Y  Y",
  facility_coordinator:    "Y  .  .  .  Y  .  Y  Y  .  Y  Y  Y  Y  .  Y  .  .  .  .  .  .  .  .  .  .  Y  Y",
  community_health_worker: "Y  Y  Y  Y  .  .  .  .  Y  Y  .  Y  .  .  .  .  .  .  .  .  .  .  .  .  .  Y  Y",
  field_supervisor:        "Y  Y  Y  Y  .  .  .  .  Y  Y  .  Y  .  .  .  .  .  .  .  .  .  .  .  .  .  Y  Y",
  programme_lead:          ".  .  .  .  .  .  .  .  .  .  .  .  Y  .  .  Y  Y  Y  Y  Y  Y  Y  .  .  .  Y  Y",
  district_analyst:        ".  .  .  .  .  .  .  .  .  .  .  .  .  Y  .  Y  Y  Y  Y  Y  .  .  .  .  .  Y  Y",
  facility_manager:        ".  .  .  .  .  .  .  .  .  .  .  .  .  .  .  Y  Y  .  Y  .  .  .  .  .  .  Y  Y",
  auditor:                 ".  .  .  .  .  .  .  .  .  .  .  .  Y  .  .  Y  .  .  .  .  .  .  .  .  .  Y  Y",
  citizen:                 ".  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  Y  Y  Y  Y  Y",
};

const cases = ROLES.flatMap((role) => {
  const flags = EXPECTED[role].split(/\s+/);
  return PERMISSIONS.map((permission, i) => ({ role, permission, granted: flags[i] === "Y" }));
});

describe("role × permission matrix (10 roles × 27 permissions)", () => {
  it("covers every role and permission", () => {
    expect(Object.keys(ROLE_PERMISSIONS).sort()).toEqual([...ROLES].sort());
    expect(PERMISSIONS).toHaveLength(27);
    expect(cases).toHaveLength(270);
    for (const role of ROLES) expect(EXPECTED[role].split(/\s+/)).toHaveLength(27);
  });

  it.each(cases)("$role · $permission → $granted", ({ role, permission, granted }) => {
    const a: ActorContext = { personaId: asId<PersonaId>("p"), role, scope: { kind: "programme" } };
    expect(checkAccess(a, permission)).toEqual(
      granted ? { allowed: true } : { allowed: false, reason: "ROLE" },
    );
  });

  it("matrix rows and reverse lookups agree with ROLE_PERMISSIONS", () => {
    for (const row of permissionMatrixRows()) {
      for (const p of PERMISSIONS)
        expect(row.grants[p]).toBe(ROLE_PERMISSIONS[row.role].includes(p));
    }
    expect(rolesWithPermission("audit.export")).toEqual(["facility_coordinator"]);
    expect(rolesWithPermission("roles.configure")).toEqual(["programme_lead"]);
    for (const p of DEMO_TOOLING_PERMISSIONS) expect(rolesWithPermission(p)).toEqual([...ROLES]);
  });
});

describe("checkAccess acceptance", () => {
  it("SCN-11: district analyst Alpha cannot read District Beta metrics (SCOPE)", () => {
    const scn = getScenario("SCN-11-unauthorized-district-access");
    const analyst = actor(scn.anchors.personaId!);
    expect(checkAccess(analyst, "metrics.read", { districtId: DISTRICT_IDS.beta })).toEqual({
      allowed: false,
      reason: "SCOPE",
    });
    expect(checkAccess(analyst, "metrics.read", { facilityId: FACILITY_IDS.beta1 })).toEqual({
      allowed: false,
      reason: "SCOPE",
    });
    expect(checkAccess(analyst, "metrics.read", { districtId: DISTRICT_IDS.alpha })).toEqual({
      allowed: true,
    });
  });

  it("a citizen cannot read another patient (SCOPE) but can read their own", () => {
    const citizen = persona(PERSONA_IDS.citizen1);
    const own = citizen.linkedPatientIds[0] as PatientId;
    const other = seed.patients.find((p) => !citizen.linkedPatientIds.includes(p.id))!.id;
    const a = actorForPersona(citizen);
    expect(checkAccess(a, "self.read", { patientId: own })).toEqual({ allowed: true });
    expect(checkAccess(a, "self.read", { patientId: other })).toEqual({
      allowed: false,
      reason: "SCOPE",
    });
  });

  it("legal representative (CTZ-P4) reads the represented patient only", () => {
    const rep = persona(PERSONA_IDS.citizenRep);
    const a = actorForPersona(rep);
    expect(a.scope).toEqual({ kind: "self", patientIds: rep.linkedPatientIds });
    expect(can(a, "self.read", { patientId: rep.linkedPatientIds[0]! })).toBe(true);
    const pending = actorForPersona(persona(PERSONA_IDS.citizenPending));
    expect(can(pending, "self.read", { patientId: rep.linkedPatientIds[0]! })).toBe(false);
  });

  it("a CHW cannot decide reviews (ROLE)", () => {
    expect(checkAccess(actor(PERSONA_IDS.chwAlpha1A), "review.decide")).toEqual({
      allowed: false,
      reason: "ROLE",
    });
    expect(
      checkAccess(actor(PERSONA_IDS.chwAlpha1A), "review.decide", {
        facilityId: FACILITY_IDS.alpha1,
      }),
    ).toEqual({ allowed: false, reason: "ROLE" });
  });

  it("clinicians are limited to their facilities; coordinators to theirs", () => {
    const clin = actor(PERSONA_IDS.clinAlpha1);
    expect(can(clin, "review.decide", { facilityId: FACILITY_IDS.alpha1 })).toBe(true);
    expect(checkAccess(clin, "review.decide", { facilityId: FACILITY_IDS.alpha2 })).toEqual({
      allowed: false,
      reason: "SCOPE",
    });
    expect(checkAccess(clin, "audit.read", { facilityId: FACILITY_IDS.beta1 })).toEqual({
      allowed: false,
      reason: "SCOPE",
    });
    const coord = actor(PERSONA_IDS.coordAlpha);
    expect(can(coord, "audit.export", { facilityId: FACILITY_IDS.alpha2 })).toBe(true);
    expect(checkAccess(coord, "review.decide", { facilityId: FACILITY_IDS.alpha1 })).toEqual({
      allowed: false,
      reason: "ROLE",
    });
  });

  it("CHW follow-ups are limited to their own assignments; supervisors are not", () => {
    const chw = actor(PERSONA_IDS.chwAlpha1A);
    const mine = seed.followUps.find((f) => f.assignedWorkerId === PERSONA_IDS.chwAlpha1A)!;
    const other = seed.followUps.find(
      (f) => f.facilityId === FACILITY_IDS.alpha1 && f.assignedWorkerId !== PERSONA_IDS.chwAlpha1A,
    )!;
    const res = (f: typeof mine) => ({
      facilityId: f.facilityId,
      assignedWorkerId: f.assignedWorkerId,
    });
    expect(can(chw, "followup.update", res(mine))).toBe(true);
    expect(checkAccess(chw, "followup.update", res(other))).toEqual({
      allowed: false,
      reason: "SCOPE",
    });
    expect(
      can(chw, "followup.read_assigned", {
        facilityId: FACILITY_IDS.alpha1,
        assignedWorkerId: null,
      }),
    ).toBe(false);
    // Fails closed: a follow-up resource without `assignedWorkerId` is denied (FND-07 fix).
    expect(checkAccess(chw, "followup.update", { facilityId: FACILITY_IDS.alpha1 })).toEqual({
      allowed: false,
      reason: "SCOPE",
    });
    expect(can(chw, "followup.read_assigned", { facilityId: FACILITY_IDS.alpha1 })).toBe(false);
    // Role-only checks (no resource) are unaffected.
    expect(can(chw, "followup.update")).toBe(true);
    // Assignment limit only applies to follow-up permissions.
    expect(can(chw, "patient.read", { facilityId: FACILITY_IDS.alpha1 })).toBe(true);
    const sup = actor(PERSONA_IDS.supAlpha);
    expect(can(sup, "followup.update", res(other))).toBe(true);
    expect(can(sup, "followup.update", { facilityId: FACILITY_IDS.beta1 })).toBe(false);
  });

  it("programme-wide personas see every district; facility managers only their facility", () => {
    const lead = actor(PERSONA_IDS.leadProgramme);
    expect(lead.scope).toEqual({ kind: "programme" });
    expect(can(lead, "metrics.drilldown", { districtId: DISTRICT_IDS.beta })).toBe(true);
    const fm = actor(PERSONA_IDS.fmgrAlpha1);
    expect(can(fm, "metrics.read", { facilityId: FACILITY_IDS.alpha1 })).toBe(true);
    expect(can(fm, "metrics.read", { districtId: DISTRICT_IDS.alpha })).toBe(false);
    const auditor = actor(PERSONA_IDS.auditorProgramme);
    expect(checkAccess(auditor, "metrics.drilldown")).toEqual({ allowed: false, reason: "ROLE" });
  });

  it("a revoked device session denies everything except demo tooling", () => {
    const chw = persona(PERSONA_IDS.chwAlpha1A);
    const revoked = actorForPersona(chw, {
      deviceSession: { id: asId("ds-1"), status: "revoked" },
    });
    expect(revoked.deviceSessionId).toBe("ds-1");
    expect(checkAccess(revoked, "screening.create", { facilityId: FACILITY_IDS.alpha1 })).toEqual({
      allowed: false,
      reason: "SESSION_REVOKED",
    });
    expect(checkAccess(revoked, "review.decide")).toEqual({
      allowed: false,
      reason: "SESSION_REVOKED",
    });
    expect(checkAccess(revoked, "demo.reset")).toEqual({ allowed: true });
    const active = actorForPersona(chw, { deviceSession: { id: asId("ds-2"), status: "active" } });
    expect(can(active, "screening.create", { facilityId: FACILITY_IDS.alpha1 })).toBe(true);
  });

  it("demo tooling is granted to every persona regardless of scope", () => {
    for (const p of seed.personas) {
      for (const perm of DEMO_TOOLING_PERMISSIONS as readonly Permission[]) {
        expect(can(actorForPersona(p), perm, { districtId: DISTRICT_IDS.beta })).toBe(true);
      }
    }
  });
});
