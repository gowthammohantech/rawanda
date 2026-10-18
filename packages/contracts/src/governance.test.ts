import { describe, expect, it } from "vitest";

import {
  AccessGrantSchema,
  ACCESS_GRANT_ROLES,
  createAccessGrantUpdateInputSchema,
  ENTITY_SCHEMAS,
} from "./index.ts";
import { errorKeys } from "./testing/fixtures.ts";

const NOW = new Date("2026-10-14T06:00:00.000Z");
const schema = createAccessGrantUpdateInputSchema({ now: () => NOW });
const ok = {
  idempotencyKey: "3f1c2a9e-8b7d-4c6e-9a1b-2d3e4f5a6b7c",
  id: "grant-persona-analyst-alpha",
  expectedVersion: 1,
  role: "district_analyst",
  districtIds: ["dist-alpha"],
  facilityIds: ["fac-alpha-2"],
  justification: "Supervision review limited to Alpha-2.",
};

describe("AccessGrant update input (ADM-08)", () => {
  it("accepts a valid edit, ALL_IN_DISTRICTS, a future validTo and a revoke", () => {
    expect(errorKeys(schema, ok)).toEqual({});
    expect(errorKeys(schema, { ...ok, facilityIds: "ALL_IN_DISTRICTS" })).toEqual({});
    expect(errorKeys(schema, { ...ok, validTo: "2026-12-31T21:59:59.999Z" })).toEqual({});
    // A past validTo is ignored on revoke (the repository sets it to now).
    expect(errorKeys(schema, { ...ok, revoke: true, validTo: "2026-01-01T00:00:00.000Z" })).toEqual(
      {},
    );
  });

  it("rejects an empty scope, a non-admin role, a short / long justification and a past validTo", () => {
    expect(errorKeys(schema, { ...ok, districtIds: [] })).toEqual({ districtIds: "required" });
    expect(errorKeys(schema, { ...ok, facilityIds: [] })).toEqual({ facilityIds: "required" });
    expect(errorKeys(schema, { ...ok, role: "clinician" })).toEqual({ role: "invalidEnum" });
    expect(errorKeys(schema, { ...ok, justification: "too short" })).toEqual({
      justification: "tooShort",
    });
    expect(errorKeys(schema, { ...ok, justification: "x".repeat(301) })).toEqual({
      justification: "tooLong",
    });
    expect(errorKeys(schema, { ...ok, validTo: "2026-10-01T00:00:00.000Z" })).toEqual({
      validTo: "dateMustBeFuture",
    });
  });

  it("four demo admin roles; the grant schema is the access_grant entity schema", () => {
    expect(ACCESS_GRANT_ROLES).toEqual([
      "programme_lead",
      "district_analyst",
      "facility_manager",
      "auditor",
    ]);
    expect(ENTITY_SCHEMAS.access_grant).toBe(AccessGrantSchema);
  });
});
