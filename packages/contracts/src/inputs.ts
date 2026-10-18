/**
 * Mutation input schemas (FND-03 task 3). Every input carries `idempotencyKey` (UUID); updates
 * also carry `expectedVersion`. Clock-dependent checks take the demo clock as `now` through a
 * `create…Schema({ now })` factory so validation stays deterministic.
 *
 * Plausibility limits are data-entry sanity ranges supplied by mock-data config — NOT
 * clinical thresholds.
 */
import {
  AUDIT_OUTCOMES,
  CARE_INSTRUCTION_KINDS,
  CARE_INSTRUCTION_SOURCE_TYPES,
  COMPLETION_EVIDENCE_TYPES,
  CONTACT_METHODS,
  CONTACT_RESULTS,
  CORRECTION_RESOLUTION_KEYS,
  DISMISS_REASON_CODES,
  ENTITY_TYPES,
  FOLLOW_UP_OUTCOMES,
  FOLLOW_UP_OUTCOMES_REQUIRING_EVIDENCE,
  FOLLOW_UP_PURPOSES,
  GLUCOSE_CONTEXTS,
  GLUCOSE_UNITS,
  REFERRAL_CANCEL_REASON_CODES,
  REFERRAL_EVIDENCE_TYPES,
  REFERRAL_OUTCOMES,
  REFERRAL_STATUSES,
  REMINDER_TIMINGS,
  REVIEW_PRIORITIES,
  SEX_VALUES,
  UNABLE_TO_REACH_REASONS,
  type AmendableScreeningField,
  type CareTaskKind,
  type FollowUpAction,
  type FollowUpOutcome,
  type NumericRange,
  type PlausibilityLimits,
  type ReferralStatus,
  type ReviewDecisionInputKind,
  type ScreeningId,
} from "@laif/domain";
import { z } from "zod";

import {
  CareTaskIdSchema,
  CareTaskPayloadSchemas,
  CorrelationIdSchema,
  DistrictIdSchema,
  FacilityIdSchema,
  FollowUpIdSchema,
  PatientIdSchema,
  PersonaIdSchema,
  ReferralIdSchema,
  ReviewIdSchema,
} from "./entities.ts";
import { vMsg } from "./messages.ts";
import {
  IdempotencyKey,
  IsoDate,
  IsoUtcString,
  JsonValueSchema,
  NonEmptyTrimmed,
  Reason,
  Version,
  boundedText,
  idSchema,
  inFuture,
  notInFuture,
  optionalNote,
} from "./primitives.ts";

/** The demo clock getter (`clock.now`). */
export type NowFn = () => Date;
export type ClockDeps = { now: NowFn };
export type ScreeningSchemaDeps = { limits: PlausibilityLimits; now: NowFn };

const SCREENING_ID = idSchema<ScreeningId>();

/** Compile-time check that a schema's discriminator values equal a domain vocabulary. */
type SameMembers<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
function assertSame<T extends true>(...proof: T[]): T[] {
  return proof; // type-level only
}

function rangeMessage(range: NumericRange): string {
  return vMsg("numberOutOfRange", { min: range.min, max: range.max });
}

function inRange(value: number, range: NumericRange): boolean {
  return value >= range.min && value <= range.max;
}

// ── Screening ────────────────────────────────────────────────────────────────

/** `measuredAt` may be at most this far after demo now (device clock skew). */
export const SCREENING_FUTURE_TOLERANCE_MS = 5 * 60 * 1000;
/** ★ `measuredAt` may be at most this many days before demo now. */
export const SCREENING_MAX_AGE_DAYS = 30;
export const SCREENING_NOTES_MAX = 500;
const DAY_MS = 86_400_000;

function measuredAtSchema(now: NowFn) {
  return notInFuture(now, SCREENING_FUTURE_TOLERANCE_MS).refine(
    (value) => Date.parse(value) >= now().getTime() - SCREENING_MAX_AGE_DAYS * DAY_MS,
    { error: vMsg("dateTooOld", { days: SCREENING_MAX_AGE_DAYS }) },
  );
}

