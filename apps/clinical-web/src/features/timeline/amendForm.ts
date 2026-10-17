/**
 * Amendment form schema (CLN-04 task 6): the form's string inputs `{ field, value, reason }`
 * parsed into the FND-03 `ScreeningAmendmentInputSchema` shape `{ field, after, reason }`.
 * Only type / format checks happen here (the field's `after` rule of the contract, with the
 * demo clock for `measuredAt ≤ now`); the repository re-validates with the stored ruleset's
 * plausibility limits. No clinical thresholds are hard-coded. Messages are `validation:*` keys
 * (`required`, `reasonTooShort`, `invalidFormat`, `integerRequired`, `dateInFuture`,
 * `noChanges`) rendered in the active language by `Field`.
 */
import {
  contractsErrorMap,
  createScreeningAmendmentInputSchema,
  Reason,
  vMsg,
  type ScreeningAmendmentInput,
} from "@laif/contracts";
import {
  AMENDABLE_SCREENING_FIELDS,
  type AmendableScreeningField,
  type AmendableValue,
  type EffectiveReadings,
} from "@laif/domain";
import { parseDecimal } from "@laif/ui-web";
import { z } from "zod";

export type AmendFormValues = { field: AmendableScreeningField; value: string; reason: string };
export type AmendFormOutput = Pick<ScreeningAmendmentInput, "field" | "after" | "reason">;

const NUMERIC: ReadonlySet<AmendableScreeningField> = new Set([
  "systolic",
  "diastolic",
  "glucoseValue",
]);

export const isNumericField = (field: AmendableScreeningField): boolean => NUMERIC.has(field);

type ParsedAfter = { ok: true; value: AmendableValue } | { ok: false; message: string };

function parseAfter(field: AmendableScreeningField, raw: string): ParsedAfter {
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: false, message: vMsg("required") };
  if (isNumericField(field)) {
    const number = parseDecimal(trimmed);
    return number === null
      ? { ok: false, message: vMsg("invalidFormat") }
      : { ok: true, value: number };
  }
  return { ok: true, value: trimmed };
}

export function createAmendFormSchema(options: { nowIso: string; readings: EffectiveReadings }) {
  const contract = createScreeningAmendmentInputSchema({ now: () => new Date(options.nowIso) });
  const afterRule = (field: AmendableScreeningField): z.ZodType => {
    const option = contract.options.find((o) => o.shape.field.value === field);
    if (option === undefined) throw new Error(`no amendment rule for ${field}`);
    return option.shape.after as z.ZodType;
  };

  return z
    .object({
      field: z.enum(AMENDABLE_SCREENING_FIELDS),
      value: z.string(),
      reason: z.string(),
    })
    .transform((values, ctx): AmendFormOutput => {
      let valid = true;
      const addIssue = (path: "value" | "reason", message: string) => {
        valid = false;
        ctx.addIssue({ code: "custom", path: [path], message });
      };

      const reason = values.reason.trim();
      if (reason === "") addIssue("reason", vMsg("required"));
      else {
        const parsed = Reason.safeParse(values.reason, { error: contractsErrorMap });
        if (!parsed.success)
          for (const issue of parsed.error.issues) addIssue("reason", issue.message);
      }

      const after = parseAfter(values.field, values.value);
      let afterValue: AmendableValue = null;
      if (!after.ok) addIssue("value", after.message);
      else {
        const parsed = afterRule(values.field).safeParse(after.value, {
          error: contractsErrorMap,
        });
        if (!parsed.success) {
          for (const issue of parsed.error.issues) addIssue("value", issue.message);
        } else {
          afterValue = parsed.data as AmendableValue;
          if (afterValue === options.readings[values.field]) addIssue("value", vMsg("noChanges"));
        }
      }

      if (!valid) return z.NEVER;
      return { field: values.field, after: afterValue, reason };
    });
}
