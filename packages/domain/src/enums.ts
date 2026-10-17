/**
 * Every status / kind vocabulary of the domain, as `as const` arrays plus union types.
 *
 * Values are lowercase snake case (tech spec §5.2). UI layers never render them directly:
 * FND-04 maps each value to an i18n key in namespace `domain`
 * (`status.<machine>.<value>`, `reason.<ReasonCode>`, `decision.<kind>`, `evidence.<type>`).
 *
 * Note: `overdue` is deliberately NOT a status anywhere — it is derived (`derive.ts`).
 */

// ── Screening ────────────────────────────────────────────────────────────────
export const SCREENING_STATUSES = [
  "draft",
  "submitted",
  "review_required",
  "no_review_required",
] as const;
export type ScreeningStatus = (typeof SCREENING_STATUSES)[number];

export const SCREENING_SOURCES = ["worker_mobile", "clinical_web", "imported"] as const;
export type ScreeningSource = (typeof SCREENING_SOURCES)[number];

/** Fields of a submitted screening that may be changed through an amendment. */
export const AMENDABLE_SCREENING_FIELDS = [
  "systolic",
  "diastolic",
  "glucoseValue",
  "glucoseUnit",
  "glucoseContext",
  "measuredAt",
] as const;
export type AmendableScreeningField = (typeof AMENDABLE_SCREENING_FIELDS)[number];

// ── Review ───────────────────────────────────────────────────────────────────
export const REVIEW_STATUSES = [
  "pending",
  "in_review",
  "action_recorded",
  "dismissed_with_reason",
] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

/**
 * Action kinds a clinician can record (spec §2.1). Dismissal is a status, not a kind.
 * CLN-07 UI options map 1:1: "Record assessment — no further action" = no_further_action,
 * "Refer" = refer, "Request repeat test" = request_repeat_screening,
 * "Plan follow-up review" = plan_follow_up, "Dismiss flag with reason" = dismiss.
 */
export const REVIEW_DECISION_KINDS = [
  "refer",
  "plan_follow_up",
  "request_repeat_screening",
  "no_further_action",
] as const;
export type ReviewDecisionKind = (typeof REVIEW_DECISION_KINDS)[number];

/** Discriminator of the decision input (FND-03): the 4 action kinds plus `dismiss`. */
export const REVIEW_DECISION_INPUT_KINDS = [...REVIEW_DECISION_KINDS, "dismiss"] as const;
export type ReviewDecisionInputKind = (typeof REVIEW_DECISION_INPUT_KINDS)[number];

/** Urgency comes only from fixtures labelled demo — there is no approved protocol. */
export const REVIEW_PRIORITIES = ["routine", "urgent_demo"] as const;
export type ReviewPriority = (typeof REVIEW_PRIORITIES)[number];

export const REVIEW_ORIGINS = ["rule_flag", "manual_escalation"] as const;
export type ReviewOrigin = (typeof REVIEW_ORIGINS)[number];

/** Demo placeholders (CLN-07). */
export const DISMISS_REASON_CODES = [
  "measurement_error_suspected",
  "repeat_reading_acceptable",
  "known_managed_condition",
  "duplicate_flag",
  "other",
] as const;
export type DismissReasonCode = (typeof DISMISS_REASON_CODES)[number];

// ── Referral ─────────────────────────────────────────────────────────────────
export const REFERRAL_STATUSES = [
  "created",
  "accepted",
  "scheduled",
  "completed",
  "cancelled_with_reason",
] as const;
export type ReferralStatus = (typeof REFERRAL_STATUSES)[number];

export const REFERRAL_OUTCOMES = [
  "attended_seen",
  "attended_further_care_planned",
  "attended_returned_to_community",
] as const;
export type ReferralOutcome = (typeof REFERRAL_OUTCOMES)[number];

