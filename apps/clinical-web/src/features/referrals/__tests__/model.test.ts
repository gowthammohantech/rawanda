/** CLN-08 referral model: URL params, tab predicates, allowed actions by capability, KPIs. */
import type { Referral } from "@laif/domain";
import { createSeed, FACILITY_IDS } from "@laif/mock-data";
import { describe, expect, it } from "vitest";

import {
  allowedActions,
  completedThisMonth,
  matchesTab,
  medianDaysToCompletion,
  parseReferralParams,
  patchReferralParams,
  tabFilter,
} from "../model.ts";

const NOW = "2026-10-14T06:00:00.000Z";
const base = createSeed().referrals[0] as Referral;
const ref = (over: Partial<Referral>): Referral => ({ ...base, ...over });
const ALL = { manage: true, complete: true };

describe("referral model", () => {
  it("parses ?tab=&facility=&q=&id= with safe defaults", () => {
    const ids = [FACILITY_IDS.alpha1, FACILITY_IDS.alpha2];
    expect(parseReferralParams(new URLSearchParams("tab=nope&facility=x&q=%20a%20"), ids)).toEqual({
      tab: "open",
      facility: null,
      q: "a",
      id: null,
    });
    expect(
      parseReferralParams(new URLSearchParams(`tab=overdue&facility=${ids[1]}&id=r1`), ids),
    ).toEqual({ tab: "overdue", facility: ids[1], q: "", id: "r1" });
    expect(
      patchReferralParams(new URLSearchParams("tab=all&id=r1"), {
        tab: "open",
        id: null,
      }).toString(),
    ).toBe("");
  });

  it("overdue is derived from dueAt only and never for terminal referrals", () => {
    const now = new Date(NOW);
    const past = "2026-10-01T06:00:00.000Z";
    expect(matchesTab(ref({ status: "scheduled", dueAt: past }), "overdue", now)).toBe(true);
    expect(matchesTab(ref({ status: "completed", dueAt: past }), "overdue", now)).toBe(false);
    expect(matchesTab(ref({ status: "created", dueAt: NOW }), "overdue", now)).toBe(false);
    expect(tabFilter("overdue")).toEqual({ overdueOnly: true });
    expect(tabFilter("open")).toEqual({ statuses: ["created", "accepted", "scheduled"] });
  });

  it("only the legal next transitions, by capability", () => {
    expect(allowedActions("created", ALL)).toEqual(["accept", "edit", "cancel"]);
    expect(allowedActions("accepted", ALL)).toEqual(["schedule", "edit", "cancel"]);
    expect(allowedActions("scheduled", ALL)).toEqual(["complete", "edit", "cancel"]);
    expect(allowedActions("completed", ALL)).toEqual([]);
    expect(allowedActions("cancelled_with_reason", ALL)).toEqual([]);
    expect(allowedActions("scheduled", { manage: false, complete: true })).toEqual(["complete"]);
    expect(allowedActions("scheduled", { manage: true, complete: false })).toEqual([
      "edit",
      "cancel",
    ]);
    expect(allowedActions("created", { manage: false, complete: false })).toEqual([]);
  });

  it("KPIs: completed this Kigali month and median days", () => {
    const done = (requestedAt: string, completedAt: string) =>
      ref({ status: "completed", requestedAt, completedAt });
    const rows = [
      done("2026-10-01T06:00:00.000Z", "2026-10-03T06:00:00.000Z"),
      done("2026-10-01T06:00:00.000Z", "2026-10-05T06:00:00.000Z"),
      // 30 Sep 23:00 UTC = 1 Oct 01:00 Kigali → this month.
      done("2026-09-20T06:00:00.000Z", "2026-09-30T23:00:00.000Z"),
      done("2026-09-01T06:00:00.000Z", "2026-09-10T06:00:00.000Z"),
    ];
    expect(completedThisMonth(rows, NOW)).toBe(3);
    expect(medianDaysToCompletion(rows)).toBe(6.5);
    expect(medianDaysToCompletion([])).toBeNull();
  });
});
