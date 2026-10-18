import { describe, expect, it } from "vitest";

import {
  AcknowledgeInstructionInputSchema,
  AcknowledgeReminderInputSchema,
  ApprovedInstructionSchema,
  CitizenAccessEventSchema,
  CitizenAccountSchema,
  CitizenCareTaskSchema,
  CitizenSettingsSchema,
  ConsentRecordSchema,
  CorrectionRequestSchema,
  IdentityVerificationSchema,
  NextStepAcknowledgementSchema,
  NotificationPreferenceSchema,
  PatientLinkSchema,
  PendingReviewPlaceholderSchema,
  RecordConsentInputSchema,
  ReleasedObservationSchema,
  UpdateCitizenSettingsInputSchema,
  UpdateNotificationPrefsInputSchema,
  VerifyIdentityInputSchema,
} from "../index.ts";
import { CareTaskPayloadSchemas, CorrectionRequestInputSchema } from "../../index.ts";

const T = "2026-10-14T06:00:00.000Z";
const base = { version: 1, createdAt: T, updatedAt: T, synthetic: true };
const KEY = "00000000-0000-4000-8000-000000000001";

const fixtures = {
  account: {
    ...base,
    id: "ctz-account-1",
    personaId: "persona-citizen-1",
    status: "active",
    verifiedAt: T,
    lockedAt: null,
  },
  link: {
    ...base,
    id: "ctz-link-1",
    accountId: "ctz-account-1",
    personaId: "persona-citizen-1",
    patientId: "pat-1",
    relationship: "self",
    status: "active",
    linkedAt: T,
  },
  verification: {
    ...base,
    id: "ctz-verification-1",
    accountId: "ctz-account-1",
    personaId: "persona-citizen-1",
    method: "demo_code",
    status: "pending",
    demoCode: "246810",
    attempts: 0,
    lastAttemptAt: null,
    verifiedAt: null,
  },
  consent: {
    ...base,
    id: "ctz-consent-1",
    patientId: "pat-1",
    personaId: "persona-citizen-1",
    action: "granted",
    noticeVersion: "demo-notice-v0.1",
    recordedAt: T,
  },
  ack: {
    ...base,
    id: "ctz-ack-1",
    patientId: "pat-1",
    instructionId: "ci-1",
    personaId: "persona-citizen-1",
    acknowledgedAt: T,
  },
  settings: {
    ...base,
    id: "ctz-settings-1",
    personaId: "persona-citizen-1",
    language: "rw",
    textScale: 1,
    highContrast: false,
  },
  access: {
    ...base,
    id: "ctz-access-1",
    patientId: "pat-1",
    actorId: "persona-clin-alpha1",
    actorRole: "clinician",
    action: "result_viewed",
    purpose: "care_review",
    resourceType: "screening",
    resourceId: "scr-1",
    occurredAt: T,
    facilityId: "fac-alpha-1",
    correlationId: "corr-1",
    changeSummary: {},
    justification: null,
  },
  observation: {
    kind: "released",
    id: "scr-1",
    patientId: "pat-1",
    screeningId: "scr-1",
    reviewId: "rev-1",
    reviewState: "released_follow_up",
    label: "followUpAgreed",
    measuredAt: T,
    facilityId: "fac-alpha-1",
    readings: {
      systolic: 152,
      diastolic: 96,
      bloodPressureUnit: "mmHg",
      glucoseValue: 7.2,
      glucoseUnit: "mmol/L",
      glucoseContext: "fasting",
    },
    originalReadings: null,
    amendments: [],
    reviewedBy: "persona-clin-alpha1",
    reviewedAt: T,
  },
} as const;

const records = [
  ["CitizenAccount", CitizenAccountSchema, fixtures.account],
  ["PatientLink", PatientLinkSchema, fixtures.link],
  ["IdentityVerification", IdentityVerificationSchema, fixtures.verification],
  ["ConsentRecord", ConsentRecordSchema, fixtures.consent],
  ["NextStepAcknowledgement", NextStepAcknowledgementSchema, fixtures.ack],
  ["CitizenSettings", CitizenSettingsSchema, fixtures.settings],
  ["CitizenAccessEvent", CitizenAccessEventSchema, fixtures.access],
] as const;

