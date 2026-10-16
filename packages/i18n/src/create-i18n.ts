/**
 * One i18next instance per app (web and React Native alike): bundled resources, EN fallback,
 * typed keys, persisted language preference, dev-only missing-key reporting.
 */
import type { AppId } from "@laif/domain";
import i18next, { type i18n as I18next, type PostProcessorModule } from "i18next";

import {
  DEFAULT_LANGUAGE,
  isSupportedLanguage,
  LANGUAGE_TAGS,
  SUPPORTED_LANGUAGES,
  type Language,
} from "./languages.ts";
import { recordMissingKey, setMissingKeyLogging, type MissingKeyWarn } from "./missing.ts";
import { DEFAULT_NAMESPACE, NAMESPACES, resources as bundledResources } from "./resources.ts";
import { createMemoryLanguageStorage, type LanguageStorage } from "./storage.ts";
import "./types.ts";

export type I18nResources = Record<Language, Record<string, object>>;

export type CreateI18nOptions = {
  appId: AppId;
  /** Where the language preference lives (web: `@laif/i18n/web`, native: `@laif/i18n/native`). */
  storage?: LanguageStorage;
  /** Used only when no preference is stored. Defaults to `'en'` (no device-locale detection). */
  initialLanguage?: Language;
  /** Dev builds: warn once per missing key and record it in `getMissingKeyReport()`. */
  isDev?: boolean;
  /** Test seam: replaces the bundled catalogues. */
  resources?: I18nResources;
  /** Test seam for dev warnings (defaults to `console.warn`). */
  warn?: MissingKeyWarn;
};

export type TFunction = I18next["t"];

export interface I18nInstance {
  readonly appId: AppId;
  /** The underlying i18next instance (for `I18nextProvider` and advanced use). */
  readonly i18n: I18next;
  readonly languages: readonly Language[];
  /** The active language. */
  readonly language: Language;
  /** Translates in the active language (typed keys; `ns:key` notation). */
  readonly t: TFunction;
  /**
   * Persists the preference **before** switching; a storage failure is logged (dev) and the
   * language still changes in memory. On web it also sets `document.documentElement.lang`.
   */
  setLanguage(language: Language): Promise<void>;
  /** Subscribes to language changes; returns an unsubscribe function. */
  onLanguageChanged(listener: (language: Language) => void): () => void;
}

let processorSeq = 0;

function cloneResources(source: I18nResources): I18nResources {
  // i18next stores the object by reference; clone so one instance's runtime edits stay local.
  return JSON.parse(JSON.stringify(source)) as I18nResources;
}

type ResolvedDetails = { res?: unknown; usedLng?: string; usedNS?: string; usedKey?: string };

function fallbackDetector(warn: MissingKeyWarn): PostProcessorModule {
  processorSeq += 1;
  return {
    type: "postProcessor",
    name: `laifMissingFallback${processorSeq}`,
    process(value, key, options, translator: { language?: string }) {
      const opts = options as { i18nResolved?: ResolvedDetails; lng?: string; ns?: unknown };
      const resolved = opts.i18nResolved;
      const requested = opts.lng ?? translator.language;
      if (
        resolved?.res !== undefined &&
        resolved.usedLng !== undefined &&
        requested !== undefined &&
        requested !== "cimode" &&
        resolved.usedLng !== requested
      ) {
        recordMissingKey(
          {
            lng: requested,
            ns: resolved.usedNS ?? DEFAULT_NAMESPACE,
            key: resolved.usedKey ?? (Array.isArray(key) ? String(key[0]) : key),
            kind: "fallback",
          },
          warn,
        );
      }
      return value;
    },
  };
}

function setDocumentLanguage(language: Language): void {
  const doc = (globalThis as { document?: { documentElement?: { lang: string } } }).document;
  if (doc?.documentElement) doc.documentElement.lang = LANGUAGE_TAGS[language];
}

function devWarn(isDev: boolean, warn: MissingKeyWarn, ...args: unknown[]): void {
  if (isDev) warn(...args);
}

/**
 * Builds and synchronously initialises an instance (resources are inline, `initAsync: false`).
 * Shared by `createI18n` (after reading storage) and `createTestI18n`.
 */
export function buildI18nInstance(
  options: CreateI18nOptions,
  language: Language,
  storage: LanguageStorage,
): I18nInstance {
  const isDev = options.isDev ?? false;
  const warn: MissingKeyWarn = options.warn ?? ((...args) => console.warn(...args));
  if (isDev) setMissingKeyLogging(true, warn);

  const instance = i18next.createInstance();
  const postProcess: string[] = [];
  if (isDev) {
    const detector = fallbackDetector(warn);
    instance.use(detector);
    postProcess.push(detector.name);
  }

  void instance.init({
    resources: cloneResources(options.resources ?? (bundledResources as I18nResources)),
    lng: language,
    fallbackLng: DEFAULT_LANGUAGE,
    supportedLngs: [...SUPPORTED_LANGUAGES],
    nonExplicitSupportedLngs: false,
    load: "languageOnly",
    ns: [...NAMESPACES],
    defaultNS: DEFAULT_NAMESPACE,
    fallbackNS: false,
    returnNull: false,
    returnEmptyString: false,
    interpolation: { escapeValue: false },
    initAsync: false,
    showSupportNotice: false,
    saveMissing: isDev,
    ...(isDev
      ? {
          postProcess,
          postProcessPassResolved: true,
          missingKeyHandler: (_lngs: readonly string[], ns: string, key: string) => {
            recordMissingKey(
              { lng: instance.language || language, ns, key, kind: "missing" },
              warn,
            );
          },
        }
      : {}),
  });

  setDocumentLanguage(language);

  const current = (): Language => {
    const resolved = instance.resolvedLanguage ?? instance.language;
    return isSupportedLanguage(resolved) ? resolved : DEFAULT_LANGUAGE;
  };

  return {
    appId: options.appId,
    i18n: instance,
    languages: SUPPORTED_LANGUAGES,
    get language() {
      return current();
    },
    t: instance.t.bind(instance),
    async setLanguage(next: Language) {
      if (!isSupportedLanguage(next)) {
        throw new RangeError(`Unsupported language: ${String(next)}`);
      }
      try {
        await storage.set(next);
      } catch (error) {
        devWarn(isDev, warn, "[i18n] could not save language preference", error);
      }
      await instance.changeLanguage(next);
      setDocumentLanguage(next);
    },
    onLanguageChanged(listener) {
      const handler = (lng: string) => {
        if (isSupportedLanguage(lng)) listener(lng);
      };
      instance.on("languageChanged", handler);
      return () => instance.off("languageChanged", handler);
    },
  };
}

/**
 * Creates the app's i18n instance. Initial language = stored preference → `initialLanguage` →
 * `'en'`. Works fully offline: no network loading of any kind.
 */
export async function createI18n(options: CreateI18nOptions): Promise<I18nInstance> {
  const storage = options.storage ?? createMemoryLanguageStorage();
  let stored: Language | null = null;
  try {
    const value = await storage.get();
    stored = isSupportedLanguage(value) ? value : null;
  } catch (error) {
    devWarn(
      options.isDev ?? false,
      options.warn ?? ((...args) => console.warn(...args)),
      "[i18n] could not read language preference",
      error,
    );
  }
  const language = stored ?? options.initialLanguage ?? DEFAULT_LANGUAGE;
  return buildI18nInstance(options, language, storage);
}
