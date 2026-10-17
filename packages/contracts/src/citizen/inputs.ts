/**
 * Citizen wallet mutation inputs (CTZ-01). Every mutation carries an `idempotencyKey`; versioned
 * updates carry `expectedVersion` (stale → `CONFLICT` with `latest`). Correction and callback
 * requests reuse the FND-03 `CorrectionRequestInputSchema` / `CallbackRequestInputSchema`.
 */
import { LANGUAGES, REMINDER_TIMINGS } from "@laif/domain";
import { z } from "zod";

import { PatientIdSchema } from "../entities.ts";
import { vMsg } from "../messages.ts";
import { IdempotencyKey, NonEmptyTrimmed, Version } from "../primitives.ts";
import { CITIZEN_NOTICE_VERSION, CONSENT_ACTIONS } from "./records.ts";

/** Grant or withdraw consent for one linked patient (append-only record). */
export const RecordConsentInputSchema = z.object({
  idempotencyKey: IdempotencyKey,
  patientId: PatientIdSchema,
  action: z.enum(CONSENT_ACTIONS),
  noticeVersion: NonEmptyTrimmed.default(CITIZEN_NOTICE_VERSION),
});
export type RecordConsentInput = z.output<typeof RecordConsentInputSchema>;

/** "I have read this" on an approved next step (idempotent: one ack per instruction). */
export const AcknowledgeInstructionInputSchema = z.object({
  idempotencyKey: IdempotencyKey,
  patientId: PatientIdSchema,
  instructionId: NonEmptyTrimmed,
  /** CTZ-04: version of the instruction the citizen read; a newer version → `CONFLICT`. */
  expectedVersion: Version.optional(),
});
export type AcknowledgeInstructionInput = z.output<typeof AcknowledgeInstructionInputSchema>;

/**
 * CTZ-05 "Got it" on a delivered (simulated) reminder → `acknowledged` (idempotent per reminder).
 * Acknowledging a reminder never changes the related next step.
 */
export const AcknowledgeReminderInputSchema = z.object({
  idempotencyKey: IdempotencyKey,
  patientId: PatientIdSchema,
  reminderId: NonEmptyTrimmed,
});
export type AcknowledgeReminderInput = z.output<typeof AcknowledgeReminderInputSchema>;

/** Reminder opt-in / timing (`expectedVersion` of the current preference is required). */
export const UpdateNotificationPrefsInputSchema = z.object({
  idempotencyKey: IdempotencyKey,
  patientId: PatientIdSchema,
  expectedVersion: Version,
  optedIn: z.boolean(),
  timing: z.enum(REMINDER_TIMINGS),
});
export type UpdateNotificationPrefsInput = z.output<typeof UpdateNotificationPrefsInputSchema>;

/** Wallet settings patch (at least one field); `expectedVersion` when a row exists. */
export const UpdateCitizenSettingsInputSchema = z
  .object({
    idempotencyKey: IdempotencyKey,
    expectedVersion: Version.optional(),
    language: z.enum(LANGUAGES).optional(),
    textScale: z.union([z.literal(1), z.literal(1.15), z.literal(1.3)]).optional(),
    highContrast: z.boolean().optional(),
  })
  .refine(
    (v) => v.language !== undefined || v.textScale !== undefined || v.highContrast !== undefined,
    { error: vMsg("required") },
  );
export type UpdateCitizenSettingsInput = z.output<typeof UpdateCitizenSettingsInputSchema>;

/**
 * Simulated identity verification attempt (CTZ-02): the labelled 6-digit demo code. Never a
 * real identity check (ADR-P09). A wrong code is a recorded attempt, not a validation error.
 */
export const VerifyIdentityInputSchema = z.object({
  idempotencyKey: IdempotencyKey,
  code: z.string().regex(/^\d{6}$/u, { error: vMsg("invalidFormat") }),
});
export type VerifyIdentityInput = z.output<typeof VerifyIdentityInputSchema>;
