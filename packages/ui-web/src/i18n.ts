/**
 * i18n glue for the kit. Every visible string comes from `@laif/i18n` keys or from props the
 * app has already translated — no component hardcodes English.
 */
import { useT, type Namespace } from "@laif/i18n";
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
