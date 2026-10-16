import { describe, expect, it } from "vitest";

import {
  faultPatchForToggle,
  faultTogglesFromConfig,
  SIMULATED_SERVER_ERROR_RATE,
  SLOW_NETWORK_LATENCY_MS,
} from "./demo-toggles.ts";
import { DEFAULT_FAULT_CONFIG, normaliseFaultConfig } from "./faults.ts";

describe("demo fault toggles ↔ FaultConfig", () => {
  it("defaults read as all switches off", () => {
    expect(faultTogglesFromConfig(DEFAULT_FAULT_CONFIG)).toEqual({
      offline: false,
      slow: false,
      errors: false,
    });
  });

  it("maps each switch onto the FND-07 field", () => {
    expect(faultPatchForToggle("offline", true)).toEqual({ offline: true });
    expect(faultPatchForToggle("slow", true)).toEqual({ latencyMs: [...SLOW_NETWORK_LATENCY_MS] });
    expect(faultPatchForToggle("slow", false)).toEqual({
      latencyMs: [...DEFAULT_FAULT_CONFIG.latencyMs],
    });
    expect(faultPatchForToggle("errors", true)).toEqual({
      serverErrorRate: SIMULATED_SERVER_ERROR_RATE,
    });
    expect(faultPatchForToggle("errors", false)).toEqual({ serverErrorRate: 0 });
  });

  it("round-trips through normaliseFaultConfig", () => {
    let config = normaliseFaultConfig({});
    for (const key of ["offline", "slow", "errors"] as const) {
      config = normaliseFaultConfig(faultPatchForToggle(key, true), config);
    }
    expect(faultTogglesFromConfig(config)).toEqual({ offline: true, slow: true, errors: true });
    config = normaliseFaultConfig(faultPatchForToggle("slow", false), config);
    expect(faultTogglesFromConfig(config).slow).toBe(false);
  });
});
