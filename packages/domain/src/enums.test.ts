import { describe, expect, expectTypeOf, it } from "vitest";

import * as enums from "./enums.ts";
import type {
  CareTaskStatus,
  ClinicianConfirmationState,
  EntitySyncState,
  FollowUpStatus,
  ReferralStatus,
  ReminderStatus,
  ReviewStatus,
  ScreeningStatus,
  SyncOpStatus,
} from "./enums.ts";

type AnyStatus =
  | ScreeningStatus
  | ReviewStatus
  | ReferralStatus
  | FollowUpStatus
  | CareTaskStatus
  | SyncOpStatus
  | ReminderStatus
  | ClinicianConfirmationState
  | EntitySyncState;

describe("enums", () => {
  it("'overdue' is not a member of any status union (type test)", () => {
    expectTypeOf<Extract<AnyStatus, "overdue">>().toEqualTypeOf<never>();
  });

  it("'overdue' is not a value of any lowercase vocabulary at runtime", () => {
    for (const [name, values] of Object.entries(enums)) {
      if (!Array.isArray(values) || name === "PATHWAY_STAGES") continue;
      expect(values, name).not.toContain("overdue");
    }
  });

  it("vocabularies have unique lowercase snake values (except units, pathway stages, field names)", () => {
    for (const [name, values] of Object.entries(enums)) {
      if (!Array.isArray(values)) continue;
      expect(new Set(values).size, name).toBe(values.length);
      if (["GLUCOSE_UNITS", "PATHWAY_STAGES", "AMENDABLE_SCREENING_FIELDS"].includes(name))
        continue;
      for (const value of values as string[]) expect(value, name).toMatch(/^[a-z][a-z0-9_]*$/u);
    }
  });

  it("evidence subsets partition the shared list", () => {
    expect([...enums.REFERRAL_EVIDENCE_TYPES, ...enums.WORKER_EVIDENCE_TYPES]).toEqual([
      ...enums.COMPLETION_EVIDENCE_TYPES,
    ]);
  });

  it("decision input kinds are the four action kinds plus dismiss", () => {
    expect(enums.REVIEW_DECISION_INPUT_KINDS).toEqual([...enums.REVIEW_DECISION_KINDS, "dismiss"]);
  });

  it("has 10 roles and the FRD pathway stages", () => {
    expect(enums.ROLES).toHaveLength(10);
    expect(enums.PATHWAY_STAGES[0]).toBe("DRAFT_SCREENING");
    expect(enums.PATHWAY_STAGES.at(-1)).toBe("CLOSED");
  });
});
