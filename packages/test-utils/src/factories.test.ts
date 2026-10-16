import { checkAccess } from "@laif/auth-demo";
import {
  FollowUpSchema,
  PatientSchema,
  ReferralSchema,
  ReviewSchema,
  ScreeningSchema,
} from "@laif/contracts";
import { asId, ROLES, type FacilityId } from "@laif/domain";
import { beforeEach, describe, expect, it } from "vitest";

import {
  buildActor,
  buildFollowUp,
  buildPatient,
  buildReferral,
  buildReview,
  buildScreening,
  resetFactorySequence,
} from "./factories.ts";

beforeEach(() => resetFactorySequence());

describe("entity factories", () => {
  it.each([
    ["patient", buildPatient, PatientSchema],
    ["screening", buildScreening, ScreeningSchema],
    ["review", buildReview, ReviewSchema],
    ["referral", buildReferral, ReferralSchema],
    ["follow-up", buildFollowUp, FollowUpSchema],
  ] as const)("%s is schema-valid and synthetic", (_name, build, schema) => {
    const entity = build();
    expect(entity.synthetic).toBe(true);
    const parsed = schema.safeParse(entity);
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
  });

  it("uses sequential ids per kind and restarts after resetFactorySequence", () => {
    expect([buildPatient().id, buildPatient().id]).toEqual([
      "test-patient-0001",
      "test-patient-0002",
    ]);
    expect(buildReferral().id).toBe("test-referral-0001");
    resetFactorySequence();
    expect(buildPatient().id).toBe("test-patient-0001");
  });

  it("applies overrides and stays valid", () => {
    const patient = buildPatient({ displayName: "Override Name", consentState: "withdrawn" });
    const screening = buildScreening({ patientId: patient.id, status: "draft", flag: null });
    expect(screening.patientId).toBe(patient.id);
    expect(ScreeningSchema.safeParse(screening).success).toBe(true);
    expect(PatientSchema.parse(patient).displayName).toBe("Override Name");
  });

  it("buildActor gives every role a default scope; scope checks work on it", () => {
    for (const role of ROLES) {
      const actor = buildActor(role);
      expect(actor.role).toBe(role);
      expect(actor.personaId).toMatch(new RegExp(`^test-persona-${role}-`));
      expect(checkAccess(actor, "demo.reset").allowed).toBe(true);
    }
    const clinician = buildActor("clinician");
    expect(clinician.scope).toEqual({ kind: "facility", facilityIds: ["fac-alpha-1"] });
    const alpha = { facilityId: asId<FacilityId>("fac-alpha-1") };
    const beta = { facilityId: asId<FacilityId>("fac-beta-1") };
    expect(checkAccess(clinician, "review.decide", alpha)).toEqual({ allowed: true });
    expect(checkAccess(clinician, "review.decide", beta)).toMatchObject({ reason: "SCOPE" });
    expect(buildActor("clinician", { kind: "programme" }).scope).toEqual({ kind: "programme" });
    expect(buildActor("citizen").scope.kind).toBe("self");
    expect(buildActor("programme_lead").scope).toEqual({ kind: "programme" });
  });
});
