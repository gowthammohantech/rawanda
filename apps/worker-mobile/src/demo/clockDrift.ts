/**
 * Clock drift (HWM-10 task 5, PRD §10 "clock drift"). After every sync run that acknowledged at
 * least one op, the device clock is compared with the simulated server's time of that run; a
 * difference of more than 5 minutes shows a warning in Sync center and Settings ("times you
 * enter are still saved" — ordering uses `localSeq`, never device time) and is audited once per
 * new drift value as `worker.sync.clock_drift_detected` (phase name `sync.clock_drift_detected`,
 * app-prefixed because it is UI-originated).
 *
 * In the demo the device and the simulated server share the demo clock, so the device clock's
 * difference is SIMULATED: Network simulation → "Device clock (simulated)" stores an offset in
 * minutes (key/value storage `laif.worker.deviceClockOffsetMin`, cleared by Reset demo).
 */
import type { KeyValueStorage } from "@laif/auth-demo";
import type { SyncRun } from "@laif/repositories";
import { createStore, type StoreApi } from "zustand/vanilla";

export const CLOCK_DRIFT_THRESHOLD_MIN = 5;
export const DEVICE_CLOCK_OFFSET_KEY = "laif.worker.deviceClockOffsetMin" as const;
export const DEVICE_CLOCK_DRIFT_KEY = "laif.worker.clockDrift" as const;

/** Network simulation presets (minutes the device clock is ahead (+) / behind (−)). */
export const DEVICE_CLOCK_PRESETS = { ok: 0, ahead: 10, behind: -30 } as const;
export type DeviceClockPreset = keyof typeof DEVICE_CLOCK_PRESETS;

const MINUTE_MS = 60_000;

/** Signed difference device − server in whole minutes (rounded toward zero). */
export function clockDriftMinutes(deviceIso: string, serverIso: string): number {
  const diff = (Date.parse(deviceIso) - Date.parse(serverIso)) / MINUTE_MS;
  if (Number.isNaN(diff)) return 0;
  return Math.trunc(diff);
}

/** |drift| strictly greater than 5 minutes. */
export function isSignificantDrift(minutes: number): boolean {
  return Math.abs(minutes) > CLOCK_DRIFT_THRESHOLD_MIN;
}

/** The (simulated) device wall clock at a server instant. */
export function deviceClockIso(serverIso: string, offsetMinutes: number): string {
  return new Date(Date.parse(serverIso) + offsetMinutes * MINUTE_MS).toISOString();
}

export type ClockDrift = { minutes: number; detectedAt: string };

/**
 * The drift a finished run reveals: only runs with an acknowledgement carry a server time.
 * Returns `undefined` when the run says nothing (keep the previous state), `null` when the clocks
 * agree, else the drift.
 */
export function driftFromRun(
  run: Pick<SyncRun, "acknowledged" | "finishedAt">,
  offsetMinutes: number,
): ClockDrift | null | undefined {
  if (run.acknowledged === 0) return undefined;
  const minutes = clockDriftMinutes(deviceClockIso(run.finishedAt, offsetMinutes), run.finishedAt);
  return isSignificantDrift(minutes) ? { minutes, detectedAt: run.finishedAt } : null;
}

export type DeviceClockState = {
  offsetMinutes: number;
  /** Last significant drift seen after a sync run (null = clocks agree / not checked). */
  drift: ClockDrift | null;
};

export type DeviceClockStore = {
  store: StoreApi<DeviceClockState>;
  setOffset: (minutes: number) => void;
  /** Applies a run; returns the drift when it is NEW (caller audits it), else null. */
  observeRun: (run: Pick<SyncRun, "acknowledged" | "finishedAt">) => ClockDrift | null;
  /** Reset demo: clock correct again, warning cleared. */
  reset: () => void;
};

function readNumber(storage: KeyValueStorage, key: string): number {
  try {
    const value = Number(storage.getItem(key) ?? "0");
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

function readDrift(storage: KeyValueStorage): ClockDrift | null {
  try {
    const raw = storage.getItem(DEVICE_CLOCK_DRIFT_KEY);
    if (raw === null) return null;
    const value = JSON.parse(raw) as Partial<ClockDrift>;
    return typeof value.minutes === "number" && typeof value.detectedAt === "string"
      ? { minutes: value.minutes, detectedAt: value.detectedAt }
      : null;
  } catch {
    return null;
  }
}

function write(storage: KeyValueStorage, key: string, value: string | null): void {
  try {
    if (value === null) storage.removeItem(key);
    else storage.setItem(key, value);
  } catch {
    // Unwritable key/value store: the value lives in memory for this run.
  }
}

export function createDeviceClockStore(storage: KeyValueStorage): DeviceClockStore {
  const store = createStore<DeviceClockState>(() => ({
    offsetMinutes: readNumber(storage, DEVICE_CLOCK_OFFSET_KEY),
    drift: readDrift(storage),
  }));
  const setDrift = (drift: ClockDrift | null) => {
    store.setState({ drift });
    write(storage, DEVICE_CLOCK_DRIFT_KEY, drift === null ? null : JSON.stringify(drift));
  };
  return {
    store,
    setOffset(minutes) {
      store.setState({ offsetMinutes: minutes });
      write(storage, DEVICE_CLOCK_OFFSET_KEY, minutes === 0 ? null : String(minutes));
    },
    observeRun(run) {
      const next = driftFromRun(run, store.getState().offsetMinutes);
      if (next === undefined) return null;
      const previous = store.getState().drift;
      setDrift(next);
      return next !== null && previous?.minutes !== next.minutes ? next : null;
    },
    reset() {
      store.setState({ offsetMinutes: 0 });
      write(storage, DEVICE_CLOCK_OFFSET_KEY, null);
      setDrift(null);
    },
  };
}
