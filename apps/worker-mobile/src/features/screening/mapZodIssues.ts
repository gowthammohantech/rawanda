/**
 * Zod issues → `{ field, key, params }` (HWM-05 task 4). Messages stay i18n KEYS: `Field` /
 * `FieldError` translate them at render time, so an EN⇄RW switch re-translates visible errors
 * without revalidating or touching the values. Unknown messages map to `invalid`.
 */
import { parseValidationMessage, type ValidationMessageKey } from "@laif/contracts";
import type { z } from "zod";

import { SCREENING_FORM_FIELDS, type ScreeningFormField } from "./screeningSchema.ts";

export type MappedIssue = {
  field: ScreeningFormField;
  key: ValidationMessageKey;
  params: Record<string, unknown>;
};

const FIELD_SET: ReadonlySet<string> = new Set(SCREENING_FORM_FIELDS);

function isFormField(value: unknown): value is ScreeningFormField {
  return typeof value === "string" && FIELD_SET.has(value);
}

/** First issue per form field, in form order. Issues outside the form's fields are dropped. */
export function mapZodIssues(issues: readonly z.core.$ZodIssue[]): MappedIssue[] {
  const byField = new Map<ScreeningFormField, MappedIssue>();
  for (const issue of issues) {
    const field = issue.path[0];
    if (!isFormField(field) || byField.has(field)) continue;
    const parsed = parseValidationMessage(issue.message);
    byField.set(field, {
      field,
      key: parsed?.key ?? "invalid",
      params: parsed?.params ?? {},
    });
  }
  return SCREENING_FORM_FIELDS.flatMap((field) => {
    const mapped = byField.get(field);
    return mapped === undefined ? [] : [mapped];
  });
}
