/**
 * Relative day distance ("2 days ago", "in 3 days") for task due dates (HWM-07 §8).
 *
 * Uses `Intl.RelativeTimeFormat` when the runtime has REAL locale data for the language (Hermes
 * may lack `Intl.RelativeTimeFormat` or Kinyarwanda; ICU builds that "support" `rw` but only
 * carry root data print a signed number such as "-2 d", which is treated as missing data) and
 * otherwise falls back to the `worker:tasks.relative.*` catalogue strings. "Today" always comes
 * from the catalogue. Day counts are Kigali calendar days from the demo clock (never wall time).
 */
import type { Language } from "@laif/i18n";
import type { TranslationKey, TranslationValues } from "@laif/ui-native";

type Tx = (key: TranslationKey, values?: TranslationValues) => string;

type RelativeTimeFormatCtor = typeof Intl.RelativeTimeFormat;

const RTF_LOCALE: Record<Language, string> = { en: "en-GB", rw: "rw" };

/** The usable `Intl.RelativeTimeFormat` locale for `lng`, or null (→ catalogue fallback). */
const runtimeRtf = (): RelativeTimeFormatCtor | null =>
  (globalThis.Intl as Partial<typeof Intl> | undefined)?.RelativeTimeFormat ?? null;

/** Root (locale-less) ICU patterns: "-2 d" / "+2 d". */
const ROOT_PATTERN = /[-+\u2212]\s?\d/u;

/**
 * The usable `Intl.RelativeTimeFormat` locale for `lng`, or null (→ catalogue fallback).
 * `rtf: null` simulates a runtime without `Intl.RelativeTimeFormat`.
 */
export function intlRelativeLocale(
  lng: Language,
  rtf: RelativeTimeFormatCtor | null = runtimeRtf(),
): string | null {
  if (rtf === null) return null;
  const locale = RTF_LOCALE[lng];
  try {
    if (rtf.supportedLocalesOf([locale]).length === 0) return null;
    const probe = new rtf(locale, { numeric: "always" }).format(-2, "day");
    return ROOT_PATTERN.test(probe) ? null : locale;
  } catch {
    return null;
  }
}

/** `days` < 0 = in the past. */
export function formatRelativeDays(
  days: number,
  lng: Language,
  t: Tx,
  rtf: RelativeTimeFormatCtor | null = runtimeRtf(),
): string {
  if (days === 0) return t("worker:tasks.relative.today");
  const locale = intlRelativeLocale(lng, rtf);
  if (locale !== null && rtf !== null) {
    return new rtf(locale, { numeric: "always" }).format(days, "day");
  }
  const count = Math.abs(days);
  return days < 0
    ? t("worker:tasks.relative.daysAgo", { count })
    : t("worker:tasks.relative.inDays", { count });
}
