/**
 * Entity schemas, each declared `satisfies z.ZodType<Entity>` so drift between `@laif/domain`
 * types and these schemas is a compile error (FND-03 task 4). Every entity requires
 * `synthetic: true` (privacy assertion: the prototype holds synthetic data only).
 *
 * Optional domain fields (`field?: T`) use `.exactOptional()` because the repo compiles with
 * `exactOptionalPropertyTypes`.
 */
import {
  AMENDABLE_SCREENING_FIELDS,
  APP_IDS,
  AUDIT_CATEGORIES,
  AUDIT_OUTCOMES,
  CARE_INSTRUCTION_KINDS,
  CARE_INSTRUCTION_SOURCE_TYPES,
  CARE_INSTRUCTION_STATUSES,
  CARE_TASK_STATUSES,
  CLINICIAN_CONFIRMATION_STATES,
  COMPLETION_EVIDENCE_TYPES,
  CONSENT_STATES,
  CONTACT_METHODS,
  CONTACT_RESULTS,
  CORRECTION_REQUEST_STATUSES,
  DEMO_RULE_DISCLAIMER,
  DEVICE_SESSION_STATUSES,
  DISMISS_REASON_CODES,
  ENTITY_TYPES,
  FACILITY_KINDS,
  FOLLOW_UP_OUTCOMES,
  FOLLOW_UP_PURPOSES,
  FOLLOW_UP_STATUSES,
  GLUCOSE_CONTEXTS,
  GLUCOSE_UNITS,
  IDENTITY_STATUSES,
  LANGUAGES,
  OBSERVATION_CODES,
  REASON_CODES,
  REFERRAL_CANCEL_REASON_CODES,
  REFERRAL_OUTCOMES,
  REFERRAL_STATUSES,
  REMINDER_CANCEL_REASONS,
  REMINDER_CHANNELS,
  REMINDER_STATUSES,
  REMINDER_TIMINGS,
  REVIEW_DECISION_INPUT_KINDS,
  REVIEW_ORIGINS,
  REVIEW_PRIORITIES,
  REVIEW_STATUSES,
  ROLES,
  SCREENING_SOURCES,
  SCREENING_STATUSES,
  SEX_VALUES,
  SYNC_OP_STATUSES,
  SYNC_OP_TYPES,
  UNABLE_TO_REACH_REASONS,
  type AuditEvent,
  type AuditEventId,
  type CareInstruction,
  type CareInstructionId,
  type CareTask,
  type CareTaskId,
  type ContactAttemptId,
  type CorrelationId,
  type DemoPersona,
  type DemoRuleset,
  type DeviceId,
  type DeviceSession,
  type DeviceSessionId,
  type District,
  type DistrictId,
  type EvidenceSnapshot,
  type Facility,
  type FacilityId,
  type FlagResult,
  type FollowUp,
  type FollowUpId,
  type Patient,
  type PatientId,
  type PersonaId,
  type Referral,
  type ReferralId,
  type Reminder,
  type ReminderId,
  type ReminderPreference,
  type ReminderPreferenceId,
  type Review,
  type ReviewId,
  type Screening,
  type ScreeningAmendmentId,
  type ScreeningId,
  type SyncOperation,
  type SyncOperationId,
} from "@laif/domain";
import { z } from "zod";

import { DataQualityIssueSchema } from "./dataQualityIssue.ts";
import { ExportAuditSchema } from "./exportAudit.ts";
import { ProgrammeActionSchema } from "./programmeAction.ts";

import {
  IsoDate,
  IsoUtcString,
  JsonValueSchema,
  NonEmptyTrimmed,
  Version,
  idSchema,
} from "./primitives.ts";

// ── Shared pieces ────────────────────────────────────────────────────────────

/** `PersistedEntity` fields. */
export const persistedEntityShape = {
  version: Version,
  createdAt: IsoUtcString,
  updatedAt: IsoUtcString,
  synthetic: z.literal(true),
};

