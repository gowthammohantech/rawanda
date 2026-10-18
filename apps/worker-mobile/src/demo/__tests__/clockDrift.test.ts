// @vitest-environment node
/** HWM-10 clock drift: minutes, threshold (> 5 min), run handling, persistence and reset. */
import { createMemoryStorage } from "@laif/auth-demo";
import { describe, expect, it } from "vitest";

import {
  clockDriftMinutes,
  createDeviceClockStore,
  DEVICE_CLOCK_OFFSET_KEY,
  deviceClockIso,
  driftFromRun,
  isSignificantDrift,
} from "../clockDrift.ts";

const SERVER = "2026-10-14T06:00:00.000Z";
const run = (acknowledged: number, finishedAt = SERVER) => ({ acknowledged, finishedAt });

describe("clock drift (HWM-10)", () => {
  it("measures signed whole minutes device − server", () => {
    expect(clockDriftMinutes("2026-10-14T06:10:30.000Z", SERVER)).toBe(10);
    expect(clockDriftMinutes("2026-10-14T05:30:00.000Z", SERVER)).toBe(-30);
    expect(clockDriftMinutes(SERVER, SERVER)).toBe(0);
    expect(clockDriftMinutes("not a date", SERVER)).toBe(0);
    expect(deviceClockIso(SERVER, -30)).toBe("2026-10-14T05:30:00.000Z");
  });

  it("warns only above 5 minutes", () => {
    expect(isSignificantDrift(5)).toBe(false);
    expect(isSignificantDrift(-5)).toBe(false);
    expect(isSignificantDrift(6)).toBe(true);
    expect(isSignificantDrift(-30)).toBe(true);
  });

  it("only runs with an acknowledgement carry a server time", () => {
    expect(driftFromRun(run(0), 30)).toBeUndefined();
    expect(driftFromRun(run(1), 0)).toBeNull();
    expect(driftFromRun(run(1), 3)).toBeNull();
    expect(driftFromRun(run(2), 10)).toEqual({ minutes: 10, detectedAt: SERVER });
  });

  it("store: a NEW drift is reported once, cleared when clocks agree, persisted, reset", () => {
    const storage = createMemoryStorage();
    const clock = createDeviceClockStore(storage);
    expect(clock.store.getState()).toEqual({ offsetMinutes: 0, drift: null });
    clock.setOffset(-30);
    expect(storage.getItem(DEVICE_CLOCK_OFFSET_KEY)).toBe("-30");
    expect(clock.observeRun(run(0))).toBeNull();
    expect(clock.store.getState().drift).toBeNull();
    expect(clock.observeRun(run(1))).toEqual({ minutes: -30, detectedAt: SERVER });
    // Same drift again: still shown, not reported (audited) twice.
    expect(clock.observeRun(run(1))).toBeNull();
    expect(clock.store.getState().drift?.minutes).toBe(-30);
    // Survives a restart.
    const restarted = createDeviceClockStore(storage);
    expect(restarted.store.getState()).toEqual({
      offsetMinutes: -30,
      drift: { minutes: -30, detectedAt: SERVER },
    });
    restarted.setOffset(0);
    expect(restarted.observeRun(run(1))).toBeNull();
    expect(restarted.store.getState().drift).toBeNull();
    restarted.setOffset(10);
    restarted.observeRun(run(1));
    restarted.reset();
    expect(restarted.store.getState()).toEqual({ offsetMinutes: 0, drift: null });
    expect(createDeviceClockStore(storage).store.getState()).toEqual({
      offsetMinutes: 0,
      drift: null,
    });
  });
});
