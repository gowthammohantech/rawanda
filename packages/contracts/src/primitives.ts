/**
 * Shared Zod 4 primitives. App phases build their schemas from these (FND-03 extension rule):
 * use `IsoUtcString` (never the Zod 3 `z.string().datetime()` form) and `vMsg` keys only.
 */
import {
  asId,
  hasMinimumReason,
  MIN_REASON_NON_WHITESPACE_CHARS,
  type Brand,
  type JsonValue,
} from "@laif/domain";
import { z } from "zod";

import { vMsg, type ValidationMessageKey } from "./messages.ts";

/** Schema-level error: `required` when the value is missing, otherwise `key`. */
function requiredOr(key: ValidationMessageKey) {
  return (issue: { input?: unknown }): string =>
    issue.input === undefined || issue.input === null ? vMsg("required") : vMsg(key);
}

/**
 * Timezone-aware ISO 8601 timestamp (`Z` or `±hh:mm` offset required), normalised to UTC `Z`
 * with millisecond precision: `2026-10-14T08:00:00+02:00` → `2026-10-14T06:00:00.000Z`.
 * Persisted values are therefore always UTC (FRD §6).
 */
export const IsoUtcString = z.iso
  .datetime({ offset: true, error: requiredOr("invalidDate") })
  .transform((value) => new Date(value).toISOString());

/** True when `value` is already a normalised UTC timestamp (`…T…:…:….sssZ`). */
export function isNormalisedIsoUtc(value: string): boolean {
  const ms = Date.parse(value);
  return !Number.isNaN(ms) && new Date(ms).toISOString() === value;
}

/** Calendar date `YYYY-MM-DD` (date of birth, Kigali report days). */
export const IsoDate = z.iso.date({ error: requiredOr("invalidDate") });

/** UUID-shaped string (8-4-4-4-12 hex, any version) — idempotency keys, runtime IDs. */
export const UuidLike = z.guid({ error: requiredOr("invalidIdentifier") });

/** Every mutation input carries one (FRD §6 `Idempotency-Key`). */
export const IdempotencyKey = UuidLike;

/** Trimmed text that must not be empty (`required`). */
export const NonEmptyTrimmed = z
  .string()
  .trim()
  .min(1, { error: vMsg("required") });

/** Maximum length of any free-text reason. */
export const REASON_MAX_LENGTH = 500;

/**
 * Reason for dismissal, override, amendment, cancellation, reassignment (FRD §4):
 * ≥ 10 non-whitespace characters (`MIN_REASON_NON_WHITESPACE_CHARS`, FND-02) and ≤ 500.
 */
export const Reason = z
  .string()
  .trim()
  .max(REASON_MAX_LENGTH, { error: vMsg("tooLong", { max: REASON_MAX_LENGTH }) })
  .refine((value) => hasMinimumReason(value), {
    error: vMsg("reasonTooShort", { min: MIN_REASON_NON_WHITESPACE_CHARS }),
  });

/** Optimistic-concurrency version (starts at 1). */
export const Version = z
  .number()
  .int({ error: vMsg("integerRequired") })
  .min(1, { error: vMsg("numberOutOfRange", { min: 1 }) });

/** Optional free-text note (≤ `max` chars, default 500). */
export function optionalNote(max = 500) {
  return z
    .string()
    .trim()
    .max(max, { error: vMsg("tooLong", { max }) })
    .optional();
}

/** Bounded trimmed text with explicit min/max keys. */
export function boundedText(min: number, max: number) {
  return z
    .string()
    .trim()
    .min(min, { error: min <= 1 ? vMsg("required") : vMsg("tooShort", { min }) })
    .max(max, { error: vMsg("tooLong", { max }) });
}

/**
 * Branded entity ID: a non-empty string typed as the `@laif/domain` brand (`asId`). IDs are
 * opaque (UUIDs at runtime, readable stable IDs in seeds), so only emptiness is checked.
 */
export function idSchema<T extends Brand<string, string>>() {
  return z
    .string({ error: requiredOr("invalidIdentifier") })
    .trim()
    .min(1, { error: vMsg("required") })
    .transform((value) => asId<T>(value));
}

/** JSON-serialisable value (sync payloads, audit summaries). */
export const JsonValueSchema: z.ZodType<JsonValue> = z.json();

/** Timestamp that must not be later than `now()` + `toleranceMs` (`dateInFuture`). */
export function notInFuture(now: () => Date, toleranceMs = 0) {
  return IsoUtcString.refine((value) => Date.parse(value) <= now().getTime() + toleranceMs, {
    error: vMsg("dateInFuture"),
  });
}

/** Timestamp that must be strictly later than `now()` (`dateMustBeFuture`). */
export function inFuture(now: () => Date) {
  return IsoUtcString.refine((value) => Date.parse(value) > now().getTime(), {
    error: vMsg("dateMustBeFuture"),
  });
}