export const PatientIdSchema = idSchema<PatientId>();
export const ScreeningIdSchema = idSchema<ScreeningId>();
export const ReviewIdSchema = idSchema<ReviewId>();
export const ReferralIdSchema = idSchema<ReferralId>();
export const FollowUpIdSchema = idSchema<FollowUpId>();
export const CareTaskIdSchema = idSchema<CareTaskId>();
export const FacilityIdSchema = idSchema<FacilityId>();
export const DistrictIdSchema = idSchema<DistrictId>();
export const PersonaIdSchema = idSchema<PersonaId>();
export const CorrelationIdSchema = idSchema<CorrelationId>();

const nullableIso = IsoUtcString.nullable();
const textOrEmpty = z.string();

// ── Rules ────────────────────────────────────────────────────────────────────

export const FlagResultSchema = z.object({
  requiresReview: z.boolean(),
  evaluable: z.boolean(),
  reasonCodes: z.array(z.enum(REASON_CODES)),
  triggeringObservations: z.array(
    z.object({
      code: z.enum(OBSERVATION_CODES),
      value: z.number(),
      unit: z.string(),
      comparedTo: z.number(),
    }),
  ),
  rulesetVersion: NonEmptyTrimmed,
  displayDisclaimer: z.literal(DEMO_RULE_DISCLAIMER),
}) satisfies z.ZodType<FlagResult>;

export const EvidenceSnapshotSchema = z.object({
  flag: FlagResultSchema,
  inputs: z.object({
    systolic: z.number().nullable(),
    diastolic: z.number().nullable(),
    glucoseValue: z.number().nullable(),
    glucoseUnit: z.enum(GLUCOSE_UNITS).nullable(),
    glucoseContext: z.enum(GLUCOSE_CONTEXTS).nullable(),
  }),
  capturedAt: IsoUtcString,
  capturedBy: PersonaIdSchema.nullable(),
}) satisfies z.ZodType<EvidenceSnapshot>;

const NumericRangeSchema = z.object({ min: z.number(), max: z.number() });

export const DemoRulesetSchema = z.object({
  version: NonEmptyTrimmed,
  status: z.enum(["active", "retired"]),
  label: z.literal(DEMO_RULE_DISCLAIMER),
  approvedBy: z.null(),
  effectiveFrom: IsoUtcString,
  effectiveTo: IsoUtcString.exactOptional(),
  requiredInputs: z.array(z.string()),
  thresholds: z.object({
    DEMO_SYSTOLIC_REVIEW_AT_OR_ABOVE: z.number(),
    DEMO_DIASTOLIC_REVIEW_AT_OR_ABOVE: z.number(),
    DEMO_GLUCOSE_REVIEW_AT_OR_ABOVE_MMOL: z.record(z.enum(GLUCOSE_CONTEXTS), z.number()),
  }),
  plausibility: z.object({
    systolic: NumericRangeSchema,
    diastolic: NumericRangeSchema,
    glucoseMmol: NumericRangeSchema,
    glucoseMgDl: NumericRangeSchema,
  }),
  synthetic: z.literal(true),
}) satisfies z.ZodType<DemoRuleset>;

// ── Reference data ───────────────────────────────────────────────────────────

export const DistrictSchema = z.object({
  ...persistedEntityShape,
  id: DistrictIdSchema,
  name: NonEmptyTrimmed,
  code: NonEmptyTrimmed,
}) satisfies z.ZodType<District>;

export const FacilitySchema = z.object({
  ...persistedEntityShape,
  id: FacilityIdSchema,
  name: NonEmptyTrimmed,
  code: NonEmptyTrimmed,
  kind: z.enum(FACILITY_KINDS),
  districtId: DistrictIdSchema,
}) satisfies z.ZodType<Facility>;

export const DemoPersonaSchema = z.object({
  ...persistedEntityShape,
  id: PersonaIdSchema,
  displayName: NonEmptyTrimmed,
  role: z.enum(ROLES),
  appIds: z.array(z.enum(APP_IDS)),
  facilityIds: z.array(FacilityIdSchema),
  districtIds: z.array(DistrictIdSchema),
  programmeWide: z.boolean(),
  workerCode: z.string().nullable(),
  linkedPatientIds: z.array(PatientIdSchema),
  preferredLanguage: z.enum(LANGUAGES),
}) satisfies z.ZodType<DemoPersona>;

// ── Patient & screening ──────────────────────────────────────────────────────

