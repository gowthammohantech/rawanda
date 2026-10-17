/**
 * Citizen wallet records (CTZ-01) — the FRD §6 citizen domain objects that are STORED in the
 * FND-07 citizen collections (`citizenAccounts`, `patientLinks`, `identityVerifications`,
 * `consentRecords`, `nextStepAcks`, `citizenSettings`, `accessEvents`), plus the FND records the
 * wallet reuses under their FRD names (NotificationPreference = `ReminderPreference`, Reminder,
 * CareTask for correction / callback requests).
 *
 * Every record is synthetic, versioned and timestamped in UTC (`IsoUtcString`). Seeds store
 * vocabulary values / i18n keys only — never free-text clinical copy.
 */
import { CARE_TASK_STATUSES, CONSENT_STATES, ENTITY_TYPES, LANGUAGES, ROLES } from "@laif/domain";
import { z } from "zod";

import {
  CareTaskIdSchema,
  CareTaskPayloadSchemas,
  CorrelationIdSchema,
  FacilityIdSchema,
  PatientIdSchema,
  PersonaIdSchema,
  persistedEntityShape,
  ReminderPreferenceSchema,
  ReminderSchema,
} from "../entities.ts";
import { IsoUtcString, JsonValueSchema, NonEmptyTrimmed } from "../primitives.ts";

const nullableIso = IsoUtcString.nullable();

// ── Vocabularies ─────────────────────────────────────────────────────────────

export const CITIZEN_ACCOUNT_STATUSES = ["pending_verification", "active", "locked"] as const;
export type CitizenAccountStatus = (typeof CITIZEN_ACCOUNT_STATUSES)[number];

export const PATIENT_LINK_RELATIONSHIPS = ["self", "legal_representative"] as const;
export type PatientLinkRelationship = (typeof PATIENT_LINK_RELATIONSHIPS)[number];

export const PATIENT_LINK_STATUSES = ["active", "revoked"] as const;
export type PatientLinkStatus = (typeof PATIENT_LINK_STATUSES)[number];

export const IDENTITY_VERIFICATION_METHODS = ["demo_code"] as const;
export type IdentityVerificationMethod = (typeof IDENTITY_VERIFICATION_METHODS)[number];

export const IDENTITY_VERIFICATION_STATUSES = ["pending", "verified", "failed", "locked"] as const;
export type IdentityVerificationStatus = (typeof IDENTITY_VERIFICATION_STATUSES)[number];

/** Maximum wrong demo codes before the account locks (CTZ-02 recovery stub). */
export const MAX_VERIFICATION_ATTEMPTS = 5;

/** Consent record actions (append-only; current state = latest record). */
export const CONSENT_ACTIONS = ["granted", "withdrawn"] as const;
export type ConsentAction = (typeof CONSENT_ACTIONS)[number];

/** Privacy notice version the seed and CTZ-02 consent screen record. */
export const CITIZEN_NOTICE_VERSION = "demo-notice-v0.1" as const;

/** Citizen-visible access history actions (`citizen:access.action.*`, CTZ-07). */
export const CITIZEN_ACCESS_ACTIONS = [
  "record_viewed",
  "result_viewed",
  "next_steps_viewed",
  "record_updated",
] as const;
export type CitizenAccessAction = (typeof CITIZEN_ACCESS_ACTIONS)[number];

/** Why the record was accessed (`citizen:access.purpose.*`, CTZ-07). */
export const CITIZEN_ACCESS_PURPOSES = [
  "care_review",
  "follow_up_visit",
  "self_access",
  "representative_access",
  "support",
] as const;
export type CitizenAccessPurpose = (typeof CITIZEN_ACCESS_PURPOSES)[number];

/** Text scale presets (CTZ-08). */
export const CITIZEN_TEXT_SCALES = [1, 1.15, 1.3] as const;
export type CitizenTextScale = (typeof CITIZEN_TEXT_SCALES)[number];

const TextScaleSchema = z.union([z.literal(1), z.literal(1.15), z.literal(1.3)]);

// ── Stored records ───────────────────────────────────────────────────────────

/** FRD CitizenAccount — one per citizen persona (`ctz_citizen_accounts`). */
export const CitizenAccountSchema = z.object({
  ...persistedEntityShape,
  id: NonEmptyTrimmed,
  personaId: PersonaIdSchema,
  status: z.enum(CITIZEN_ACCOUNT_STATUSES),
  verifiedAt: nullableIso,
  lockedAt: nullableIso,
});
export type CitizenAccount = z.output<typeof CitizenAccountSchema>;

/** FRD PatientLink — which patient records an account may see (`ctz_patient_links`). */
export const PatientLinkSchema = z.object({
  ...persistedEntityShape,
  id: NonEmptyTrimmed,
  accountId: NonEmptyTrimmed,
  personaId: PersonaIdSchema,
  patientId: PatientIdSchema,
  relationship: z.enum(PATIENT_LINK_RELATIONSHIPS),
  status: z.enum(PATIENT_LINK_STATUSES),
  linkedAt: IsoUtcString,
});
export type PatientLink = z.output<typeof PatientLinkSchema>;

