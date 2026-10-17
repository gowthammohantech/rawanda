import { describe, expect, it } from "vitest";

import { AccessGrantSchema, ALL_IN_DISTRICTS, TimeEntrySchema } from "./admin.ts";

const persisted = {
  version: 1,
  createdAt: "2026-08-16T06:00:00.000Z",
  updatedAt: "2026-08-16T06:00:00.000Z",
  synthetic: true,
};

const grant = {
  ...persisted,
  id: "grant-persona-analyst-alpha",
  personaId: "persona-analyst-alpha",
  role: "district_analyst",
  districtIds: ["dist-alpha"],
  facilityIds: ALL_IN_DISTRICTS,
  validFrom: "2026-08-16T06:00:00.000Z",
  updatedBy: "persona-lead-programme",
};

describe("AccessGrantSchema", () => {
  it("accepts ALL_IN_DISTRICTS or an explicit facility list", () => {
    expect(AccessGrantSchema.parse(grant).facilityIds).toBe(ALL_IN_DISTRICTS);
    expect(AccessGrantSchema.parse({ ...grant, facilityIds: ["fac-alpha-1"] }).facilityIds).toEqual(
      ["fac-alpha-1"],
    );
    expect(AccessGrantSchema.parse({ ...grant, validTo: "2026-12-31T00:00:00.000Z" }).validTo).toBe(
      "2026-12-31T00:00:00.000Z",
    );
  });

  it("rejects unknown roles, other facility tokens and non-synthetic records", () => {
    expect(AccessGrantSchema.safeParse({ ...grant, role: "superuser" }).success).toBe(false);
    expect(AccessGrantSchema.safeParse({ ...grant, facilityIds: "ALL" }).success).toBe(false);
    expect(AccessGrantSchema.safeParse({ ...grant, synthetic: false }).success).toBe(false);
    expect(AccessGrantSchema.safeParse({ ...grant, validTo: undefined }).success).toBe(false);
  });
});

describe("TimeEntrySchema", () => {
  const entry = {
    ...persisted,
    id: "time-1",
    workerId: "persona-chw-alpha1-a",
    facilityId: "fac-alpha-1",
    date: "2026-10-12",
    minutes: 95,
    activity: "screening",
    source: "self_reported_demo",
  };

  it("accepts a self-reported demo entry", () => {
    expect(TimeEntrySchema.parse(entry).minutes).toBe(95);
  });

  it("rejects unknown activities, negative minutes and non-date days", () => {
    expect(TimeEntrySchema.safeParse({ ...entry, activity: "lunch" }).success).toBe(false);
    expect(TimeEntrySchema.safeParse({ ...entry, minutes: -1 }).success).toBe(false);
    expect(TimeEntrySchema.safeParse({ ...entry, date: "12/10/2026" }).success).toBe(false);
    expect(TimeEntrySchema.safeParse({ ...entry, source: "measured" }).success).toBe(false);
  });
});
