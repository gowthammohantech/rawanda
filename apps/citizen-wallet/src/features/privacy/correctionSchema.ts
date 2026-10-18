/**
 * Correction request form schema (CTZ-07 task 6). Messages are `citizen:validation.correction.*`
 * KEYS (EN + RW catalogues), rendered inline by the form in the active language. The repository
 * re-validates with the FND `CorrectionRequestInputSchema` (min 10 there too); the wallet adds
 * the tighter citizen limits (500 / 200) and the "I understand" tick.
 */
import { z } from "zod";

export const CORRECTION_TARGET_TYPES = ["screening", "care_instruction", "patient"] as const;
export type CorrectionTargetType = (typeof CORRECTION_TARGET_TYPES)[number];

export const CORRECTION_DESCRIPTION_MIN = 10;
export const CORRECTION_DESCRIPTION_MAX = 500;
export const CORRECTION_SUGGESTED_MAX = 200;

export const CORRECTION_MESSAGES = {
  targetRequired: "citizen:validation.correction.targetRequired",
  descriptionMin: "citizen:validation.correction.descriptionMin",
  descriptionMax: "citizen:validation.correction.descriptionMax",
  suggestedMax: "citizen:validation.correction.suggestedMax",
  mustUnderstand: "citizen:validation.correction.mustUnderstand",
} as const;
export type CorrectionMessageKey = (typeof CORRECTION_MESSAGES)[keyof typeof CORRECTION_MESSAGES];

const M = CORRECTION_MESSAGES;

/** Step 1: what is wrong (a target id is required unless it is "my personal details"). */
export const correctionTargetSchema = z
  .object({
    targetType: z.enum(CORRECTION_TARGET_TYPES, { error: M.targetRequired }),
    targetId: z.string({ error: M.targetRequired }).trim(),
  })
  .superRefine((value, ctx) => {
    if (value.targetType !== "patient" && value.targetId === "") {
      ctx.addIssue({ code: "custom", path: ["targetId"], message: M.targetRequired });
    }
  });

/** Step 2: the citizen's own words (stored and shown verbatim, never translated). */
export const correctionDetailsSchema = z.object({
  description: z
    .string({ error: M.descriptionMin })
    .trim()
    .min(CORRECTION_DESCRIPTION_MIN, { error: M.descriptionMin })
    .max(CORRECTION_DESCRIPTION_MAX, { error: M.descriptionMax }),
  suggestedValue: z
    .string()
    .trim()
    .max(CORRECTION_SUGGESTED_MAX, { error: M.suggestedMax })
    .default(""),
  understood: z.literal(true, { error: M.mustUnderstand }),
});

/** The whole request as the review step sends it. */
export const correctionSchema = z.intersection(correctionTargetSchema, correctionDetailsSchema);
export type CorrectionFormValues = z.output<typeof correctionSchema>;

export type CorrectionField = "targetId" | "description" | "suggestedValue" | "understood";
export type CorrectionErrors = Partial<Record<CorrectionField, CorrectionMessageKey>>;

/** First message per field (`targetType` errors are reported on `targetId`). */
export function correctionErrorsOf(error: z.ZodError): CorrectionErrors {
  const out: CorrectionErrors = {};
  for (const issue of error.issues) {
    const head = issue.path[0];
    const field: CorrectionField | null =
      head === "targetType" || head === "targetId"
        ? "targetId"
        : head === "description" || head === "suggestedValue" || head === "understood"
          ? head
          : null;
    if (field !== null && out[field] === undefined) {
      out[field] = issue.message as CorrectionMessageKey;
    }
  }
  return out;
}

/** Field order used to move focus to the first error. */
export const CORRECTION_FIELD_ORDER: readonly CorrectionField[] = [
  "targetId",
  "description",
  "suggestedValue",
  "understood",
];
