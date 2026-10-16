/**
 * `@laif/i18n/native` — React Native adapter backed by `expo-sqlite/kv-store`.
 *
 * The kv-store is injected rather than imported so this package does not pin an Expo SDK
 * (FND-11 owns the SDK pin). App usage:
 *
 *   import Storage from "expo-sqlite/kv-store";
 *   const storage = createNativeLanguageStorage("worker", Storage);
 */
import type { AppId } from "@laif/domain";

import type { Language } from "./languages.ts";
import { languageStorageKey, parseStoredLanguage, type LanguageStorage } from "./storage.ts";

/** The async subset of `expo-sqlite/kv-store` (also matches AsyncStorage). */
export interface KeyValueStoreLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export function createNativeLanguageStorage(
  appId: AppId,
  kvStore: KeyValueStoreLike,
): LanguageStorage {
  const key = languageStorageKey(appId);
  return {
    get: async () => parseStoredLanguage(await kvStore.getItem(key)),
    set: (language: Language) => kvStore.setItem(key, language),
  };
}

export type { LanguageStorage };
