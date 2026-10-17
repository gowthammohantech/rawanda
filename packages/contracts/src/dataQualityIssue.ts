/**
 * Data-quality issues (ADM-06, PA-06, FRD §4 / T-03 / T-06): deterministic signals detected over
 * the admin metrics dataset (missing mandatory fields, identity mismatches, overturned flags,
 * manual escalations) plus their persisted programme TRIAGE state. Collection `dataQualityIssues`
 * (pre-registered in the FND-07 `COLLECTIONS` registry); entity type `data_quality_issue`.
 *
 * Privacy: an issue names a facility, a district, a rule and an OPAQUE record reference
 * (`SCR-` / `REV-` / `PAT-` + the first 8 characters of the record uuid) — never a patient name,
 * synthetic identifier or date of birth. Triage never edits the clinical record: corrections
 * happen at source through amendment events (the original is kept).
 *
 * Triage state machine: `open → acknowledged → resolved_with_note`;
 * `open | acknowledged → sent_to_facility → resolved_with_note`; `open → resolved_with_note`.
 * `resolved_with_note` is terminal (a re-detection under a NEW id is a new issue).
 *
 * This module builds only on the primitives (no import of `entities.ts`, which registers the
 * schema in `ENTITY_SCHEMAS` — avoiding an import cycle).
 */
import {
  ROLES,
  type CorrelationId,
  type DistrictId,
  type FacilityId,
  type PersonaId,
} from "@laif/domain";
import { z } from "zod";

import {
  IdempotencyKey,
  IsoUtcString,
  NonEmptyTrimmed,
  Version,
  boundedText,
  idSchema,
} from "./primitives.ts";

export const DATA_QUALITY_ISSUE_TYPES = [
  "missing_field",
  "duplicate_identifier",
  "orphan_screening",
  "overturned_flag",
  "manual_escalation",
] as const;
export type DataQualityIssueType = (typeof DATA_QUALITY_ISSUE_TYPES)[number];

export const DATA_QUALITY_ISSUE_STATUSES = [
  "open",
  "acknowledged",
  "resolved_with_note",
  "sent_to_facility",
] as const;
export type DataQualityIssueStatus = (typeof DATA_QUALITY_ISSUE_STATUSES)[number];

/** Rule code of each issue type (shown in the expanded row, T-10 explanation). */
export const DATA_QUALITY_RULES = {
  missing_field: "DQ-01-MANDATORY-FIELDS",
  duplicate_identifier: "DQ-02-DUPLICATE-IDENTIFIER",
  orphan_screening: "DQ-03-ORPHAN-SCREENING",
  overturned_flag: "DQ-04-OVERTURNED-FLAG",
  manual_escalation: "DQ-05-MANUAL-ESCALATION",
} as const satisfies Record<DataQualityIssueType, string>;
export type DataQualityRule = (typeof DATA_QUALITY_RULES)[DataQualityIssueType];

/**
 * Mandatory screening fields (FRD §4 "patient, facility, author, event time, measurement units
 * and source"): always `patientId`, `facilityId`, `workerId`, `measuredAt`, `source`,
 * `rulesetVersion`; `glucoseUnit` + `glucoseContext` when a glucose value is present; `systolic`
 * + `diastolic` together when either is present. Units are never inferred.
 */
export const MANDATORY_SCREENING_FIELDS = [
  "patientId",
  "facilityId",
  "workerId",
  "measuredAt",
  "source",
  "rulesetVersion",
  "glucoseUnit",
  "glucoseContext",
  "systolic",
  "diastolic",
] as const;
export type MandatoryScreeningField = (typeof MANDATORY_SCREENING_FIELDS)[number];

/** App / channel the subject record came from. */
export const DATA_QUALITY_SOURCE_APPS = ["worker", "clinical", "import", "registry"] as const;
export type DataQualitySourceApp = (typeof DATA_QUALITY_SOURCE_APPS)[number];

/** Opaque record reference: `SCR-` / `REV-` / `PAT-` + 8 lowercase hex / id characters. */
export const SUBJECT_REF_PATTERN = /^(SCR|REV|PAT)-[0-9a-z]{8}$/;

export const QUALITY_TRIAGE_NOTE_MIN = 10;
export const QUALITY_TRIAGE_NOTE_MAX = 500;

const FacilityIdField = idSchema<FacilityId>();
const DistrictIdField = idSchema<DistrictId>();
const PersonaIdField = idSchema<PersonaId>();
const CorrelationIdField = idSchema<CorrelationId>();

export const DataQualityIssueDetailsSchema = z.object({
  rule: z.enum(Object.values(DATA_QUALITY_RULES) as [DataQualityRule, ...DataQualityRule[]]),
  /** Missing field ids (`missing_field` only). */
  fields: z.array(z.enum(MANDATORY_SCREENING_FIELDS)).default([]),
  /** Ruleset version of the subject screening (null when not recorded). */
  rulesetVersion: z.string().nullable(),
  /** Number of records involved (e.g. 2 patients sharing one identifier). */
  records: z.number().int().min(1).default(1),
});
export type DataQualityIssueDetails = z.output<typeof DataQualityIssueDetailsSchema>;