/** Demo placeholders (CLN-08). */
export const REFERRAL_CANCEL_REASON_CODES = [
  "patient_declined",
  "duplicate",
  "no_longer_indicated",
  "destination_unavailable",
  "other",
] as const;
export type ReferralCancelReasonCode = (typeof REFERRAL_CANCEL_REASON_CODES)[number];

// ── Follow-up ────────────────────────────────────────────────────────────────
export const FOLLOW_UP_STATUSES = [
  "assigned",
  "contacted",
  "completed",
  "unable_to_reach",
  "reassigned",
] as const;
export type FollowUpStatus = (typeof FOLLOW_UP_STATUSES)[number];

export const FOLLOW_UP_PURPOSES = [
  "referral_attendance",
  "planned_review",
  "repeat_screening",
  "post_referral_check",
] as const;
export type FollowUpPurpose = (typeof FOLLOW_UP_PURPOSES)[number];

export const FOLLOW_UP_OUTCOMES = [
  "attended",
  "repeat_screening_done",
  "referred_onward",
  "unable_to_reach",
  "declined",
] as const;
export type FollowUpOutcome = (typeof FOLLOW_UP_OUTCOMES)[number];

/** Follow-up outcomes that must carry an evidence type (FND-03 `record_outcome`). */
export const FOLLOW_UP_OUTCOMES_REQUIRING_EVIDENCE = [
  "attended",
  "repeat_screening_done",
  "referred_onward",
] as const satisfies readonly FollowUpOutcome[];

export const UNABLE_TO_REACH_REASONS = [
  "not_at_home_repeatedly",
  "moved_away",
  "phone_unreachable",
  "declined_contact",
  "other",
] as const;
export type UnableToReachReason = (typeof UNABLE_TO_REACH_REASONS)[number];

export const CONTACT_METHODS = ["home_visit", "phone", "facility"] as const;
export type ContactMethod = (typeof CONTACT_METHODS)[number];

export const CONTACT_RESULTS = ["reached", "not_reached", "declined"] as const;
export type ContactResult = (typeof CONTACT_RESULTS)[number];

/** WF-01 step 7: clinician confirmation of a worker-recorded completion. */
export const CLINICIAN_CONFIRMATION_STATES = [
  "not_required",
  "pending",
  "confirmed",
  "returned",
] as const;
export type ClinicianConfirmationState = (typeof CLINICIAN_CONFIRMATION_STATES)[number];

// ── Care tasks ───────────────────────────────────────────────────────────────
export const CARE_TASK_KINDS = [
  "follow_up_assignment",
  "correction_request",
  "callback_request",
  "programme_action",
  "data_quality",
] as const;
export type CareTaskKind = (typeof CARE_TASK_KINDS)[number];

export const CARE_TASK_STATUSES = ["open", "in_progress", "done", "cancelled_with_reason"] as const;
export type CareTaskStatus = (typeof CARE_TASK_STATUSES)[number];

/**
 * ext (CTZ-01): citizen-visible state of a `correction_request` task (payload `requestStatus`).
 * Only staff move a request beyond `submitted`; the clinical record is never edited by it.
 */
export const CORRECTION_REQUEST_STATUSES = [
  "submitted",
  "in_review",
  "resolved_amended",
  "resolved_no_change",
] as const;
export type CorrectionRequestStatus = (typeof CORRECTION_REQUEST_STATUSES)[number];

// ── Sync ─────────────────────────────────────────────────────────────────────
/** The single sync design shared with HWM-02/09/10 (see machines/sync-operation.ts). */
export const SYNC_OP_STATUSES = [
  "queued",
  "sending",
  "acknowledged",
  "retryable_failure",
  "conflict",
  "needs_resolution",
  "rejected",
  "superseded",
  "blocked_revoked",
] as const;
export type SyncOpStatus = (typeof SYNC_OP_STATUSES)[number];

export const SYNC_OP_TYPES = ["create", "update", "command"] as const;
export type SyncOpType = (typeof SYNC_OP_TYPES)[number];

