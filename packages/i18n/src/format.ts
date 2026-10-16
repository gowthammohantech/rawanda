/**
 * Date, number and measurement formatting. Inputs are ISO UTC strings; output is ALWAYS
 * Africa/Kigali wall time, regardless of the device time zone.
 *
 * Two engines produce identical strings by construction:
 * - `intl`: `Intl.DateTimeFormat(<en-GB | rw-RW>, { timeZone: 'Africa/Kigali' })` supplies the
 *   numeric date/time fields (feature-detected: Hermes may lack time zones or `rw`);
 * - `manual`: Kigali is a fixed UTC+02:00 with no DST, so add 2 h and read the UTC fields.
 * Month/weekday names and the patterns always come from `common:months.*`, `common:weekdays.*`
 * and `common:format.*`, so EN and RW look the same on every runtime.
 *
 * Nothing here reads the wall clock: relative times use the injected demo clock.
 */
import type { Clock } from "@laif/domain";

import { DEFAULT_LANGUAGE, type Language } from "./languages.ts";
import { resources } from "./resources.ts";

export const KIGALI_TZ = "Africa/Kigali" as const;
/** Africa/Kigali is UTC+02:00 all year (no DST). */
export const KIGALI_UTC_OFFSET_MS = 2 * 60 * 60 * 1000;

export type FormatEngine = "auto" | "intl" | "manual";
export type FormatOptions = { engine?: FormatEngine };
export type DateStyle = "short" | "long";

type WallParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number;
};

const INTL_LOCALE: Record<Language, string> = { en: "en-GB", rw: "rw-RW" };

// ── Catalogue access (bundled resources, EN fallback) ────────────────────────
function lookup(lng: Language, path: string): string {
  const read = (language: Language): string | undefined => {
    let node: unknown = resources[language].common;
    for (const part of path.split(".")) {
      if (typeof node !== "object" || node === null) return undefined;
      node = (node as Record<string, unknown>)[part];
    }
    return typeof node === "string" && node !== "" ? node : undefined;
  };
  return read(lng) ?? read(DEFAULT_LANGUAGE) ?? path;
}

function fill(pattern: string, values: Record<string, string | number>): string {
  return pattern.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, name: string) =>
    name in values ? String(values[name]) : match,
  );
}

const pad2 = (n: number): string => String(n).padStart(2, "0");

// ── Engines ──────────────────────────────────────────────────────────────────
function parseIso(iso: string): number {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) throw new RangeError(`Invalid ISO timestamp: ${iso}`);
  return ms;
}

function weekdayOf(year: number, month: number, day: number): number {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function kigaliPartsManual(ms: number): WallParts {
  const d = new Date(ms + KIGALI_UTC_OFFSET_MS);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    weekday: d.getUTCDay(),
  };
}

let intlTimeZoneSupport: boolean | undefined;

/** True when this runtime's Intl can format in Africa/Kigali. */
export function supportsIntlTimeZone(): boolean {
  if (intlTimeZoneSupport !== undefined) return intlTimeZoneSupport;
  try {
    const formatter = new Intl.DateTimeFormat("en-GB", { timeZone: KIGALI_TZ });
    intlTimeZoneSupport = formatter.resolvedOptions().timeZone === KIGALI_TZ;
  } catch {
    intlTimeZoneSupport = false;
  }
  return intlTimeZoneSupport;
}

