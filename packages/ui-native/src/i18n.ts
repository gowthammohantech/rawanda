/**
 * i18n glue for the kit. Every visible string comes from `@laif/i18n` keys or from props the
 * app has already translated — no component hardcodes English.
 */
import { useI18nInstance, useT, type Namespace } from "@laif/i18n";
import type { ParseKeys } from "i18next";
import { useCallback } from "react";

/** Any fully-qualified catalogue key, e.g. `"shell:nav.section.work"` (checked by `tsc`). */
export type TranslationKey = ParseKeys<readonly Namespace[]>;

export type TranslationValues = Record<string, string | number>;

/** `(key, values?) => string` for any namespace; re-renders on language change. */
export function useTx(): (key: TranslationKey, values?: TranslationValues) => string {
  const t = useT();
  return useCallback(
    (key: TranslationKey, values?: TranslationValues) =>
      (t as unknown as (k: string, v?: TranslationValues) => string)(key, values),
    [t],
  );
}

/**
 * Like `useTx`, but returns `null` outside `<I18nProvider>` (the BrandSplash may render
 * before the app's i18n instance has finished loading the persisted language).
 */
export function useOptionalTx():
  ((key: TranslationKey, values?: TranslationValues) => string) | null {
  let available = true;
  try {
    useI18nInstance();
  } catch {
    available = false;
  }
  const t = useTx();
  return available ? t : null;
}