export const CONFLICT_RESOLUTIONS = ["reapply_on_latest", "keep_latest"] as const;
export type ConflictResolution = (typeof CONFLICT_RESOLUTIONS)[number];

/** Per-entity sync indicator derived from the op queue (`deriveSyncState`). */
export const ENTITY_SYNC_STATES = [
  "saved_locally",
  "syncing",
  "synced",
  "conflict",
  "rejected",
  "blocked",
] as const;
export type EntitySyncState = (typeof ENTITY_SYNC_STATES)[number];

// ── Measurements ─────────────────────────────────────────────────────────────
export const GLUCOSE_UNITS = ["mmol/L", "mg/dL"] as const;
export type GlucoseUnit = (typeof GLUCOSE_UNITS)[number];

/** `not_recorded` is an explicit choice, never a default (CLN-04, HWM-05, CTZ-03). */
export const GLUCOSE_CONTEXTS = ["fasting", "non_fasting", "not_recorded"] as const;
export type GlucoseContext = (typeof GLUCOSE_CONTEXTS)[number];

// ── Patient ──────────────────────────────────────────────────────────────────
export const CONSENT_STATES = ["granted", "withdrawn", "not_recorded"] as const;
export type ConsentState = (typeof CONSENT_STATES)[number];

export const IDENTITY_STATUSES = [
  "verified_local",
  "unverified",
  "possible_duplicate",
  "needs_match_review",
] as const;
export type IdentityStatus = (typeof IDENTITY_STATUSES)[number];

export const SEX_VALUES = ["female", "male", "not_recorded"] as const;
export type Sex = (typeof SEX_VALUES)[number];

export const LANGUAGES = ["en", "rw"] as const;
export type Language = (typeof LANGUAGES)[number];

// ── Evidence ─────────────────────────────────────────────────────────────────
/** One list for all apps (demo placeholders needing clinical sign-off). */
export const COMPLETION_EVIDENCE_TYPES = [
  "facility_attendance_record",
  "clinician_confirmation",
  "return_slip_reference",
  "facility_register_checked",
  "appointment_card_seen",
  "worker_accompanied_visit",
  "patient_verbal_confirmation",
] as const;
export type CompletionEvidenceType = (typeof COMPLETION_EVIDENCE_TYPES)[number];

/** Clinical portal referral completion (CLN-08): the first three. */
export const REFERRAL_EVIDENCE_TYPES = [
  "facility_attendance_record",
  "clinician_confirmation",
  "return_slip_reference",
] as const satisfies readonly CompletionEvidenceType[];
export type ReferralEvidenceType = (typeof REFERRAL_EVIDENCE_TYPES)[number];

/** Worker app follow-up completion (HWM-08): the last four. */
export const WORKER_EVIDENCE_TYPES = [
  "facility_register_checked",
  "appointment_card_seen",
  "worker_accompanied_visit",
  "patient_verbal_confirmation",
] as const satisfies readonly CompletionEvidenceType[];
export type WorkerEvidenceType = (typeof WORKER_EVIDENCE_TYPES)[number];

// ── Reminders & care instructions ────────────────────────────────────────────
export const REMINDER_STATUSES = [
  "scheduled",
  "delivered_simulated",
  "acknowledged",
  "cancelled",
] as const;
export type ReminderStatus = (typeof REMINDER_STATUSES)[number];

export const REMINDER_CANCEL_REASONS = [
  "opted_out",
  "timing_changed",
  "consent_withdrawn",
  "instruction_cancelled",
] as const;
export type ReminderCancelReason = (typeof REMINDER_CANCEL_REASONS)[number];

/** The prototype uses `in_app` only (CTZ-05). */
export const REMINDER_CHANNELS = ["in_app", "sms_simulated"] as const;
export type ReminderChannel = (typeof REMINDER_CHANNELS)[number];

export const REMINDER_TIMINGS = ["day_before", "morning_of"] as const;
export type ReminderTiming = (typeof REMINDER_TIMINGS)[number];

