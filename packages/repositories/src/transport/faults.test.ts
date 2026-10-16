import type { Screening } from "@laif/domain";
import { PERSONA_IDS, SEED_ANCHORS } from "@laif/mock-data";
import { describe, expect, it, vi } from "vitest";

import { createHarness } from "../testing/harness.ts";
import {
  createFaultInjector,
  createPrng,
  DEFAULT_FAULT_CONFIG,
  normaliseFaultConfig,
} from "./faults.ts";
import { realSleep, simulateTransport, withSimulatedTransport } from "./simulated.ts";

const patientInput = (h: Awaited<ReturnType<typeof createHarness>>) => ({
  patientId: h.seed.patients.find((p) => p.facilityId === "fac-alpha-1")!.id,
  measuredAt: "2026-10-14T05:00:00.000Z",
  systolic: 128,
  diastolic: 82,
});

describe("FaultConfig", () => {
  it("defaults match the phase spec", () => {
    expect(DEFAULT_FAULT_CONFIG).toEqual({
      latencyMs: [150, 450],
      timeoutRate: 0,
      serverErrorRate: 0,
      dependencyUnavailableRate: 0,
      offline: false,
      conflictOnce: [],
      deviceRevoked: false,
    });
  });

  it("normalises rates, latency and conflict targets (UI names map onto one config)", () => {
    const cfg = normaliseFaultConfig({
      latencyMs: [500, 100],
      timeoutRate: 3,
      serverErrorRate: -1,
      dependencyUnavailableRate: Number.NaN,
      conflictOnce: [{ entityType: "followUp", entityId: "f1" }],
    });
    expect(cfg.latencyMs).toEqual([500, 500]);
    expect(cfg.timeoutRate).toBe(1);
    expect(cfg.serverErrorRate).toBe(0);
    expect(cfg.dependencyUnavailableRate).toBe(0);
    expect(cfg.conflictOnce).toEqual([{ entityType: "follow_up", entityId: "f1" }]);
    expect(() =>
      normaliseFaultConfig({ conflictOnce: [{ entityType: "x", entityId: "1" }] }),
    ).toThrow();
  });

  it("is deterministic per seed and a zero rate consumes no draw", () => {
    const a = createFaultInjector(1, { serverErrorRate: 0.5, latencyMs: [10, 20] });
    const b = createFaultInjector(1, { serverErrorRate: 0.5, latencyMs: [10, 20] });
    const rolls = (i: ReturnType<typeof createFaultInjector>) =>
      Array.from({ length: 20 }, () => [i.rollServerError(), i.rollTimeout(), i.latency()]);
    expect(rolls(a)).toEqual(rolls(b));
    expect(createPrng(5)()).toBe(createPrng(5)());
    const fixed = createFaultInjector(1, { latencyMs: [30, 30] });
    expect(fixed.latency()).toBe(30);
  });

  it("load / serialize round-trip; bad JSON falls back to defaults", () => {
    const i = createFaultInjector();
    i.set({ offline: true });
    expect(i.dirty).toBe(true);
    const json = i.serialize();
    const j = createFaultInjector();
    expect(j.load(json).offline).toBe(true);
    expect(j.dirty).toBe(false);
    expect(j.load("{not json").offline).toBe(false);
    expect(j.load(undefined)).toEqual(DEFAULT_FAULT_CONFIG);
    expect(j.reset()).toEqual(DEFAULT_FAULT_CONFIG);
  });

  it("realSleep waits", async () => {
    vi.useFakeTimers();
    const p = realSleep(10);
    vi.advanceTimersByTime(10);
    await expect(p).resolves.toBeUndefined();
    vi.useRealTimers();
  });
});

describe("simulated transport (web apps)", () => {
  it("offline: every call rejects OFFLINE; demo tooling keeps working; persisted", async () => {
    const h = await createHarness({ personaId: PERSONA_IDS.clinAlpha1 });
    await h.repo.demo.setFaults({ offline: true });
    await expect(h.repo.listPatients()).rejects.toMatchObject({ code: "OFFLINE", status: 0 });
    await expect(h.repo.getReview(SEED_ANCHORS.WF01_FLAGGED_REVIEW.reviewId)).rejects.toMatchObject(
      {
        code: "OFFLINE",
      },
    );
    expect((await h.repo.demo.getFaults()).offline).toBe(true);
    // Restart: the toggle survives (meta demo.faults).
    const again = h.restart();
    await expect(again.repo.listPatients()).rejects.toMatchObject({ code: "OFFLINE" });
    await again.repo.demo.setFaults({ offline: false });
    expect((await again.repo.listPatients()).total).toBeGreaterThan(0);
  });

  it("500 / 503 happen BEFORE the write (nothing stored)", async () => {
    const h = await createHarness({ personaId: PERSONA_IDS.chwAlpha1A });
    const before = (await h.store.getAll<Screening>("screenings")).length;
    await h.repo.demo.setFaults({ serverErrorRate: 1 });
    await expect(h.repo.createScreening(patientInput(h), h.key())).rejects.toMatchObject({
      code: "INTERNAL",
      status: 500,
    });
    await h.repo.demo.setFaults({ serverErrorRate: 0, dependencyUnavailableRate: 1 });
    await expect(h.repo.createScreening(patientInput(h), h.key())).rejects.toMatchObject({
      code: "DEPENDENCY_UNAVAILABLE",
    });
    expect((await h.store.getAll<Screening>("screenings")).length).toBe(before);
  });

  it("timeout after commit + retry with the same key → exactly one record", async () => {
    const h = await createHarness({ personaId: PERSONA_IDS.chwAlpha1A });
    const before = (await h.store.getAll<Screening>("screenings")).length;
    const key = h.key();
    await h.repo.demo.setFaults({ timeoutRate: 1 });
    await expect(h.repo.createScreening(patientInput(h), key)).rejects.toMatchObject({
      code: "TIMEOUT",
      details: { committed: true },
    });
    expect((await h.store.getAll<Screening>("screenings")).length).toBe(before + 1);
    await h.repo.demo.setFaults({ timeoutRate: 0 });
    const retry = await h.repo.createScreening(patientInput(h), key);
    expect(retry.replayed).toBe(true);
    expect((await h.store.getAll<Screening>("screenings")).length).toBe(before + 1);
  });

  it("latency sleeps through the injected sleep; non-function members pass through", async () => {
    const faults = createFaultInjector(3, { latencyMs: [40, 40] });
    const sleep = vi.fn(() => Promise.resolve());
    await expect(simulateTransport(faults, sleep, () => Promise.resolve(1))).resolves.toBe(1);
    expect(sleep).toHaveBeenCalledWith(40);
    await expect(
      simulateTransport(faults, sleep, () => Promise.reject(new Error("boom"))),
    ).rejects.toMatchObject({ code: "INTERNAL", details: { message: "boom" } });
    const repo = withSimulatedTransport({ x: 1, sync: {}, demo: {} } as never, faults, { sleep });
    expect((repo as unknown as { x: number }).x).toBe(1);
  });
});
