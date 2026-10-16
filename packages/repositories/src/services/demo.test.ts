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
});
