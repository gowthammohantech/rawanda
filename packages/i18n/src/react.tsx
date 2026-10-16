/**
 * React bindings usable in React DOM and React Native alike (react-i18next only, no DOM APIs).
 */
import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { I18nextProvider, useTranslation } from "react-i18next";

import type { I18nInstance } from "./create-i18n.ts";
import {
  DEFAULT_LANGUAGE,
  isSupportedLanguage,
  SUPPORTED_LANGUAGES,
  type Language,
} from "./languages.ts";
import { DEFAULT_NAMESPACE, type Namespace } from "./resources.ts";

const LaifI18nContext = createContext<I18nInstance | null>(null);

export type I18nProviderProps = { i18n: I18nInstance; children?: ReactNode };

export function I18nProvider({ i18n, children }: I18nProviderProps) {
  return (
    <LaifI18nContext.Provider value={i18n}>
      <I18nextProvider i18n={i18n.i18n} defaultNS={DEFAULT_NAMESPACE}>
        {children}
      </I18nextProvider>
    </LaifI18nContext.Provider>
  );
}

/** The app's `I18nInstance` (throws outside `<I18nProvider>`). */
export function useI18nInstance(): I18nInstance {
  const instance = useContext(LaifI18nContext);
  if (instance === null) throw new Error("useI18nInstance must be used inside <I18nProvider>");
  return instance;
}

/**
 * Typed `t` for one namespace (default `common`); re-renders on language change. Use
 * `useT('demo')('banner')` for another namespace (the instance `t` accepts `ns:key`).
 */
export function useT<N extends Namespace = typeof DEFAULT_NAMESPACE>(ns?: N) {
  return useTranslation((ns ?? DEFAULT_NAMESPACE) as N, { useSuspense: false }).t;
}

export type UseLanguageResult = {
  language: Language;
  setLanguage: (language: Language) => Promise<void>;
  languages: readonly Language[];
};

/** Current language + persisted switcher (for FND-09/FND-10 `LanguageSwitcher`). */
export function useLanguage(): UseLanguageResult {
  const instance = useI18nInstance();
  const { i18n } = useTranslation(DEFAULT_NAMESPACE, { useSuspense: false });
  const resolved = i18n.resolvedLanguage ?? i18n.language;
  const language = isSupportedLanguage(resolved) ? resolved : DEFAULT_LANGUAGE;
  const setLanguage = useCallback((next: Language) => instance.setLanguage(next), [instance]);
  return useMemo(
    () => ({ language, setLanguage, languages: SUPPORTED_LANGUAGES }),
    [language, setLanguage],
  );
}
