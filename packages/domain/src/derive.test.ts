import { describe, expect, it } from "vitest";

import {
  deriveDatePassed,
  deriveInstructionProgress,
  derivePathwayStage,
  deriveSyncState,
  effectiveReadings,
  isFollowUpOverdue,
  isReferralOverdue,
  type PathwayInput,
} from "./derive.ts";
import type { ClinicianConfirmationState, FollowUpStatus, ReferralStatus } from "./enums.ts";
import { asId } from "./ids.ts";
import { applyAmendment } from "./invariants.ts";
import { T0, makeFollowUp, makeReferral, makeScreening } from "./testing/fixtures.ts";

const now = new Date(T0);
const PAST = "2026-10-13T06:00:00.000Z";
const FUTURE = "2026-10-15T06:00:00.000Z";

describe("isFollowUpOverdue", () => {
  it("is true only for incomplete follow-ups with dueAt strictly before now", () => {
    expect(isFollowUpOverdue({ status: "assigned", dueAt: PAST }, now)).toBe(true);
    expect(isFollowUpOverdue({ status: "unable_to_reach", dueAt: PAST }, now)).toBe(true);
    expect(isFollowUpOverdue({ status: "completed", dueAt: PAST }, now)).toBe(false);
    expect(isFollowUpOverdue({ status: "assigned", dueAt: FUTURE }, now)).toBe(false);
  });

  it("boundary: dueAt === now is not overdue", () => {
    expect(isFollowUpOverdue({ status: "assigned", dueAt: T0 }, now)).toBe(false);
  });
});

describe("isReferralOverdue", () => {
  it.each<[ReferralStatus, boolean]>([
    ["created", true],
    ["accepted", true],
    ["scheduled", true],
    ["completed", false],
    ["cancelled_with_reason", false],
  ])("%s past due → %s", (status, expected) => {
    expect(isReferralOverdue({ status, dueAt: PAST }, now)).toBe(expected);
  });

  it("boundary: dueAt === now is not overdue", () => {
    expect(isReferralOverdue({ status: "created", dueAt: T0 }, now)).toBe(false);
  });
});

describe("effectiveReadings", () => {
  it("returns originals when there are no amendments", () => {
    const readings = effectiveReadings(makeScreening());
    expect(readings).toMatchObject({ systolic: 130, glucoseUnit: "mmol/L", amendedFields: [] });
  });

  it("applies amendments in order and keeps originals on the screening", () => {
    let screening = makeScreening({ glucoseUnit: null, glucoseValue: 120, source: "imported" });
    const common = {
      reason: "Unit confirmed with worker by phone",
      amendedBy: asId<never>("persona-clin-1"),
      amendedAt: T0,
    };
    screening = applyAmendment(screening, {
      ...common,
      id: asId("a1"),
      field: "glucoseUnit",
      after: "mg/dL",
    });
    screening = applyAmendment(screening, {
      ...common,
      id: asId("a2"),
      field: "glucoseValue",
      after: 121,
    });
    screening = applyAmendment(screening, {
      ...common,
      id: asId("a3"),
      field: "glucoseValue",
      after: 122,
    });
    const readings = effectiveReadings(screening);
    expect(readings.glucoseUnit).toBe("mg/dL");
    expect(readings.glucoseValue).toBe(122);
    expect(readings.amendedFields).toEqual(["glucoseUnit", "glucoseValue"]);
    expect(screening.glucoseUnit).toBeNull();
    expect(screening.glucoseValue).toBe(120);
  });
});

describe("deriveInstructionProgress", () => {
  const released = { status: "released" as const };

  it("withdrawn instructions are cancelled", () => {
    expect(deriveInstructionProgress({ status: "withdrawn" }, makeReferral())).toBe("cancelled");
  });

  it.each<[ReferralStatus, string]>([
    ["created", "planned"],
    ["accepted", "planned"],
    ["scheduled", "planned"],
    ["completed", "completed"],
    ["cancelled_with_reason", "cancelled"],
  ])("referral %s → %s", (status, expected) => {
    expect(deriveInstructionProgress(released, makeReferral({ status }))).toBe(expected);
  });

  it("follow-up progress follows status and outcome", () => {
    expect(deriveInstructionProgress(released, makeFollowUp())).toBe("planned");
    const outcome = {
      occurredAt: T0,
      evidenceType: null,
      reasonCode: null,
      note: "",
      recordedBy: asId<never>("p"),
    };
    expect(
      deriveInstructionProgress(
        released,
        makeFollowUp({ status: "completed", outcome: { ...outcome, kind: "attended" } }),
      ),
    ).toBe("completed");
    expect(
      deriveInstructionProgress(
        released,
        makeFollowUp({ status: "completed", outcome: { ...outcome, kind: "declined" } }),
      ),
    ).toBe("cancelled");
    expect(
      deriveInstructionProgress(
        released,
        makeFollowUp({ status: "completed", outcome: { ...outcome, kind: "unable_to_reach" } }),
      ),
    ).toBe("cancelled");
  });

  it("review / missing source → planned", () => {
    expect(deriveInstructionProgress(released, null)).toBe("planned");
    expect(
      deriveInstructionProgress(released, {
        status: "action_recorded",
        evidenceSnapshot: {} as never,
      }),
    ).toBe("planned");
  });
});

