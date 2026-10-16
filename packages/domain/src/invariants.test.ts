import { describe, expect, it } from "vitest";

import { DomainInvariantError } from "./errors.ts";
import { asId } from "./ids.ts";
import {
  applyAmendment,
  assertAttributable,
  assertCancellationReason,
  assertCompletionEvidence,
  assertDismissalReason,
  assertNotCompletedByReminder,
  assertScreeningMutable,
  assertVersion,
  hasMinimumReason,
  updateScreeningDraft,
} from "./invariants.ts";
import { effectiveReadings } from "./derive.ts";
import { T0, makeFollowUp, makeReferral, makeScreening } from "./testing/fixtures.ts";

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    if (error instanceof DomainInvariantError) return error.code;
    throw error;
  }
  return undefined;
}

describe("assertAttributable", () => {
  const decision = {
    kind: "refer" as const,
    note: "",
    decidedBy: asId<never>("persona-clin-1"),
    decidedAt: T0,
  };

  it("accepts a decision with author and time", () => {
    expect(() => assertAttributable(decision)).not.toThrow();
  });

  it.each([
    ["null decision", null],
    ["missing author", { ...decision, decidedBy: asId<never>("  ") }],
    ["missing time", { ...decision, decidedAt: "" }],
    ["invalid time", { ...decision, decidedAt: "not-a-date" }],
  ])("rejects %s", (_label, value) => {
    expect(codeOf(() => assertAttributable(value))).toBe("DECISION_NOT_ATTRIBUTABLE");
  });
});

describe("reason minimums (★ 10 non-whitespace chars)", () => {
  it.each([null, undefined, "", "          ", "123456789", "1 2 3 4 5 6 7 8 9 \n\t"])(
    "dismissal rejects %j",
    (reason) => {
      expect(codeOf(() => assertDismissalReason(reason))).toBe("DISMISSAL_REASON_REQUIRED");
    },
  );

  it("dismissal accepts exactly 10 non-whitespace chars", () => {
    expect(() => assertDismissalReason(" 12345 67890 ")).not.toThrow();
    expect(hasMinimumReason("1234567890")).toBe(true);
  });

  it("cancellation uses the same rule", () => {
    expect(codeOf(() => assertCancellationReason("short"))).toBe("CANCELLATION_REASON_REQUIRED");
    expect(() => assertCancellationReason("Patient moved to another district")).not.toThrow();
  });
});

describe("assertCompletionEvidence", () => {
  const evidence = {
    type: "facility_attendance_record" as const,
    reference: "REG-123",
    outcome: "attended_seen" as const,
    note: "",
    recordedBy: asId<never>("persona-coord-1"),
    recordedAt: T0,
  };

  it("rejects a referral without evidence", () => {
    expect(codeOf(() => assertCompletionEvidence(makeReferral()))).toBe(
      "COMPLETION_EVIDENCE_REQUIRED",
    );
  });

  it.each([
    ["type", { ...evidence, type: "" as never }],
    ["timestamp", { ...evidence, recordedAt: "" }],
    ["recordedBy", { ...evidence, recordedBy: asId<never>("") }],
    ["outcome", { ...evidence, outcome: "" as never }],
  ])("rejects referral evidence missing %s", (_label, completionEvidence) => {
    expect(codeOf(() => assertCompletionEvidence(makeReferral({ completionEvidence })))).toBe(
      "COMPLETION_EVIDENCE_REQUIRED",
    );
  });

  it("accepts complete referral evidence", () => {
    expect(() =>
      assertCompletionEvidence(makeReferral({ completionEvidence: evidence })),
    ).not.toThrow();
  });

  const outcome = {
    kind: "attended" as const,
    occurredAt: T0,
    evidenceType: "appointment_card_seen" as const,
    reasonCode: null,
    note: "",
    recordedBy: asId<never>("persona-chw-1"),
  };

  it("rejects follow-up completion without outcome, evidence type, time or author", () => {
    const cases = [
      makeFollowUp(),
      makeFollowUp({ outcome: { ...outcome, evidenceType: null } }),
      makeFollowUp({ outcome: { ...outcome, occurredAt: "" } }),
      makeFollowUp({ outcome: { ...outcome, recordedBy: asId("") } }),
      makeFollowUp({ outcome: { ...outcome, kind: "unable_to_reach", evidenceType: null } }),
    ];
    for (const fu of cases) {
      expect(codeOf(() => assertCompletionEvidence(fu))).toBe("COMPLETION_EVIDENCE_REQUIRED");
    }
  });

  it("accepts follow-up outcomes with the required evidence", () => {
    expect(() => assertCompletionEvidence(makeFollowUp({ outcome }))).not.toThrow();
    expect(() =>
      assertCompletionEvidence(
        makeFollowUp({
          outcome: {
            ...outcome,
            kind: "unable_to_reach",
            evidenceType: null,
            reasonCode: "moved_away",
          },
        }),
      ),
    ).not.toThrow();
    expect(() =>
      assertCompletionEvidence(
        makeFollowUp({ outcome: { ...outcome, kind: "declined", evidenceType: null } }),
      ),
    ).not.toThrow();
  });
});