function glucoseRange(limits: PlausibilityLimits, unit: (typeof GLUCOSE_UNITS)[number]) {
  return unit === "mmol/L" ? limits.glucoseMmol : limits.glucoseMgDl;
}

/**
 * Submitted screening (HW-04 / CL capture). Cross-field rules: glucose value → unit
 * (`unitRequired`) and context (`contextRequired`) required, glucose within the unit's
 * plausibility range, `diastolic < systolic` (`diastolicNotBelowSystolic`).
 */
export function createScreeningInputSchema({ limits, now }: ScreeningSchemaDeps) {
  return z
    .object({
      idempotencyKey: IdempotencyKey,
      patientId: PatientIdSchema,
      measuredAt: measuredAtSchema(now),
      systolic: z
        .number()
        .int({ error: vMsg("integerRequired") })
        .refine((v) => inRange(v, limits.systolic), { error: rangeMessage(limits.systolic) }),
      diastolic: z
        .number()
        .int({ error: vMsg("integerRequired") })
        .refine((v) => inRange(v, limits.diastolic), { error: rangeMessage(limits.diastolic) }),
      glucoseValue: z.number().nullable().default(null),
      glucoseUnit: z.enum(GLUCOSE_UNITS).nullable().default(null),
      glucoseContext: z.enum(GLUCOSE_CONTEXTS).nullable().default(null),
      notes: z
        .string()
        .trim()
        .max(SCREENING_NOTES_MAX, { error: vMsg("tooLong", { max: SCREENING_NOTES_MAX }) })
        .default(""),
      captureDurationSeconds: z.number().int().min(0).optional(),
    })
    .superRefine((v, ctx) => {
      if (v.diastolic >= v.systolic) {
        ctx.addIssue({
          code: "custom",
          path: ["diastolic"],
          message: vMsg("diastolicNotBelowSystolic"),
        });
      }
      if (v.glucoseValue === null) return;
      if (v.glucoseUnit === null) {
        ctx.addIssue({ code: "custom", path: ["glucoseUnit"], message: vMsg("unitRequired") });
      } else {
        const range = glucoseRange(limits, v.glucoseUnit);
        if (!inRange(v.glucoseValue, range)) {
          ctx.addIssue({ code: "custom", path: ["glucoseValue"], message: rangeMessage(range) });
        }
      }
      if (v.glucoseContext === null) {
        ctx.addIssue({
          code: "custom",
          path: ["glucoseContext"],
          message: vMsg("contextRequired"),
        });
      }
    });
}
export type ScreeningInputSchema = ReturnType<typeof createScreeningInputSchema>;
export type ScreeningInput = z.output<ScreeningInputSchema>;

/** Device-local draft: every field optional except `patientId` (never synced, FND-07). */
export const ScreeningDraftInputSchema = z.object({
  idempotencyKey: IdempotencyKey,
  /** Existing draft to overwrite; omitted for a new draft. */
  screeningId: SCREENING_ID.optional(),
  patientId: PatientIdSchema,
  measuredAt: IsoUtcString.optional(),
  systolic: z.number().int().nullable().optional(),
  diastolic: z.number().int().nullable().optional(),
  glucoseValue: z.number().nullable().optional(),
  glucoseUnit: z.enum(GLUCOSE_UNITS).nullable().optional(),
  glucoseContext: z.enum(GLUCOSE_CONTEXTS).nullable().optional(),
  notes: z
    .string()
    .trim()
    .max(SCREENING_NOTES_MAX, { error: vMsg("tooLong", { max: SCREENING_NOTES_MAX }) })
    .optional(),
  captureDurationSeconds: z.number().int().min(0).optional(),
});
export type ScreeningDraftInput = z.output<typeof ScreeningDraftInputSchema>;

/**
 * Amendment of one submitted-screening field (CLN-04, HWM-06), discriminated on `field`.
 * With `deps`, numeric values are checked against the plausibility limits and `measuredAt`
 * against the demo clock; without, only types are checked.
 */