describe("citizen record schemas", () => {
  it.each(records)("%s accepts a valid synthetic record", (_name, schema, value) => {
    expect(schema.safeParse(value).success).toBe(true);
  });

  it.each(records)("%s requires every field and synthetic: true", (_name, schema, value) => {
    for (const key of Object.keys(value)) {
      const copy: Record<string, unknown> = { ...value };
      delete copy[key];
      expect(schema.safeParse(copy).success, key).toBe(false);
    }
    expect(schema.safeParse({ ...value, synthetic: false }).success).toBe(false);
  });

  it("timestamps must be timezone-aware ISO 8601 and are normalised to UTC", () => {
    expect(
      ConsentRecordSchema.safeParse({ ...fixtures.consent, recordedAt: "2026-10-14T08:00:00" })
        .success,
    ).toBe(false);
    const parsed = ConsentRecordSchema.parse({
      ...fixtures.consent,
      recordedAt: "2026-10-14T08:00:00+02:00",
    });
    expect(parsed.recordedAt).toBe("2026-10-14T06:00:00.000Z");
  });

  it("access events carry the FRD §5 audit fields", () => {
    for (const field of [
      "id",
      "actorId",
      "actorRole",
      "patientId",
      "resourceType",
      "resourceId",
      "action",
      "changeSummary",
      "occurredAt",
      "facilityId",
      "correlationId",
      "justification",
    ]) {
      expect(Object.keys(CitizenAccessEventSchema.shape)).toContain(field);
    }
  });

  it("the demo verification code is six digits", () => {
    expect(
      IdentityVerificationSchema.safeParse({ ...fixtures.verification, demoCode: "12345" }).success,
    ).toBe(false);
  });

  it("notification preferences are the FND reminder preference (in-app channel)", () => {
    expect(
      NotificationPreferenceSchema.safeParse({
        ...base,
        id: "pref-1",
        patientId: "pat-1",
        optedIn: true,
        timing: "day_before",
        channel: "in_app",
      }).success,
    ).toBe(true);
  });

  it("citizen care tasks are correction or callback requests only", () => {
    const task = {
      ...base,
      id: "task-1",
      status: "open",
      patientId: "pat-1",
      facilityId: "fac-alpha-1",
      assignedToId: null,
      createdBy: "persona-citizen-1",
      dueAt: null,
      completedAt: null,
      cancelled: null,
    };
    expect(
      CitizenCareTaskSchema.safeParse({
        ...task,
        kind: "correction_request",
        payload: {
          targetType: "screening",
          targetId: "scr-1",
          description: "The time looks wrong.",
          suggestedValue: null,
          requestStatus: "submitted",
        },
      }).success,
    ).toBe(true);
    expect(
      CitizenCareTaskSchema.safeParse({
        ...task,
        kind: "programme_action",
        payload: { actionKey: "x", note: "" },
      }).success,
    ).toBe(false);
  });
});

describe("citizen projections", () => {
  it("released observations state units explicitly", () => {
    expect(ReleasedObservationSchema.safeParse(fixtures.observation).success).toBe(true);
    expect(
      ReleasedObservationSchema.safeParse({
        ...fixtures.observation,
        readings: { ...fixtures.observation.readings, bloodPressureUnit: "kPa" },
      }).success,
    ).toBe(false);
    expect(
      ReleasedObservationSchema.safeParse({
        ...fixtures.observation,
        readings: { ...fixtures.observation.readings, glucoseUnit: "mg" },
      }).success,
    ).toBe(false);
  });

  it("released observations never carry the awaiting_review state", () => {
    expect(
      ReleasedObservationSchema.safeParse({
        ...fixtures.observation,
        reviewState: "awaiting_review",
      }).success,
    ).toBe(false);
  });

  it("a pending placeholder cannot carry any values", () => {
    const placeholder = { kind: "pending_review", id: "scr-2", patientId: "pat-1", measuredAt: T };
    expect(PendingReviewPlaceholderSchema.safeParse(placeholder).success).toBe(true);
    expect(
      PendingReviewPlaceholderSchema.safeParse({ ...placeholder, systolic: 171 }).success,
    ).toBe(false);
  });

  it("approved instructions are released care instructions only", () => {
    const instruction = {
      ...base,
      id: "ci-1",
      patientId: "pat-1",
      kind: "appointment",
      sourceType: "referral",
      sourceId: "ref-1",
      messageKey: "citizen:nextStep.appointment.message",
      params: {},
      appointmentAt: "2026-10-19T08:30:00.000Z",
      facilityId: "fac-alpha-1",
      releasedBy: "persona-clin-alpha1",
      releasedAt: T,
      status: "released",
      approvalState: "approved",
      progress: "planned",
      datePassed: false,
      reviewId: null,
      acknowledgement: null,
      completion: null,
    };
    expect(ApprovedInstructionSchema.safeParse(instruction).success).toBe(true);
    expect(
      ApprovedInstructionSchema.safeParse({
        ...instruction,
        completion: { completedAt: T, evidenceType: "facility_attendance_record" },
      }).success,
    ).toBe(true);
    expect(
      ApprovedInstructionSchema.safeParse({ ...instruction, status: "withdrawn" }).success,
    ).toBe(false);
  });

  it("correction requests expose the request status", () => {
    expect(
      CorrectionRequestSchema.safeParse({
        ...base,
        id: "task-1",
        patientId: "pat-1",
        targetType: "screening",
        targetId: "scr-1",
        description: "The time looks wrong.",
        status: "resolved_amended",
        createdBy: "persona-citizen-1",
        resolvedAt: T,
        suggestedText: null,
        resolutionKey: "glucose_context_corrected",
      }).success,
    ).toBe(true);
  });

  it("CTZ-07: correction payload accepts a routing role and an outcome KEY, never free text", () => {
    const payload = {
      targetType: "screening",
      targetId: "scr-1",
      description: "The time looks wrong.",
      suggestedValue: null,
      requestStatus: "resolved_no_change",
      assignedRole: "clinician",
    };
    const schema = CareTaskPayloadSchemas.correction_request;
    expect(schema.safeParse({ ...payload, resolutionKey: "reading_time_confirmed" }).success).toBe(
      true,
    );
    expect(schema.safeParse({ ...payload, resolutionKey: "Checked, all fine!" }).success).toBe(
      false,
    );
    expect(schema.safeParse({ ...payload, assignedRole: "nobody" }).success).toBe(false);
    expect(
      CorrectionRequestInputSchema.safeParse({
        idempotencyKey: KEY,
        patientId: "pat-1",
        targetType: "patient",
        targetId: "pat-1",
        description: "My birth year is wrong.",
        expectedTargetVersion: 0,
      }).success,
    ).toBe(false);
  });
});

