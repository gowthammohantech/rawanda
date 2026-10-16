/**
 * `@laif/i18n/web` — browser adapter: `localStorage` key `laif.<appId>.language`.
 * Kept out of the main entry so the core never touches DOM-only globals at import time.
 */
import type { AppId } from "@laif/domain";

import type { Language } from "./languages.ts";
import { languageStorageKey, parseStoredLanguage, type LanguageStorage } from "./storage.ts";

/** The subset of the Web Storage API the adapter needs (injectable for tests). */
export interface WebStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function defaultWebStorage(): WebStorageLike {
  // Merely reading `localStorage` throws (SecurityError) when site data is blocked.
  const storage = (globalThis as { localStorage?: WebStorageLike }).localStorage;
  if (storage === undefined) throw new Error("localStorage is not available");
  return storage;
}

/**
 * `localStorage` is resolved lazily on each call, so a missing or blocked store never throws
 * here. Errors (private mode, quota, disabled storage) surface as rejected promises;
 * `createI18n` / `setLanguage` catch them and keep the language in memory.
 */
export function createWebLanguageStorage(appId: AppId, storage?: WebStorageLike): LanguageStorage {
  const key = languageStorageKey(appId);
  const backing = (): WebStorageLike => storage ?? defaultWebStorage();
  return {
    get: () => Promise.resolve().then(() => parseStoredLanguage(backing().getItem(key))),
    set: (language: Language) => Promise.resolve().then(() => backing().setItem(key, language)),
  };
}

export type { LanguageStorage };
