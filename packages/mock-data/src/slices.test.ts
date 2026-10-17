import { describe, expect, it } from "vitest";

import { SEED_ANCHORS } from "./anchors.ts";
import { createSeed } from "./seed/generate.ts";
import { SEED_IDS } from "./seed/ids.ts";
import { SEED_COLLECTIONS } from "./seed/types.ts";
import { sliceForApp, type SliceOverlay } from "./slices.ts";

const seed = createSeed();

describe("sliceForApp", () => {
  it("clinical gets the full seed", () => {
    const slice = sliceForApp(seed, "clinical");
    for (const name of SEED_COLLECTIONS) expect(slice[name]).toEqual(seed[name]);
    expect(slice.slice).toEqual({ appId: "clinical", personaId: null });
    expect(slice.extraCollections).toEqual({});
  });

  it("admin gets the full seed plus the ADM-01 analytics overlay appended", () => {
    const slice = sliceForApp(seed, "admin");
    for (const name of SEED_COLLECTIONS) {
      const base = seed[name] as unknown[];
      expect((slice[name] as unknown[]).slice(0, base.length)).toEqual(base);
    }
    expect(slice.screenings.length).toBeGreaterThan(seed.screenings.length);
    expect(Object.keys(slice.extraCollections).sort()).toEqual(["accessGrants", "timeEntries"]);
    // Without the registered overlay the admin slice is exactly the base seed.
    const plain = sliceForApp(seed, "admin", undefined, { overlays: {} });
    for (const name of SEED_COLLECTIONS) expect(plain[name]).toEqual(seed[name]);
  });

  it("worker gets only the patients and tasks of the worker's facility", () => {
    const slice = sliceForApp(seed, "worker", "persona-chw-alpha1-a");
    expect(slice.patients).toHaveLength(18);
    expect(slice.patients.every((p) => p.facilityId === SEED_IDS.facilities.alpha1)).toBe(true);
    const ids = new Set(slice.patients.map((p) => p.id));
    for (const rows of [
      slice.screenings,
      slice.reviews,
      slice.referrals,
      slice.followUps,
      slice.reminders,
      slice.careInstructions,
    ]) {
      expect(rows.every((r) => ids.has(r.patientId))).toBe(true);
    }
    expect(slice.careTasks.every((t) => t.facilityId === SEED_IDS.facilities.alpha1)).toBe(true);
    expect(slice.careTasks.length).toBeGreaterThan(0);
    expect(slice.auditEvents.every((e) => e.facilityId === SEED_IDS.facilities.alpha1)).toBe(true);
    expect(
      slice.followUps.some((f) => f.id === SEED_ANCHORS.WF02_FOLLOWUP_CONFLICT.followUpId),
    ).toBe(true);
    expect(
      slice.patients.some((p) => p.id === SEED_ANCHORS.WF04_OTHER_FACILITY_PATIENT.patientId),
    ).toBe(false);
    expect(slice.facilities).toHaveLength(3);
    expect(slice.personas).toHaveLength(18);
  });

  it("worker defaults to persona-chw-alpha1-a; supervisor covers both Alpha facilities", () => {
    expect(sliceForApp(seed, "worker").slice.personaId).toBe("persona-chw-alpha1-a");
    expect(sliceForApp(seed, "worker", "persona-sup-alpha").patients).toHaveLength(32);
    expect(sliceForApp(seed, "worker", "persona-chw-beta1-a").patients).toHaveLength(16);
    expect(() => sliceForApp(seed, "worker", "persona-clin-alpha1")).toThrow(RangeError);
  });

  it("citizen gets exactly the patients linked to the five citizen personas and released instructions only", () => {
    // Base slicing only (the CTZ-01 overlay adds CTZ-P5's pending enrolment record on top).
    const slice = sliceForApp(seed, "citizen", undefined, { overlays: {} });
    const linked = seed.personas
      .filter((p) => p.role === "citizen")
      .flatMap((p) => p.linkedPatientIds);
    expect(slice.patients.map((p) => p.id).sort()).toEqual([...linked].sort());
    expect(slice.patients).toHaveLength(4);
    expect(slice.careInstructions.length).toBeGreaterThan(0);
    expect(slice.careInstructions.every((c) => c.status === "released")).toBe(true);
    expect(
      slice.careInstructions.some(
        (c) => c.sourceId === SEED_ANCHORS.CTZ_P1_UNRELEASED_REFERRAL.referralId,
      ),
    ).toBe(false);
    expect(
      slice.careInstructions.some(
        (c) => c.id === SEED_ANCHORS.CTZ_P2_WITHDRAWN_INSTRUCTION.careInstructionId,
      ),
    ).toBe(false);
    const ids = new Set(linked);
    expect(slice.screenings.every((s) => ids.has(s.patientId))).toBe(true);
    expect(slice.reminderPreferences).toHaveLength(4);
  });

  it("does not mutate the seed and keeps record IDs", () => {
    const before = structuredClone(seed);
    const slice = sliceForApp(seed, "worker", "persona-chw-alpha2-a");
    slice.patients[0]!.displayName = "changed";
    expect(seed).toEqual(before);
  });

  it("merges registered overlays deterministically without changing base counts", () => {
    const overlay: SliceOverlay = (base) => ({
      accessGrants: [{ id: "grant-1", personaId: base.personas[0]?.id ?? "" } as { id: string }],
      auditEvents: [{ ...base.auditEvents[0]!, id: "overlay-audit-1" }],
    });
    const slice = sliceForApp(seed, "admin", undefined, { overlays: { admin: overlay } });
    expect(slice.extraCollections).toEqual({
      accessGrants: [{ id: "grant-1", personaId: "persona-clin-alpha1" }],
    });
    expect(slice.auditEvents).toHaveLength(seed.auditEvents.length + 1);
    expect(seed.patients).toHaveLength(48);
    expect(sliceForApp(seed, "admin", undefined, { overlays: { admin: overlay } })).toEqual(slice);
    const clash: SliceOverlay = (base) => ({ patients: [base.patients[0]!] });
    expect(() => sliceForApp(seed, "admin", undefined, { overlays: { admin: clash } })).toThrow(
      /re-uses/,
    );
  });
});
