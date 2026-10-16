import type { AuditEvent, Screening, SyncOperation } from "@laif/domain";
import {
  applyScenario,
  createSeed,
  PERSONA_IDS,
  SEED_ANCHORS,
  SEED_VERSION,
  sliceForApp,
} from "@laif/mock-data";
import { describe, expect, it } from "vitest";

import { computeDatasetHash, datasetToRecords, readDatasetHash } from "../seed-records.ts";
import { createMemoryStoreAdapter } from "../store/memory-adapter.ts";
import { createHarness } from "../testing/harness.ts";

const audits = (h: Awaited<ReturnType<typeof createHarness>>) =>
  h.store.getAll<AuditEvent>("auditEvents");

describe("resetDemo / ensureSeeded / loadScenario", () => {
  it("resetDemo → datasetHash equals the fresh seed slice; audit = baseline + one demo.reset", async () => {
    const h = await createHarness({ personaId: PERSONA_IDS.clinAlpha1 });
    const slice = sliceForApp(createSeed(), "clinical");
    // Make changes, then reset.
    const review = SEED_ANCHORS.WF01_FLAGGED_REVIEW.reviewId;
    await h.repo.startReview({ reviewId: review, expectedVersion: 1 }, h.key());
    await h.repo.demo.setFaults({ offline: true });
    h.clock.advanceBy(3_600_000);
    const state = await h.repo.demo.resetDemo();

    expect(state).toEqual({
      seedVersion: SEED_VERSION,
      datasetHash: computeDatasetHash(datasetToRecords(slice)),
      scenarioId: null,
      clockIso: "2026-10-14T06:00:00.000Z",
      pendingSyncCount: 0,
    });
    const events = await audits(h);
    const baseline = new Set(slice.auditEvents.map((e) => e.id));
    const extra = events.filter((e) => !baseline.has(e.id));
    expect(extra.map((e) => e.action)).toEqual(["demo.reset"]);
    expect(extra[0]).toMatchObject({ category: "demo", actorId: PERSONA_IDS.clinAlpha1 });
    expect(events).toHaveLength(slice.auditEvents.length + 1);
    expect(await h.store.getAll("idempotency")).toEqual([]);
    expect((await h.repo.demo.getFaults()).offline).toBe(false);
    expect(await h.store.getMeta("seedVersion")).toBe(SEED_VERSION);
  });

  it("two consecutive resets produce identical data (deterministic)", async () => {
    const h = await createHarness({ personaId: PERSONA_IDS.clinAlpha1 });
    const a = await h.repo.demo.resetDemo();
    const b = await h.repo.demo.resetDemo();
    expect(a.datasetHash).toBe(b.datasetHash);
  });

  it("ensureSeeded seeds on first run only, without an audit event", async () => {
    const store = createMemoryStoreAdapter();
    const h = await createHarness({ store, seeded: false, personaId: null });
    expect(await h.repo.demo.ensureSeeded()).toEqual({ seeded: true });
    const count = (await audits(h)).length;
    expect(count).toBe(createSeed().auditEvents.length);
    expect(await h.repo.demo.ensureSeeded()).toEqual({ seeded: false });
    expect((await audits(h)).length).toBe(count);
    expect((await h.repo.demo.getDemoState()).seedVersion).toBe(SEED_VERSION);
  });

  it("worker reset: device slice locally, FULL seed in remote_*", async () => {
    const h = await createHarness({ appId: "worker", personaId: PERSONA_IDS.chwAlpha1A });
    const seed = createSeed();
    const slice = sliceForApp(seed, "worker", PERSONA_IDS.chwAlpha1A);
    const state = await h.repo.demo.resetDemo();
    expect(state.datasetHash).toBe(computeDatasetHash(datasetToRecords(slice)));
    expect(await h.store.getAll("patients")).toHaveLength(slice.patients.length);
    expect(await h.store.getAll("remote_patients")).toHaveLength(seed.patients.length);
    expect(slice.patients.length).toBeLessThan(seed.patients.length);
    expect(await h.store.getMeta("sync.localSeq")).toBe("0");
  });

  it("loadScenario compares against applyScenario (SCN-08 adds queued screenings)", async () => {
    const h = await createHarness({ appId: "worker", personaId: PERSONA_IDS.chwAlpha1A });
    const scenarioSeed = applyScenario(createSeed(), "SCN-08-offline-sync");
    const state = await h.repo.demo.loadScenario("SCN-08-offline-sync");
    expect(state.scenarioId).toBe("SCN-08-offline-sync");
    expect(state.pendingSyncCount).toBe(scenarioSeed.syncOperations.length);
    const slice = sliceForApp(scenarioSeed, "worker", PERSONA_IDS.chwAlpha1A);
    expect(await h.store.getAll<Screening>("screenings")).toHaveLength(slice.screenings.length);
    const ops = await h.store.getAll<SyncOperation>("syncOperations");
    expect(ops.map((o) => o.id).sort()).toEqual(
      scenarioSeed.syncOperations.map((o) => o.id).sort(),
    );
    expect(await h.store.getMeta("sync.localSeq")).toBe("2");
    expect((await audits(h)).filter((e) => e.action === "demo.scenario_loaded")).toHaveLength(1);
    await expect(h.repo.demo.loadScenario("SCN-99")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("clinical loadScenario keeps the full dataset of applyScenario", async () => {
    const h = await createHarness({ personaId: PERSONA_IDS.clinAlpha1 });
    const state = await h.repo.demo.loadScenario("SCN-03-clinician-dismissal");
    const expected = sliceForApp(
      applyScenario(createSeed(), "SCN-03-clinician-dismissal"),
      "clinical",
    );
    expect(state.datasetHash).toBe(computeDatasetHash(datasetToRecords(expected)));
    expect(await readDatasetHash(h.store)).toBe(state.datasetHash);
  });

  it("advanceClock / resetClock persist an offset that survives restart", async () => {
    const h = await createHarness({ personaId: PERSONA_IDS.clinAlpha1 });
    expect(await h.repo.demo.advanceClock(86_400_000)).toBe("2026-10-15T06:00:00.000Z");
    expect(await h.store.getMeta("demo.clockOffsetMs")).toBe("86400000");
    h.clock.reset();
    const again = h.restart();
    await again.repo.demo.getDemoState();
    expect(h.clock.nowIso()).toBe("2026-10-15T06:00:00.000Z");
    expect(await again.repo.demo.resetClock()).toBe("2026-10-14T06:00:00.000Z");
    await expect(again.repo.demo.advanceClock(Number.NaN)).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
    expect((await audits(h)).filter((e) => e.action === "demo.clock_changed")).toHaveLength(2);
  });

  it("setFaults validates and audits; faults are persisted in meta demo.faults", async () => {
    const h = await createHarness({ personaId: PERSONA_IDS.clinAlpha1 });
    const cfg = await h.repo.demo.setFaults({ serverErrorRate: 0.25 });
    expect(cfg.serverErrorRate).toBe(0.25);
    const persisted = JSON.parse((await h.store.getMeta("demo.faults"))!) as {
      serverErrorRate: number;
    };
    expect(persisted.serverErrorRate).toBe(0.25);
    expect((await audits(h)).some((e) => e.action === "demo.fault_toggled")).toBe(true);
    await expect(
      h.repo.demo.setFaults({ conflictOnce: [{ entityType: "unknown", entityId: "x" }] }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("reset is atomic: a failing seed leaves the store untouched", async () => {
    const h = await createHarness({ personaId: PERSONA_IDS.clinAlpha1 });
    const before = await readDatasetHash(h.store);
    const store = h.store;
    // A document without an id makes the bulk write throw mid-reset → rolled back.
    await expect(
      (async () => {
        const { createCareRepository } = await import("../create-care-repository.ts");
        const { createDemoClock, createSequentialIdGenerator } = await import("@laif/domain");
        const repo = createCareRepository({
          store,
          clock: createDemoClock(),
          ids: createSequentialIdGenerator("bad"),
          getActor: () => null,
          appId: "clinical",
          sleep: () => Promise.resolve(),
          seed: () => {
            const seed = createSeed();
            (seed.patients as unknown[]).push({ id: "" });
            return seed;
          },
        });
        await repo.demo.resetDemo();
      })(),
    ).rejects.toBeDefined();
    expect(await readDatasetHash(store)).toBe(before);
  });
});
