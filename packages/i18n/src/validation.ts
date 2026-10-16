/**
 * Renders `vMsg` strings from `@laif/contracts` (e.g. `validation:reasonTooShort|{"min":10}`) in
 * the active language. Unknown messages render `validation:invalid` and are logged in dev.
 */
import {
  parseValidationMessage,
  VALIDATION_NAMESPACE,
  type ParsedValidationMessage,
  type ValidationMessageKey,
} from "@laif/contracts";
import { useTranslation } from "react-i18next";

import { isMissingKeyLoggingEnabled, recordMissingKey } from "./missing.ts";

/** Any i18next `t` (typed for any namespace) or a plain `(key, options) => string`. */
export type TranslateLike = (...args: never[]) => unknown;

type LooseT = (key: string, options?: Record<string, unknown>) => string;

/** Params each key interpolates. A message missing one renders `validation:invalid`. */
const REQUIRED_PARAMS: Partial<Record<ValidationMessageKey, readonly string[]>> = {
  reasonTooShort: ["min"],
  tooShort: ["min"],
  tooLong: ["max"],
  dateTooOld: ["days"],
  unrecognizedKeys: ["keys"],
};

/** i18next option names that a message param must never override. */
const RESERVED_OPTION_NAMES: ReadonlySet<string> = new Set([
  "lng",
  "lngs",
  "ns",
  "context",
  "count",
  "defaultValue",
  "fallbackLng",
  "keyPrefix",
  "postProcess",
  "returnObjects",
  "returnDetails",
  "interpolation",
  "replace",
]);

function isParamValue(value: unknown): value is string | number {
  return typeof value === "string" || (typeof value === "number" && Number.isFinite(value));
}

function invalid(t: LooseT): string {
  return t(`${VALIDATION_NAMESPACE}:invalid`);
}

/**
 * `numberOutOfRange` is emitted with `{min,max}`, `{min}` or `{max}`; each shape has its own
 * i18next context variant (`_between`, `_min`, `_max`) so no interpolation is ever blank.
 */
function rangeContext(params: Record<string, unknown>): "between" | "min" | "max" | undefined {
  const hasMin = isParamValue(params["min"]);
  const hasMax = isParamValue(params["max"]);
  if (hasMin && hasMax) return "between";
  if (hasMin) return "min";
  if (hasMax) return "max";
  return undefined;
}

function logUnknown(message: string): void {
  if (!isMissingKeyLoggingEnabled()) return;
  recordMissingKey({
    lng: "*",
    ns: VALIDATION_NAMESPACE,
    key: message,
    kind: "unknownValidationMessage",
  });
}

/** Translates an already-parsed message (e.g. from `safeParseToFieldErrors`). */
export function translateParsedValidationMessage(
  t: TranslateLike,
  parsed: ParsedValidationMessage,
): string {
  const tt = t as unknown as LooseT;
  const { key, params } = parsed;
  const required = REQUIRED_PARAMS[key];
  if (required !== undefined && !required.every((name) => isParamValue(params[name]))) {
    logUnknown(`${VALIDATION_NAMESPACE}:${key}|${JSON.stringify(params)}`);
    return invalid(tt);
  }
  const options: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(params)) {
    if (!RESERVED_OPTION_NAMES.has(name) && isParamValue(value)) options[name] = value;
  }
  if (key === "numberOutOfRange") {
    const context = rangeContext(params);
    if (context !== undefined) options["context"] = context;
  }
  return tt(`${VALIDATION_NAMESPACE}:${key}`, options);
}

/** Translates a `vMsg` string; anything unrecognised renders `validation:invalid`. */
export function translateValidationMessage(t: TranslateLike, message: string): string {
  const parsed = parseValidationMessage(message);
  if (parsed === null) {
    logUnknown(message);
    return invalid(t as unknown as LooseT);
  }
  return translateParsedValidationMessage(t, parsed);
}

/** react-hook-form `FieldError` (structural), a parsed message, or a raw `vMsg` string. */
export type FieldErrorLike =
  { message?: string | undefined } | ParsedValidationMessage | string | null | undefined;

/** Pure form of `useFieldErrorText`: `undefined` when there is no error. */
export function fieldErrorText(t: TranslateLike, error: FieldErrorLike): string | undefined {
  if (error === null || error === undefined) return undefined;
  if (typeof error === "string") return translateValidationMessage(t, error);
  if ("key" in error && "params" in error) return translateParsedValidationMessage(t, error);
  if (typeof error.message !== "string" || error.message === "") return undefined;
  return translateValidationMessage(t, error.message);
}

/** Field error text in the active language, for RHF (web) and native forms. */
export function useFieldErrorText(error?: FieldErrorLike): string | undefined {
  const { t } = useTranslation(VALIDATION_NAMESPACE, { useSuspense: false });
  return fieldErrorText(t, error);
}
