/**
 * CLN-01: the clinical capability model is the FND-06 matrix (no clinical-only names, no
 * `authorisedReviewer` flag): clinician and the authorised nurse reviewer may decide reviews,
 * the facility coordinator may not; only the coordinator exports the audit log.
 */
import { PERMISSIONS, ROLE_PERMISSIONS } from "@laif/auth-demo";
import { DEMO_PERSONAS, FACILITY_IDS, PERSONA_IDS } from "@laif/mock-data";
import { describe, expect, it } from "vitest";

import {
  ACTION_CAPABILITY,
  capabilitiesForRole,
  CLINICAL_CAPABILITIES,
  CLINICAL_ROLES,
  roleCan,
  ROUTE_CAPABILITY,
} from "../capabilities.ts";
import { permittedFacilityIdsFor } from "../session-store.ts";

const MATRIX = {
  clinician: {
    "patient.read": true,
    "screening.amend": true,
    "review.read": true,
    "review.decide": true,
    "referral.manage": true,
    "referral.complete": true,
    "task.assign": true,
    "task.read": true,
    "audit.read": true,
    "audit.export": false,
    "demo.reset": true,
  },
  nurse_reviewer: {
    "patient.read": true,
    "screening.amend": true,
    "review.read": true,
    "review.decide": true,
    "referral.manage": true,
    "referral.complete": true,
    "task.assign": true,
    "task.read": true,
    "audit.read": true,
    "audit.export": false,
    "demo.reset": true,
  },
  facility_coordinator: {
    "patient.read": true,
    "screening.amend": false,
    "review.read": true,
    "review.decide": false,
    "referral.manage": true,
    "referral.complete": true,
    "task.assign": true,
    "task.read": true,
    "audit.read": true,
    "audit.export": true,
    "demo.reset": true,
  },
} as const;

describe("clinical capabilities", () => {
  it("are FND-06 permission names only", () => {
    for (const capability of CLINICAL_CAPABILITIES) {
      expect(PERMISSIONS).toContain(capability);
    }
    for (const capability of [
      ...Object.values(ROUTE_CAPABILITY),
      ...Object.values(ACTION_CAPABILITY),
    ]) {
      if (capability !== null) expect(CLINICAL_CAPABILITIES).toContain(capability);
    }
  });

  it.each(CLINICAL_ROLES)("role → capability matrix: %s", (role) => {
    for (const capability of CLINICAL_CAPABILITIES) {
      expect(roleCan(role, capability), `${role} ${capability}`).toBe(MATRIX[role][capability]);
      expect(roleCan(role, capability)).toBe(ROLE_PERMISSIONS[role].includes(capability));
    }
    expect(capabilitiesForRole(role)).toEqual(
      CLINICAL_CAPABILITIES.filter((capability) => MATRIX[role][capability]),
    );
  });

  it("maps the routes onto the phase's permissions", () => {
    expect(ROUTE_CAPABILITY).toEqual({
      queue: "review.read",
      patients: "patient.read",
      patient: "patient.read",
      review: "review.read",
      decision: "review.decide",
      referrals: "referral.manage",
      tasks: "task.assign",
      audit: "audit.read",
      settings: null,
    });
  });

  it("authorised review comes from the nurse_reviewer role, not an authorisedReviewer flag", () => {
    for (const persona of DEMO_PERSONAS) {
      expect(persona).not.toHaveProperty("authorisedReviewer");
    }
    const nurse = DEMO_PERSONAS.find((persona) => persona.id === PERSONA_IDS.nurseAlpha2);
    expect(nurse?.role).toBe("nurse_reviewer");
    expect(roleCan("nurse_reviewer", "review.decide")).toBe(true);
  });

  it("derives permitted facilities from the FND-06 scope (WF-04)", () => {
    const byId = (id: string) => DEMO_PERSONAS.find((persona) => persona.id === id)!;
    expect(permittedFacilityIdsFor(byId(PERSONA_IDS.clinAlpha1))).toEqual([FACILITY_IDS.alpha1]);
    expect(permittedFacilityIdsFor(byId(PERSONA_IDS.nurseAlpha2))).toEqual([FACILITY_IDS.alpha2]);
    expect(permittedFacilityIdsFor(byId(PERSONA_IDS.coordAlpha))).toEqual([
      FACILITY_IDS.alpha1,
      FACILITY_IDS.alpha2,
    ]);
    expect(permittedFacilityIdsFor(byId(PERSONA_IDS.clinBeta1))).toEqual([FACILITY_IDS.beta1]);
  });
});