export function createScreeningAmendmentInputSchema(deps: Partial<ScreeningSchemaDeps> = {}) {
  const base = {
    idempotencyKey: IdempotencyKey,
    screeningId: SCREENING_ID,
    expectedVersion: Version,
    reason: Reason,
  };
  const bp = (range: NumericRange | undefined) => {
    const int = z.number().int({ error: vMsg("integerRequired") });
    return range ? int.refine((v) => inRange(v, range), { error: rangeMessage(range) }) : int;
  };
  const limits = deps.limits;
  return z.discriminatedUnion("field", [
    z.object({ ...base, field: z.literal("systolic"), after: bp(limits?.systolic) }),
    z.object({ ...base, field: z.literal("diastolic"), after: bp(limits?.diastolic) }),
    z.object({ ...base, field: z.literal("glucoseValue"), after: z.number().nullable() }),
    z.object({ ...base, field: z.literal("glucoseUnit"), after: z.enum(GLUCOSE_UNITS) }),
    z.object({ ...base, field: z.literal("glucoseContext"), after: z.enum(GLUCOSE_CONTEXTS) }),
    z.object({
      ...base,
      field: z.literal("measuredAt"),
      after: deps.now ? measuredAtSchema(deps.now) : IsoUtcString,
    }),
  ]);
}
export const ScreeningAmendmentInputSchema = createScreeningAmendmentInputSchema();
export type ScreeningAmendmentInput = z.output<typeof ScreeningAmendmentInputSchema>;
assertSame<SameMembers<ScreeningAmendmentInput["field"], AmendableScreeningField>>();

// ── Patient ──────────────────────────────────────────────────────────────────

export const PERSON_NAME_MAX = 80;
export const ESTIMATED_AGE_MAX_YEARS = 120;
/** HWM-04: optional free-text village / cell label (fictional in the demo). */
export const VILLAGE_LABEL_MAX = 60;
/** HWM-04: synthetic phone, stored as 10 digits `07XXXXXXXX` (shown `07X XXX XXXX`). */
export const SYNTHETIC_PHONE_PATTERN = /^07\d{8}$/u;

/** HWM-04 registration: either `dateOfBirth` or `estimatedAgeYears` is required. */
export const RegisterPatientInputSchema = z
  .object({
    idempotencyKey: IdempotencyKey,
    givenName: boundedText(1, PERSON_NAME_MAX),
    familyName: boundedText(1, PERSON_NAME_MAX),
    dateOfBirth: IsoDate.optional(),
    estimatedAgeYears: z
      .number()
      .int({ error: vMsg("integerRequired") })
      .min(0, { error: vMsg("numberOutOfRange", { min: 0, max: ESTIMATED_AGE_MAX_YEARS }) })
      .max(ESTIMATED_AGE_MAX_YEARS, {
        error: vMsg("numberOutOfRange", { min: 0, max: ESTIMATED_AGE_MAX_YEARS }),
      })
      .optional(),
    sex: z.enum(SEX_VALUES),
    facilityId: FacilityIdSchema,
    localIdentifier: boundedText(1, 40).optional(),
    /** ext (HWM-04): optional village / cell label, free text. */
    villageLabel: boundedText(1, VILLAGE_LABEL_MAX).optional(),
    /** ext (HWM-04): optional synthetic phone (`07XXXXXXXX`). */
    syntheticPhone: z
      .string()
      .trim()
      .regex(SYNTHETIC_PHONE_PATTERN, { error: vMsg("phonePattern") })
      .optional(),
    matchDecision: z.literal("register_anyway_flagged").optional(),
  })
  .superRefine((v, ctx) => {
    if (v.dateOfBirth === undefined && v.estimatedAgeYears === undefined) {
      ctx.addIssue({ code: "custom", path: ["dateOfBirth"], message: vMsg("required") });
    }
  });
export type RegisterPatientInput = z.output<typeof RegisterPatientInputSchema>;

// ── Review ───────────────────────────────────────────────────────────────────

export const StartReviewInputSchema = z.object({
  idempotencyKey: IdempotencyKey,
  reviewId: ReviewIdSchema,
  expectedVersion: Version,
  /** Required by the repository when taking over another clinician's in-progress review. */
  takeOverReason: Reason.optional(),
});
export type StartReviewInput = z.output<typeof StartReviewInputSchema>;

