// @vitest-environment node
/** HWM-08 task 1: attempt form rules (time window, method, result, note ≤ 300) → FND-03 input. */
import { FollowUpUpdateInputSchema, vMsg } from "@laif/contracts";
import { describe, expect, it } from "vitest";

import {
  attemptIssues,
  initialAttemptValues,
  toAttemptCall,
  type AttemptFormValues,
} from "../attemptSchema.ts";

const NOW = new Date("2026-10-14T06:00:00.000Z");
const deps = { now: () => NOW, createdAt: "2026-10-01T08:00:00.000Z" };
const MIN = 60_000;
const at = (offsetMs: number) => new Date(NOW.getTime() + offsetMs).toISOString();

const valid = (patch: Partial<AttemptFormValues> = {}): AttemptFormValues => ({
  ...initialAttemptValues(NOW),
  method: "home_visit",
  result: "not_reached",
  ...patch,
});

describe("attemptSchema (HWM-08)", () => {
  it("defaults the time to the demo now; method and result are required", () => {
    const initial = initialAttemptValues(NOW);
    expect(initial.attemptedAt).toBe(NOW.toISOString());
    expect(attemptIssues(initial, deps)).toEqual([
      { field: "method", message: vMsg("required") },
      { field: "result", message: vMsg("required") },
    ]);
    expect(attemptIssues(valid(), deps)).toEqual([]);
  });

  it("time: required, ≤ now + 5 min, not before the task was created", () => {
    expect(attemptIssues(valid({ attemptedAt: null }), deps)[0]).toEqual({
      field: "attemptedAt",
      message: vMsg("required"),
    });
    expect(attemptIssues(valid({ attemptedAt: at(5 * MIN) }), deps)).toEqual([]);
    expect(attemptIssues(valid({ attemptedAt: at(5 * MIN + 1000) }), deps)[0]?.message).toBe(
      vMsg("dateInFuture"),
    );
    expect(
      attemptIssues(valid({ attemptedAt: "2026-09-30T08:00:00.000Z" }), deps)[0]?.message,
    ).toBe(vMsg("dateBeforeTaskCreated"));
  });

  it("note is optional, at most 300 characters", () => {
    expect(attemptIssues(valid({ note: "x".repeat(300) }), deps)).toEqual([]);
    expect(attemptIssues(valid({ note: "x".repeat(301) }), deps)).toEqual([
      { field: "note", message: vMsg("tooLong", { max: 300 }) },
    ]);
  });

  it("maps to a valid FND-03 record_attempt against the opened version", () => {
    const call = toAttemptCall(valid({ note: "  Neighbour says at market  " }), {
      id: "fu-1",
      version: 4,
    });
    expect(call).toEqual({
      followUpId: "fu-1",
      expectedVersion: 4,
      action: "record_attempt",
      at: NOW.toISOString(),
      method: "home_visit",
      result: "not_reached",
      note: "Neighbour says at market",
    });
    expect(
      FollowUpUpdateInputSchema.safeParse({
        ...call,
        followUpId: "0976e711-6a18-54f8-8984-ed116a248c86",
        idempotencyKey: "0976e711-6a18-44f8-8984-ed116a248c86",
      }).success,
    ).toBe(true);
    expect(toAttemptCall(valid(), { id: "fu-1", version: 1 })).not.toHaveProperty("note");
  });
});
