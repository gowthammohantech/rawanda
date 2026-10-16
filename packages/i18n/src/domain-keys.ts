/**
 * The binding map from every FND-02 domain vocabulary to its i18n key group in namespace
 * `domain` (`domain:<group>.<value>`). Used by `coverage.test.ts` and `pnpm i18n:check`, so a
 * new enum value without EN + RW copy fails the build.
 *
 * Not mapped (deliberately): `GLUCOSE_UNITS` (unit symbols are printed verbatim by
 * `formatMeasurement`) and `LANGUAGES` (labels live in `common:languageName.*`).
 */
import {
  AMENDABLE_SCREENING_FIELDS,
  APP_IDS,
  AUDIT_CATEGORIES,
  AUDIT_OUTCOMES,
  CARE_INSTRUCTION_KINDS,
  CARE_INSTRUCTION_SOURCE_TYPES,
  CARE_INSTRUCTION_STATUSES,
  CARE_TASK_KINDS,
  CARE_TASK_STATUSES,
  CLINICIAN_CONFIRMATION_STATES,
  COMPLETION_EVIDENCE_TYPES,
  CONFLICT_RESOLUTIONS,
  CONSENT_STATES,
  CONTACT_METHODS,
  CONTACT_RESULTS,
  DEVICE_SESSION_STATUSES,
  DISMISS_REASON_CODES,
  DOMAIN_INVARIANT_CODES,
  ENTITY_SYNC_STATES,
  ENTITY_TYPES,
  FACILITY_KINDS,
  FOLLOW_UP_OUTCOMES,
  FOLLOW_UP_PURPOSES,
  FOLLOW_UP_STATUSES,
  GLUCOSE_CONTEXTS,
  IDENTITY_STATUSES,
  INSTRUCTION_PROGRESS_VALUES,
  OBSERVATION_CODES,
  PAST_DUE_LABEL_KEY,
  PATHWAY_STAGES,
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
  TRANSITION_TRIGGERS,
  UNABLE_TO_REACH_REASONS,
} from "@laif/domain";
import { VALIDATION_KEYS, VALIDATION_NAMESPACE } from "@laif/contracts";

/** Key group (inside namespace `domain`) → the domain values that need a label. */
export const DOMAIN_KEY_GROUPS = {
  "status.screening": SCREENING_STATUSES,
  "status.review": REVIEW_STATUSES,
  "status.referral": REFERRAL_STATUSES,
  "status.followUp": FOLLOW_UP_STATUSES,
  "status.careTask": CARE_TASK_STATUSES,
  "status.syncOp": SYNC_OP_STATUSES,
  "status.entitySync": ENTITY_SYNC_STATES,
  "status.reminder": REMINDER_STATUSES,
  "status.careInstruction": CARE_INSTRUCTION_STATUSES,
  "status.deviceSession": DEVICE_SESSION_STATUSES,
  screeningSource: SCREENING_SOURCES,
  decision: REVIEW_DECISION_INPUT_KINDS,
  priority: REVIEW_PRIORITIES,
  origin: REVIEW_ORIGINS,
  dismissReason: DISMISS_REASON_CODES,
  referralOutcome: REFERRAL_OUTCOMES,
  referralCancelReason: REFERRAL_CANCEL_REASON_CODES,
  followUpPurpose: FOLLOW_UP_PURPOSES,
  followUpOutcome: FOLLOW_UP_OUTCOMES,
  unableToReachReason: UNABLE_TO_REACH_REASONS,
  contactMethod: CONTACT_METHODS,
  contactResult: CONTACT_RESULTS,
  clinicianConfirmation: CLINICIAN_CONFIRMATION_STATES,
  careTaskKind: CARE_TASK_KINDS,
  syncOpType: SYNC_OP_TYPES,
  conflictResolution: CONFLICT_RESOLUTIONS,
  glucoseContext: GLUCOSE_CONTEXTS,
  consent: CONSENT_STATES,
  identity: IDENTITY_STATUSES,
  sex: SEX_VALUES,
  evidence: COMPLETION_EVIDENCE_TYPES,
  reminderCancelReason: REMINDER_CANCEL_REASONS,
  channel: REMINDER_CHANNELS,
  reminderTiming: REMINDER_TIMINGS,
  careInstructionKind: CARE_INSTRUCTION_KINDS,
  careInstructionSource: CARE_INSTRUCTION_SOURCE_TYPES,
  instructionProgress: INSTRUCTION_PROGRESS_VALUES,
  role: ROLES,
  app: APP_IDS,
  facilityKind: FACILITY_KINDS,
  auditCategory: AUDIT_CATEGORIES,
  auditOutcome: AUDIT_OUTCOMES,
  entityType: ENTITY_TYPES,
  pathwayStage: PATHWAY_STAGES,
  transitionTrigger: TRANSITION_TRIGGERS,
  observation: OBSERVATION_CODES,
  amendableField: AMENDABLE_SCREENING_FIELDS,
  reason: REASON_CODES,
  invariant: DOMAIN_INVARIANT_CODES,
} as const satisfies Record<string, readonly string[]>;

export type DomainKeyGroup = keyof typeof DOMAIN_KEY_GROUPS;

/** `domain:<group>.<value>` for any mapped vocabulary value (typed by group). */
export function domainKey<G extends DomainKeyGroup>(
  group: G,
  value: (typeof DOMAIN_KEY_GROUPS)[G][number],
): `domain:${G}.${(typeof DOMAIN_KEY_GROUPS)[G][number]}` {
  return `domain:${group}.${value}`;
}

/** Fully qualified (`ns:key`) keys that must exist in EN and RW. */
export function requiredCatalogueKeys(): string[] {
  const keys: string[] = [];
  for (const [group, values] of Object.entries(DOMAIN_KEY_GROUPS)) {
    for (const value of values) keys.push(`domain:${group}.${value}`);
  }
  keys.push(PAST_DUE_LABEL_KEY);
  for (const key of VALIDATION_KEYS) keys.push(`${VALIDATION_NAMESPACE}:${key}`);
  // `numberOutOfRange` is emitted with {min,max}, {min} or {max}: one variant per shape.
  for (const variant of NUMBER_OUT_OF_RANGE_CONTEXTS) {
    keys.push(`${VALIDATION_NAMESPACE}:numberOutOfRange_${variant}`);
  }
  return keys;
}

/** i18next `context` variants of `validation:numberOutOfRange`. */
export const NUMBER_OUT_OF_RANGE_CONTEXTS = ["between", "min", "max"] as const;
