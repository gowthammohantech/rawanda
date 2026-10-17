/**
 * Demo API (FND-07 task 9, tech spec §10):
 * - `resetDemo()` = `clearAll` + `bulkPut(sliceForApp(createSeed(), appId, persona))` + (worker
 *   only) the FULL seed into `remote_*` + reset idempotency, sync queue and meta (`seedVersion`,
 *   `demoClockIso`, fault defaults) + exactly one `demo.reset` audit event — in ONE transaction
 *   (a failed reset leaves the store untouched).
 * - `loadScenario(id)` = the same reset over `applyScenario(seed, id)` (scenario records such as
 *   SCN-07/08 queued screenings and ops included) + the scenario clock + `demo.scenario_loaded`.
 * - `ensureSeeded()` seeds on first run only (meta `seedVersion` absent or different).
 * - `refreshSlice()` (worker, HWM-02): the device slice follows the signed-in worker persona. When
 *   it differs from the slice on the device (meta `demo.slicePersonaId`), the patient-scoped
 *   collections are re-sliced from the simulated remote — rows with an unsettled sync op and
 *   unsynced drafts are kept, nothing else of another persona's facilities stays on the device;
 *   audit log, sync queue, device sessions and meta are untouched. One `demo.slice_refreshed`.
 * - Faults persist in meta `demo.faults`; the clock offset in meta `demo.clockOffsetMs`.
 * Demo tooling is open to every role (FND-06 `demo.reset`) and works without a signed-in actor.
 */
import { asId, type DemoClock, type PersonaId, type SyncOperation } from "@laif/domain";
import {
  applyScenario,
  DEFAULT_WORKER_PERSONA_ID,
  getScenario,
  SEED_COLLECTIONS,
  SEED_VERSION,
  sliceForApp,
  type ScenarioId,
  type SeedDataset,
} from "@laif/mock-data";

import type { DemoApi, DemoState } from "../care-repository.ts";
import type { Engine, TxContext } from "../core/engine.ts";
import { RepositoryError } from "../errors.ts";
import { datasetToRecords, readDatasetHash, writeRecords } from "../seed-records.ts";
import { createRemoteStoreView } from "../store/prefixed-adapter.ts";
import { FAULTS_META_KEY, type FaultConfigPatch, type FaultInjector } from "../transport/faults.ts";
import { simulateEdit, type SimulatedRemote } from "../sync/simulated-remote.ts";
import { LOCAL_SEQ_META_KEY } from "../sync/sync-queue.ts";

export const META_KEYS = {
  seedVersion: "seedVersion",
  demoClockIso: "demoClockIso",
  scenarioId: "demo.scenarioId",
  clockOffsetMs: "demo.clockOffsetMs",
  faults: FAULTS_META_KEY,
  localSeq: LOCAL_SEQ_META_KEY,
  slicePersonaId: "demo.slicePersonaId",
} as const;

/** Patient-scoped collections a worker slice refresh replaces (reference data is identical). */
const SLICE_REFRESH_COLLECTIONS = [
  "patients",
  "screenings",
  "reviews",
  "referrals",
  "followUps",
  "careTasks",
  "reminders",
  "reminderPreferences",
  "careInstructions",
] as const;

const SETTLED_OPS = new Set(["acknowledged", "superseded", "rejected"]);

const WORKER_ROLES = new Set(["community_health_worker", "field_supervisor"]);

type AdjustableClock = Partial<Pick<DemoClock, "advanceBy" | "reset" | "pinnedIso">>;

