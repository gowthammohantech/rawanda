/**
 * Citizen wallet test helpers (CTZ-01): `makeCitizenRepo()` — a seeded `CitizenRepository` over
 * the memory adapter (or a given store, e.g. `createSqliteStoreAdapter(createTestSqliteExecutor())`)
 * with the pinned test clock, sequential ids, no simulated latency and a switchable citizen
 * persona — plus projection factories `aReleasedObservation()` / `anInstruction()`.
 */
import { actorForPersona } from "@laif/auth-demo";
import {
  asId,
  createSequentialIdGenerator,
  type ApprovedInstruction,
  type DemoClock,
  type DemoPersona,
  type PendingReviewPlaceholder,
  type ReleasedObservation,
} from "@laif/domain";
import { createSeed, PERSONA_IDS, type SeedDataset } from "@laif/mock-data";
import {
  createFaultInjector,
  createMemoryStoreAdapter,
  type FaultConfigPatch,
  type FaultInjector,
  type StoreAdapter,
} from "@laif/repositories";
import { createCitizenRepository, type CitizenRepository } from "@laif/repositories/citizen";

import { createTestClock } from "../clock.ts";
import { testKey } from "../repo.ts";

export type CitizenTestRepoOptions = {
  /** Persona id; `null` = signed out (default CTZ-P1 `persona-citizen-1`). */
  persona?: string | null;
  store?: StoreAdapter;
  clockIso?: string;
  faults?: FaultConfigPatch;
  /** Seed the store before returning (default true). */
  seeded?: boolean;
};

export type CitizenTestRepo = {
  repo: CitizenRepository;
  store: StoreAdapter;
  clock: DemoClock;
  faults: FaultInjector;
  key(): string;
  as(personaId: string | null): void;
};

let cachedSeed: SeedDataset | null = null;
const seedCopy = (): SeedDataset => {
  cachedSeed ??= createSeed();
  return structuredClone(cachedSeed);
};

export async function makeCitizenRepo(
  options: CitizenTestRepoOptions = {},
): Promise<CitizenTestRepo> {
  const store = options.store ?? createMemoryStoreAdapter();
  const clock = createTestClock(options.clockIso);
  const faults = createFaultInjector(7, { latencyMs: [0, 0] });
  const personas = new Map(seedCopy().personas.map((p) => [p.id as string, p]));
  const state = {
    personaId: options.persona === undefined ? PERSONA_IDS.citizen1 : options.persona,
    keys: 0,
  };
  const persona = (id: string): DemoPersona => {
    const found = personas.get(id);
    if (!found) throw new Error(`unknown persona ${id}`);
    return found;
  };
  if (state.personaId !== null) persona(state.personaId);
  const repo = createCitizenRepository({
    store,
    clock,
    ids: createSequentialIdGenerator("ctz-test"),
    getActor: () => (state.personaId === null ? null : actorForPersona(persona(state.personaId))),
    sleep: () => Promise.resolve(),
    seed: seedCopy,
    faults,
  });
  if (options.seeded !== false) await repo.demo.ensureSeeded();
  if (options.faults) await repo.demo.setFaults({ latencyMs: [0, 0], ...options.faults });
  return {
    repo,
    store,
    clock,
    faults,
    key: () => testKey(++state.keys),
    as: (id) => {
      if (id !== null) persona(id);
      state.personaId = id;
    },
  };
}

/** A released result (follow-up agreed, BP + glucose with units). */
export function aReleasedObservation(
  overrides: Partial<ReleasedObservation> = {},
): ReleasedObservation {
  return {
    kind: "released",
    id: asId<never>("scr-test-1"),
    patientId: asId<never>("pat-test-1"),
    screeningId: asId<never>("scr-test-1"),
    reviewId: asId<never>("rev-test-1"),
    reviewState: "released_follow_up",
    label: "followUpAgreed",
    measuredAt: "2026-10-11T08:24:00.000Z",
    facilityId: asId<never>("fac-alpha-1"),
    readings: {
      systolic: 152,
      diastolic: 96,
      bloodPressureUnit: "mmHg",
      glucoseValue: 7.4,
      glucoseUnit: "mmol/L",
      glucoseContext: "non_fasting",
    },
    originalReadings: null,
    amendments: [],
    reviewedBy: asId<never>("persona-clin-alpha1"),
    reviewedAt: "2026-10-12T08:24:00.000Z",
    ...overrides,
  };
}

/** A value-less pending-review placeholder. */
export function aPendingReview(
  overrides: Partial<PendingReviewPlaceholder> = {},
): PendingReviewPlaceholder {
  return {
    kind: "pending_review",
    id: asId<never>("scr-test-2"),
    patientId: asId<never>("pat-test-1"),
    measuredAt: "2026-10-12T08:24:00.000Z",
    ...overrides,
  };
}

/** An approved (released) appointment next step, planned, after the demo clock. */
export function anInstruction(overrides: Partial<ApprovedInstruction> = {}): ApprovedInstruction {
  return {
    id: asId<never>("ci-test-1"),
    patientId: asId<never>("pat-test-1"),
    kind: "appointment",
    sourceType: "referral",
    sourceId: "ref-test-1",
    messageKey: "citizen:nextStep.appointment.message",
    params: { facilityId: "fac-alpha-1" },
    appointmentAt: "2026-10-19T08:30:00.000Z",
    facilityId: asId<never>("fac-alpha-1"),
    releasedBy: asId<never>("persona-clin-alpha1"),
    releasedAt: "2026-10-02T08:24:00.000Z",
    status: "released",
    version: 1,
    createdAt: "2026-10-02T08:24:00.000Z",
    updatedAt: "2026-10-02T08:24:00.000Z",
    synthetic: true,
    approvalState: "approved",
    progress: "planned",
    datePassed: false,
    reviewId: asId<never>("rev-test-1"),
    acknowledgement: null,
    ...overrides,
  };
}