export const PatientSchema = z.object({
  ...persistedEntityShape,
  id: PatientIdSchema,
  syntheticIdentifier: NonEmptyTrimmed,
  displayName: NonEmptyTrimmed,
  dateOfBirth: IsoDate.nullable(),
  estimatedAgeYears: z.number().int().min(0).max(130).exactOptional(),
  sexOptional: z.enum(SEX_VALUES).nullable(),
  facilityId: FacilityIdSchema,
  districtId: DistrictIdSchema,
  consentState: z.enum(CONSENT_STATES),
  identityStatus: z.enum(IDENTITY_STATUSES),
  duplicateCandidateIds: z.array(PatientIdSchema),
  preferredLanguage: z.enum(LANGUAGES),
  villageLabel: NonEmptyTrimmed.exactOptional(),
  syntheticPhone: z
    .string()
    .regex(/^07\d{8}$/u)
    .exactOptional(),
}) satisfies z.ZodType<Patient>;

/**
 * CLN-03: one row of the clinical patient search — the patient's identity columns plus derived
 * values (age at the demo clock, latest screening, open reviews + referrals + follow-ups).
 */
export const PatientSummarySchema = z.object({
  id: PatientIdSchema,
  syntheticIdentifier: NonEmptyTrimmed,
  displayName: NonEmptyTrimmed,
  /** Whole years at the demo clock; null when neither a date of birth nor an estimate exists. */
  ageYears: z.number().int().min(0).max(130).nullable(),
  /** True when `ageYears` comes from `estimatedAgeYears` (no date of birth recorded). */
  ageEstimated: z.boolean(),
  sexOptional: z.enum(SEX_VALUES).nullable(),
  facilityId: FacilityIdSchema,
  lastScreeningAt: IsoUtcString.nullable(),
  openItems: z.number().int().min(0),
});
export type PatientSummary = z.output<typeof PatientSummarySchema>;

const AmendableValueSchema = z.union([z.number(), z.string(), z.null()]);

export const ScreeningAmendmentSchema = z.object({
  id: idSchema<ScreeningAmendmentId>(),
  field: z.enum(AMENDABLE_SCREENING_FIELDS),
  before: AmendableValueSchema,
  after: AmendableValueSchema,
  reason: NonEmptyTrimmed,
  amendedBy: PersonaIdSchema,
  amendedAt: IsoUtcString,
});

export const ScreeningSchema = z.object({
  ...persistedEntityShape,
  id: ScreeningIdSchema,
  patientId: PatientIdSchema,
  workerId: PersonaIdSchema,
  facilityId: FacilityIdSchema,
  districtId: DistrictIdSchema,
  measuredAt: IsoUtcString,
  systolic: z.number().int().nullable(),
  diastolic: z.number().int().nullable(),
  glucoseValue: z.number().nullable(),
  glucoseUnit: z.enum(GLUCOSE_UNITS).nullable(),
  glucoseContext: z.enum(GLUCOSE_CONTEXTS).nullable(),
  observations: z.array(
    z.object({
      code: NonEmptyTrimmed,
      value: z.union([z.string(), z.number(), z.boolean()]),
      unit: z.string().nullable(),
    }),
  ),
  source: z.enum(SCREENING_SOURCES),
  rulesetVersion: z.string().nullable(),
  status: z.enum(SCREENING_STATUSES),
  flag: FlagResultSchema.nullable(),
  clientMutationId: NonEmptyTrimmed,
  captureDurationSeconds: z.number().int().min(0).nullable(),
  notes: textOrEmpty,
  amendments: z.array(ScreeningAmendmentSchema),
}) satisfies z.ZodType<Screening>;

// ── Review ───────────────────────────────────────────────────────────────────

export const ReviewDecisionSchema = z.object({
  kind: z.enum(REVIEW_DECISION_INPUT_KINDS),
  note: textOrEmpty,
  reasonCode: z.enum(DISMISS_REASON_CODES).exactOptional(),
  decidedBy: PersonaIdSchema,
  decidedAt: IsoUtcString,
});