export function createDemoApi(options: {
  engine: Engine;
  remote: SimulatedRemote | null;
  faults: FaultInjector;
  seed: () => SeedDataset;
}): DemoApi {
  const { engine, remote, faults } = options;
  const clock = engine.clock as typeof engine.clock & AdjustableClock;

  function authorizeTooling(ctx: TxContext, entityId: string): void {
    if (ctx.actor) ctx.authorize("demo.reset", undefined, { entityType: "audit_event", entityId });
  }

  function slicePersona(): PersonaId {
    const actor = engine.deps.getActor();
    if (actor && WORKER_ROLES.has(actor.role)) return actor.personaId;
    return engine.deps.slicePersonaId ?? DEFAULT_WORKER_PERSONA_ID;
  }

  function resetClockTo(offsetMs: number): void {
    clock.reset?.();
    if (offsetMs !== 0) {
      if (!clock.advanceBy) {
        throw new RepositoryError("INTERNAL", { details: { message: "clock is not adjustable" } });
      }
      clock.advanceBy(offsetMs);
    }
  }

  /** Clears and re-seeds inside `ctx.tx` (no audit). */
  async function seedInto(ctx: TxContext, dataset: SeedDataset, scenarioId: ScenarioId | null) {
    const tx = ctx.tx;
    await tx.clearAll();
    const persona = engine.appId === "worker" ? slicePersona() : undefined;
    const slice = sliceForApp(dataset, engine.appId, persona);
    if (engine.appId === "worker") {
      // Scenario ops (SCN-07/08/09) belong to the device queue; sliceForApp drops base ops.
      const ids = new Set<string>(
        [...slice.screenings, ...slice.followUps, ...slice.patients].map((r) => r.id),
      );
      slice.syncOperations = dataset.syncOperations.filter((op) => ids.has(op.entityId));
    }
    await writeRecords(tx, datasetToRecords(slice));
    if (remote) {
      // The simulated remote always holds the FULL base seed (cross-facility denial provable).
      await writeRecords(createRemoteStoreView(tx), datasetToRecords(options.seed()));
    }
    const localSeq = slice.syncOperations.reduce(
      (max, op: SyncOperation) => Math.max(max, op.localSeq),
      0,
    );
    faults.reset();
    await tx.setMeta(META_KEYS.seedVersion, SEED_VERSION);
    await tx.setMeta(META_KEYS.demoClockIso, ctx.nowIso);
    await tx.setMeta(META_KEYS.scenarioId, scenarioId ?? "");
    await tx.setMeta(META_KEYS.faults, faults.serialize());
    await tx.setMeta(META_KEYS.localSeq, String(localSeq));
    await tx.setMeta(META_KEYS.clockOffsetMs, "0");
    await tx.setMeta(META_KEYS.slicePersonaId, persona ?? "");
    for (const op of slice.syncOperations) {
      await tx.setMeta(`sync.localVersion.${op.id}`, String(localVersionOf(slice, op)));
    }
    faults.markClean();
  }

  function localVersionOf(dataset: SeedDataset, op: SyncOperation): number {
    const rows = [...dataset.screenings, ...dataset.followUps, ...dataset.patients] as Array<{
      id: string;
      version: number;
    }>;
    return rows.find((r) => r.id === op.entityId)?.version ?? 0;
  }

  async function state(): Promise<DemoState> {
    await engine.ready();
    const store = engine.store;
    const scenario = (await store.getMeta(META_KEYS.scenarioId)) ?? "";
    const ops = await store.getAll<SyncOperation>("syncOperations");
    return {
      seedVersion: (await store.getMeta(META_KEYS.seedVersion)) ?? null,
      datasetHash: await readDatasetHash(store),
      scenarioId: scenario === "" ? null : (scenario as ScenarioId),
      clockIso: clock.nowIso(),
      pendingSyncCount: ops.filter(
        (o) => !["acknowledged", "superseded", "rejected"].includes(o.status),
      ).length,
    };
  }

  async function reset(dataset: SeedDataset, scenarioId: ScenarioId | null, clockIso?: string) {
    const pinned = clock.pinnedIso ? Date.parse(clock.pinnedIso) : null;
    const offset = clockIso && pinned !== null ? Date.parse(clockIso) - pinned : 0;
    resetClockTo(offset);
    await engine.write(async (ctx) => {
      authorizeTooling(ctx, scenarioId ?? "reset");
      await seedInto(ctx, dataset, scenarioId);
      await ctx.tx.setMeta(META_KEYS.clockOffsetMs, String(offset));
      await ctx.audit({
        action: scenarioId ? "demo.scenario_loaded" : "demo.reset",
        entityType: "audit_event",
        entityId: scenarioId ?? "demo",
        correlationId: asId(ctx.ids()),
        changeSummary: { appId: engine.appId, seedVersion: SEED_VERSION, scenarioId },
      });
    });
    return state();
  }

  return {
    async ensureSeeded() {
      await engine.ready();
      if ((await engine.store.getMeta(META_KEYS.seedVersion)) === SEED_VERSION) {
        return { seeded: false };
      }
      resetClockTo(0);
      await engine.write(async (ctx) => {
        await seedInto(ctx, options.seed(), null);
      });
      return { seeded: true };
    },

    resetDemo: () => reset(options.seed(), null),

    async refreshSlice() {
      await engine.ready();
      const personaId = slicePersona();
      if (engine.appId !== "worker" || !remote) return { refreshed: false, personaId: null };
      const current =
        (await engine.store.getMeta(META_KEYS.slicePersonaId)) || DEFAULT_WORKER_PERSONA_ID;
      if (current === personaId) return { refreshed: false, personaId };
      await engine.write(async (ctx) => {
        const tx = ctx.tx;
        const remoteView = createRemoteStoreView(tx);
        const dataset = {} as Record<string, unknown>;
        for (const name of SEED_COLLECTIONS) dataset[name] = await remoteView.getAll(name);
        const slice = sliceForApp(dataset as unknown as SeedDataset, "worker", personaId);
        const ops = await tx.getAll<SyncOperation>("syncOperations");
        const keep = new Set<string>(
          ops.filter((o) => !SETTLED_OPS.has(o.status)).map((o) => o.entityId),
        );
        const counts: Record<string, number> = {};
        for (const name of SLICE_REFRESH_COLLECTIONS) {
          const wanted = slice[name] as unknown as Array<{ id: string }>;
          const wantedIds = new Set(wanted.map((r) => r.id));
          let removed = 0;
          for (const row of await tx.getAll<{ id: string; status?: string }>(name)) {
            const unsynced = keep.has(row.id) || (name === "screenings" && row.status === "draft");
            if (unsynced || wantedIds.has(row.id)) continue;
            await tx.delete(name, row.id);
            removed += 1;
          }
          const incoming = wanted.filter((r) => !keep.has(r.id));
          if (incoming.length > 0) await tx.bulkPut(name, structuredClone(incoming));
          counts[name] = incoming.length - removed;
        }
        await tx.setMeta(META_KEYS.slicePersonaId, personaId);
        await ctx.audit({
          action: "demo.slice_refreshed",
          entityType: "audit_event",
          entityId: "slice",
          changeSummary: {
            fromPersonaId: current,
            toPersonaId: personaId,
            keptUnsynced: keep.size,
          },
        });
      });
      return { refreshed: true, personaId };
    },

    async loadScenario(id: string) {
      let scenario;
      try {
        scenario = getScenario(id);
      } catch {
        throw new RepositoryError("NOT_FOUND", { details: { scenarioId: id } });
      }
      return reset(applyScenario(options.seed(), scenario.id), scenario.id, scenario.clockIso);
    },

    getDemoState: state,

    async setFaults(cfg: FaultConfigPatch) {
      await engine.ready();
      let next;
      try {
        next = faults.set(cfg);
      } catch (error) {
        throw new RepositoryError("VALIDATION_ERROR", {
          fieldErrors: { conflictOnce: { key: "invalid", params: {} } },
          details: { message: error instanceof Error ? error.message : String(error) },
        });
      }
      await engine.write(async (ctx) => {
        authorizeTooling(ctx, "faults");
        await ctx.audit({
          action: "demo.fault_toggled",
          entityType: "audit_event",
          entityId: "faults",
          changeSummary: JSON.parse(faults.serialize()) as never,
        });
      });
      return next;
    },

    async getFaults() {
      await engine.ready();
      return faults.get();
    },

    async advanceClock(ms: number) {
      await engine.ready();
      if (!Number.isFinite(ms)) {
        throw new RepositoryError("VALIDATION_ERROR", {
          fieldErrors: { ms: { key: "invalidType", params: {} } },
        });
      }
      const current = Number((await engine.store.getMeta(META_KEYS.clockOffsetMs)) ?? "0");
      resetClockTo(current + ms);
      await engine.write(async (ctx) => {
        authorizeTooling(ctx, "clock");
        await ctx.tx.setMeta(META_KEYS.clockOffsetMs, String(current + ms));
        await ctx.audit({
          action: "demo.clock_changed",
          entityType: "audit_event",
          entityId: "clock",
          changeSummary: { advancedByMs: ms, offsetMs: current + ms },
        });
      });
      return clock.nowIso();
    },

    async resetClock() {
      await engine.ready();
      resetClockTo(0);
      await engine.write(async (ctx) => {
        authorizeTooling(ctx, "clock");
        await ctx.tx.setMeta(META_KEYS.clockOffsetMs, "0");
        await ctx.audit({
          action: "demo.clock_changed",
          entityType: "audit_event",
          entityId: "clock",
          changeSummary: { offsetMs: 0 },
        });
      });
      return clock.nowIso();
    },

    async simulateExternalUpdate(entityType, id, patch, actorPersonaId) {
      await engine.ready();
      return simulateEdit(engine, entityType, id, patch, actorPersonaId);
    },
  };
}

/** Applies the persisted clock offset (init). */
export function applyClockOffset(clock: AdjustableClock, offsetMs: number): void {
  clock.reset?.();
  if (offsetMs !== 0) clock.advanceBy?.(offsetMs);
}
