// @vitest-environment node
/**
 * HWM-10 Reset demo (golden baseline): after a messy session (offline screenings, a draft,
 * a synced change, a revoked device, faults, clock moved, device id) `resetDemoBaseline` leaves
 * byte-identical table hashes — every local AND `remote_*` collection — to a reset of a pristine
 * device (excluding the device id and the generated id of the one `demo.reset` event), the
 * dataset hash equals the FND seed slice, the audit baseline holds exactly one `demo.reset`, the
 * device id is regenerated, the session is cleared and the device clock is correct again.
 */
import { createMemoryStorage } from "@laif/auth-demo";
import type { AuditEvent, Patient } from "@laif/domain";
import { createSeed, PERSONA_IDS, sliceForApp } from "@laif/mock-data";
import {
  COLLECTIONS,
  computeDatasetHash,
  datasetToRecords,
  type StoreAdapter,
} from "@laif/repositories";
import { createTestRepository, type TestRepository } from "@laif/test-utils";
import { describe, expect, it, vi } from "vitest";

import { createDeviceClockStore } from "../clockDrift.ts";
import { countDiscardable, isResetConfirmed, resetDemoBaseline } from "../reset.ts";

const PERSONA = PERSONA_IDS.chwAlpha1A;
const META_KEYS = [
  "seedVersion",
  "demoClockIso",
  "demo.scenarioId",
  "demo.faults",
  "sync.localSeq",
  "demo.clockOffsetMs",
  "demo.slicePersonaId",
] as const;

/** FNV-1a 32-bit over a canonical JSON string (stable across runs). */
function fnv(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/** Per-collection hashes; the `demo.reset` event is compared without its generated ids. */
async function tableHashes(store: StoreAdapter): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const name of COLLECTIONS) {
    const rows = (await store.getAll<{ id: string } & Record<string, unknown>>(name))
      .map((row) =>
        name === "auditEvents" && (row as unknown as AuditEvent).action === "demo.reset"
          ? { ...row, id: "<reset>", correlationId: "<reset>" }
          : row,
      )
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    out[name] = fnv(JSON.stringify(rows));
  }
  for (const key of META_KEYS) out[`meta:${key}`] = fnv((await store.getMeta(key)) ?? "");
  return out;
}

async function pristineBaseline(): Promise<Record<string, string>> {
  const t = await createTestRepository({ appId: "worker", persona: PERSONA });
  await resetDemoBaseline({ repo: t.repo, session: { clear: () => undefined } });
  return tableHashes(t.store);
}

async function messUp(t: TestRepository): Promise<void> {
  const patient = (await t.repo.listPatients({ pageSize: 1 })).items[0] as Patient;
  const screening = (systolic: number) => ({
    patientId: patient.id,
    measuredAt: "2026-10-14T05:10:00.000Z",
    systolic,
    diastolic: 82,
  });
  // One synced, two waiting offline, one draft, a revoked device, a moved clock.
  await t.repo.createScreening(screening(121), t.key());
  await t.repo.sync.process({ trigger: "manual" });
  await t.repo.demo.setFaults({ offline: true, serverErrorRate: 0.5 });
  await t.repo.createScreening(screening(133), t.key());
  await t.repo.createScreening(screening(141), t.key());
  await t.repo.saveScreeningDraft({ patientId: patient.id, systolic: 150 }, t.key());
  await t.repo.device.getOrCreateDeviceId();
  t.advance(3 * 3_600_000);
}

describe("resetDemoBaseline (HWM-10 golden baseline)", () => {
  it("restores byte-identical table hashes (local + remote_*) excluding the device id", async () => {
    const golden = await pristineBaseline();
    const t = await createTestRepository({ appId: "worker", persona: PERSONA });
    const baseline = await countDiscardable(t.repo);
    expect(baseline.waiting).toBe(0);
    await messUp(t);
    const before = await tableHashes(t.store);
    expect(before).not.toEqual(golden);

    const counts = await countDiscardable(t.repo);
    expect(counts).toEqual({
      waiting: 2,
      needsDecision: 0,
      drafts: baseline.drafts + 1,
      total: 2 + baseline.drafts + 1,
    });

    const session = { clear: vi.fn() };
    const deviceClock = createDeviceClockStore(createMemoryStorage());
    deviceClock.setOffset(10);
    const oldDeviceId = await t.repo.device.getOrCreateDeviceId();
    const { state, deviceId } = await resetDemoBaseline({ repo: t.repo, session, deviceClock });

    expect(await tableHashes(t.store)).toEqual(golden);
    expect(state.datasetHash).toBe(
      computeDatasetHash(datasetToRecords(sliceForApp(createSeed(), "worker", PERSONA))),
    );
    expect(state.pendingSyncCount).toBe(0);
    expect(state.clockIso).toBe("2026-10-14T06:00:00.000Z");
    // Audit baseline: the seed slice's history + exactly one demo.reset.
    const resets = (await t.store.getAll<AuditEvent>("auditEvents")).filter(
      (e) => e.action === "demo.reset",
    );
    expect(resets).toHaveLength(1);
    expect(resets[0]).toMatchObject({ actorId: PERSONA, category: "demo" });
    // Device id regenerated, session signed out, device clock correct again.
    expect(deviceId).not.toBe(oldDeviceId);
    expect(await t.store.getMeta("device_id")).toBe(deviceId);
    expect(session.clear).toHaveBeenCalledOnce();
    expect(deviceClock.store.getState()).toEqual({ offsetMinutes: 0, drift: null });
    // Back to the seed's own items (the seeded draft returns; the added work is gone).
    expect(await countDiscardable(t.repo)).toEqual(baseline);
  });

  it("is deterministic: two resets in a row give the same hashes", async () => {
    const t = await createTestRepository({ appId: "worker", persona: PERSONA });
    await resetDemoBaseline({ repo: t.repo, session: { clear: () => undefined } });
    const first = await tableHashes(t.store);
    await resetDemoBaseline({ repo: t.repo, session: { clear: () => undefined } });
    expect(await tableHashes(t.store)).toEqual(first);
  });

  it("works on a revoked device (demo tooling is always allowed)", async () => {
    const t = await createTestRepository({ appId: "worker", persona: PERSONA });
    await t.repo.sync.revokeDevice();
    await expect(
      resetDemoBaseline({ repo: t.repo, session: { clear: () => undefined } }),
    ).resolves.toMatchObject({ state: { pendingSyncCount: 0 } });
    expect((await t.repo.sync.getStatus()).deviceRevoked).toBe(false);
  });

  it("the typed confirmation must be exactly RESET", () => {
    expect(isResetConfirmed("RESET")).toBe(true);
    expect(isResetConfirmed("  RESET ")).toBe(true);
    for (const text of ["", "reset", "RESE", "RESET!", "RE SET"]) {
      expect(isResetConfirmed(text), text).toBe(false);
    }
  });
});