export const ReviewSchema = z.object({
  ...persistedEntityShape,
  id: ReviewIdSchema,
  screeningId: ScreeningIdSchema,
  patientId: PatientIdSchema,
  facilityId: FacilityIdSchema,
  assignedClinicianId: PersonaIdSchema.nullable(),
  status: z.enum(REVIEW_STATUSES),
  flagReasons: z.array(z.enum(REASON_CODES)),
  evidenceSnapshot: EvidenceSnapshotSchema,
  decision: ReviewDecisionSchema.nullable(),
  decisionReason: z.string().nullable(),
  reviewedAt: nullableIso,
  startedBy: PersonaIdSchema.nullable(),
  reviewedBy: PersonaIdSchema.nullable(),
  priority: z.enum(REVIEW_PRIORITIES),
  reviewDueAt: nullableIso,
  origin: z.enum(REVIEW_ORIGINS),
}) satisfies z.ZodType<Review>;

// ── Referral ─────────────────────────────────────────────────────────────────

export const ReferralCompletionEvidenceSchema = z.object({
  type: z.enum(COMPLETION_EVIDENCE_TYPES),
  reference: NonEmptyTrimmed,
  outcome: z.enum(REFERRAL_OUTCOMES),
  note: textOrEmpty,
  recordedBy: PersonaIdSchema,
  recordedAt: IsoUtcString,
});

export const ReferralSchema = z.object({
  ...persistedEntityShape,
  id: ReferralIdSchema,
  patientId: PatientIdSchema,
  reviewId: ReviewIdSchema,
  destination: NonEmptyTrimmed,
  requestedAt: IsoUtcString,
  dueAt: IsoUtcString,
  status: z.enum(REFERRAL_STATUSES),
  completedAt: nullableIso,
  completionEvidence: ReferralCompletionEvidenceSchema.nullable(),
  facilityId: FacilityIdSchema,
  destinationFacilityId: FacilityIdSchema,
  assignedWorkerId: PersonaIdSchema.nullable(),
  priority: z.enum(REVIEW_PRIORITIES),
  referralReason: z.string().exactOptional(),
  appointmentAt: nullableIso,
  cancelled: z
    .object({ reasonCode: z.enum(REFERRAL_CANCEL_REASON_CODES), reason: NonEmptyTrimmed })
    .nullable(),
}) satisfies z.ZodType<Referral>;

// ── Follow-up ────────────────────────────────────────────────────────────────

export const ContactAttemptSchema = z.object({
  id: idSchema<ContactAttemptId>(),
  at: IsoUtcString,
  method: z.enum(CONTACT_METHODS),
  result: z.enum(CONTACT_RESULTS),
  note: textOrEmpty,
  durationMinutes: z.number().int().min(0).nullable(),
  recordedBy: PersonaIdSchema,
});

export const FollowUpOutcomeRecordSchema = z.object({
  kind: z.enum(FOLLOW_UP_OUTCOMES),
  occurredAt: IsoUtcString,
  evidenceType: z.enum(COMPLETION_EVIDENCE_TYPES).nullable(),
  reasonCode: z.enum(UNABLE_TO_REACH_REASONS).nullable(),
  note: textOrEmpty,
  recordedBy: PersonaIdSchema,
});

export const FollowUpSchema = z.object({
  ...persistedEntityShape,
  id: FollowUpIdSchema,
  patientId: PatientIdSchema,
  referralId: ReferralIdSchema.nullable(),
  reviewId: ReviewIdSchema.nullable(),
  facilityId: FacilityIdSchema,
  assignedWorkerId: PersonaIdSchema.nullable(),
  dueAt: IsoUtcString,
  status: z.enum(FOLLOW_UP_STATUSES),
  attempts: z.array(ContactAttemptSchema),
  completedAt: nullableIso,
  outcome: FollowUpOutcomeRecordSchema.nullable(),
  purpose: z.enum(FOLLOW_UP_PURPOSES),
  assignmentHistory: z.array(
    z.object({
      workerId: PersonaIdSchema.nullable(),
      assignedAt: IsoUtcString,
      assignedBy: PersonaIdSchema,
      reason: z.string().nullable(),
    }),
  ),
  notes: z.array(z.object({ at: IsoUtcString, by: PersonaIdSchema, text: NonEmptyTrimmed })),
  clinicianConfirmation: z.object({
    status: z.enum(CLINICIAN_CONFIRMATION_STATES),
    by: PersonaIdSchema.exactOptional(),
    at: IsoUtcString.exactOptional(),
    reason: z.string().exactOptional(),
  }),
}) satisfies z.ZodType<FollowUp>;