export const INSTRUCTIONS_FOR_WORKER_MIN = 5;
export const INSTRUCTIONS_FOR_WORKER_MAX = 300;
export const DECISION_NOTE_MAX = 1000;

/**
 * The single decision contract (CLN-07), discriminated on `kind`
 * (`REVIEW_DECISION_INPUT_KINDS`, FND-02). Effects (FND-07): `refer` creates a Referral
 * `created`; `request_repeat_screening` a FollowUp `repeat_screening`; `plan_follow_up` a
 * FollowUp `planned_review`; `dismiss` creates nothing (WF-03).
 * Pass the demo clock as `now` to enforce `dueAt > now`; omit it for type-only checks.
 */
export function createReviewDecisionInputSchema(deps: Partial<ClockDeps> = {}) {
  const dueAt = deps.now ? inFuture(deps.now) : IsoUtcString;
  const base = {
    idempotencyKey: IdempotencyKey,
    reviewId: ReviewIdSchema,
    expectedVersion: Version,
    note: optionalNote(DECISION_NOTE_MAX),
  };
  return z.discriminatedUnion("kind", [
    z.object({ ...base, kind: z.literal("no_further_action"), note: Reason }),
    z.object({
      ...base,
      kind: z.literal("refer"),
      destinationFacilityId: FacilityIdSchema,
      referralReason: Reason,
      dueAt,
      priority: z.enum(REVIEW_PRIORITIES),
    }),
    z.object({
      ...base,
      kind: z.literal("request_repeat_screening"),
      assignedWorkerId: PersonaIdSchema,
      dueAt,
      instructionsForWorker: boundedText(INSTRUCTIONS_FOR_WORKER_MIN, INSTRUCTIONS_FOR_WORKER_MAX),
    }),
    z.object({
      ...base,
      kind: z.literal("plan_follow_up"),
      assignedWorkerId: PersonaIdSchema.optional(),
      dueAt,
      note: Reason,
    }),
    z.object({
      ...base,
      kind: z.literal("dismiss"),
      dismissReasonCode: z.enum(DISMISS_REASON_CODES),
      reason: Reason,
    }),
  ]);
}
export const ReviewDecisionInputSchema = createReviewDecisionInputSchema();
export type ReviewDecisionInput = z.output<typeof ReviewDecisionInputSchema>;
assertSame<SameMembers<ReviewDecisionInput["kind"], ReviewDecisionInputKind>>();

// ── Referral ─────────────────────────────────────────────────────────────────

export const EVIDENCE_REFERENCE_MIN = 3;
export const EVIDENCE_REFERENCE_MAX = 100;

export const ReferralInputSchema = z.object({
  idempotencyKey: IdempotencyKey,
  reviewId: ReviewIdSchema,
  patientId: PatientIdSchema,
  destinationFacilityId: FacilityIdSchema,
  dueAt: IsoUtcString,
  priority: z.enum(REVIEW_PRIORITIES),
  assignedWorkerId: PersonaIdSchema.optional(),
  referralReason: Reason,
});
export type ReferralInput = z.output<typeof ReferralInputSchema>;

export const ReferralEditInputSchema = z
  .object({
    idempotencyKey: IdempotencyKey,
    referralId: ReferralIdSchema,
    expectedVersion: Version,
    destinationFacilityId: FacilityIdSchema.optional(),
    dueAt: IsoUtcString.optional(),
    changeReason: Reason,
  })
  .superRefine((v, ctx) => {
    if (v.destinationFacilityId === undefined && v.dueAt === undefined) {
      ctx.addIssue({ code: "custom", path: [], message: vMsg("noChanges") });
    }
  });
export type ReferralEditInput = z.output<typeof ReferralEditInputSchema>;

