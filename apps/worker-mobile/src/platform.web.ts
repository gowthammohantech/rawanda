/**
 * Expo web target (and Vitest): IndexedDB `laif-worker` via Dexie (expo-sqlite's exclusive
 * transactions are not supported on web), localStorage for language + persona, and
 * `crypto.randomUUID`. Metro bundles this file only for `--platform web`.
 */
import { createMemoryStorage, type KeyValueStorage } from "@laif/auth-demo";
import { createWebLanguageStorage } from "@laif/i18n/web";
import { dexieDbName } from "@laif/repositories";
import { createDexieStoreAdapter } from "@laif/repositories/dexie";
import { createWebIdGenerator } from "@laif/repositories/ids/web";

import { APP_ID } from "./config.ts";
import type { AppPlatform } from "./platform.types.ts";

function browserStorage(): KeyValueStorage {
  try {
    const storage = window.localStorage;
    const probe = "laif.__probe";
    storage.setItem(probe, "1");
    storage.removeItem(probe);
    return storage;
  } catch {
    return createMemoryStorage();
  }
}

export const platform: AppPlatform = {
  openStore: () => Promise.resolve(createDexieStoreAdapter({ dbName: dexieDbName(APP_ID) })),
  createIds: () => createWebIdGenerator(),
  languageStorage: () => createWebLanguageStorage(APP_ID),
  personaStorage: browserStorage,
  copyText: async (text) => {
    try {
      if (typeof navigator === "undefined" || navigator.clipboard === undefined) return false;
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  },
};