/** FRD IdentityVerification — simulated (demo code), never a real identity check. */
export const IdentityVerificationSchema = z.object({
  ...persistedEntityShape,
  id: NonEmptyTrimmed,
  accountId: NonEmptyTrimmed,
  personaId: PersonaIdSchema,
  method: z.enum(IDENTITY_VERIFICATION_METHODS),
  status: z.enum(IDENTITY_VERIFICATION_STATUSES),
  /** Labelled demo code (synthetic); shown on the demo hint card only. */
  demoCode: z.string().regex(/^\d{6}$/u),
  attempts: z.number().int().min(0),
  lastAttemptAt: nullableIso,
  verifiedAt: nullableIso,
});
export type IdentityVerification = z.output<typeof IdentityVerificationSchema>;

/** Append-only consent record (`ctz_consent_records`); mirrored to `Patient.consentState`. */
export const ConsentRecordSchema = z.object({
  ...persistedEntityShape,
  id: NonEmptyTrimmed,
  patientId: PatientIdSchema,
  /** Who recorded it (the citizen or their legal representative). */
  personaId: PersonaIdSchema,
  action: z.enum(CONSENT_ACTIONS),
  noticeVersion: NonEmptyTrimmed,
  recordedAt: IsoUtcString,
});
export type ConsentRecord = z.output<typeof ConsentRecordSchema>;

/** Current consent of one patient as the wallet sees it. */
export const ConsentStatusSchema = z.object({
  patientId: PatientIdSchema,
  state: z.enum(CONSENT_STATES),
  latest: ConsentRecordSchema.nullable(),
  history: z.array(ConsentRecordSchema),
});
export type ConsentStatus = z.output<typeof ConsentStatusSchema>;

/** "I have read this" on an approved next step (`ctz_next_step_acks`). */
export const NextStepAcknowledgementSchema = z.object({
  ...persistedEntityShape,
  id: NonEmptyTrimmed,
  patientId: PatientIdSchema,
  instructionId: NonEmptyTrimmed,
  personaId: PersonaIdSchema,
  acknowledgedAt: IsoUtcString,
});
export type NextStepAcknowledgement = z.output<typeof NextStepAcknowledgementSchema>;

/** Per-persona wallet settings (`ctz_settings`); language mirrored to FND-04 storage. */
export const CitizenSettingsSchema = z.object({
  ...persistedEntityShape,
  id: NonEmptyTrimmed,
  personaId: PersonaIdSchema,
  language: z.enum(LANGUAGES),
  textScale: TextScaleSchema,
  highContrast: z.boolean(),
});
export type CitizenSettings = z.output<typeof CitizenSettingsSchema>;

/**
 * Citizen-visible access event (`ctz_access_events`). Carries the FRD §5 audit field list:
 * event ID, actor, role, patient/resource reference, action, change summary, timestamp,
 * facility, correlation ID and justification.
 */
export const CitizenAccessEventSchema = z.object({
  ...persistedEntityShape,
  id: NonEmptyTrimmed,
  patientId: PatientIdSchema,
  actorId: PersonaIdSchema.nullable(),
  actorRole: z.enum(ROLES).nullable(),
  action: z.enum(CITIZEN_ACCESS_ACTIONS),
  purpose: z.enum(CITIZEN_ACCESS_PURPOSES),
  resourceType: z.enum(ENTITY_TYPES),
  resourceId: NonEmptyTrimmed,
  occurredAt: IsoUtcString,
  facilityId: FacilityIdSchema.nullable(),
  correlationId: CorrelationIdSchema,
  changeSummary: JsonValueSchema,
  justification: z.string().nullable(),
});
export type CitizenAccessEvent = z.output<typeof CitizenAccessEventSchema>;

/** FRD NotificationPreference = FND `ReminderPreference` (`ctz_notification_prefs`). */
export const NotificationPreferenceSchema = ReminderPreferenceSchema;
export type NotificationPreference = z.output<typeof NotificationPreferenceSchema>;

/** FRD Reminder = FND `Reminder` (`ctz_reminders`, delivery simulated). */
export const CitizenReminderSchema = ReminderSchema;

const citizenTaskBase = {
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

/** Care-team task a citizen can raise: correction request or callback (`ctz_care_tasks`). */
export const CitizenCareTaskSchema = z.discriminatedUnion("kind", [
  z.object({
    ...citizenTaskBase,
    kind: z.literal("correction_request"),
    payload: CareTaskPayloadSchemas.correction_request,
  }),
  z.object({
    ...citizenTaskBase,
    kind: z.literal("callback_request"),
    payload: CareTaskPayloadSchemas.callback_request,
  }),
]);
export type CitizenCareTask = z.output<typeof CitizenCareTaskSchema>;

/** Stored citizen record schemas by FND-07 collection (overlay / import validation). */
export const CITIZEN_RECORD_SCHEMAS = {
  citizenAccounts: CitizenAccountSchema,
  patientLinks: PatientLinkSchema,
  identityVerifications: IdentityVerificationSchema,
  consentRecords: ConsentRecordSchema,
  nextStepAcks: NextStepAcknowledgementSchema,
  citizenSettings: CitizenSettingsSchema,
  accessEvents: CitizenAccessEventSchema,
} as const;
