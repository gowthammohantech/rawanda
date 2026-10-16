/**
 * Language preference persistence through an injected adapter. Only `laif.<appId>.language` is
 * ever stored (no patient data). Web: `@laif/i18n/web`; native: `@laif/i18n/native`.
 */
import type { AppId } from "@laif/domain";

import { isSupportedLanguage, type Language } from "./languages.ts";

export interface LanguageStorage {
  /** The saved preference, or `null` when none (or an unrecognised value) is stored. */
  get(): Promise<Language | null>;
  set(language: Language): Promise<void>;
}

/** Storage key of an app's language preference. */
export function languageStorageKey(appId: AppId): `laif.${AppId}.language` {
  return `laif.${appId}.language`;
}

/** Normalises a raw stored value: anything unsupported reads as "no preference". */
export function parseStoredLanguage(raw: unknown): Language | null {
  return isSupportedLanguage(raw) ? raw : null;
}

export interface MemoryLanguageStorage extends LanguageStorage {
  /** Synchronous read of the current value (tests, `createTestI18n`). */
  peek(): Language | null;
}

/** In-memory adapter: tests, Storybook-like galleries and the default when none is injected. */
export function createMemoryLanguageStorage(
  initial: Language | null = null,
): MemoryLanguageStorage {
  let value = initial;
  return {
    get: () => Promise.resolve(value),
    set: (language) => {
      value = language;
      return Promise.resolve();
    },
    peek: () => value,
  };
}
