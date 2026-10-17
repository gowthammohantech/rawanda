import type { AuditEvent, Patient, Screening } from "@laif/domain";
import { PERSONA_IDS } from "@laif/mock-data";
import { describe, expect, it } from "vitest";

import { createHarness } from "../testing/harness.ts";

describe("demo service", () => {
  it("getDemoState reports seed version, hash, scenario, clock and pending sync count", async () => {
    const h = await createHarness({ appId: "worker", personaId: PERSONA_IDS.chwAlpha1A });
    const state = await h.repo.demo.getDemoState();
    expect(state).toMatchObject({ seedVersion: "seed-v1", scenarioId: null, pendingSyncCount: 0 });
    expect(state.datasetHash).toMatch(/^[0-9a-f]{16}$/u);
    const loaded = await h.repo.demo.loadScenario("SCN-07-duplicate-submission");
    expect(loaded).toMatchObject({
      scenarioId: "SCN-07-duplicate-submission",
      pendingSyncCount: 2,
    });
    expect(loaded.datasetHash).not.toBe(state.datasetHash);
  });

  it("simulateExternalUpdate validates the entity type and never changes id / version from the patch", async () => {
    const h = await createHarness({ personaId: PERSONA_IDS.clinAlpha1 });
    await expect(
      h.repo.demo.simulateExternalUpdate("spaceship", "x", {}, PERSONA_IDS.chwAlpha1A),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(
      h.repo.demo.simulateExternalUpdate("patient", "missing", {}, PERSONA_IDS.chwAlpha1A),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    const patient = h.seed.patients[0]!;
    const result = await h.repo.demo.simulateExternalUpdate(
      "patients",
      patient.id,
      { id: "hijack", version: 99, preferredLanguage: "en" },
      PERSONA_IDS.coordAlpha,
    );
    expect(result).toEqual({ entityType: "patient", id: patient.id, version: patient.version + 1 });
    expect(await h.store.get("patients", "hijack")).toBeUndefined();
  });

  it("demo tooling works signed out and for every role", async () => {
    const h = await createHarness({ personaId: null });
    expect((await h.repo.demo.resetDemo()).seedVersion).toBe("seed-v1");
    h.as(PERSONA_IDS.citizen1);
    expect((await h.repo.demo.setFaults({ latencyMs: [0, 10] })).latencyMs).toEqual([0, 10]);
  });

  it("refreshSlice: the worker slice follows the signed-in persona, unsynced rows stay", async () => {
    // Seeded while signed out → default persona (CHW Alpha-1 A) slice.
    const h = await createHarness({ appId: "worker", personaId: null });
    const facilities = async () =>
      new Set((await h.store.getAll<Patient>("patients")).map((p) => p.facilityId));
    expect(await facilities()).toEqual(new Set(["fac-alpha-1"]));
    h.as(PERSONA_IDS.chwAlpha1A);
    expect(await h.repo.demo.refreshSlice()).toEqual({
      refreshed: false,
      personaId: PERSONA_IDS.chwAlpha1A,
    });

    // An unsynced alpha-1 screening and draft, then a different persona signs in.
    const patient = (await h.store.getAll<Patient>("patients"))[0]!;
    const queued = await h.repo.createScreening(
      {
        patientId: patient.id,
        measuredAt: "2026-10-14T05:10:00.000Z",
        systolic: 126,
        diastolic: 80,
      },
      h.key(),
    );
    const draft = await h.repo.saveScreeningDraft(
      { patientId: patient.id, systolic: 120 },
      h.key(),
    );
    const opsBefore = await h.store.getAll("syncOperations");
    const remoteBefore = await h.store.getAll("remote_patients");
    h.as(PERSONA_IDS.chwAlpha2A);
    expect(await h.repo.demo.refreshSlice()).toEqual({
      refreshed: true,
      personaId: PERSONA_IDS.chwAlpha2A,
    });
    const patients = await h.store.getAll<Patient>("patients");
    expect(new Set(patients.map((p) => p.facilityId))).toEqual(new Set(["fac-alpha-2"]));
    const screenings = await h.store.getAll<Screening>("screenings");
    expect(screenings.map((s) => s.id)).toEqual(
      expect.arrayContaining([queued.data.id, draft.data.id]),
    );
    expect(await h.store.getAll("syncOperations")).toEqual(opsBefore);
    expect(await h.store.getAll("remote_patients")).toEqual(remoteBefore);
    const audit = (await h.store.getAll<AuditEvent>("auditEvents")).filter(
      (e) => e.action === "demo.slice_refreshed",
    );
    expect(audit).toHaveLength(1);
    expect(await h.repo.demo.refreshSlice()).toMatchObject({ refreshed: false });
  });

  it("refreshSlice is a no-op outside the worker app", async () => {
    const h = await createHarness({ personaId: PERSONA_IDS.clinAlpha1 });
    expect(await h.repo.demo.refreshSlice()).toEqual({ refreshed: false, personaId: null });
  });
});
