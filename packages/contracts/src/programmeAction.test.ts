import { describe, expect, it } from "vitest";

import { parseValidationMessage } from "./messages.ts";
import {
  createProgrammeActionInputSchema,
  createProgrammeActionUpdateInputSchema,
  isTerminalProgrammeActionStatus,
  programmeActionDueWindow,
  ProgrammeActionInputSchema,
} from "./programmeAction.ts";

const KEY = "3f1c2a9e-8b7d-4c6e-9a1b-2d3e4f5a6b7c";
// 08:00 Kigali, 14 Oct 2026.
const now = () => new Date("2026-10-14T06:00:00.000Z");

const valid = {
  idempotencyKey: KEY,
  facilityId: "fac-alpha-1",
  category: "supervision_visit",
  title: "Supervision visit",
  dueDate: "2026-10-20",
  sourceContext: { page: "funnel_stage", stage: "reviewed", filters: { preset: "90d" } },
};

const keyOf = (issues: { path: PropertyKey[]; message: string }[], field: string) =>
  parseValidationMessage(issues.find((i) => i.path[0] === field)?.message ?? "")?.key;

describe("ProgrammeAction input (ADM-03)", () => {
  const schema = createProgrammeActionInputSchema({ now });

  it("accepts a valid input; note defaults to empty", () => {
    const parsed = schema.parse(valid);
    expect(parsed).toMatchObject({ title: "Supervision visit", note: "" });
  });

  it("category is required; title 5–120; note ≤ 500", () => {
    const r = schema.safeParse({
      ...valid,
      category: undefined,
      title: "abc",
      note: "x".repeat(501),
    });
    expect(r.success).toBe(false);
    const issues = r.error?.issues ?? [];
    expect(keyOf(issues, "category")).toBe("required");
    expect(keyOf(issues, "title")).toBe("tooShort");
    expect(keyOf(issues, "note")).toBe("tooLong");
    expect(
      keyOf(schema.safeParse({ ...valid, title: "x".repeat(121) }).error?.issues ?? [], "title"),
    ).toBe("tooLong");
  });

  it("dueDate is between demo today (Kigali) and +180 days", () => {
    expect(programmeActionDueWindow(now())).toEqual({ from: "2026-10-14", to: "2027-04-12" });
    expect(schema.safeParse({ ...valid, dueDate: "2026-10-14" }).success).toBe(true);
    expect(schema.safeParse({ ...valid, dueDate: "2027-04-12" }).success).toBe(true);
    for (const dueDate of ["2026-10-13", "2027-04-13"]) {
      const issue = schema.safeParse({ ...valid, dueDate }).error?.issues[0];
      expect(parseValidationMessage(issue?.message ?? "")).toEqual({
        key: "dateOutOfRange",
        params: { from: "2026-10-14", to: "2027-04-12" },
      });
    }
    // Without a clock only the type is checked.
    expect(ProgrammeActionInputSchema.safeParse({ ...valid, dueDate: "2020-01-01" }).success).toBe(
      true,
    );
  });

  it("update: cancelling needs a ≥10-char reason; an empty patch is rejected", () => {
    const update = createProgrammeActionUpdateInputSchema({ now });
    const base = { idempotencyKey: KEY, id: "pa-1", expectedVersion: 1 };
    expect(update.safeParse({ ...base, status: "in_progress" }).success).toBe(true);
    const missing = update.safeParse({ ...base, status: "cancelled_with_reason" });
    expect(keyOf(missing.error?.issues ?? [], "statusReason")).toBe("required");
    const short = update.safeParse({
      ...base,
      status: "cancelled_with_reason",
      statusReason: "too short",
    });
    expect(keyOf(short.error?.issues ?? [], "statusReason")).toBe("reasonTooShort");
    expect(
      update.safeParse({
        ...base,
        status: "cancelled_with_reason",
        statusReason: "Facility already completed the check",
      }).success,
    ).toBe(true);
    expect(
      parseValidationMessage(update.safeParse(base).error?.issues[0]?.message ?? "")?.key,
    ).toBe("noChanges");
  });

  it("terminal statuses", () => {
    expect(isTerminalProgrammeActionStatus("done")).toBe(true);
    expect(isTerminalProgrammeActionStatus("cancelled_with_reason")).toBe(true);
    expect(isTerminalProgrammeActionStatus("open")).toBe(false);
  });
});