/** `rw-RW` when Intl knows Kinyarwanda, else `en-GB` (only numeric fields are taken). */
export function intlLocaleFor(lng: Language): string {
  const preferred = INTL_LOCALE[lng];
  try {
    if (Intl.DateTimeFormat.supportedLocalesOf([preferred]).length > 0) return preferred;
  } catch {
    // fall through
  }
  return INTL_LOCALE.en;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

/** Test seam: forgets cached feature detection and formatters (e.g. after stubbing Intl). */
export function resetFormatFeatureDetection(): void {
  intlTimeZoneSupport = undefined;
  formatterCache.clear();
}

function kigaliPartsIntl(ms: number, lng: Language): WallParts | null {
  const locale = intlLocaleFor(lng);
  let formatter = formatterCache.get(locale);
  if (formatter === undefined) {
    formatter = new Intl.DateTimeFormat(locale, {
      timeZone: KIGALI_TZ,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      hourCycle: "h23",
      numberingSystem: "latn",
    });
    formatterCache.set(locale, formatter);
  }
  const values: Partial<Record<Intl.DateTimeFormatPartTypes, number>> = {};
  for (const part of formatter.formatToParts(ms)) {
    if (part.type === "literal") continue;
    const n = Number.parseInt(part.value, 10);
    if (!Number.isNaN(n)) values[part.type] = n;
  }
  const { year, month, day, hour, minute } = values;
  if (
    year === undefined ||
    month === undefined ||
    day === undefined ||
    hour === undefined ||
    minute === undefined
  ) {
    return null;
  }
  return { year, month, day, hour: hour % 24, minute, weekday: weekdayOf(year, month, day) };
}

function kigaliParts(iso: string, lng: Language, options: FormatOptions): WallParts {
  const ms = parseIso(iso);
  const engine = options.engine ?? "auto";
  if (engine !== "manual" && supportsIntlTimeZone()) {
    const parts = kigaliPartsIntl(ms, lng);
    if (parts !== null) return parts;
  }
  if (engine === "intl") throw new Error("Intl time-zone formatting is not available");
  return kigaliPartsManual(ms);
}

// ── Public date/time API ─────────────────────────────────────────────────────
function datePart(parts: WallParts, lng: Language, style: DateStyle): string {
  if (style === "long") {
    return fill(lookup(lng, "format.dateLong"), {
      weekday: lookup(lng, `weekdays.long.${parts.weekday}`),
      day: parts.day,
      month: lookup(lng, `months.long.${parts.month}`),
      year: parts.year,
    });
  }
  return fill(lookup(lng, "format.date"), {
    day: parts.day,
    month: lookup(lng, `months.short.${parts.month}`),
    year: parts.year,
  });
}

function timePart(parts: WallParts, lng: Language): string {
  return fill(lookup(lng, "format.time"), { hour: pad2(parts.hour), minute: pad2(parts.minute) });
}

/** `"14 Oct 2026"` (long style: `"Wednesday 14 October 2026"`), Kigali calendar date. */
export function formatDate(
  iso: string,
  lng: Language = DEFAULT_LANGUAGE,
  options: FormatOptions & { style?: DateStyle } = {},
): string {
  return datePart(kigaliParts(iso, lng, options), lng, options.style ?? "short");
}

/** `"08:00"` (24-hour Kigali time). */
export function formatTime(
  iso: string,
  lng: Language = DEFAULT_LANGUAGE,
  options: FormatOptions = {},
): string {
  return timePart(kigaliParts(iso, lng, options), lng);
}

/** `"14 Oct 2026, 08:00"` in Kigali time. */
export function formatDateTime(
  iso: string,
  lng: Language = DEFAULT_LANGUAGE,
  options: FormatOptions & { style?: DateStyle } = {},
): string {
  const parts = kigaliParts(iso, lng, options);
  return fill(lookup(lng, "format.dateTime"), {
    date: datePart(parts, lng, options.style ?? "short"),
    time: timePart(parts, lng),
  });
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** `"3 hours ago"` / `"in 2 days"` relative to the DEMO clock (never wall time). */
export function formatRelativeToNow(
  iso: string,
  clock: Pick<Clock, "now">,
  lng: Language = DEFAULT_LANGUAGE,
): string {
  const diff = parseIso(iso) - clock.now().getTime();
  const abs = Math.abs(diff);
  if (abs < MINUTE_MS) return lookup(lng, "relative.now");
  const [unit, size] =
    abs < HOUR_MS
      ? (["Minutes", MINUTE_MS] as const)
      : abs < DAY_MS
        ? (["Hours", HOUR_MS] as const)
        : (["Days", DAY_MS] as const);
  const count = Math.floor(abs / size);
  const base = diff < 0 ? `${unit.toLowerCase()}Ago` : `in${unit}`;
  // EN and RW both distinguish exactly "1" from everything else; no Intl.PluralRules needed
  // (not guaranteed on Hermes).
  const plural = count === 1 ? "one" : "other";
  return fill(lookup(lng, `relative.${base}_${plural}`), { count });
}

// ── Numbers & measurements ───────────────────────────────────────────────────
export type NumberFormatOptions = FormatOptions & {
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
};

function groupThousands(integer: string): string {
  return integer.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function formatNumberManual(value: number, min: number, max: number): string {
  let text = value.toFixed(max);
  if (max > min) {
    const [int = "0", frac = ""] = text.split(".");
    let trimmed = frac;
    while (trimmed.length > min && trimmed.endsWith("0")) trimmed = trimmed.slice(0, -1);
    text = trimmed === "" ? int : `${int}.${trimmed}`;
  }
  const negative = text.startsWith("-");
  const body = negative ? text.slice(1) : text;
  const [int = "0", frac] = body.split(".");
  const out = frac === undefined ? groupThousands(int) : `${groupThousands(int)}.${frac}`;
  return negative && /[1-9]/.test(out) ? `-${out}` : out;
}

/**
 * Numbers use `.` decimals and `,` grouping in BOTH languages (decision: clinical values must
 * read the same to every user; Kinyarwanda CLDR's `,` decimal is avoided — needs review).
 */
/** Number locale per UI language: both use en-GB symbols (see `formatNumber`). */
const NUMBER_LOCALE: Record<Language, string> = { en: "en-GB", rw: "en-GB" };

export function formatNumber(
  value: number,
  lng: Language = DEFAULT_LANGUAGE,
  options: NumberFormatOptions = {},
): string {
  const min = options.minimumFractionDigits ?? 0;
  const max = Math.max(min, options.maximumFractionDigits ?? 2);
  if (!Number.isFinite(value)) return String(value);
  if (options.engine !== "manual" && typeof Intl !== "undefined" && "NumberFormat" in Intl) {
    try {
      return new Intl.NumberFormat(NUMBER_LOCALE[lng], {
        minimumFractionDigits: min,
        maximumFractionDigits: max,
        numberingSystem: "latn",
      }).format(value);
    } catch {
      // fall through to the manual formatter
    }
  }
  return formatNumberManual(value, min, max);
}

/** Fixed fraction digits per unit (glucose mmol/L one decimal; mg/dL and mmHg integers). */
const UNIT_FRACTION_DIGITS: Readonly<Record<string, number>> = {
  "mmol/L": 1,
  "mg/dL": 0,
  mmHg: 0,
};

export type BloodPressureValue = { systolic: number; diastolic: number };

/**
 * Always prints the unit: `formatMeasurement(7.8, 'mmol/L')` → `"7.8 mmol/L"`,
 * `formatMeasurement({ systolic: 148, diastolic: 92 }, 'mmHg')` → `"148/92 mmHg"`.
 */
export function formatMeasurement(
  value: number | BloodPressureValue,
  unit: string,
  lng: Language = DEFAULT_LANGUAGE,
  options: NumberFormatOptions = {},
): string {
  if (unit.trim() === "") throw new RangeError("formatMeasurement requires a unit");
  const digits = UNIT_FRACTION_DIGITS[unit];
  const numberOptions: NumberFormatOptions =
    digits === undefined
      ? options
      : { minimumFractionDigits: digits, maximumFractionDigits: digits, ...options };
  const text =
    typeof value === "number"
      ? formatNumber(value, lng, numberOptions)
      : `${formatNumber(value.systolic, lng, numberOptions)}/${formatNumber(value.diastolic, lng, numberOptions)}`;
  return `${text} ${unit}`;
}
