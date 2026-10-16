import { DEMO_PERSONAS, DISTRICT_IDS, FACILITY_IDS, PERSONA_IDS } from "@laif/mock-data";
import { describe, expect, it } from "vitest";

import { actorForPersona } from "./check-access.ts";
import { type ForbiddenError, guardRoute, isForbiddenError, requirePermission } from "./guards.ts";

const actor = (id: string) => actorForPersona(DEMO_PERSONAS.find((p) => p.id === id)!);

describe("requirePermission", () => {
  it("returns silently when allowed", () => {
    expect(() =>
      requirePermission(actor(PERSONA_IDS.clinAlpha1), "review.decide", {
        facilityId: FACILITY_IDS.alpha1,
      }),
    ).not.toThrow();
  });

  it("throws ForbiddenError with code, status, reason and permission", () => {
    let caught: unknown;
    try {
      requirePermission(actor(PERSONA_IDS.analystAlpha), "metrics.read", {
        districtId: DISTRICT_IDS.beta,
      });
    } catch (error) {
      caught = error;
    }
    expect(isForbiddenError(caught)).toBe(true);
    const err = caught as ForbiddenError;
    expect(err).toBeInstanceOf(Error);
    expect(err).toMatchObject({
      name: "ForbiddenError",
      code: "FORBIDDEN",
      status: 403,
      reason: "SCOPE",
      permission: "metrics.read",
      resource: { districtId: DISTRICT_IDS.beta },
    });
    expect(err.message).toContain("not authentication");
    expect(() => requirePermission(actor(PERSONA_IDS.chwAlpha1A), "review.decide")).toThrow(
      expect.objectContaining({ reason: "ROLE" }) as Error,
    );
    expect(isForbiddenError(new Error("x"))).toBe(false);
  });
});

describe("guardRoute", () => {
  it("distinguishes unauthenticated, forbidden and allowed", () => {
    expect(guardRoute(null, "review.read")).toEqual({ status: "unauthenticated" });
    expect(guardRoute(undefined, "review.read")).toEqual({ status: "unauthenticated" });
    expect(guardRoute(actor(PERSONA_IDS.coordAlpha), "review.decide")).toEqual({
      status: "forbidden",
      reason: "ROLE",
      permission: "review.decide",
    });
    expect(
      guardRoute(actor(PERSONA_IDS.coordAlpha), "audit.export", {
        facilityId: FACILITY_IDS.beta1,
      }),
    ).toEqual({ status: "forbidden", reason: "SCOPE", permission: "audit.export" });
    expect(guardRoute(actor(PERSONA_IDS.leadProgramme), "roles.configure")).toEqual({
      status: "allowed",
    });
  });
});
