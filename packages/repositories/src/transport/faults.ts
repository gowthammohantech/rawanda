/**
 * The single fault API every app's Settings / Demo tools drive (FND-07 task 7; CLN-02, HWM-02
 * network simulation, ADM-09, CTZ-02). UI toggle names in app phases map as:
 *
 * | UI toggle                                                  | FaultConfig field            |
 * |------------------------------------------------------------|------------------------------|
 * | latency                                                    | `latencyMs`                  |
 * | timeout / drop-ack / dropped acknowledgement               | `timeoutRate` (after commit) |
 * | 500 / `error500` / `server_error` / failure rate           | `serverErrorRate`            |
 * | unavailable                                                | `dependencyUnavailableRate`  |
 * | offline                                                    | `offline`                    |
 * | conflict / conflict-next-write / conflict_next_write       | `conflictOnce`               |
 * | revoked                                                    | `deviceRevoked`              |
 *
 * Random draws come from a deterministic PRNG seeded per session (`createFaultInjector(seed)`);
 * a rate of 0 never consumes a draw, so enabling one fault does not shift another's sequence.
 * The config is persisted in store meta `demo.faults` so a toggle survives reload.
 */
import { resolveEntityType } from "../store/collections.ts";
import type { EntityType } from "@laif/domain";

export type ConflictOnceTarget = { entityType: EntityType; entityId: string };

export type FaultConfig = {
  /** Uniform simulated latency range in ms, inclusive. */
  latencyMs: [number, number];
  /** Probability the response is lost AFTER the call committed ("dropped ack" → TIMEOUT). */
  timeoutRate: number;
  /** Probability of `INTERNAL` (500) before the call runs. */
  serverErrorRate: number;
  /** Probability of `DEPENDENCY_UNAVAILABLE` (503) before the call runs. */
  dependencyUnavailableRate: number;
  /** Every wrapped call rejects with `OFFLINE`; sync ops stay queued. */
  offline: boolean;
  /** The next write to each listed entity conflicts (409 with `latest`), then the entry is removed. */
  conflictOnce: ConflictOnceTarget[];
  /** The simulated remote answers `FORBIDDEN` reason `DEVICE_REVOKED`. */
  deviceRevoked: boolean;
};

export const FAULTS_META_KEY = "demo.faults" as const;

export const DEFAULT_FAULT_CONFIG: Readonly<FaultConfig> = Object.freeze({
  latencyMs: [150, 450] as [number, number],
  timeoutRate: 0,
  serverErrorRate: 0,
  dependencyUnavailableRate: 0,
  offline: false,
  conflictOnce: [],
  deviceRevoked: false,
});

/** A patch from a Settings screen; `conflictOnce` entries may name `followUp` / `followUps`. */
export type FaultConfigPatch = Partial<
  Omit<FaultConfig, "conflictOnce"> & {
    conflictOnce: Array<{ entityType: string; entityId: string }>;
  }
>;

const clampRate = (value: number): number =>
  Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;

/** Validates / clamps a patch on top of `base` (rates in [0, 1], latency ≥ 0 and ordered). */
export function normaliseFaultConfig(
  patch: FaultConfigPatch,
  base: Readonly<FaultConfig> = DEFAULT_FAULT_CONFIG,
): FaultConfig {
  const [rawMin, rawMax] = patch.latencyMs ?? base.latencyMs;
  const min = Math.max(0, Math.round(Number.isFinite(rawMin) ? rawMin : 0));
  const max = Math.max(min, Math.round(Number.isFinite(rawMax) ? rawMax : min));
  const conflictOnce: ConflictOnceTarget[] = [];
  for (const target of patch.conflictOnce ?? base.conflictOnce) {
    const entityType = resolveEntityType(target.entityType);
    if (entityType === null) throw new RangeError(`conflictOnce: unknown ${target.entityType}`);
    conflictOnce.push({ entityType, entityId: target.entityId });
  }
  return {
    latencyMs: [min, max],
    timeoutRate: clampRate(patch.timeoutRate ?? base.timeoutRate),
    serverErrorRate: clampRate(patch.serverErrorRate ?? base.serverErrorRate),
    dependencyUnavailableRate: clampRate(
      patch.dependencyUnavailableRate ?? base.dependencyUnavailableRate,
    ),
    offline: patch.offline ?? base.offline,
    conflictOnce,
    deviceRevoked: patch.deviceRevoked ?? base.deviceRevoked,
  };
}

/** mulberry32 — small, fast, deterministic. */
export function createPrng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface FaultInjector {
  get(): FaultConfig;
  /** Applies a patch, marks the injector dirty and returns the new config. */
  set(patch: FaultConfigPatch): FaultConfig;
  /** Restores the defaults (demo reset). */
  reset(): FaultConfig;
  /** Loads a persisted config (meta `demo.faults`); invalid JSON falls back to defaults. */
  load(json: string | undefined): FaultConfig;
  serialize(): string;
  /** True after `set` / `reset` / a consumed `conflictOnce` until `markClean()`. */
  readonly dirty: boolean;
  markClean(): void;
  latency(): number;
  rollTimeout(): boolean;
  rollServerError(): boolean;
  rollDependencyUnavailable(): boolean;
  /** True (and removes the entry) when the next write to this entity must conflict. */
  consumeConflictOnce(entityType: EntityType, entityId: string): boolean;
}

export function createFaultInjector(seed = 20261014, initial?: FaultConfigPatch): FaultInjector {
  const random = createPrng(seed);
  let config = normaliseFaultConfig(initial ?? {});
  let dirty = false;
  const roll = (rate: number): boolean => rate > 0 && random() < rate;

  return {
    get: () => structuredClone(config),
    set(patch) {
      config = normaliseFaultConfig(patch, config);
      dirty = true;
      return structuredClone(config);
    },
    reset() {
      config = normaliseFaultConfig({});
      dirty = true;
      return structuredClone(config);
    },
    load(json) {
      if (json === undefined || json === "") {
        config = normaliseFaultConfig({});
      } else {
        try {
          config = normaliseFaultConfig(JSON.parse(json) as FaultConfigPatch);
        } catch {
          config = normaliseFaultConfig({});
        }
      }
      dirty = false;
      return structuredClone(config);
    },
    serialize: () => JSON.stringify(config),
    get dirty() {
      return dirty;
    },
    markClean() {
      dirty = false;
    },
    latency() {
      const [min, max] = config.latencyMs;
      if (max <= 0) return 0;
      return min === max ? min : Math.round(min + random() * (max - min));
    },
    rollTimeout: () => roll(config.timeoutRate),
    rollServerError: () => roll(config.serverErrorRate),
    rollDependencyUnavailable: () => roll(config.dependencyUnavailableRate),
    consumeConflictOnce(entityType, entityId) {
      const index = config.conflictOnce.findIndex(
        (t) => t.entityType === entityType && t.entityId === entityId,
      );
      if (index < 0) return false;
      config.conflictOnce.splice(index, 1);
      dirty = true;
      return true;
    },
  };
}