/** `evidenceRequired` when missing, `invalidEnum` when not a referral evidence type. */
const referralEvidenceType = z.enum(REFERRAL_EVIDENCE_TYPES, {
  error: (issue) => (issue.input == null ? vMsg("evidenceRequired") : vMsg("invalidEnum")),
});
const evidenceReference = z
  .string({ error: (issue) => (issue.input == null ? vMsg("evidenceRequired") : undefined) })
  .trim()
  .min(EVIDENCE_REFERENCE_MIN, { error: vMsg("tooShort", { min: EVIDENCE_REFERENCE_MIN }) })
  .max(EVIDENCE_REFERENCE_MAX, { error: vMsg("tooLong", { max: EVIDENCE_REFERENCE_MAX }) });

/**
 * Referral transitions, discriminated on the target status `to`. `completed` requires
 * timestamp + outcome + evidence type + reference (FRD §4). Pass `now` to enforce
 * `completedAt ≤ now`.
 */
export function createReferralTransitionInputSchema(deps: Partial<ClockDeps> = {}) {
  const base = {
    idempotencyKey: IdempotencyKey,
    referralId: ReferralIdSchema,
    expectedVersion: Version,
  };
  return z.discriminatedUnion("to", [
    z.object({ ...base, to: z.literal("accepted"), note: optionalNote() }),
    z.object({ ...base, to: z.literal("scheduled"), appointmentAt: IsoUtcString }),
    z.object({
      ...base,
      to: z.literal("completed"),
      completedAt: deps.now ? notInFuture(deps.now) : IsoUtcString,
      outcome: z.enum(REFERRAL_OUTCOMES),
      evidenceType: referralEvidenceType,
      evidenceReference,
      note: optionalNote(),
    }),
    z.object({
      ...base,
      to: z.literal("cancelled_with_reason"),
      cancelReasonCode: z.enum(REFERRAL_CANCEL_REASON_CODES),
      reason: Reason,
    }),
  ]);
}
export const ReferralTransitionInputSchema = createReferralTransitionInputSchema();
export type ReferralTransitionInput = z.output<typeof ReferralTransitionInputSchema>;
assertSame<SameMembers<ReferralTransitionInput["to"], Exclude<ReferralStatus, "created">>>();
export const REFERRAL_TRANSITION_TARGETS = REFERRAL_STATUSES.filter(
  (s): s is Exclude<ReferralStatus, "created"> => s !== "created",
);

// ── Follow-up ────────────────────────────────────────────────────────────────

export const FollowUpInputSchema = z.object({
  idempotencyKey: IdempotencyKey,
  patientId: PatientIdSchema,
  purpose: z.enum(FOLLOW_UP_PURPOSES),
  dueAt: IsoUtcString,
  assignedWorkerId: PersonaIdSchema.optional(),
  referralId: ReferralIdSchema.optional(),
  reviewId: ReviewIdSchema.optional(),
  note: optionalNote(),
});
export type FollowUpInput = z.output<typeof FollowUpInputSchema>;

export const FOLLOW_UP_NOTE_MIN = 3;
export const FOLLOW_UP_NOTE_MAX = 500;
export const CONTACT_DURATION_MAX_MINUTES = 600;

const OUTCOMES_REQUIRING_EVIDENCE: ReadonlySet<FollowUpOutcome> = new Set(
  FOLLOW_UP_OUTCOMES_REQUIRING_EVIDENCE,
);

/**
 * Follow-up updates, discriminated on `action` (`FOLLOW_UP_ACTIONS`, FND-02). Shared by
 * CLN-09 (clinician) and HWM-08 (worker); permissions decide which role may send which action.
 */
