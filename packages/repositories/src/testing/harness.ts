/**
 * Test harness for repository tests (FND-08's `createTestRepository` builds on the same idea):
 * memory store (or a given adapter), pinned demo clock, sequential ids, no-op latency, a
 * switchable demo persona, deterministic UUID keys.
 */
import { actorForPersona, type ActorContext } from "@laif/auth-demo";
import {
  createDemoClock,
  createSequentialIdGenerator,
  type AppId,
  type DemoClock,
  type DemoPersona,
  type DeviceSession,
} from "@laif/domain";
import { createSeed, type SeedDataset } from "@laif/mock-data";

import type { CareRepository } from "../care-repository.ts";
import { createCareRepository } from "../create-care-repository.ts";
import { createMemoryStoreAdapter } from "../store/memory-adapter.ts";
import type { StoreAdapter } from "../store/store-adapter.ts";
import {
  createFaultInjector,
  type FaultConfigPatch,
  type FaultInjector,
} from "../transport/faults.ts";

let cachedSeed: SeedDataset | null = null;
/** The default seed, generated once per test file. */
export function testSeed(): SeedDataset {
  cachedSeed ??= createSeed();
  return structuredClone(cachedSeed);
}

/** Deterministic UUID-shaped key (`IdempotencyKey` accepts any version). */
export const uuid = (n: number): string =>
  `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;

export type Harness = {
  repo: CareRepository;
  store: StoreAdapter;
  clock: DemoClock;
  faults: FaultInjector;
  seed: SeedDataset;
  /** Fresh idempotency key per call. */
  key(): string;
  /** Switch the signed-in demo persona (null = signed out). */
  as(personaId: string | null): void;
  actor(): ActorContext | null;
  /** Creates (in the store) and attaches a device session for the current persona. */
  attachDevice(id?: string): Promise<void>;
  persona(id: string): DemoPersona;
  /** A second repository over the same store and clock (app restart). */
  restart(): Harness;
};

export type HarnessOptions = {
  appId?: AppId;
  personaId?: string | null;
  store?: StoreAdapter;
  sync?: boolean;
  faults?: FaultConfigPatch;
  /** Seed the store (`ensureSeeded`) before returning (default true). */
  seeded?: boolean;
  /**
   * Prefix of the sequential runtime ids (default `rt`). A harness reopened over a persisted
   * store (FND-08 restart tests) needs a different one, since its counter starts again.
   */
  idPrefix?: string;
};

export async function createHarness(options: HarnessOptions = {}): Promise<Harness> {
  const store = options.store ?? createMemoryStoreAdapter();
  const seed = testSeed();
  const clock = createDemoClock();
  const state = {
    personaId: options.personaId === undefined ? null : options.personaId,
    deviceSession: null as Pick<DeviceSession, "id" | "status"> | null,
    n: 0,
    builds: 0,
  };

  const persona = (id: string): DemoPersona => {
    const found = seed.personas.find((p) => p.id === id);
    if (!found) throw new Error(`unknown persona ${id}`);
    return found;
  };
  const actor = (): ActorContext | null =>
    state.personaId === null
      ? null
      : actorForPersona(persona(state.personaId), { deviceSession: state.deviceSession });

  const build = (faults: FaultInjector): Harness => {
    const repo = createCareRepository({
      store,
      clock,
      ids: createSequentialIdGenerator(`${options.idPrefix ?? "rt"}${++state.builds}`),
      getActor: actor,
      appId: options.appId ?? "clinical",
      sleep: () => Promise.resolve(),
      seed: testSeed,
      faults,
      ...(options.sync !== undefined ? { sync: options.sync } : {}),
    });
    const harness: Harness = {
      repo,
      store,
      clock,
      faults,
      seed,
      key: () => uuid(++state.n),
      as: (id) => {
        state.personaId = id;
      },
      actor,
      persona,
      async attachDevice(id = "ds-test-1") {
        if (state.personaId === null) throw new Error("attachDevice needs a persona");
        const p = persona(state.personaId);
        const session: DeviceSession = {
          id: id as DeviceSession["id"],
          personaId: p.id,
          deviceId: "dev-test-1" as DeviceSession["deviceId"],
          facilityId: p.facilityIds[0] as DeviceSession["facilityId"],
          status: "active",
          version: 1,
          createdAt: clock.nowIso(),
          updatedAt: clock.nowIso(),
          synthetic: true,
        };
        await store.put("deviceSessions", session);
        await store.put("remote_deviceSessions", session);
        state.deviceSession = { id: session.id, status: "active" };
      },
      restart: () => build(createFaultInjector(11, { latencyMs: [0, 0] })),
    };
    return harness;
  };

  const harness = build(createFaultInjector(7, { latencyMs: [0, 0] }));
  if (options.seeded !== false) await harness.repo.demo.ensureSeeded();
  if (options.faults) await harness.repo.demo.setFaults({ latencyMs: [0, 0], ...options.faults });
  return harness;
}
