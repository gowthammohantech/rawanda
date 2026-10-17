/**
 * Citizen-visible PROJECTIONS (CTZ-01) — derived by `@laif/domain` visibility selectors from the
 * clinician-side records, never stored twice: ReleasedObservation (+ value-less pending
 * placeholder), approved CareInstruction, CorrectionRequest and timeline items. Declared
 * `satisfies z.ZodType<…>` against the domain types where those exist (drift = compile error).
 */
import {
  AMENDABLE_SCREENING_FIELDS,
  CITIZEN_RESULT_LABELS,
  CORRECTION_REQUEST_STATUSES,
  ENTITY_TYPES,
  GLUCOSE_CONTEXTS,
  GLUCOSE_UNITS,
  INSTRUCTION_PROGRESS_VALUES,
  type ApprovedInstruction,
  type PendingReviewPlaceholder,
  type ReleasedObservation,
  type ReviewId,
  type ScreeningId,
} from "@laif/domain";
import { z } from "zod";

import {
  CareInstructionSchema,
  CareTaskIdSchema,
  FacilityIdSchema,
  PatientIdSchema,
  PersonaIdSchema,
  persistedEntityShape,
} from "../entities.ts";
import { IsoUtcString, NonEmptyTrimmed, idSchema } from "../primitives.ts";

const ScreeningIdSchema = idSchema<ScreeningId>();
const ReviewIdSchema = idSchema<ReviewId>();
const AmendableValueSchema = z.union([z.number(), z.string(), z.null()]);

/** Readings with explicit units (blood pressure in mmHg, glucose unit per value). */
export const CitizenReadingsSchema = z.object({
  systolic: z.number().nullable(),
  diastolic: z.number().nullable(),
  bloodPressureUnit: z.literal("mmHg").nullable(),
  glucoseValue: z.number().nullable(),
  glucoseUnit: z.enum(GLUCOSE_UNITS).nullable(),
  glucoseContext: z.enum(GLUCOSE_CONTEXTS).nullable(),
});

export const ReleasedObservationSchema = z.object({
  kind: z.literal("released"),
  id: ScreeningIdSchema,
  patientId: PatientIdSchema,
  screeningId: ScreeningIdSchema,
  reviewId: ReviewIdSchema.nullable(),
  reviewState: z.enum(["released_follow_up", "released_no_action", "dismissed_with_reason"]),
  label: z.enum(CITIZEN_RESULT_LABELS),
  measuredAt: IsoUtcString,
  facilityId: FacilityIdSchema,
  readings: CitizenReadingsSchema,
  originalReadings: CitizenReadingsSchema.nullable(),
  amendments: z.array(
    z.object({
      field: z.enum(AMENDABLE_SCREENING_FIELDS),
      before: AmendableValueSchema,
      after: AmendableValueSchema,
      amendedBy: PersonaIdSchema,
      amendedAt: IsoUtcString,
      reasonKey: z.string().nullable(),
    }),
  ),
  reviewedBy: PersonaIdSchema.nullable(),
  reviewedAt: IsoUtcString.nullable(),
}) satisfies z.ZodType<ReleasedObservation>;

/** Strict: a placeholder can never carry readings, flags or reasons. */
export const PendingReviewPlaceholderSchema = z.strictObject({
  kind: z.literal("pending_review"),
  id: ScreeningIdSchema,
  patientId: PatientIdSchema,
  measuredAt: IsoUtcString,
}) satisfies z.ZodType<PendingReviewPlaceholder>;

export const CitizenObservationItemSchema = z.discriminatedUnion("kind", [
  ReleasedObservationSchema,
  PendingReviewPlaceholderSchema,
]);

/** Approved next step (= FND `CareInstruction` with `status: 'released'`) + derived fields. */
export const ApprovedInstructionSchema = CareInstructionSchema.extend({
  status: z.literal("released"),
  approvalState: z.literal("approved"),
  progress: z.enum(INSTRUCTION_PROGRESS_VALUES),
  datePassed: z.boolean(),
  reviewId: ReviewIdSchema.nullable(),
  acknowledgement: z.object({ id: NonEmptyTrimmed, acknowledgedAt: IsoUtcString }).nullable(),
}) satisfies z.ZodType<ApprovedInstruction>;

/** FRD CorrectionRequest — projection of a `correction_request` care task. */
export const CorrectionRequestSchema = z.object({
  ...persistedEntityShape,
  id: CareTaskIdSchema,
  patientId: PatientIdSchema,
  targetType: z.enum(ENTITY_TYPES),
  targetId: NonEmptyTrimmed,
  description: NonEmptyTrimmed,
  status: z.enum(CORRECTION_REQUEST_STATUSES),
  createdBy: PersonaIdSchema,
  resolvedAt: IsoUtcString.nullable(),
});
export type CorrectionRequest = z.output<typeof CorrectionRequestSchema>;

/** Timeline (CTZ-06) item kinds and citizen-facing states. Reminders are never `done`. */
export const TIMELINE_ITEM_KINDS = [
  "result_shared",
  "awaiting_review",
  "record_updated",
  "next_step",
  "next_step_read",
  "reminder_sent",
  "correction_requested",
  "correction_resolved",
  "consent_granted",
  "consent_withdrawn",
] as const;
export type TimelineItemKind = (typeof TIMELINE_ITEM_KINDS)[number];

export const TIMELINE_ITEM_STATES = ["done", "waiting", "changed", "cancelled", "info"] as const;
export type TimelineItemState = (typeof TIMELINE_ITEM_STATES)[number];

export const TimelineItemSchema = z.object({
  id: NonEmptyTrimmed,
  patientId: PatientIdSchema,
  kind: z.enum(TIMELINE_ITEM_KINDS),
  state: z.enum(TIMELINE_ITEM_STATES),
  occurredAt: IsoUtcString,
  refType: z.enum([
    "observation",
    "instruction",
    "acknowledgement",
    "reminder",
    "correction",
    "consent",
  ]),
  refId: NonEmptyTrimmed,
});
export type TimelineItem = z.output<typeof TimelineItemSchema>;