// ── Care tasks ───────────────────────────────────────────────────────────────

/** Payload schema per care task kind (shared with `CareTaskInputSchema`). */
export const CareTaskPayloadSchemas = {
  follow_up_assignment: z.object({
    followUpId: FollowUpIdSchema,
    referralId: ReferralIdSchema.nullable(),
  }),
  correction_request: z.object({
    targetType: z.enum(ENTITY_TYPES),
    targetId: NonEmptyTrimmed,
    description: NonEmptyTrimmed,
    suggestedValue: JsonValueSchema,
    requestStatus: z.enum(CORRECTION_REQUEST_STATUSES).exactOptional(),
    // ext (CTZ-07): routing role and the staff outcome KEY (vocabulary, never free text).
    assignedRole: z.enum(ROLES).exactOptional(),
    resolutionKey: z
      .string()
      .regex(/^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/u)
      .exactOptional(),
  }),
  callback_request: z.object({
    topic: NonEmptyTrimmed,
    window: NonEmptyTrimmed,
    note: textOrEmpty,
  }),
  programme_action: z.object({
    actionKey: NonEmptyTrimmed,
    note: textOrEmpty,
  }),
  data_quality: z.object({
    issueCode: NonEmptyTrimmed,
    targetType: z.enum(ENTITY_TYPES),
    targetId: NonEmptyTrimmed,
    note: textOrEmpty,
  }),
} as const;

const careTaskBaseShape = {
  ...persistedEntityShape,
  id: CareTaskIdSchema,
  status: z.enum(CARE_TASK_STATUSES),
  patientId: PatientIdSchema.nullable(),
  facilityId: FacilityIdSchema.nullable(),
  assignedToId: PersonaIdSchema.nullable(),
  createdBy: PersonaIdSchema,
  dueAt: nullableIso,
  completedAt: nullableIso,
  cancelled: z.object({ reason: NonEmptyTrimmed }).nullable(),
};

export const CareTaskSchema = z.discriminatedUnion("kind", [
  z.object({
    ...careTaskBaseShape,
    kind: z.literal("follow_up_assignment"),
    payload: CareTaskPayloadSchemas.follow_up_assignment,
  }),
  z.object({
    ...careTaskBaseShape,
    kind: z.literal("correction_request"),
    payload: CareTaskPayloadSchemas.correction_request,
  }),
  z.object({
    ...careTaskBaseShape,
    kind: z.literal("callback_request"),
    payload: CareTaskPayloadSchemas.callback_request,
  }),
  z.object({
    ...careTaskBaseShape,
    kind: z.literal("programme_action"),
    payload: CareTaskPayloadSchemas.programme_action,
  }),
  z.object({
    ...careTaskBaseShape,
    kind: z.literal("data_quality"),
    payload: CareTaskPayloadSchemas.data_quality,
  }),
]) satisfies z.ZodType<CareTask>;

// ── Citizen-facing ───────────────────────────────────────────────────────────

export const CareInstructionSchema = z.object({
  ...persistedEntityShape,
  id: idSchema<CareInstructionId>(),
  patientId: PatientIdSchema,
  kind: z.enum(CARE_INSTRUCTION_KINDS),
  sourceType: z.enum(CARE_INSTRUCTION_SOURCE_TYPES),
  sourceId: NonEmptyTrimmed,
  messageKey: NonEmptyTrimmed,
  params: z.record(z.string(), z.union([z.string(), z.number()])),
  appointmentAt: nullableIso,
  facilityId: FacilityIdSchema,
  releasedBy: PersonaIdSchema,
  releasedAt: IsoUtcString,
  status: z.enum(CARE_INSTRUCTION_STATUSES),
}) satisfies z.ZodType<CareInstruction>;

export const ReminderSchema = z.object({
  ...persistedEntityShape,
  id: idSchema<ReminderId>(),
  patientId: PatientIdSchema,
  followUpId: FollowUpIdSchema.nullable(),
  channel: z.enum(REMINDER_CHANNELS),
  consentBasis: NonEmptyTrimmed,
  scheduledAt: IsoUtcString,
  status: z.enum(REMINDER_STATUSES),
  instructionId: idSchema<CareInstructionId>(),
  cancelReason: z.enum(REMINDER_CANCEL_REASONS).nullable(),
  deliveredAt: nullableIso,
  acknowledgedAt: nullableIso,
}) satisfies z.ZodType<Reminder>;

