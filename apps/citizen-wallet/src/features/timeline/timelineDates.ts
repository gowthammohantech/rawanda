/**
 * Kigali calendar helpers for the timeline (CTZ-06): month sections ("October 2026") and the
 * mono rail label ("OCT 13"). Africa/Kigali is UTC+2 all year (no DST), so the `@laif/i18n`
 * fixed-offset wall-clock parts are exact. Month names come from the `common:months.*`
 * catalogue (EN + RW).
 */
import { kigaliPartsManual } from "@laif/i18n";
import type { TranslationKey, TranslationValues } from "@laif/ui-native";

type Tx = (key: TranslationKey, values?: TranslationValues) => string;

const partsOf = (iso: string) => kigaliPartsManual(Date.parse(iso));

/** `"2026-10"` — the Kigali month an ISO instant falls in. */
export function monthKeyOf(iso: string): string {
  const { year, month } = partsOf(iso);
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** `"October 2026"` / `"Ukwakira 2026"`. */
export function monthTitle(t: Tx, iso: string): string {
  const { year, month } = partsOf(iso);
  return `${t(`common:months.long.${month}` as TranslationKey)} ${year}`;
}

/** `"OCT 13"` / `"UKW 13"`. */
export function railDateLabel(t: Tx, iso: string): string {
  const { month, day } = partsOf(iso);
  return `${t(`common:months.short.${month}` as TranslationKey).toUpperCase()} ${day}`;
}

/** Groups newest-first items into month sections (order kept). */
export function groupByMonth<T extends { occurredAt: string }>(
  items: readonly T[],
): { key: string; firstIso: string; data: T[] }[] {
  const sections: { key: string; firstIso: string; data: T[] }[] = [];
  for (const entry of items) {
    const key = monthKeyOf(entry.occurredAt);
    const last = sections.at(-1);
    if (last !== undefined && last.key === key) last.data.push(entry);
    else sections.push({ key, firstIso: entry.occurredAt, data: [entry] });
  }
  return sections;
}