export const FollowUpUpdateInputSchema = z.discriminatedUnion("action", [
  z.object({
    idempotencyKey: IdempotencyKey,
    followUpId: FollowUpIdSchema,
    expectedVersion: Version,
    action: z.literal("assign"),
    assignedWorkerId: PersonaIdSchema,
    dueAt: IsoUtcString,
  }),
  z.object({
    idempotencyKey: IdempotencyKey,
    followUpId: FollowUpIdSchema,
    expectedVersion: Version,
    action: z.literal("reassign"),
    assignedWorkerId: PersonaIdSchema,
    dueAt: IsoUtcString.optional(),
    reason: Reason,
  }),
  z.object({
    idempotencyKey: IdempotencyKey,
    followUpId: FollowUpIdSchema,
    expectedVersion: Version,
    action: z.literal("set_due_date"),
    dueAt: IsoUtcString,
    reason: Reason,
  }),
  z.object({
    idempotencyKey: IdempotencyKey,
    followUpId: FollowUpIdSchema,
    expectedVersion: Version,
    action: z.literal("record_attempt"),
    at: IsoUtcString,
    method: z.enum(CONTACT_METHODS),
    result: z.enum(CONTACT_RESULTS),
    note: optionalNote(FOLLOW_UP_NOTE_MAX),
    durationMinutes: z
      .number()
      .int({ error: vMsg("integerRequired") })
      .min(0, { error: vMsg("numberOutOfRange", { min: 0, max: CONTACT_DURATION_MAX_MINUTES }) })
      .max(CONTACT_DURATION_MAX_MINUTES, {
        error: vMsg("numberOutOfRange", { min: 0, max: CONTACT_DURATION_MAX_MINUTES }),
      })
      .optional(),
  }),
  z
    .object({
      idempotencyKey: IdempotencyKey,
      followUpId: FollowUpIdSchema,
      expectedVersion: Version,
      action: z.literal("record_outcome"),
      outcome: z.enum(FOLLOW_UP_OUTCOMES),
      occurredAt: IsoUtcString,
      evidenceType: z.enum(COMPLETION_EVIDENCE_TYPES).optional(),
      reasonCode: z.enum(UNABLE_TO_REACH_REASONS).optional(),
      note: optionalNote(FOLLOW_UP_NOTE_MAX),
    })
    .superRefine((v, ctx) => {
      if (OUTCOMES_REQUIRING_EVIDENCE.has(v.outcome) && v.evidenceType === undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["evidenceType"],
          message: vMsg("evidenceTypeRequired"),
        });
      }
      if (v.outcome === "unable_to_reach" && v.reasonCode === undefined) {
        ctx.addIssue({ code: "custom", path: ["reasonCode"], message: vMsg("required") });
      }
    }),
  z.object({
    idempotencyKey: IdempotencyKey,
    followUpId: FollowUpIdSchema,
    expectedVersion: Version,
    action: z.literal("add_note"),
    note: boundedText(FOLLOW_UP_NOTE_MIN, FOLLOW_UP_NOTE_MAX),
  }),
  z.object({
    idempotencyKey: IdempotencyKey,
    followUpId: FollowUpIdSchema,
    expectedVersion: Version,
    action: z.literal("confirm_completion"),
  }),
  z.object({
    idempotencyKey: IdempotencyKey,
    followUpId: FollowUpIdSchema,
    expectedVersion: Version,
    action: z.literal("return_to_worker"),
    reason: Reason,
  }),
]);
export type FollowUpUpdateInput = z.output<typeof FollowUpUpdateInputSchema>;
assertSame<SameMembers<FollowUpUpdateInput["action"], FollowUpAction>>();

// ── Care tasks ───────────────────────────────────────────────────────────────

const careTaskInputBase = {
  idempotencyKey: IdempotencyKey,
  patientId: PatientIdSchema.optional(),
  facilityId: FacilityIdSchema.optional(),
  assignedToId: PersonaIdSchema.optional(),
  dueAt: IsoUtcString.optional(),
};

/** Generic task creation, discriminated on `kind` with the entity's payload schemas. */
export const CareTaskInputSchema = z.discriminatedUnion("kind", [
  z.object({
    ...careTaskInputBase,
    kind: z.literal("follow_up_assignment"),
    payload: CareTaskPayloadSchemas.follow_up_assignment,
  }),
  z.object({
    ...careTaskInputBase,
    kind: z.literal("correction_request"),
    payload: CareTaskPayloadSchemas.correction_request,
  }),
  z.object({
    ...careTaskInputBase,
    kind: z.literal("callback_request"),
    payload: CareTaskPayloadSchemas.callback_request,
  }),
  z.object({
    ...careTaskInputBase,
    kind: z.literal("programme_action"),
    payload: CareTaskPayloadSchemas.programme_action,
  }),
  z.object({
    ...careTaskInputBase,
    kind: z.literal("data_quality"),
    payload: CareTaskPayloadSchemas.data_quality,
  }),
]);
export type CareTaskInput = z.output<typeof CareTaskInputSchema>;
assertSame<SameMembers<CareTaskInput["kind"], CareTaskKind>>();

