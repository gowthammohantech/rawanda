/**
 * Settings › Fault simulation ↔ FND-07 `FaultConfig` (CLN-02 task 6). Unlike the topbar menu's
 * probabilistic "Server errors" (25 %), the Settings toggles are deterministic (rate 1) so a
 * presenter can show each error state on demand.
 *
 * | Settings control | FaultConfig                                                    |
 * |------------------|----------------------------------------------------------------|
 * | latency slider   | `latencyMs: [ms, ms]` (0–3000)                                 |
 * | timeout          | `timeoutRate: 1` (after commit → TIMEOUT, same-key retry safe) |
 * | serverError      | `serverErrorRate: 1` (500 before the call runs)                |
 * | offline          | `offline: true`                                                |
 * | conflict         | `conflictOnce` on the WF-01 / WF-02 / WF-03 scenario records + |
 * |                  | the AMENDED / MISSING_UNIT screenings (CLN-04 amendment)       |
 */
import { SEED_ANCHORS } from "@laif/mock-data";
import { DEFAULT_FAULT_CONFIG, type FaultConfig, type FaultConfigPatch } from "@laif/repositories";

export const LATENCY_MAX_MS = 3000;
export const LATENCY_STEP_MS = 50;

export type FaultSwitchKey = "timeout" | "serverError" | "offline" | "conflict";
export const FAULT_SWITCHES: readonly FaultSwitchKey[] = [
  "offline",
  "serverError",
  "timeout",
  "conflict",
];

/** Records whose next write conflicts while "Conflict on next write" is on. */
export const CONFLICT_TARGETS = [
  { entityType: "review", entityId: SEED_ANCHORS.WF01_FLAGGED_REVIEW.reviewId },
  { entityType: "followUp", entityId: SEED_ANCHORS.WF02_FOLLOWUP_CONFLICT.followUpId },
  { entityType: "review", entityId: SEED_ANCHORS.WF03_DISMISSABLE_FLAG.reviewId },
  // CLN-04: the next amendment of these screenings reports a version conflict.
  { entityType: "screening", entityId: SEED_ANCHORS.AMENDED_SCREENING.screeningId },
  { entityType: "screening", entityId: SEED_ANCHORS.MISSING_UNIT_SCREENING.screeningId },
] as const;

export function faultSwitchOn(config: Readonly<FaultConfig>, key: FaultSwitchKey): boolean {
  switch (key) {
    case "timeout":
      return config.timeoutRate > 0;
    case "serverError":
      return config.serverErrorRate > 0;
    case "offline":
      return config.offline;
    case "conflict":
      return config.conflictOnce.length > 0;
  }
}

export function faultSwitchPatch(key: FaultSwitchKey, enabled: boolean): FaultConfigPatch {
  switch (key) {
    case "timeout":
      return { timeoutRate: enabled ? 1 : 0 };
    case "serverError":
      return { serverErrorRate: enabled ? 1 : 0 };
    case "offline":
      return { offline: enabled };
    case "conflict":
      return { conflictOnce: enabled ? CONFLICT_TARGETS.map((target) => ({ ...target })) : [] };
  }
}

export function latencyPatch(ms: number): FaultConfigPatch {
  const value = Math.min(LATENCY_MAX_MS, Math.max(0, Math.round(ms)));
  return { latencyMs: [value, value] };
}

/** Latency shown on the slider: the upper bound of the configured range. */
export function latencyValue(config: Readonly<FaultConfig>): number {
  return config.latencyMs[1];
}

const isDefaultLatency = (config: Readonly<FaultConfig>): boolean =>
  config.latencyMs[0] === DEFAULT_FAULT_CONFIG.latencyMs[0] &&
  config.latencyMs[1] === DEFAULT_FAULT_CONFIG.latencyMs[1];

/** True when any simulated fault differs from the defaults (drives the "active" pill). */
export function anyFaultActive(config: Readonly<FaultConfig>): boolean {
  return (
    config.offline ||
    config.timeoutRate > 0 ||
    config.serverErrorRate > 0 ||
    config.dependencyUnavailableRate > 0 ||
    config.conflictOnce.length > 0 ||
    config.deviceRevoked ||
    !isDefaultLatency(config)
  );
}

/** Everything back to the FND-07 defaults. */
export const ALL_FAULTS_OFF: FaultConfigPatch = {
  latencyMs: [DEFAULT_FAULT_CONFIG.latencyMs[0], DEFAULT_FAULT_CONFIG.latencyMs[1]],
  timeoutRate: 0,
  serverErrorRate: 0,
  dependencyUnavailableRate: 0,
  offline: false,
  conflictOnce: [],
  deviceRevoked: false,
};