/** The deterministic detection part (`detectQualityIssues` output, `upsertDetectedIssues` input). */
export const DetectedQualityIssueSchema = z.object({
  id: z.string().regex(/^dqi_[0-9a-f]{16}$/),
  type: z.enum(DATA_QUALITY_ISSUE_TYPES),
  subjectRef: z.string().regex(SUBJECT_REF_PATTERN),
  facilityId: FacilityIdField,
  districtId: DistrictIdField,
  detectedAt: IsoUtcString,
  sourceApp: z.enum(DATA_QUALITY_SOURCE_APPS),
  details: DataQualityIssueDetailsSchema,
});
export type DetectedQualityIssue = z.output<typeof DetectedQualityIssueSchema>;

export const TRIAGE_ACTIONS = ["acknowledge", "resolve", "send_to_facility"] as const;
export type TriageAction = (typeof TRIAGE_ACTIONS)[number];

/** One triage step (actor, role, time; the note LENGTH only — the note text is on the record). */
export const TriageHistoryEntrySchema = z.object({
  at: IsoUtcString,
  by: PersonaIdField,
  role: z.enum(ROLES),
  action: z.enum(TRIAGE_ACTIONS),
  fromStatus: z.enum(DATA_QUALITY_ISSUE_STATUSES),
  toStatus: z.enum(DATA_QUALITY_ISSUE_STATUSES),
  noteLength: z.number().int().min(0).nullable(),
  programmeActionId: z.string().nullable(),
});
export type TriageHistoryEntry = z.output<typeof TriageHistoryEntrySchema>;

export const DataQualityIssueSchema = DetectedQualityIssueSchema.extend({
  version: Version,
  createdAt: IsoUtcString,
  updatedAt: IsoUtcString,
  synthetic: z.literal(true),
  // ── Triage state (separate from the clinical record; never edits it) ──
  status: z.enum(DATA_QUALITY_ISSUE_STATUSES),
  note: z.string().nullable(),
  programmeActionId: z.string().nullable(),
  /** Null until the first triage step (detection is a system event). */
  updatedBy: PersonaIdField.nullable(),
  history: z.array(TriageHistoryEntrySchema),
});
export type DataQualityIssue = z.output<typeof DataQualityIssueSchema>;

/** Status reached by each triage action. */
export const TRIAGE_TARGET_STATUS = {
  acknowledge: "acknowledged",
  resolve: "resolved_with_note",
  send_to_facility: "sent_to_facility",
} as const satisfies Record<TriageAction, DataQualityIssueStatus>;

const TRANSITIONS: Readonly<Record<DataQualityIssueStatus, readonly DataQualityIssueStatus[]>> = {
  open: ["acknowledged", "sent_to_facility", "resolved_with_note"],
  acknowledged: ["sent_to_facility", "resolved_with_note"],
  sent_to_facility: ["resolved_with_note"],
  resolved_with_note: [],
};

export function canTransitionQualityIssue(
  from: DataQualityIssueStatus,
  to: DataQualityIssueStatus,
): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Triage actions available from a status (UI buttons; the repository re-checks). */
export function triageActionsFor(status: DataQualityIssueStatus): TriageAction[] {
  return TRIAGE_ACTIONS.filter((a) => canTransitionQualityIssue(status, TRIAGE_TARGET_STATUS[a]));
}

export function isTerminalQualityIssueStatus(status: DataQualityIssueStatus): boolean {
  return TRANSITIONS[status].length === 0;
}

/** Resolve note: 10–500 characters (trimmed). */
export const TriageNote = boundedText(QUALITY_TRIAGE_NOTE_MIN, QUALITY_TRIAGE_NOTE_MAX);

/**
 * Triage input (`triageQualityIssue`). FND-07 convention: `expectedVersion` travels inside the
 * input. `resolve` needs a note (10–500); `send_to_facility` needs the id of the programme action
 * just created through ADM-03 (`programme_action.write`, checked by the repository).
 */
export const TriageInputSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("acknowledge"),
    idempotencyKey: IdempotencyKey,
    id: NonEmptyTrimmed,
    expectedVersion: Version,
    correlationId: CorrelationIdField.optional(),
  }),
  z.object({
    action: z.literal("resolve"),
    idempotencyKey: IdempotencyKey,
    id: NonEmptyTrimmed,
    expectedVersion: Version,
    note: TriageNote,
    correlationId: CorrelationIdField.optional(),
  }),
  z.object({
    action: z.literal("send_to_facility"),
    idempotencyKey: IdempotencyKey,
    id: NonEmptyTrimmed,
    expectedVersion: Version,
    programmeActionId: NonEmptyTrimmed,
    correlationId: CorrelationIdField.optional(),
  }),
]);
export type TriageInput = z.output<typeof TriageInputSchema>;

/** List filter (scope is applied by the repository). */
export const QualityIssueFilterSchema = z.object({
  ids: z.array(z.string()).optional(),
  facilityIds: z.array(FacilityIdField).optional(),
  districtIds: z.array(DistrictIdField).optional(),
  statuses: z.array(z.enum(DATA_QUALITY_ISSUE_STATUSES)).optional(),
  types: z.array(z.enum(DATA_QUALITY_ISSUE_TYPES)).optional(),
});
export type QualityIssueFilter = z.output<typeof QualityIssueFilterSchema>;