export const ReminderPreferenceSchema = z.object({
  ...persistedEntityShape,
  id: idSchema<ReminderPreferenceId>(),
  patientId: PatientIdSchema,
  optedIn: z.boolean(),
  timing: z.enum(REMINDER_TIMINGS),
  channel: z.enum(REMINDER_CHANNELS),
}) satisfies z.ZodType<ReminderPreference>;

// ── Audit ────────────────────────────────────────────────────────────────────

export const AuditEventSchema = z.object({
  ...persistedEntityShape,
  id: idSchema<AuditEventId>(),
  actorId: PersonaIdSchema.nullable(),
  actorRole: z.enum(ROLES).nullable(),
  action: NonEmptyTrimmed,
  entityType: z.enum(ENTITY_TYPES),
  entityId: NonEmptyTrimmed,
  beforeHash: z.string().exactOptional(),
  afterHash: z.string().exactOptional(),
  occurredAt: IsoUtcString,
  correlationId: CorrelationIdSchema,
  category: z.enum(AUDIT_CATEGORIES),
  outcome: z.enum(AUDIT_OUTCOMES),
  facilityId: FacilityIdSchema.nullable(),
  districtId: DistrictIdSchema.nullable(),
  patientId: PatientIdSchema.nullable(),
  changeSummary: JsonValueSchema,
  justification: z.string().nullable(),
}) satisfies z.ZodType<AuditEvent>;

// ── Sync & devices ───────────────────────────────────────────────────────────

const SyncOperationIdSchema = idSchema<SyncOperationId>();

export const SyncOperationSchema = z.object({
  ...persistedEntityShape,
  id: SyncOperationIdSchema,
  clientMutationId: NonEmptyTrimmed,
  idempotencyKey: NonEmptyTrimmed,
  localSeq: z.number().int().min(0),
  entityType: z.enum(ENTITY_TYPES),
  entityId: NonEmptyTrimmed,
  opType: z.enum(SYNC_OP_TYPES),
  payload: JsonValueSchema,
  baseVersion: z.number().int().min(0).nullable(),
  dependsOnOpId: SyncOperationIdSchema.nullable(),
  resolvesOpId: SyncOperationIdSchema.nullable(),
  status: z.enum(SYNC_OP_STATUSES),
  attempts: z.number().int().min(0),
  nextAttemptAt: nullableIso,
  lastError: z.object({ code: NonEmptyTrimmed, reason: z.string().nullable() }).nullable(),
  deviceTimestamp: IsoUtcString,
  serverSnapshot: JsonValueSchema.nullable(),
  correlationId: CorrelationIdSchema,
}) satisfies z.ZodType<SyncOperation>;

export const DeviceSessionSchema = z.object({
  ...persistedEntityShape,
  id: idSchema<DeviceSessionId>(),
  personaId: PersonaIdSchema,
  deviceId: idSchema<DeviceId>(),
  facilityId: FacilityIdSchema,
  status: z.enum(DEVICE_SESSION_STATUSES),
}) satisfies z.ZodType<DeviceSession>;

/** Every entity schema by entity type (used by import paths and the synthetic-flag test). */
export const ENTITY_SCHEMAS = {
  patient: PatientSchema,
  screening: ScreeningSchema,
  review: ReviewSchema,
  referral: ReferralSchema,
  follow_up: FollowUpSchema,
  care_task: CareTaskSchema,
  care_instruction: CareInstructionSchema,
  reminder: ReminderSchema,
  reminder_preference: ReminderPreferenceSchema,
  audit_event: AuditEventSchema,
  facility: FacilitySchema,
  district: DistrictSchema,
  persona: DemoPersonaSchema,
  ruleset: DemoRulesetSchema,
  sync_operation: SyncOperationSchema,
  device_session: DeviceSessionSchema,
  programme_action: ProgrammeActionSchema,
  data_quality_issue: DataQualityIssueSchema,
  export_audit: ExportAuditSchema,
} as const satisfies Record<(typeof ENTITY_TYPES)[number], z.ZodType>;
