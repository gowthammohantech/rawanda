/**
 * iOS / Android (Expo Go): SQLite file `laif-worker.db` (one file per app; the simulated remote
 * lives in its `remote_*` collections), `expo-sqlite/kv-store` for language + persona, and
 * `expo-crypto` UUIDs. Metro bundles this file only for native platforms.
 */
import { createNativeLanguageStorage } from "@laif/i18n/native";
import { sqliteDbFileName } from "@laif/repositories";
import { openExpoSqliteExecutor } from "@laif/repositories/expo-sqlite";
import { createNativeIdGenerator } from "@laif/repositories/ids/native";
import { createSqliteStoreAdapter } from "@laif/repositories/sqlite";
import Storage from "expo-sqlite/kv-store";
import { Share } from "react-native";

import { APP_ID } from "./config.ts";
import type { AppPlatform } from "./platform.types.ts";

export const platform: AppPlatform = {
  openStore: async () =>
    createSqliteStoreAdapter(await openExpoSqliteExecutor(sqliteDbFileName(APP_ID))),
  createIds: () => createNativeIdGenerator(),
  languageStorage: () => createNativeLanguageStorage(APP_ID, Storage),
  personaStorage: () => ({
    getItem: (key) => Storage.getItemSync(key),
    setItem: (key, value) => Storage.setItemSync(key, value),
    removeItem: (key) => {
      Storage.removeItemSync(key);
    },
  }),
  copyText: async (text) => {
    try {
      const result = await Share.share({ message: text });
      return result.action !== Share.dismissedAction;
    } catch {
      return false;
    }
  },
};