describe("deriveDatePassed", () => {
  it("is true only for planned steps whose date is strictly past", () => {
    expect(deriveDatePassed(PAST, "planned", now)).toBe(true);
    expect(deriveDatePassed(T0, "planned", now)).toBe(false);
    expect(deriveDatePassed(FUTURE, "planned", now)).toBe(false);
    expect(deriveDatePassed(PAST, "completed", now)).toBe(false);
    expect(deriveDatePassed(PAST, "cancelled", now)).toBe(false);
    expect(deriveDatePassed(null, "planned", now)).toBe(false);
  });
});

describe("deriveSyncState", () => {
  const op = (
    status: Parameters<typeof deriveSyncState>[1][number]["status"],
    localSeq: number,
    entityId = "e1",
  ) => ({
    entityId,
    status,
    localSeq,
  });

  it("is synced with no ops or only acknowledged ops", () => {
    expect(deriveSyncState("e1", [])).toBe("synced");
    expect(deriveSyncState("e1", [op("acknowledged", 1), op("queued", 2, "other")])).toBe("synced");
  });

  it.each([
    [[op("queued", 1)], "saved_locally"],
    [[op("retryable_failure", 1)], "saved_locally"],
    [[op("acknowledged", 1), op("sending", 2), op("queued", 3)], "syncing"],
    [[op("conflict", 1), op("sending", 2)], "conflict"],
    [[op("needs_resolution", 1)], "conflict"],
    [[op("blocked_revoked", 1), op("queued", 2)], "blocked"],
    [[op("rejected", 1)], "rejected"],
    [[op("rejected", 1), op("acknowledged", 2)], "synced"],
    [[op("superseded", 1), op("acknowledged", 2)], "synced"],
  ] as const)("%j → %s", (ops, expected) => {
    expect(deriveSyncState("e1", ops)).toBe(expected);
  });
});

describe("derivePathwayStage", () => {
  const decision = (
    kind: "refer" | "plan_follow_up" | "no_further_action" | "request_repeat_screening",
  ) => ({
    kind,
    note: "",
    decidedBy: asId<never>("c"),
    decidedAt: T0,
  });
  const decided = { status: "action_recorded" as const, decision: decision("refer") };
  const ref = (status: ReferralStatus, dueAt = FUTURE) => ({ status, dueAt });
  const fu = (
    status: FollowUpStatus,
    confirmation: ClinicianConfirmationState = "not_required",
    dueAt = FUTURE,
  ) => ({ status, dueAt, clinicianConfirmation: { status: confirmation } });
  const stage = (input: Partial<PathwayInput>) =>
    derivePathwayStage(
      { screening: { status: "review_required" }, referrals: [], followUps: [], ...input },
      now,
    );

  it("maps screening states", () => {
    expect(stage({ screening: { status: "draft" } })).toBe("DRAFT_SCREENING");
    expect(stage({ screening: { status: "submitted" } })).toBe("RECORDED");
    expect(stage({ screening: { status: "no_review_required" } })).toBe("NO_REVIEW_REQUIRED");
  });

  it("maps review states", () => {
    expect(stage({})).toBe("REVIEW_REQUIRED");
    expect(stage({ review: null })).toBe("REVIEW_REQUIRED");
    expect(stage({ review: { status: "pending", decision: null } })).toBe("REVIEW_REQUIRED");
    expect(stage({ review: { status: "in_review", decision: null } })).toBe("REVIEW_REQUIRED");
    expect(stage({ review: { status: "dismissed_with_reason", decision: null } })).toBe(
      "CLOSED_WITH_REASON",
    );
  });

  it("maps downstream referral / follow-up states", () => {
    expect(stage({ review: decided })).toBe("REVIEWED");
    expect(stage({ review: { ...decided, decision: decision("no_further_action") } })).toBe(
      "CLOSED",
    );
    expect(stage({ review: decided, referrals: [ref("accepted")] })).toBe("REFERRAL_OPEN");
    expect(stage({ review: decided, referrals: [ref("scheduled", PAST)] })).toBe("OVERDUE");
    expect(stage({ review: decided, followUps: [fu("assigned")] })).toBe("FOLLOW_UP_PLANNED");
    expect(stage({ review: decided, followUps: [fu("contacted", "not_required", PAST)] })).toBe(
      "OVERDUE",
    );
    expect(
      stage({
        review: decided,
        referrals: [ref("completed")],
        followUps: [fu("completed", "pending")],
      }),
    ).toBe("FOLLOW_UP_COMPLETED");
    expect(stage({ review: decided, followUps: [fu("completed", "confirmed")] })).toBe("CLOSED");
    expect(stage({ review: decided, referrals: [ref("completed", PAST)] })).toBe("CLOSED");
    expect(stage({ review: decided, referrals: [ref("cancelled_with_reason", PAST)] })).toBe(
      "CLOSED_WITH_REASON",
    );
  });
});
