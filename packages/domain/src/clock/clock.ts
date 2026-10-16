/**
 * The single wall-clock reader of the repo (lint-enforced). Apps use a pinned demo clock so
 * every screen, seed and derivation is deterministic.
 */

export interface Clock {
  now(): Date;
  nowIso(): string;
}

/** 08:00 Africa/Kigali on Wednesday 14 October 2026 (decision, FND-02). */
export const DEMO_CLOCK_DEFAULT_ISO = "2026-10-14T06:00:00.000Z";

export type DemoClockMode = "frozen" | "ticking";

export type DemoClockOptions = {
  pinnedIso?: string;
  mode?: DemoClockMode;
  /** Wall-time source for `ticking` mode (defaults to `Date.now`); injectable for tests. */
  wallNow?: () => number;
};

export interface DemoClock extends Clock {
  readonly mode: DemoClockMode;
  /** The pinned start instant (ISO). */
  readonly pinnedIso: string;
  /** Demo "time travel": moves the clock forward (or back, with a negative value). */
  advanceBy(ms: number): void;
  /** Returns to the pinned instant (clears time travel and elapsed ticking time). */
  reset(): void;
}

/**
 * - `frozen`: always returns the pinned instant (+ any `advanceBy` offset).
 * - `ticking`: advances from the pinned instant with real elapsed time since creation, so
 *   restarts within a session stay coherent.
 */
export function createDemoClock(options: DemoClockOptions = {}): DemoClock {
  const pinnedIso = options.pinnedIso ?? DEMO_CLOCK_DEFAULT_ISO;
  const mode = options.mode ?? "frozen";
  const wallNow = options.wallNow ?? (() => Date.now());
  const pinnedMs = Date.parse(pinnedIso);
  if (Number.isNaN(pinnedMs)) {
    throw new RangeError(`Invalid demo clock instant: ${pinnedIso}`);
  }

  let startedAt = wallNow();
  let offsetMs = 0;

  const nowMs = (): number =>
    pinnedMs + offsetMs + (mode === "ticking" ? wallNow() - startedAt : 0);

  return {
    mode,
    pinnedIso: new Date(pinnedMs).toISOString(),
    now: () => new Date(nowMs()),
    nowIso: () => new Date(nowMs()).toISOString(),
    advanceBy(ms: number) {
      offsetMs += ms;
    },
    reset() {
      offsetMs = 0;
      startedAt = wallNow();
    },
  };
}

/** Real wall clock. Exists only for tests of the clock itself — apps use `createDemoClock`. */
export function createSystemClock(): Clock {
  return {
    now: () => new Date(),
    nowIso: () => new Date().toISOString(),
  };
}