export const CARE_INSTRUCTION_KINDS = ["appointment", "referral", "follow_up"] as const;
export type CareInstructionKind = (typeof CARE_INSTRUCTION_KINDS)[number];

export const CARE_INSTRUCTION_SOURCE_TYPES = ["review", "referral", "follow_up"] as const;
export type CareInstructionSourceType = (typeof CARE_INSTRUCTION_SOURCE_TYPES)[number];

export const CARE_INSTRUCTION_STATUSES = ["released", "withdrawn"] as const;
export type CareInstructionStatus = (typeof CARE_INSTRUCTION_STATUSES)[number];

/** Citizen-visible progress of an instruction — derived, never stored. */
export const INSTRUCTION_PROGRESS_VALUES = ["planned", "completed", "cancelled"] as const;
export type InstructionProgress = (typeof INSTRUCTION_PROGRESS_VALUES)[number];

// ── Devices ──────────────────────────────────────────────────────────────────
/** `ended` = signed out on this device (HWM-01); the record is kept for the audit trail. */
export const DEVICE_SESSION_STATUSES = ["active", "revoked", "ended"] as const;
export type DeviceSessionStatus = (typeof DEVICE_SESSION_STATUSES)[number];

// ── Actors ───────────────────────────────────────────────────────────────────
/** PRD/FRD actor lists. Role switching is demo-only (FND-06). */
export const ROLES = [
  "clinician",
  "nurse_reviewer",
  "facility_coordinator",
  "community_health_worker",
  "field_supervisor",
  "programme_lead",
  "district_analyst",
  "facility_manager",
  "auditor",
  "citizen",
] as const;
export type Role = (typeof ROLES)[number];

export const APP_IDS = ["clinical", "worker", "admin", "citizen"] as const;
export type AppId = (typeof APP_IDS)[number];

export const FACILITY_KINDS = ["health_centre", "health_post", "district_hospital"] as const;
export type FacilityKind = (typeof FACILITY_KINDS)[number];

// ── Audit ────────────────────────────────────────────────────────────────────
export const AUDIT_CATEGORIES = ["access", "change", "export", "security", "demo"] as const;
export type AuditCategory = (typeof AUDIT_CATEGORIES)[number];

export const AUDIT_OUTCOMES = ["success", "denied"] as const;
export type AuditOutcome = (typeof AUDIT_OUTCOMES)[number];

export const ENTITY_TYPES = [
  "patient",
  "screening",
  "review",
  "referral",
  "follow_up",
  "care_task",
  "care_instruction",
  "reminder",
  "reminder_preference",
  "audit_event",
  "facility",
  "district",
  "persona",
  "ruleset",
  "sync_operation",
  "device_session",
  // ext (ADM-03): non-clinical programme follow-up action (collection `programmeActions`).
  "programme_action",
] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

// ── Pathway (FRD shared lifecycle, derived for reporting) ────────────────────
/**
 * FRD uppercase lifecycle. Never stored: `derivePathwayStage` maps the per-entity
 * lowercase machine states onto it. `OVERDUE` here is a derived reporting bucket.
 */
export const PATHWAY_STAGES = [
  "DRAFT_SCREENING",
  "RECORDED",
  "REVIEW_REQUIRED",
  "NO_REVIEW_REQUIRED",
  "REVIEWED",
  "REFERRAL_OPEN",
  "FOLLOW_UP_PLANNED",
  "CLOSED_WITH_REASON",
  "FOLLOW_UP_COMPLETED",
  "OVERDUE",
  "CLOSED",
] as const;
export type PathwayStage = (typeof PATHWAY_STAGES)[number];

/** Who/what caused a state change (used by `assertNotCompletedByReminder`). */
export const TRANSITION_TRIGGERS = ["user_action", "sync", "system", "reminder"] as const;
export type TransitionTrigger = (typeof TRANSITION_TRIGGERS)[number];
