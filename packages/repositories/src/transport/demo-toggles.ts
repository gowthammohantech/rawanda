/**
 * The three demo-tools switches every app shell shows (ui-web `DemoToolsMenu`, ui-native
 * `DemoToolsSheet`: Offline / Slow network / Server errors) mapped onto the single FND-07
 * `FaultConfig` (FND-11). Apps never invent their own mapping.
 *
 * | Toggle   | FaultConfig                                                         |
 * |----------|---------------------------------------------------------------------|
 * | offline  | `offline: true`                                                      |
 * | slow     | `latencyMs: SLOW_NETWORK_LATENCY_MS` (off → the default 150–450 ms) |
 * | errors   | `serverErrorRate: SIMULATED_SERVER_ERROR_RATE` (off → 0)            |
 */
import { DEFAULT_FAULT_CONFIG, type FaultConfig, type FaultConfigPatch } from "./faults.ts";

/** Same shape as `DemoFaultToggles` in `@laif/ui-web` / `@laif/ui-native`. */
export type DemoFaultToggleState = { offline: boolean; slow: boolean; errors: boolean };
export type DemoFaultToggleKey = keyof DemoFaultToggleState;

/** "Slow network": 1.5–3 s per call (real time). */
export const SLOW_NETWORK_LATENCY_MS: readonly [number, number] = [1500, 3000];

/** "Server errors": one call in four fails with `INTERNAL` (500) before it runs. */
export const SIMULATED_SERVER_ERROR_RATE = 0.25;

/** Reads the switch positions from a fault config (e.g. after reload or reset). */
export function faultTogglesFromConfig(config: Readonly<FaultConfig>): DemoFaultToggleState {
  return {
    offline: config.offline,
    slow: config.latencyMs[0] >= SLOW_NETWORK_LATENCY_MS[0],
    errors: config.serverErrorRate > 0,
  };
}

/** The `repo.demo.setFaults` patch for one switch. */
export function faultPatchForToggle(key: DemoFaultToggleKey, enabled: boolean): FaultConfigPatch {
  switch (key) {
    case "offline":
      return { offline: enabled };
    case "slow":
      return {
        latencyMs: enabled
          ? [SLOW_NETWORK_LATENCY_MS[0], SLOW_NETWORK_LATENCY_MS[1]]
          : [DEFAULT_FAULT_CONFIG.latencyMs[0], DEFAULT_FAULT_CONFIG.latencyMs[1]],
      };
    case "errors":
      return { serverErrorRate: enabled ? SIMULATED_SERVER_ERROR_RATE : 0 };
  }
}
