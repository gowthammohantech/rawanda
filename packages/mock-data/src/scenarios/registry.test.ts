import { ENTITY_SCHEMAS } from "@laif/contracts";
import { enResources, rwResources } from "@laif/i18n";
import { describe, expect, it } from "vitest";

import { DEMO_SMALL_CELL_THRESHOLD } from "../config/privacy.ts";
import { createSeed } from "../seed/generate.ts";
import type { SeedDataset } from "../seed/types.ts";
import { applyScenario, getScenario, SCENARIO_IDS, SCENARIOS } from "./registry.ts";

const seed = createSeed();

const lookup = (catalogue: object, key: string): unknown => {
  const [ns, path] = key.split(":") as [string, string];
  let node: unknown = (catalogue as Record<string, unknown>)[ns];
  for (const part of path.split(".")) node = (node as Record<string, unknown> | undefined)?.[part];
  return node;
};

const exists = (data: SeedDataset, rows: keyof SeedDataset, id: string | undefined) =>
  id === undefined || (data[rows] as Array<{ id: string }>).some((r) => r.id === id);

describe("scenario registry", () => {
  it("defines exactly the 12 scenarios in order", () => {
    expect(SCENARIOS.map((s) => s.id)).toEqual([...SCENARIO_IDS]);
    expect(SCENARIOS).toHaveLength(12);
  });

  it.each(SCENARIO_IDS)("%s resolves and every anchor exists after applyScenario", (id) => {
    const scenario = getScenario(id);
    const data = applyScenario(seed, id);
    const a = scenario.anchors;
    expect(exists(data, "patients", a.patientId)).toBe(true);
    expect(exists(data, "screenings", a.screeningId)).toBe(true);
    expect(exists(data, "reviews", a.reviewId)).toBe(true);
    expect(exists(data, "referrals", a.referralId)).toBe(true);
    expect(exists(data, "followUps", a.followUpId)).toBe(true);
    expect(exists(data, "personas", a.personaId)).toBe(true);
    expect(exists(data, "facilities", a.facilityId)).toBe(true);
    expect(exists(data, "districts", a.districtId)).toBe(true);
    for (const opId of a.syncOperationIds ?? [])
      expect(exists(data, "syncOperations", opId)).toBe(true);
    expect(Object.values(a).filter((v) => v !== undefined).length).toBeGreaterThan(0);
    for (const op of data.syncOperations)
      expect(ENTITY_SCHEMAS.sync_operation.safeParse(op).success).toBe(true);
    for (const s of data.screenings)
      expect(ENTITY_SCHEMAS.screening.safeParse(s).success).toBe(true);
  });

  it("has EN + RW title and description keys for every scenario", () => {
    for (const s of SCENARIOS) {
      for (const key of [s.titleKey, s.descriptionKey]) {
        expect(typeof lookup(enResources, key), key).toBe("string");
        expect(typeof lookup(rwResources, key), key).toBe("string");
      }
    }
  });

  it("never mutates the base seed", () => {
    const before = structuredClone(seed);
    for (const id of SCENARIO_IDS) applyScenario(seed, id);
    expect(seed).toEqual(before);
    expect(applyScenario(seed, "SCN-01-normal-screening")).toBe(seed);
  });

  it("throws for unknown scenarios", () => {
    expect(() => getScenario("SCN-99")).toThrow(RangeError);
  });

  it("SCN-01…06 guarantee their states", () => {
    const g = (id: string) => getScenario(id).anchors;
    expect(
      seed.screenings.find((s) => s.id === g("SCN-01-normal-screening").screeningId)?.status,
    ).toBe("no_review_required");
    const scn02 = seed.reviews.find((r) => r.id === g("SCN-02-flagged-screening").reviewId);
    expect(scn02?.status).toBe("pending");
    expect(scn02?.evidenceSnapshot.flag.triggeringObservations.length).toBeGreaterThan(0);
    expect(
      seed.reviews.find((r) => r.id === g("SCN-03-clinician-dismissal").reviewId)?.status,
    ).toBe("dismissed_with_reason");
    const scn04 = seed.referrals.find((r) => r.id === g("SCN-04-overdue-referral").referralId);
    expect(scn04?.status).toBe("scheduled");
    expect(Date.parse(scn04?.dueAt ?? "")).toBeLessThan(Date.parse(seed.meta.demoClockIso));
    const scn05 = seed.followUps.find((f) => f.id === g("SCN-05-completed-follow-up").followUpId);
    expect(scn05?.status).toBe("completed");
    expect(
      seed.careInstructions.some((c) => c.sourceId === scn05?.id && c.status === "released"),
    ).toBe(true);
    const scn06 = seed.screenings.find((s) => s.id === g("SCN-06-missing-unit").screeningId);
    expect(scn06?.glucoseUnit).toBeNull();
    expect(scn06?.flag?.reasonCodes).toContain("GLUCOSE_UNIT_MISSING");
    expect(
      seed.screenings.some(
        (s) => s.status === "draft" && s.glucoseValue !== null && s.glucoseUnit === null,
      ),
    ).toBe(true);
  });

  it("SCN-07 queues two ops with the same idempotency key", () => {
    const data = applyScenario(seed, "SCN-07-duplicate-submission");
    expect(data.syncOperations).toHaveLength(2);
    const [a, b] = data.syncOperations;
    expect(a?.idempotencyKey).toBe(b?.idempotencyKey);
    expect(a?.id).not.toBe(b?.id);
    expect(data.syncOperations.every((op) => op.status === "queued")).toBe(true);
  });

  it("SCN-08 queues 2 offline screenings for persona-chw-alpha1-a", () => {
    const data = applyScenario(seed, "SCN-08-offline-sync");
    expect(data.syncOperations).toHaveLength(2);
    expect(new Set(data.syncOperations.map((o) => o.idempotencyKey)).size).toBe(2);
    for (const op of data.syncOperations) {
      expect(op).toMatchObject({ status: "queued", entityType: "screening", opType: "create" });
      expect(data.screenings.find((s) => s.id === op.entityId)?.workerId).toBe(
        "persona-chw-alpha1-a",
      );
    }
    expect(data.screenings).toHaveLength(62);
  });

  it("SCN-09 queues a follow-up update one version behind", () => {
    const data = applyScenario(seed, "SCN-09-version-conflict");
    const op = data.syncOperations[0];
    const fu = data.followUps.find((f) => f.id === op?.entityId);
    expect(op).toMatchObject({ status: "queued", entityType: "follow_up", opType: "update" });
    expect(op?.baseVersion).toBe((fu?.version ?? 0) - 1);
  });

  it("SCN-10 anchors a consent-withdrawn patient with cancelled reminders and a citizen persona", () => {
    const a = getScenario("SCN-10-consent-withdrawn").anchors;
    expect(seed.patients.find((p) => p.id === a.patientId)?.consentState).toBe("withdrawn");
    expect(
      seed.reminders
        .filter((r) => r.patientId === a.patientId)
        .every((r) => r.status === "cancelled"),
    ).toBe(true);
    expect(seed.personas.find((p) => p.id === a.personaId)?.linkedPatientIds).toEqual([
      a.patientId,
    ]);
  });

  it("SCN-11 anchors the Alpha analyst and a District Beta resource", () => {
    const a = getScenario("SCN-11-unauthorized-district-access").anchors;
    const analyst = seed.personas.find((p) => p.id === a.personaId);
    expect(analyst?.districtIds).toEqual(["dist-alpha"]);
    expect(a.districtId).toBe("dist-beta");
    expect(analyst?.districtIds).not.toContain(a.districtId);
  });

  it("SCN-12 anchors a District Beta cell with a value of 1–4", () => {
    const a = getScenario("SCN-12-suppressed-small-aggregate").anchors;
    const value = seed.followUps.filter(
      (f) => f.facilityId === a.facilityId && f.status === "completed",
    ).length;
    expect(value).toBeGreaterThanOrEqual(1);
    expect(value).toBeLessThan(DEMO_SMALL_CELL_THRESHOLD);
  });
});
