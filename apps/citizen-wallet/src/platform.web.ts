/**
 * Expo web target (and Vitest): IndexedDB `laif-citizen` via Dexie (expo-sqlite's exclusive
 * transactions are not supported on web), localStorage for language + persona, and
 * `crypto.randomUUID`. Metro bundles this file only for `--platform web`.
 */
import { createMemoryStorage, type KeyValueStorage } from "@laif/auth-demo";
import { createWebLanguageStorage } from "@laif/i18n/web";
import { dexieDbName } from "@laif/repositories";
import { createDexieStoreAdapter } from "@laif/repositories/dexie";
import { createWebIdGenerator } from "@laif/repositories/ids/web";

import { APP_ID } from "./config.ts";
import { SimulatedNotificationAdapter } from "./features/reminders/notificationAdapter.ts";
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

/** No OS notifications on the Expo web target (preview hidden): simulation only. */
const notifications = new SimulatedNotificationAdapter();

export const platform: AppPlatform = {
  openStore: () => Promise.resolve(createDexieStoreAdapter({ dbName: dexieDbName(APP_ID) })),
  createIds: () => createWebIdGenerator(),
  languageStorage: () => createWebLanguageStorage(APP_ID),
  personaStorage: browserStorage,
  notifications: () => notifications,
};
