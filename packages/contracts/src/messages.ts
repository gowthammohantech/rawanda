/**
 * Validation messages are i18n keys, never English sentences (FND-03 task 2).
 *
 * Encoding: `"validation:<key>"` or `"validation:<key>|<json-params>"`, e.g.
 * `validation:reasonTooShort|{"min":10}`. FND-04 translates them from namespace `validation`
 * (EN + RW for every key in `VALIDATION_KEYS`).
 *
 * Extension rule: app phases APPEND new keys at the end of `VALIDATION_KEYS` (and add EN + RW
 * strings in FND-04's catalogue in the same commit). Never put English text in a schema.
 */

export const VALIDATION_NAMESPACE = "validation" as const;

export const VALIDATION_KEYS = [
  "required",
  "reasonTooShort",
  "numberOutOfRange",
  "integerRequired",
  "unitRequired",
  "contextRequired",
  "dateInFuture",
  "dateTooOld",
  "diastolicNotBelowSystolic",
  "evidenceRequired",
  "evidenceTypeRequired",
  "dueDateBeforeStart",
  "invalidIdentifier",
  "duplicateIdempotencyKey",
  "consentWithdrawn",
  "tooLong",
  "invalidEnum",
  // ── Appended by FND-03 for the global error map and the input schemas ──
  /** Value has the wrong type (e.g. text where a number is expected). */
  "invalidType",
  /** Value does not match the expected format (e.g. checksum, pattern). */
  "invalidFormat",
  /** Not a valid ISO 8601 date / timestamp. */
  "invalidDate",
  /** Text or list shorter than `{min}` (other than "required" or a reason). */
  "tooShort",
  /** Timestamp must be later than the current demo time (e.g. a due date). */
  "dateMustBeFuture",
  /** `from` must not be after `to` (filter ranges). */
  "dateRangeOrder",
  /** Unknown fields were sent (`{keys}`). */
  "unrecognizedKeys",
  /** At least one of the optional changes must be provided. */
  "noChanges",
  /** Generic fallback for any issue without a more specific key. */
  "invalid",
  // ── Appended by CLN-03 ──
  /** Free text (e.g. a search query) shorter than `{min}` characters. */
  "minLength",
  // ── Appended by ADM-03 ──
  /** Calendar date outside the allowed window `{from}` … `{to}` (e.g. a programme action due date). */
  "dateOutOfRange",
] as const;

export type ValidationMessageKey = (typeof VALIDATION_KEYS)[number];

export type ValidationMessageParams = Record<string, string | number>;

export type ParsedValidationMessage = {
  key: ValidationMessageKey;
  params: Record<string, unknown>;
};

const PREFIX = `${VALIDATION_NAMESPACE}:`;
const KEY_SET: ReadonlySet<string> = new Set(VALIDATION_KEYS);

export function isValidationMessageKey(value: string): value is ValidationMessageKey {
  return KEY_SET.has(value);
}

/** Encodes a translatable validation message. Params are serialised as JSON. */
export function vMsg(key: ValidationMessageKey, params?: ValidationMessageParams): string {
  if (params === undefined || Object.keys(params).length === 0) return `${PREFIX}${key}`;
  return `${PREFIX}${key}|${JSON.stringify(params)}`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Decodes a `vMsg` string; returns `null` for anything that is not a known validation key. */
export function parseValidationMessage(msg: string): ParsedValidationMessage | null {
  if (!msg.startsWith(PREFIX)) return null;
  const body = msg.slice(PREFIX.length);
  const bar = body.indexOf("|");
  const key = bar === -1 ? body : body.slice(0, bar);
  if (!isValidationMessageKey(key)) return null;
  if (bar === -1) return { key, params: {} };
  try {
    const params: unknown = JSON.parse(body.slice(bar + 1));
    return isPlainObject(params) ? { key, params } : null;
  } catch {
    return null;
  }
}
