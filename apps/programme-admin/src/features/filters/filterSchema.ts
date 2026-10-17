/**
 * Global admin filters (ADM-02 task 2), stored in the URL so links can be shared and reloads keep
 * the view: `preset` (30d | 90d | ytd | custom, default 90d), `from` / `to` (Kigali `YYYY-MM-DD`,
 * required with `custom`), `district`, `facility` (ids; absent = all in the grant) and `type`
 * (all | bp | glucose, default all).
 *
 * Rules: from ≤ to; to ≤ today (demo clock, Kigali); span ≤ 366 days; a facility must belong to
 * the selected district. Invalid params are replaced by defaults (`parseAdminFilters` returns
 * the issues; the hook shows a translated notice). Out-of-grant ids never reach this parser:
 * ScopeGuard (ADM-01) answers them with a 403 first.
 */
import { addDays, SCREENING_TYPE_FILTERS, type ScreeningTypeFilter } from "@laif/analytics";
import { z } from "zod";

import { SEED_REFERENCE, type ReferenceData } from "../../auth/scope.ts";

export const DATE_PRESETS = ["30d", "90d", "ytd", "custom"] as const;
export type DatePreset = (typeof DATE_PRESETS)[number];

export const DEFAULT_PRESET: DatePreset = "90d";
export const MAX_RANGE_DAYS = 366;

/** URL search params owned by the filter bar (kept across pages by the sidebar). */
export const FILTER_PARAMS = ["preset", "from", "to", "district", "facility", "type"] as const;

/** Keeps only the filter params of a search string (other page params are page-specific). */
export function filterSearchOf(search: string): string {
  const params = new URLSearchParams(search);
  const out = new URLSearchParams();
  for (const name of FILTER_PARAMS) {
    const value = params.get(name);
    if (value) out.set(name, value);
  }
  const text = out.toString();
  return text === "" ? "" : `?${text}`;
}

const IsoDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const ms = Date.parse(`${v}T00:00:00.000Z`);
    return !Number.isNaN(ms) && new Date(ms).toISOString().slice(0, 10) === v;
  });
const Id = z.string().trim().min(1).max(100);

/** Raw URL shape (each param validated on its own; cross-field rules in `parseAdminFilters`). */
export const AdminFilterSchema = z.object({
  preset: z.enum(DATE_PRESETS).default(DEFAULT_PRESET),
  from: IsoDay.optional(),
  to: IsoDay.optional(),
  district: Id.optional(),
  facility: Id.optional(),
  type: z.enum(SCREENING_TYPE_FILTERS).default("all"),
});

export type AdminFilters = {
  preset: DatePreset;
  /** Only with `custom`. */
  from: string | null;
  to: string | null;
  district: string | null;
  facility: string | null;
  type: ScreeningTypeFilter;
};

export const DEFAULT_FILTERS: AdminFilters = {
  preset: DEFAULT_PRESET,
  from: null,
  to: null,
  district: null,
  facility: null,
  type: "all",
};

/** `admin:filters.validation.<code>` */
export const FILTER_ISSUES = [
  "invalidPreset",
  "invalidDate",
  "invalidType",
  "customRangeMissing",
  "rangeOrder",
  "futureDate",
  "rangeTooLong",
  "facilityDistrict",
] as const;
export type FilterIssue = (typeof FILTER_ISSUES)[number];

const dayDiff = (from: string, to: string): number =>
  Math.round(
    (Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / 86_400_000,
  );

/** Custom range rules (also the inline error of the custom-range form). Null when valid. */
export function customRangeIssue(
  from: string | null,
  to: string | null,
  today: string,
): FilterIssue | null {
  if (from === null || to === null) return "customRangeMissing";
  if (!IsoDay.safeParse(from).success || !IsoDay.safeParse(to).success) return "invalidDate";
  if (from > to) return "rangeOrder";
  if (to > today) return "futureDate";
  // Inclusive span: from … to covers dayDiff + 1 days.
  if (dayDiff(from, to) + 1 > MAX_RANGE_DAYS) return "rangeTooLong";
  return null;
}

export type ParsedFilters = { filters: AdminFilters; issues: FilterIssue[] };

/** URL → filters; every invalid part falls back to its default and is reported once. */
export function parseAdminFilters(
  search: string | URLSearchParams,
  today: string,
  reference: ReferenceData = SEED_REFERENCE,
): ParsedFilters {
  const params = typeof search === "string" ? new URLSearchParams(search) : search;
  const issues = new Set<FilterIssue>();
  const raw = (name: string): string | undefined => {
    const v = params.get(name)?.trim();
    return v === undefined || v === "" ? undefined : v;
  };
  const shape = AdminFilterSchema.shape;
  const field = <T>(schema: z.ZodType<T>, name: string, issue: FilterIssue, fallback: T): T => {
    const value = raw(name);
    if (value === undefined) return fallback;
    const parsed = schema.safeParse(value);
    if (parsed.success) return parsed.data;
    issues.add(issue);
    return fallback;
  };

  let preset = field(shape.preset, "preset", "invalidPreset", DEFAULT_PRESET);
  const type = field(shape.type, "type", "invalidType", "all");
  const district = field(Id, "district", "facilityDistrict", undefined as string | undefined);
  let facility = field(Id, "facility", "facilityDistrict", undefined as string | undefined);
  let from: string | null = null;
  let to: string | null = null;

  if (preset === "custom") {
    const rawFrom = raw("from") ?? null;
    const rawTo = raw("to") ?? null;
    const issue = customRangeIssue(rawFrom, rawTo, today);
    if (issue === null) {
      from = rawFrom;
      to = rawTo;
    } else {
      issues.add(issue);
      preset = DEFAULT_PRESET;
    }
  } else if (raw("from") !== undefined || raw("to") !== undefined) {
    // Dates only belong to a custom range; a preset ignores (and drops) them.
    issues.add("customRangeMissing");
  }

  if (facility !== undefined && district !== undefined) {
    const f = reference.facilities.find((x) => x.id === facility);
    if (f !== undefined && f.districtId !== district) {
      issues.add("facilityDistrict");
      facility = undefined;
    }
  }

  return {
    filters: {
      preset,
      from,
      to,
      district: district ?? null,
      facility: facility ?? null,
      type,
    },
    issues: [...issues],
  };
}

/** Canonical search string (defaults omitted, fixed order) — `""` or `?…`. */
export function serializeAdminFilters(filters: AdminFilters): string {
  const out = new URLSearchParams();
  if (filters.preset !== DEFAULT_PRESET) out.set("preset", filters.preset);
  if (filters.preset === "custom") {
    if (filters.from !== null) out.set("from", filters.from);
    if (filters.to !== null) out.set("to", filters.to);
  }
  if (filters.district !== null) out.set("district", filters.district);
  if (filters.facility !== null) out.set("facility", filters.facility);
  if (filters.type !== "all") out.set("type", filters.type);
  const text = out.toString();
  return text === "" ? "" : `?${text}`;
}

export type Period = { from: string; to: string };

/** The Kigali day range a filter selects (`today` = demo clock, Kigali). */
export function resolvePeriod(filters: AdminFilters, today: string): Period {
  switch (filters.preset) {
    case "30d":
      return { from: addDays(today, -29), to: today };
    case "90d":
      return { from: addDays(today, -89), to: today };
    case "ytd":
      return { from: `${today.slice(0, 4)}-01-01`, to: today };
    case "custom":
      return { from: filters.from ?? addDays(today, -89), to: filters.to ?? today };
  }
}
