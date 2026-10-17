// @vitest-environment node
/**
 * HWM-08 tasks 2–3: outcome rules (evidence for attended / referred onward, unsuccessful attempt
 * + reason for unable to reach, Other needs text) and the client transition guard.
 */
import { FollowUpUpdateInputSchema, vMsg } from "@laif/contracts";
import type { ContactAttempt, FollowUp } from "@laif/domain";
import { describe, expect, it } from "vitest";

import {
  initialOutcomeValues,
  outcomeGuard,
  outcomeIssues,
  taskBlock,
  toOutcomeCall,
  type OutcomeFormValues,
} from "../outcomeSchema.ts";

const NOW = new Date("2026-10-14T06:00:00.000Z");
const deps = (hasUnsuccessfulAttempt = true) => ({
  now: () => NOW,
  createdAt: "2026-10-01T08:00:00.000Z",
  hasUnsuccessfulAttempt,
});
const values = (patch: Partial<OutcomeFormValues>): OutcomeFormValues => ({
  ...initialOutcomeValues(NOW),
  ...patch,
});
const fields = (v: OutcomeFormValues, unsuccessful = true) =>
  outcomeIssues(v, deps(unsuccessful)).map((i) => [i.field, i.message]);

const attempt = (result: ContactAttempt["result"], at: string) =>
  ({ id: `a-${at}`, at, method: "home_visit", result, note: "", durationMinutes: null }) as never;
type G = Pick<FollowUp, "status" | "attempts" | "outcome">;
const task = (patch: Partial<G> = {}): G => ({
  status: "assigned",
  attempts: [],
  outcome: null,
  ...patch,
});

describe("outcomeSchema (HWM-08)", () => {
  it("initial: no outcome selected → only 'required' on the outcome", () => {
    expect(fields(initialOutcomeValues(NOW))).toEqual([["outcome", vMsg("required")]]);
  });

  it("attended without evidence type or occurred-at cannot be saved (T-03)", () => {
    expect(fields(values({ outcome: "attended", occurredAt: null }))).toEqual([
      ["occurredAt", vMsg("required")],
      ["evidenceType", vMsg("followUpEvidenceRequired")],
    ]);
    expect(
      fields(values({ outcome: "attended", evidenceType: "facility_register_checked" })),
    ).toEqual([]);
    expect(
      fields(
        values({
          outcome: "attended",
          evidenceType: "facility_register_checked",
          occurredAt: "2026-10-14T06:06:00.000Z",
        }),
      ),
    ).toEqual([["occurredAt", vMsg("dateInFuture")]]);
  });

  it("referred onward needs evidence too", () => {
    expect(fields(values({ outcome: "referred_onward" }))).toEqual([
      ["evidenceType", vMsg("followUpEvidenceRequired")],
    ]);
  });

  it("unable to reach: reason required; Other needs text; no unsuccessful attempt → blocked", () => {
    expect(fields(values({ outcome: "unable_to_reach" }))).toEqual([
      ["reasonCode", vMsg("required")],
    ]);
    expect(fields(values({ outcome: "unable_to_reach", reasonCode: "other" }))).toEqual([
      ["reasonText", vMsg("required")],
    ]);
    expect(
      fields(values({ outcome: "unable_to_reach", reasonCode: "other", reasonText: "Gone" })),
    ).toEqual([]);
    // No not_reached attempt on the task: the inline attempt is required…
    expect(fields(values({ outcome: "unable_to_reach", reasonCode: "moved_away" }), false)).toEqual(
      [["inlineAttempt", vMsg("attemptRequired")]],
    );
    // …with its method.
    expect(
      fields(
        values({ outcome: "unable_to_reach", reasonCode: "moved_away", inlineAttempt: true }),
        false,
      ),
    ).toEqual([["inlineMethod", vMsg("required")]]);
    expect(
      fields(
        values({
          outcome: "unable_to_reach",
          reasonCode: "moved_away",
          inlineAttempt: true,
          inlineMethod: "phone",
        }),
        false,
      ),
    ).toEqual([]);
  });

  it("maps to valid FND-03 record_outcome inputs (evidence only where needed, Other text in note)", () => {
    const ids = {
      followUpId: "0976e711-6a18-54f8-8984-ed116a248c86",
      idempotencyKey: "0976e711-6a18-44f8-8984-ed116a248c86",
    };
    const attended = toOutcomeCall(
      values({ outcome: "attended", evidenceType: "appointment_card_seen", note: " ok " }),
      ids.followUpId,
      3,
    );
    expect(attended).toMatchObject({
      action: "record_outcome",
      outcome: "attended",
      expectedVersion: 3,
      evidenceType: "appointment_card_seen",
      note: "ok",
    });
    expect(attended).not.toHaveProperty("reasonCode");
    const unable = toOutcomeCall(
      values({
        outcome: "unable_to_reach",
        reasonCode: "other",
        reasonText: "Family relocated",
        evidenceType: "appointment_card_seen",
        note: "Neighbour confirmed",
      }),
      ids.followUpId,
      2,
    );
    expect(unable).toMatchObject({
      reasonCode: "other",
      note: "Family relocated\nNeighbour confirmed",
    });
    expect(unable).not.toHaveProperty("evidenceType");
    for (const call of [attended, unable]) {
      expect(FollowUpUpdateInputSchema.safeParse({ ...call, ...ids }).success).toBe(true);
    }
  });
});

describe("outcomeGuard (HWM-08 task 3)", () => {
  it("rejects any outcome on a completed task", () => {
    const done = task({ status: "completed" });
    expect(outcomeGuard(done, "attended")).toBe("completed");
    expect(outcomeGuard(done, "unable_to_reach")).toBe("completed");
    expect(taskBlock(done)).toBe("completed");
  });

  it("attended on unable_to_reach needs a reached attempt newer than that outcome", () => {
    const outcome = {
      kind: "unable_to_reach",
      occurredAt: "2026-10-12T06:00:00.000Z",
    } as FollowUp["outcome"];
    const utr = task({
      status: "unable_to_reach",
      outcome,
      attempts: [attempt("reached", "2026-10-10T06:00:00.000Z")],
    });
    expect(outcomeGuard(utr, "attended")).toBe("needs_reached_attempt");
    expect(outcomeGuard(utr, "unable_to_reach")).toBe("already_unable_to_reach");
    expect(outcomeGuard(utr, "referred_onward")).toBe("not_allowed");
    const reachedLater = {
      ...utr,
      attempts: [...utr.attempts, attempt("reached", "2026-10-13T06:00:00.000Z")],
    };
    expect(outcomeGuard(reachedLater, "attended")).toBeNull();
    expect(taskBlock(reachedLater)).toBeNull();
  });

  it("open tasks allow every outcome; referred onward only once", () => {
    for (const status of ["assigned", "contacted", "reassigned"] as const) {
      expect(outcomeGuard(task({ status }), "attended")).toBeNull();
      expect(outcomeGuard(task({ status }), "referred_onward")).toBeNull();
      expect(outcomeGuard(task({ status }), "unable_to_reach")).toBeNull();
    }
    const onward = task({
      status: "contacted",
      outcome: { kind: "referred_onward" } as FollowUp["outcome"],
    });
    expect(outcomeGuard(onward, "referred_onward")).toBe("already_referred_onward");
    expect(outcomeGuard(onward, "attended")).toBeNull();
  });
});
