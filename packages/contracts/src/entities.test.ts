import { ENTITY_TYPES } from "@laif/domain";
import { describe, expect, it } from "vitest";

import { ENTITY_SCHEMAS } from "./entities.ts";
import { base, NOW_ISO } from "./testing/fixtures.ts";

const flag = {
  requiresReview: true,
  evaluable: true,
  reasonCodes: ["DEMO_BP_SYSTOLIC_AT_OR_ABOVE_THRESHOLD"],
  triggeringObservations: [{ code: "SYSTOLIC", value: 162, unit: "mmHg", comparedTo: 145 }],
  rulesetVersion: "demo-ruleset-v1",
  displayDisclaimer: "DEMO_RULE_NOT_CLINICALLY_VALIDATED",
};

/** One hand-written valid fixture per entity type. */
const fixtures: Record<(typeof ENTITY_TYPES)[number], Record<string, unknown>> = {
  patient: {
    ...base,
    id: "pat-000001",
    syntheticIdentifier: "DEMO-P-0001",
    displayName: "Demo Patient One",
    dateOfBirth: "1968-04-02",
    sexOptional: "female",
    facilityId: "fac-alpha-1",
    districtId: "dis-alpha",
    consentState: "granted",
    identityStatus: "verified_local",
    duplicateCandidateIds: [],
    preferredLanguage: "rw",
  },
  screening: {
    ...base,
    id: "scr-000001",
    patientId: "pat-000001",
    workerId: "persona-chw-1",
    facilityId: "fac-alpha-1",
    districtId: "dis-alpha",
    measuredAt: NOW_ISO,
    systolic: 162,
    diastolic: 92,
    glucoseValue: null,
    glucoseUnit: null,
    glucoseContext: null,
    observations: [{ code: "SYSTOLIC", value: 162, unit: "mmHg" }],
    source: "worker_mobile",
    rulesetVersion: "demo-ruleset-v1",
    status: "review_required",
    flag,
    clientMutationId: "cm-000001",
    captureDurationSeconds: 95,
    notes: "",
    amendments: [
      {
        id: "amd-1",
        field: "systolic",
        before: 126,
        after: 162,
        reason: "Transcription error on entry",
        amendedBy: "persona-chw-1",
        amendedAt: NOW_ISO,
      },
    ],
  },
  review: {
    ...base,
    id: "rev-000001",
    screeningId: "scr-000001",
    patientId: "pat-000001",
    facilityId: "fac-alpha-1",
    assignedClinicianId: null,
    status: "dismissed_with_reason",
    flagReasons: ["DEMO_BP_SYSTOLIC_AT_OR_ABOVE_THRESHOLD"],
    evidenceSnapshot: {
      flag,
      inputs: {
        systolic: 162,
        diastolic: 92,
        glucoseValue: null,
        glucoseUnit: null,
        glucoseContext: null,
      },
      capturedAt: NOW_ISO,
      capturedBy: "persona-chw-1",
    },
    decision: {
      kind: "dismiss",
      note: "Repeat reading acceptable",
      reasonCode: "repeat_reading_acceptable",
      decidedBy: "persona-clin-1",
      decidedAt: NOW_ISO,
    },
    decisionReason: "Repeat reading acceptable",
    reviewedAt: NOW_ISO,
    startedBy: "persona-clin-1",
    reviewedBy: "persona-clin-1",
    priority: "routine",
    reviewDueAt: null,
    origin: "rule_flag",
  },
  referral: {
    ...base,
    id: "ref-000001",
    patientId: "pat-000001",
    reviewId: "rev-000001",
    destination: "Demo Facility Alpha-2",
    requestedAt: NOW_ISO,
    dueAt: "2026-10-20T06:00:00.000Z",
    status: "completed",
    completedAt: NOW_ISO,
    completionEvidence: {
      type: "facility_attendance_record",
      reference: "REG-104",
      outcome: "attended_seen",
      note: "",
      recordedBy: "persona-clin-1",
      recordedAt: NOW_ISO,
    },
    facilityId: "fac-alpha-1",
    destinationFacilityId: "fac-alpha-2",
    assignedWorkerId: "persona-chw-1",
    priority: "routine",
    referralReason: "Raised readings on two visits",
    appointmentAt: null,
    cancelled: null,
  },
  follow_up: {
    ...base,
    id: "fu-000001",
    patientId: "pat-000001",
    referralId: "ref-000001",
    reviewId: null,
    facilityId: "fac-alpha-1",
    assignedWorkerId: "persona-chw-1",
    dueAt: "2026-10-20T06:00:00.000Z",
    status: "completed",
    attempts: [
      {
        id: "att-1",
        at: NOW_ISO,
        method: "phone",
        result: "reached",
        note: "",
        durationMinutes: null,
        recordedBy: "persona-chw-1",
      },
    ],
    completedAt: NOW_ISO,
    outcome: {
      kind: "attended",
      occurredAt: NOW_ISO,
      evidenceType: "appointment_card_seen",
      reasonCode: null,
      note: "",
      recordedBy: "persona-chw-1",
    },
    purpose: "referral_attendance",
    assignmentHistory: [
      {
        workerId: "persona-chw-1",
        assignedAt: NOW_ISO,
        assignedBy: "persona-clin-1",
        reason: null,
      },
    ],
    notes: [{ at: NOW_ISO, by: "persona-chw-1", text: "Visited" }],
    clinicianConfirmation: { status: "pending" },
  },
  care_task: {
    ...base,
    id: "task-000001",
    kind: "correction_request",
    status: "open",
    patientId: "pat-000001",
    facilityId: "fac-alpha-1",
    assignedToId: null,
    createdBy: "persona-citizen-1",
    dueAt: null,
    completedAt: null,
    cancelled: null,
    payload: {
      targetType: "screening",
      targetId: "scr-000001",
      description: "The date of the reading is wrong",
      suggestedValue: { measuredAt: "2026-10-12" },
    },
  },
  care_instruction: {
    ...base,
    id: "ci-000001",
    patientId: "pat-000001",
    kind: "referral",
    sourceType: "referral",
    sourceId: "ref-000001",
    messageKey: "citizen:instruction.referral",
    params: { facility: "Demo Facility Alpha-2", days: 6 },
    appointmentAt: null,
    facilityId: "fac-alpha-2",
    releasedBy: "persona-clin-1",
    releasedAt: NOW_ISO,
    status: "released",
  },
  reminder: {
    ...base,
    id: "rem-000001",
    patientId: "pat-000001",
    followUpId: null,
    channel: "in_app",
    consentBasis: "citizen_opt_in",
    scheduledAt: NOW_ISO,
    status: "scheduled",
    instructionId: "ci-000001",
    cancelReason: null,
    deliveredAt: null,
    acknowledgedAt: null,
  },
  reminder_preference: {
    ...base,
    id: "rp-000001",
    patientId: "pat-000001",
    optedIn: true,
    timing: "day_before",
    channel: "in_app",
  },
  audit_event: {
    ...base,
    id: "aud-000001",
    actorId: "persona-clin-1",
    actorRole: "clinician",
    action: "review.dismissed",
    entityType: "review",
    entityId: "rev-000001",
    beforeHash: "0123456789abcdef",
    occurredAt: NOW_ISO,
    correlationId: "cor-000001",
    category: "change",
    outcome: "success",
    facilityId: "fac-alpha-1",
    districtId: "dis-alpha",
    patientId: "pat-000001",
    changeSummary: { status: ["in_review", "dismissed_with_reason"] },
    justification: "Repeat reading acceptable",
  },
  facility: {
    ...base,
    id: "fac-alpha-1",
    name: "Demo Facility Alpha-1",
    code: "ALPHA-1",
    kind: "health_centre",
    districtId: "dis-alpha",
  },
  district: { ...base, id: "dis-alpha", name: "Demo District Alpha", code: "ALPHA" },
  persona: {
    ...base,
    id: "persona-clin-1",
    displayName: "Demo Clinician",
    role: "clinician",
    appIds: ["clinical"],
    facilityIds: ["fac-alpha-1"],
    districtIds: [],
    programmeWide: false,
    workerCode: null,
    linkedPatientIds: [],
    preferredLanguage: "en",
  },
  ruleset: {
    version: "demo-ruleset-v1",
    status: "active",
    label: "DEMO_RULE_NOT_CLINICALLY_VALIDATED",
    approvedBy: null,
    effectiveFrom: "2026-01-01T00:00:00.000Z",
    requiredInputs: ["systolic", "diastolic"],
    thresholds: {
      DEMO_SYSTOLIC_REVIEW_AT_OR_ABOVE: 145,
      DEMO_DIASTOLIC_REVIEW_AT_OR_ABOVE: 95,
      DEMO_GLUCOSE_REVIEW_AT_OR_ABOVE_MMOL: { fasting: 7.5, non_fasting: 11.5, not_recorded: 11.5 },
    },
    plausibility: {
      systolic: { min: 60, max: 260 },
      diastolic: { min: 30, max: 160 },
      glucoseMmol: { min: 1, max: 35 },
      glucoseMgDl: { min: 18, max: 630 },
    },
    synthetic: true,
  },
  sync_operation: {
    ...base,
    id: "op-000001",
    clientMutationId: "cm-000001",
    idempotencyKey: "3f1c2a9e-8b7d-4c6e-9a1b-2d3e4f5a6b7c",
    localSeq: 1,
    entityType: "screening",
    entityId: "scr-000001",
    opType: "create",
    payload: { systolic: 162 },
    baseVersion: null,
    dependsOnOpId: null,
    resolvesOpId: null,
    status: "conflict",
    attempts: 1,
    nextAttemptAt: null,
    lastError: { code: "CONFLICT", reason: null },
    deviceTimestamp: NOW_ISO,
    serverSnapshot: null,
    correlationId: "cor-000001",
  },
  device_session: {
    ...base,
    id: "ds-000001",
    personaId: "persona-chw-1",
    deviceId: "dev-000001",
    facilityId: "fac-alpha-1",
    status: "active",
  },
  programme_action: {
    ...base,
    id: "pa-000001",
    idempotencyKey: "3f1c2a9e-8b7d-4c6e-9a1b-2d3e4f5a6b7d",
    facilityId: "fac-alpha-1",
    districtId: "dis-alpha",
    category: "data_completeness_check",
    title: "Check missing glucose units",
    note: "",
    ownerRole: "facility_manager",
    dueDate: "2026-10-30",
    status: "open",
    createdBy: "persona-analyst-alpha",
    updatedBy: "persona-analyst-alpha",
    sourceContext: { page: "funnel_stage", stage: "reviewed", filters: { preset: "90d" } },
  },
  data_quality_issue: {
    ...base,
    id: "dqi_0123456789abcdef",
    type: "missing_field",
    subjectRef: "SCR-6e4e8f18",
    facilityId: "fac-alpha-1",
    districtId: "dis-alpha",
    detectedAt: NOW_ISO,
    sourceApp: "import",
    details: {
      rule: "DQ-01-MANDATORY-FIELDS",
      fields: ["glucoseUnit"],
      rulesetVersion: "demo-ruleset-2026.10-v1",
      records: 1,
    },
    status: "acknowledged",
    note: null,
    programmeActionId: null,
    updatedBy: "persona-analyst-alpha",
    history: [
      {
        at: NOW_ISO,
        by: "persona-analyst-alpha",
        role: "district_analyst",
        action: "acknowledge",
        fromStatus: "open",
        toStatus: "acknowledged",
        noteLength: null,
        programmeActionId: null,
      },
    ],
  },
  export_audit: {
    ...base,
    id: "6f1c2a9e-8b7d-4c6e-9a1b-2d3e4f5a6b7d",
    idempotencyKey: "3f1c2a9e-8b7d-4c6e-9a1b-2d3e4f5a6b7d",
    actorId: "persona-analyst-alpha",
    role: "district_analyst",
    grantId: "grant-analyst-alpha",
    correlationId: "cor-000001",
    scope: { districtIds: ["dist-alpha"], facilityIds: ["fac-alpha-1", "fac-alpha-2"] },
    period: { from: "2026-07-17", to: "2026-10-14" },
    template: "programme_summary",
    granularity: "facility",
    reasonCode: "district_meeting",
    reasonText: null,
    rowCount: 14,
    suppressedCells: 3,
    sha256: "a".repeat(64),
    fileName: "laif-demo_programme_summary_dist-alpha_2026-07-17_2026-10-14_6f1c2a9e.csv",
    csvText: "\uFEFF# DEMONSTRATION — SYNTHETIC PATIENT DATA — NOT FOR CLINICAL USE\r\n",
    status: "generated",
    deniedReason: null,
  },
};

