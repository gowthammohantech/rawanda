/**
 * "Recent" on the Find tab (HWM-04 task 1): the last 10 patients touched (opened or registered)
 * ON THIS DEVICE, per facility. Only patient ids are kept (no names — those are resolved from the
 * local store at read time), in the device key/value storage next to the session
 * (`laif.worker.recentPatients.<facilityId>`). Ids no longer on the device are skipped on read.
 */
import { createMemoryStorage, type KeyValueStorage } from "@laif/auth-demo";

import { platform } from "../platform";

export const RECENT_PATIENTS_LIMIT = 10;
export const recentPatientsKey = (facilityId: string) =>
  `laif.worker.recentPatients.${facilityId}` as const;

export type RecentPatientsStore = {
  list: (facilityId: string) => string[];
  touch: (facilityId: string, patientId: string) => void;
};

export function createRecentPatientsStore(storage: KeyValueStorage): RecentPatientsStore {
  const read = (facilityId: string): string[] => {
    try {
      const raw = storage.getItem(recentPatientsKey(facilityId));
      const value: unknown = raw === null ? [] : JSON.parse(raw);
      return Array.isArray(value)
        ? value.filter((id): id is string => typeof id === "string").slice(0, RECENT_PATIENTS_LIMIT)
        : [];
    } catch {
      return [];
    }
  };
  return {
    list: read,
    touch(facilityId, patientId) {
      const next = [patientId, ...read(facilityId).filter((id) => id !== patientId)].slice(
        0,
        RECENT_PATIENTS_LIMIT,
      );
      try {
        storage.setItem(recentPatientsKey(facilityId), JSON.stringify(next));
      } catch {
        // Recents are a convenience only; an unwritable store never blocks the flow.
      }
    },
  };
}

let shared: RecentPatientsStore | null = null;

/** The device store (platform key/value storage; memory if it cannot be opened). */
export function recentPatients(): RecentPatientsStore {
  if (shared === null) {
    let storage: KeyValueStorage;
    try {
      storage = platform.personaStorage();
    } catch {
      storage = createMemoryStorage();
    }
    shared = createRecentPatientsStore(storage);
  }
  return shared;
}
