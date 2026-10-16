import { LANGUAGES, type Language } from "@laif/domain";

export type { Language };

/** Supported UI languages (English, Kinyarwanda). Same vocabulary as `@laif/domain` LANGUAGES. */
export const SUPPORTED_LANGUAGES = LANGUAGES;

/** Initial language when no preference is stored (no device-locale detection — decision). */
export const DEFAULT_LANGUAGE = "en" as const satisfies Language;

/** BCP 47 tags used for `document.documentElement.lang` and Intl. */
export const LANGUAGE_TAGS = { en: "en", rw: "rw" } as const satisfies Record<Language, string>;

export function isSupportedLanguage(value: unknown): value is Language {
  return typeof value === "string" && (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}