const entries = Object.entries(ENTITY_SCHEMAS) as [
  keyof typeof ENTITY_SCHEMAS,
  (typeof ENTITY_SCHEMAS)[keyof typeof ENTITY_SCHEMAS],
][];

describe("entity schemas", () => {
  it("cover every domain entity type", () => {
    expect(Object.keys(ENTITY_SCHEMAS).sort()).toEqual([...ENTITY_TYPES].sort());
  });

  it.each(entries)("%s: parses its hand-written valid fixture unchanged", (type, schema) => {
    const result = schema.safeParse(fixtures[type]);
    expect(result.error?.issues ?? []).toEqual([]);
    expect(result.data).toEqual(fixtures[type]);
  });

  it.each(entries)("%s: rejects synthetic: false", (type, schema) => {
    const result = schema.safeParse({ ...fixtures[type], synthetic: false });
    expect(result.success).toBe(false);
    expect(result.error?.issues.some((i) => i.path.join(".") === "synthetic")).toBe(true);
  });

  it.each(entries)("%s: rejects a missing synthetic flag", (type, schema) => {
    const rest = { ...fixtures[type], synthetic: undefined };
    expect(schema.safeParse(rest).success).toBe(false);
  });

  it("normalises +02:00 offsets to UTC Z on persisted timestamps", () => {
    const parsed = ENTITY_SCHEMAS.patient.parse({
      ...fixtures.patient,
      createdAt: "2026-10-14T08:00:00+02:00",
      updatedAt: "2026-10-14T08:00:00.123+02:00",
    });
    expect(parsed.createdAt).toBe("2026-10-14T06:00:00.000Z");
    expect(parsed.updatedAt).toBe("2026-10-14T06:00:00.123Z");
  });

  it("rejects timestamps without timezone", () => {
    expect(
      ENTITY_SCHEMAS.patient.safeParse({ ...fixtures.patient, createdAt: "2026-10-14T08:00:00" })
        .success,
    ).toBe(false);
  });

  it("accepts the optional ext fields only with their declared types", () => {
    expect(
      ENTITY_SCHEMAS.patient.safeParse({ ...fixtures.patient, estimatedAgeYears: 54 }).success,
    ).toBe(true);
    expect(
      ENTITY_SCHEMAS.patient.safeParse({ ...fixtures.patient, estimatedAgeYears: "54" }).success,
    ).toBe(false);
  });
});