/** Care task updates (machine: open → in_progress → done; open|in_progress → cancelled). */
export const CARE_TASK_UPDATE_ACTIONS = ["start", "complete", "cancel", "assign"] as const;
export type CareTaskUpdateAction = (typeof CARE_TASK_UPDATE_ACTIONS)[number];

const careTaskUpdateBase = {
  idempotencyKey: IdempotencyKey,
  taskId: CareTaskIdSchema,
  expectedVersion: Version,
};

export const CareTaskUpdateInputSchema = z.discriminatedUnion("action", [
  z.object({ ...careTaskUpdateBase, action: z.literal("start") }),
  z.object({
    ...careTaskUpdateBase,
    action: z.literal("complete"),
    note: optionalNote(),
    /** CLN-09: correction requests only — the outcome KEY shown to the citizen (vocabulary). */
    resolutionKey: z.enum(CORRECTION_RESOLUTION_KEYS).optional(),
  }),
  z.object({ ...careTaskUpdateBase, action: z.literal("cancel"), reason: Reason }),
  z.object({
    ...careTaskUpdateBase,
    action: z.literal("assign"),
    assignedToId: PersonaIdSchema.nullable(),
    dueAt: IsoUtcString.nullable().optional(),
  }),
]);
export type CareTaskUpdateInput = z.output<typeof CareTaskUpdateInputSchema>;
assertSame<SameMembers<CareTaskUpdateInput["action"], CareTaskUpdateAction>>();

export const CORRECTION_DESCRIPTION_MIN = 10;
export const CORRECTION_DESCRIPTION_MAX = 1000;

/** Correction request (WF-04.4): creates a `correction_request` task, never edits the record. */
export const CorrectionRequestInputSchema = z.object({
  idempotencyKey: IdempotencyKey,
  patientId: PatientIdSchema,
  targetType: z.enum(ENTITY_TYPES),
  targetId: NonEmptyTrimmed,
  description: boundedText(CORRECTION_DESCRIPTION_MIN, CORRECTION_DESCRIPTION_MAX),
  suggestedValue: JsonValueSchema.default(null),
  /**
   * ext (CTZ-07): version of the target record the citizen picked (stale → `CONFLICT`, nothing
   * written). Omitted = no version check.
   */
  expectedTargetVersion: Version.optional(),
});
export type CorrectionRequestInput = z.output<typeof CorrectionRequestInputSchema>;

/** CTZ-08 callback form vocabulary. */
export const CALLBACK_TOPICS = [
  "appointment_question",
  "result_question",
  "app_problem",
  "other",
] as const;
export type CallbackTopic = (typeof CALLBACK_TOPICS)[number];
export const CALLBACK_WINDOWS = ["morning", "afternoon"] as const;
export type CallbackWindow = (typeof CALLBACK_WINDOWS)[number];
export const CALLBACK_NOTE_MAX = 300;

export const CallbackRequestInputSchema = z.object({
  idempotencyKey: IdempotencyKey,
  patientId: PatientIdSchema,
  topic: z.enum(CALLBACK_TOPICS),
  window: z.enum(CALLBACK_WINDOWS),
  note: optionalNote(CALLBACK_NOTE_MAX),
});
export type CallbackRequestInput = z.output<typeof CallbackRequestInputSchema>;

// ── Citizen reminders & instructions ─────────────────────────────────────────

export const ReminderPreferenceInputSchema = z.object({
  idempotencyKey: IdempotencyKey,
  patientId: PatientIdSchema,
  /** Present when updating an existing preference. */
  expectedVersion: Version.optional(),
  optedIn: z.boolean(),
  timing: z.enum(REMINDER_TIMINGS),
});
export type ReminderPreferenceInput = z.output<typeof ReminderPreferenceInputSchema>;

