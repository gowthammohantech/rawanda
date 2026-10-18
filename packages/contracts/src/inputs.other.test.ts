import { describe, expect, it } from "vitest";

import {
  CallbackRequestInputSchema,
  ClientAuditInputSchema,
  CareTaskInputSchema,
  CareTaskUpdateInputSchema,
  CorrectionRequestInputSchema,
  ExportRecordInputSchema,
  RegisterPatientInputSchema,
  ReleaseCareInstructionInputSchema,
  ReminderPreferenceInputSchema,
} from "./inputs.ts";
import { errorKeys, KEY, VALID_REASON } from "./testing/fixtures.ts";

describe("RegisterPatientInputSchema", () => {
  const input = {
    idempotencyKey: KEY,
    givenName: "  Demo ",
    familyName: "Person",
    sex: "not_recorded",
    facilityId: "fac-alpha-1",
  };

  it("needs dateOfBirth or estimatedAgeYears", () => {
    expect(errorKeys(RegisterPatientInputSchema, input)).toEqual({ dateOfBirth: "required" });
    expect(errorKeys(RegisterPatientInputSchema, { ...input, estimatedAgeYears: 45 })).toEqual({});
    expect(errorKeys(RegisterPatientInputSchema, { ...input, dateOfBirth: "1980-01-31" })).toEqual(
      {},
    );
    expect(RegisterPatientInputSchema.parse({ ...input, estimatedAgeYears: 45 }).givenName).toBe(
      "Demo",
    );
  });

  it("validates ranges, enums and the flagged match decision", () => {
    expect(
      errorKeys(RegisterPatientInputSchema, {
        ...input,
        estimatedAgeYears: 130,
        sex: "x",
        givenName: " ",
        matchDecision: "merge",
      }),
    ).toEqual({
      estimatedAgeYears: "numberOutOfRange",
      sex: "invalidEnum",
      givenName: "required",
      matchDecision: "invalidEnum",
    });
    expect(
      errorKeys(RegisterPatientInputSchema, {
        ...input,
        dateOfBirth: "1980-01-31",
        matchDecision: "register_anyway_flagged",
      }),
    ).toEqual({});
  });

  it("HWM-04: optional village label and synthetic phone (07XXXXXXXX)", () => {
    const ok = { ...input, estimatedAgeYears: 40 };
    expect(
      errorKeys(RegisterPatientInputSchema, {
        ...ok,
        villageLabel: "Demo Cell A",
        syntheticPhone: "0780000001",
      }),
    ).toEqual({});
    expect(
      errorKeys(RegisterPatientInputSchema, {
        ...ok,
        villageLabel: "x".repeat(61),
        syntheticPhone: "078 000 0001",
      }),
    ).toEqual({ villageLabel: "tooLong", syntheticPhone: "phonePattern" });
  });
});

describe("care task inputs", () => {
  it("creates tasks with kind-specific payloads", () => {
    expect(
      errorKeys(CareTaskInputSchema, {
        idempotencyKey: KEY,
        kind: "programme_action",
        payload: { actionKey: "admin.action.review_backlog", note: "" },
      }),
    ).toEqual({});
    expect(
      errorKeys(CareTaskInputSchema, {
        idempotencyKey: KEY,
        kind: "follow_up_assignment",
        payload: { actionKey: "x" },
      }),
    ).toEqual({ "payload.followUpId": "required", "payload.referralId": "required" });
  });

  it("updates tasks by action; cancel needs a reason", () => {
    const base = { idempotencyKey: KEY, taskId: "task-1", expectedVersion: 1 };
    expect(errorKeys(CareTaskUpdateInputSchema, { ...base, action: "start" })).toEqual({});
    expect(errorKeys(CareTaskUpdateInputSchema, { ...base, action: "cancel" })).toEqual({
      reason: "required",
    });
    expect(
      errorKeys(CareTaskUpdateInputSchema, { ...base, action: "cancel", reason: VALID_REASON }),
    ).toEqual({});
    // CLN-09: a correction outcome is a vocabulary key, never free text.
    expect(
      errorKeys(CareTaskUpdateInputSchema, {
        ...base,
        action: "complete",
        resolutionKey: "reading_time_confirmed",
      }),
    ).toEqual({});
    expect(
      Object.keys(
        errorKeys(CareTaskUpdateInputSchema, {
          ...base,
          action: "complete",
          resolutionKey: "Checked, all fine",
        }),
      ),
    ).toEqual(["resolutionKey"]);
  });

  it("correction and callback requests", () => {
    expect(
      errorKeys(CorrectionRequestInputSchema, {
        idempotencyKey: KEY,
        patientId: "pat-1",
        targetType: "screening",
        targetId: "scr-1",
        description: "Wrong day",
      }),
    ).toEqual({ description: "tooShort" });
    expect(
      errorKeys(CallbackRequestInputSchema, {
        idempotencyKey: KEY,
        patientId: "pat-1",
        topic: "result_question",
        window: "evening",
        note: "x".repeat(301),
      }),
    ).toEqual({ window: "invalidEnum", note: "tooLong" });
  });
});

describe("citizen inputs", () => {
  it("reminder preference", () => {
    expect(
      errorKeys(ReminderPreferenceInputSchema, {
        idempotencyKey: KEY,
        patientId: "pat-1",
        optedIn: true,
        timing: "morning_of",
      }),
    ).toEqual({});
    expect(
      errorKeys(ReminderPreferenceInputSchema, { idempotencyKey: KEY, patientId: "pat-1" }),
    ).toEqual({ optedIn: "required", timing: "required" });
  });

  it("released instruction messages are citizen i18n keys", () => {
    const input = {
      idempotencyKey: KEY,
      patientId: "pat-1",
      kind: "referral",
      sourceType: "referral",
      sourceId: "ref-1",
      messageKey: "citizen:instruction.referral",
      facilityId: "fac-alpha-2",
    };
    expect(ReleaseCareInstructionInputSchema.parse(input).params).toEqual({});
    expect(
      errorKeys(ReleaseCareInstructionInputSchema, { ...input, messageKey: "Go to the clinic" }),
    ).toEqual({ messageKey: "invalidFormat" });
  });
});

describe("ExportRecordInputSchema", () => {
  const input = {
    idempotencyKey: KEY,
    reasonCode: "district_meeting",
    template: "programme_summary",
    granularity: "district",
    scope: { districtIds: ["dis-alpha"], facilityIds: [] },
    filters: { preset: "90d" },
    rowCount: 12,
    suppressedCells: 2,
    sha256: "a".repeat(64),
  };

  it("accepts a complete record", () => {
    expect(errorKeys(ExportRecordInputSchema, input)).toEqual({});
  });

  it("requires reason text for `other` and a hex sha256", () => {
    expect(
      errorKeys(ExportRecordInputSchema, { ...input, reasonCode: "other", sha256: "abc" }),
    ).toEqual({ reasonText: "required", sha256: "invalidFormat" });
  });
});

describe("ClientAuditInputSchema", () => {
  it("accepts a dotted action with defaults and rejects malformed actions", () => {
    expect(ClientAuditInputSchema.parse({ action: "session.started" })).toEqual({
      action: "session.started",
      outcome: "success",
      changeSummary: {},
    });
    expect(errorKeys(ClientAuditInputSchema, { action: "Session Started" })).toEqual({
      action: "invalidFormat",
    });
    expect(
      errorKeys(ClientAuditInputSchema, { action: "access.denied", outcome: "maybe" }),
    ).toEqual({ outcome: "invalidEnum" });
  });
});