describe("citizen inputs", () => {
  it("consent defaults the notice version and needs an idempotency key", () => {
    expect(
      RecordConsentInputSchema.parse({ idempotencyKey: KEY, patientId: "pat-1", action: "granted" })
        .noticeVersion,
    ).toBe("demo-notice-v0.1");
    expect(
      RecordConsentInputSchema.safeParse({ patientId: "pat-1", action: "granted" }).success,
    ).toBe(false);
  });

  it("acknowledgements need patient and instruction", () => {
    expect(
      AcknowledgeInstructionInputSchema.safeParse({ idempotencyKey: KEY, patientId: "pat-1" })
        .success,
    ).toBe(false);
    // CTZ-04: the read version is optional; when given it must be a positive version.
    const ack = { idempotencyKey: KEY, patientId: "pat-1", instructionId: "ci-1" };
    expect(AcknowledgeInstructionInputSchema.safeParse(ack).success).toBe(true);
    expect(
      AcknowledgeInstructionInputSchema.safeParse({ ...ack, expectedVersion: 2 }).success,
    ).toBe(true);
    expect(
      AcknowledgeInstructionInputSchema.safeParse({ ...ack, expectedVersion: 0 }).success,
    ).toBe(false);
  });

  it("reminder acknowledgements need patient and reminder (CTZ-05)", () => {
    expect(
      AcknowledgeReminderInputSchema.safeParse({ idempotencyKey: KEY, patientId: "pat-1" }).success,
    ).toBe(false);
    expect(
      AcknowledgeReminderInputSchema.safeParse({
        idempotencyKey: KEY,
        patientId: "pat-1",
        reminderId: "rem-1",
      }).success,
    ).toBe(true);
  });

  it("preference updates require expectedVersion", () => {
    const input = { idempotencyKey: KEY, patientId: "pat-1", optedIn: false, timing: "day_before" };
    expect(UpdateNotificationPrefsInputSchema.safeParse(input).success).toBe(false);
    expect(
      UpdateNotificationPrefsInputSchema.safeParse({ ...input, expectedVersion: 1 }).success,
    ).toBe(true);
  });

  it("settings updates need at least one field", () => {
    expect(UpdateCitizenSettingsInputSchema.safeParse({ idempotencyKey: KEY }).success).toBe(false);
    expect(
      UpdateCitizenSettingsInputSchema.safeParse({ idempotencyKey: KEY, textScale: 1.15 }).success,
    ).toBe(true);
    // CTZ-08 "Largest" preset.
    expect(
      UpdateCitizenSettingsInputSchema.safeParse({ idempotencyKey: KEY, textScale: 1.5 }).success,
    ).toBe(true);
    expect(
      UpdateCitizenSettingsInputSchema.safeParse({ idempotencyKey: KEY, textScale: 3 }).success,
    ).toBe(false);
  });

  it("verification attempts need exactly six digits (CTZ-02)", () => {
    expect(
      VerifyIdentityInputSchema.safeParse({ idempotencyKey: KEY, code: "246810" }).success,
    ).toBe(true);
    for (const code of ["24681", "2468100", "24681a", ""]) {
      expect(VerifyIdentityInputSchema.safeParse({ idempotencyKey: KEY, code }).success).toBe(
        false,
      );
    }
  });
});