describe("screening immutability and amendments", () => {
  it("allows editing a draft through updateScreeningDraft", () => {
    const draft = makeScreening({ status: "draft" });
    const next = updateScreeningDraft(draft, { systolic: 140 }, "2026-10-14T07:00:00.000Z");
    expect(next.systolic).toBe(140);
    expect(next.version).toBe(2);
    expect(draft.systolic).toBe(130);
  });

  it.each(["submitted", "review_required", "no_review_required"] as const)(
    "rejects in-place edits of a %s screening",
    (status) => {
      const screening = makeScreening({ status });
      expect(codeOf(() => assertScreeningMutable(screening))).toBe("SCREENING_IMMUTABLE");
      expect(codeOf(() => updateScreeningDraft(screening, { systolic: 1 }, T0))).toBe(
        "SCREENING_IMMUTABLE",
      );
    },
  );

  const amendment = {
    id: asId<never>("amd-1"),
    field: "systolic" as const,
    after: 128,
    reason: "Transcription error on paper form",
    amendedBy: asId<never>("persona-clin-1"),
    amendedAt: "2026-10-14T08:00:00.000Z",
  };

  it("appends an amendment, keeping the original value in before", () => {
    const original = makeScreening({ status: "review_required", systolic: 182 });
    const amended = applyAmendment(original, amendment);
    expect(amended.systolic).toBe(182);
    expect(amended.amendments).toHaveLength(1);
    expect(amended.amendments[0]).toMatchObject({ field: "systolic", before: 182, after: 128 });
    expect(amended.version).toBe(original.version + 1);
    expect(amended.updatedAt).toBe(amendment.amendedAt);
    expect(effectiveReadings(amended).systolic).toBe(128);
    expect(original.amendments).toHaveLength(0);

    const twice = applyAmendment(amended, { ...amendment, id: asId("amd-2"), after: 126 });
    expect(twice.amendments.map((a) => [a.before, a.after])).toEqual([
      [182, 128],
      [128, 126],
    ]);
  });

  it("requires a reason, attribution and a non-draft screening", () => {
    const submitted = makeScreening();
    expect(codeOf(() => applyAmendment(submitted, { ...amendment, reason: "typo" }))).toBe(
      "AMENDMENT_REASON_REQUIRED",
    );
    expect(codeOf(() => applyAmendment(submitted, { ...amendment, amendedAt: "" }))).toBe(
      "DECISION_NOT_ATTRIBUTABLE",
    );
    expect(codeOf(() => applyAmendment(makeScreening({ status: "draft" }), amendment))).toBe(
      "AMENDMENT_NOT_APPLICABLE",
    );
  });
});

describe("assertVersion", () => {
  it("passes on a matching version and throws STALE_VERSION otherwise", () => {
    expect(() => assertVersion({ version: 3 }, 3)).not.toThrow();
    try {
      assertVersion({ version: 4 }, 3);
      expect.unreachable();
    } catch (error) {
      expect(error).toMatchObject({
        code: "STALE_VERSION",
        details: { expectedVersion: 3, currentVersion: 4 },
      });
    }
  });
});

describe("assertNotCompletedByReminder", () => {
  it.each(["referral", "follow_up"] as const)(
    "blocks reminder-triggered %s transitions",
    (entityType) => {
      expect(
        codeOf(() =>
          assertNotCompletedByReminder({ trigger: "reminder", entityType, to: "completed" }),
        ),
      ).toBe("REMINDER_CANNOT_TRANSITION");
    },
  );

  it("allows user actions and reminder changes on reminders themselves", () => {
    expect(() =>
      assertNotCompletedByReminder({
        trigger: "user_action",
        entityType: "referral",
        to: "completed",
      }),
    ).not.toThrow();
    expect(() =>
      assertNotCompletedByReminder({ trigger: "reminder", entityType: "reminder" }),
    ).not.toThrow();
  });
});
