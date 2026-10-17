import { describe, expect, it } from "vitest";

import {
  canTransitionQualityIssue,
  DATA_QUALITY_ISSUE_STATUSES,
  DetectedQualityIssueSchema,
  isTerminalQualityIssueStatus,
  SUBJECT_REF_PATTERN,
  triageActionsFor,
  TriageInputSchema,
} from "./dataQualityIssue.ts";
import { parseValidationMessage } from "./messages.ts";

const KEY = "3f1c2a9e-8b7d-4c6e-9a1b-2d3e4f5a6b7c";

describe("DataQualityIssue contracts (ADM-06)", () => {
  it("state machine: open → acknowledged → resolved; open|acknowledged → sent → resolved", () => {
    expect(canTransitionQualityIssue("open", "acknowledged")).toBe(true);
    expect(canTransitionQualityIssue("acknowledged", "resolved_with_note")).toBe(true);
    expect(canTransitionQualityIssue("acknowledged", "sent_to_facility")).toBe(true);
    expect(canTransitionQualityIssue("sent_to_facility", "resolved_with_note")).toBe(true);
    expect(canTransitionQualityIssue("sent_to_facility", "acknowledged")).toBe(false);
    expect(canTransitionQualityIssue("resolved_with_note", "open")).toBe(false);
    expect(DATA_QUALITY_ISSUE_STATUSES.filter(isTerminalQualityIssueStatus)).toEqual([
      "resolved_with_note",
    ]);
    expect(triageActionsFor("open")).toEqual(["acknowledge", "resolve", "send_to_facility"]);
    expect(triageActionsFor("sent_to_facility")).toEqual(["resolve"]);
    expect(triageActionsFor("resolved_with_note")).toEqual([]);
  });

  it("resolve needs a 10–500 character note", () => {
    const base = { action: "resolve", idempotencyKey: KEY, id: "dqi_x", expectedVersion: 1 };
    const short = TriageInputSchema.safeParse({ ...base, note: "abc" });
    expect(short.success).toBe(false);
    expect(parseValidationMessage(short.error?.issues[0]?.message ?? "")?.key).toBe("tooShort");
    const long = TriageInputSchema.safeParse({ ...base, note: "x".repeat(501) });
    expect(long.success).toBe(false);
    expect(TriageInputSchema.safeParse({ ...base, note: "Unit confirmed at source" }).success).toBe(
      true,
    );
  });

  it("send_to_facility needs a programme action id", () => {
    const r = TriageInputSchema.safeParse({
      action: "send_to_facility",
      idempotencyKey: KEY,
      id: "dqi_x",
      expectedVersion: 1,
    });
    expect(r.success).toBe(false);
  });

  it("subject refs are opaque record refs, never identifiers", () => {
    expect(SUBJECT_REF_PATTERN.test("SCR-6e4e8f18")).toBe(true);
    expect(SUBJECT_REF_PATTERN.test("PAT-c1565e1a")).toBe(true);
    expect(SUBJECT_REF_PATTERN.test("DEMO-A-0023")).toBe(false);
    const r = DetectedQualityIssueSchema.safeParse({
      id: "dqi_0123456789abcdef",
      type: "duplicate_identifier",
      subjectRef: "DEMO-A-0023",
      facilityId: "fac-alpha-2",
      districtId: "dis-alpha",
      detectedAt: "2026-07-17T11:46:00.000Z",
      sourceApp: "registry",
      details: { rule: "DQ-02-DUPLICATE-IDENTIFIER", rulesetVersion: null, records: 2 },
    });
    expect(r.success).toBe(false);
  });
});
