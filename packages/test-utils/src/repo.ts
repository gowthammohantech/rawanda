/**
 * `createTestRepository(options)` (FND-08 task 8): a seeded `CareRepository` for app-track tests —
 * memory adapter (or the given store), `createTestClock(DEMO_CLOCK_DEFAULT_ISO)`, the app's seed
 * slice (or a named scenario), a signed-in demo persona, sequential runtime ids and **no simulated
 * latency** (no-op sleep, `latencyMs: [0, 0]`) so tests never wait 150–450 ms per call.
 */
import { actorForPersona, type ActorContext } from "@laif/auth-demo";
import {
  createSequentialIdGenerator,
  type AppId,
  type DemoClock,
  type DemoPersona,
} from "@laif/domain";
import {
  createSeed,
  DEFAULT_WORKER_PERSONA_ID,
  getScenario,
  PERSONA_IDS,
  type SeedDataset,
} from "@laif/mock-data";
import {
  createCareRepository,
  createFaultInjector,
  createMemoryStoreAdapter,
  type CareRepository,
  type DemoState,
  type FaultConfigPatch,
  type FaultInjector,
  type StoreAdapter,
} from "@laif/repositories";

import { createTestClock } from "./clock.ts";

/** Persona signed in by default per app. */
export const DEFAULT_TEST_PERSONAS: Readonly<Record<AppId, string>> = {
  clinical: PERSONA_IDS.clinAlpha1,
  worker: DEFAULT_WORKER_PERSONA_ID,
  admin: PERSONA_IDS.leadProgramme,
  citizen: PERSONA_IDS.citizen1,
};

export type TestRepositoryOptions = {
  /** Default: the scenario's first app, else `clinical`. */
  appId?: AppId;
  /** Persona id; `null` = signed out. Default: the scenario's persona, else the app default. */
  persona?: string | null;
  /** Named scenario (`SCN-09-version-conflict`, …) loaded instead of the plain seed slice. */
  scenario?: string;
  /** Fault config applied after seeding (latency stays `[0, 0]` unless given). */
  faults?: FaultConfigPatch;
  /** Store to run on (default: a fresh memory adapter). */
  store?: StoreAdapter;
  /** Pinned clock instant (default `DEMO_CLOCK_DEFAULT_ISO`). */
  clockIso?: string;
  /** Sync queue + simulated remote (default: `appId === 'worker'`). */
  sync?: boolean;
  /** Seed the store before returning (default true). */
  seeded?: boolean;
};

export type TestRepository = {
  repo: CareRepository;
  store: StoreAdapter;
  clock: DemoClock;
  faults: FaultInjector;
  appId: AppId;
  /** The seed the repository resets to (a fresh copy). */
  seed(): SeedDataset;
  /** Demo state after seeding / loading the scenario (null when `seeded: false`). */
  state: DemoState | null;
  /** Moves the demo clock forward by `ms`. */
  advance(ms: number): void;
  /** A fresh, deterministic UUID-shaped idempotency key per call. */
  key(): string;
  /** Switch the signed-in persona (`null` = signed out). */
  as(personaId: string | null): void;
  actor(): ActorContext | null;
  persona(id: string): DemoPersona;
};

let cachedSeed: SeedDataset | null = null;
const seedCopy = (): SeedDataset => {
  cachedSeed ??= createSeed();
  return structuredClone(cachedSeed);
};

/** Deterministic UUID-shaped key (`IdempotencyKey` accepts any version). */
export const testKey = (n: number): string =>
  `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;

export async function createTestRepository(
  options: TestRepositoryOptions = {},
): Promise<TestRepository> {
  const scenario = options.scenario ? getScenario(options.scenario) : null;
  const appId: AppId = options.appId ?? scenario?.apps[0] ?? "clinical";
  const store = options.store ?? createMemoryStoreAdapter();
  const clock = createTestClock(options.clockIso);
  const faults = createFaultInjector(7, { latencyMs: [0, 0] });
  const personas = new Map(seedCopy().personas.map((p) => [p.id as string, p]));
  const state = {
    personaId:
      options.persona === undefined
        ? (scenario?.anchors.personaId ?? DEFAULT_TEST_PERSONAS[appId])
        : options.persona,
    keys: 0,
  };

  const persona = (id: string): DemoPersona => {
    const found = personas.get(id);
    if (!found) throw new Error(`unknown persona ${id}`);
    return found;
  };
  const actor = (): ActorContext | null =>
    state.personaId === null ? null : actorForPersona(persona(state.personaId));
  if (state.personaId !== null) persona(state.personaId); // fail fast on a typo

  const repo = createCareRepository({
    store,
    clock,
    ids: createSequentialIdGenerator("test-rt"),
    getActor: actor,
    appId,
    sleep: () => Promise.resolve(),
    seed: seedCopy,
    faults,
    ...(options.sync !== undefined ? { sync: options.sync } : {}),
  });

  let demoState: DemoState | null = null;
  if (options.seeded !== false) {
    if (scenario) {
      demoState = await repo.demo.loadScenario(scenario.id);
    } else {
      await repo.demo.ensureSeeded();
      demoState = await repo.demo.getDemoState();
    }
  }
  if (options.faults) await repo.demo.setFaults({ latencyMs: [0, 0], ...options.faults });

  return {
    repo,
    store,
    clock,
    faults,
    appId,
    seed: seedCopy,
    state: demoState,
    advance: (ms) => clock.advanceBy(ms),
    key: () => testKey(++state.keys),
    as: (id) => {
      if (id !== null) persona(id);
      state.personaId = id;
    },
    actor,
    persona,
  };
}