export const ReleaseCareInstructionInputSchema = z.object({
  idempotencyKey: IdempotencyKey,
  patientId: PatientIdSchema,
  kind: z.enum(CARE_INSTRUCTION_KINDS),
  sourceType: z.enum(CARE_INSTRUCTION_SOURCE_TYPES),
  sourceId: NonEmptyTrimmed,
  /** i18n key in namespace `citizen` (never free text). */
  messageKey: z
    .string()
    .trim()
    .regex(/^citizen:[A-Za-z0-9_.-]+$/u, { error: vMsg("invalidFormat") }),
  params: z.record(z.string(), z.union([z.string(), z.number()])).default({}),
  appointmentAt: IsoUtcString.nullable().default(null),
  facilityId: FacilityIdSchema,
});
export type ReleaseCareInstructionInput = z.output<typeof ReleaseCareInstructionInputSchema>;

// ── Exports ──────────────────────────────────────────────────────────────────

/** ADM-07 export reason codes (demo placeholders). */
export const EXPORT_REASON_CODES = [
  "programme_review",
  "district_meeting",
  "data_quality_followup",
  "evaluation_reporting",
  "other",
] as const;
export type ExportReasonCode = (typeof EXPORT_REASON_CODES)[number];

export const EXPORT_GRANULARITIES = ["scope_total", "district", "facility", "week"] as const;
export type ExportGranularity = (typeof EXPORT_GRANULARITIES)[number];
export const EXPORT_REASON_TEXT_MIN = 10;
export const EXPORT_REASON_TEXT_MAX = 300;

/** Aggregate export record (ADM-07, CLN-10); `reasonText` is required when `other`. */
export const ExportRecordInputSchema = z
  .object({
    idempotencyKey: IdempotencyKey,
    reasonCode: z.enum(EXPORT_REASON_CODES),
    reasonText: boundedText(EXPORT_REASON_TEXT_MIN, EXPORT_REASON_TEXT_MAX).optional(),
    template: NonEmptyTrimmed,
    granularity: z.enum(EXPORT_GRANULARITIES),
    scope: z.object({
      districtIds: z.array(DistrictIdSchema),
      facilityIds: z.array(FacilityIdSchema),
    }),
    filters: z.record(z.string(), JsonValueSchema),
    rowCount: z.number().int().min(0),
    suppressedCells: z.number().int().min(0),
    sha256: z.string().regex(/^[0-9a-f]{64}$/u, { error: vMsg("invalidFormat") }),
  })
  .superRefine((v, ctx) => {
    if (v.reasonCode === "other" && v.reasonText === undefined) {
      ctx.addIssue({ code: "custom", path: ["reasonText"], message: vMsg("required") });
    }
  });
export type ExportRecordInput = z.output<typeof ExportRecordInputSchema>;

// ── Client-originated audit events ───────────────────────────────────────────

/**
 * UI-originated access / session / demo audit events (FND-07 `recordAuditEvent`): route-guard
 * denials, `session.started`, demo tooling. The repository additionally requires `action` to be
 * a client-recordable entry of the FND-07 audit action registry.
 */
export const ClientAuditInputSchema = z.object({
  action: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/u, { error: vMsg("invalidFormat") }),
  entityType: z.enum(ENTITY_TYPES).optional(),
  entityId: NonEmptyTrimmed.optional(),
  patientId: PatientIdSchema.optional(),
  facilityId: FacilityIdSchema.optional(),
  districtId: DistrictIdSchema.optional(),
  outcome: z.enum(AUDIT_OUTCOMES).default("success"),
  changeSummary: z.record(z.string(), JsonValueSchema).default({}),
  justification: optionalNote(),
  /** ext (ADM-01): links UI events to a session (e.g. the admin session's correlation id). */
  correlationId: CorrelationIdSchema.optional(),
});
export type ClientAuditInput = z.input<typeof ClientAuditInputSchema>;
export type ParsedClientAuditInput = z.output<typeof ClientAuditInputSchema>;
