import { createDemoClock, isFollowUpOverdue, isReferralOverdue } from "@laif/domain";
import { createSeed } from "@laif/mock-data";
import { describe, expect, it } from "vitest";

import { kigaliDate, kigaliIsoWeekStart } from "../filters.ts";
import { median } from "./shared.ts";
import { timeliness } from "./timeliness.ts";

const seed = createSeed();
const now = createDemoClock().now();

describe("timeliness", () => {
  const t = timeliness(seed, {}, now);

  it("median days measuredAt → reviewedAt equals a naive computation (1 dp)", () => {
    const days = seed.reviews
      .filter(
        (r) => ["action_recorded", "dismissed_with_reason"].includes(r.status) && r.reviewedAt,
      )
      .map((r) => {
        const s = seed.screenings.find((x) => x.id === r.screeningId)!;
        return (Date.parse(r.reviewedAt!) - Date.parse(s.measuredAt)) / 86_400_000;
      });
    expect(days).toHaveLength(15);
    expect(t.reviewsCompleted).toBe(15);
    expect(t.medianDaysToReview).toBe(Math.round(median(days)! * 10) / 10);
  });

  it("counts past-due referrals and follow-ups with the FND-02 derive helpers", () => {
    expect(t.overdueReferrals).toBe(seed.referrals.filter((r) => isReferralOverdue(r, now)).length);
    expect(t.overdueFollowUps).toBe(seed.followUps.filter((f) => isFollowUpOverdue(f, now)).length);
    expect(t.overdueReferrals).toBeGreaterThan(0);
    // Past due depends on the demo clock: far in the past nothing is due yet.
    const early = timeliness(seed, {}, new Date("2020-01-01T00:00:00.000Z"));
    expect(early.overdueReferrals).toBe(0);
    expect(early.overdueFollowUps).toBe(0);
  });

  it("weekly buckets are contiguous Kigali ISO weeks (Mondays) whose sums match", () => {
    expect(t.weekly.length).toBeGreaterThan(0);
    for (const [i, w] of t.weekly.entries()) {
      expect(new Date(`${w.weekStart}T00:00:00Z`).getUTCDay()).toBe(1);
      if (i > 0) {
        const prev = Date.parse(`${t.weekly[i - 1]!.weekStart}T00:00:00Z`);
        expect(Date.parse(`${w.weekStart}T00:00:00Z`) - prev).toBe(7 * 86_400_000);
      }
    }
    expect(t.weekly.reduce((n, w) => n + w.screeningsRecorded, 0)).toBe(57);
    expect(t.weekly.reduce((n, w) => n + w.screeningsFlagged, 0)).toBe(20);
    expect(t.weekly.reduce((n, w) => n + w.reviewsCompleted, 0)).toBe(15);
  });

  it("a date-range filter fixes the week span, including empty weeks", () => {
    const r = timeliness(seed, { from: "2026-09-01", to: "2026-09-30" }, now);
    expect(r.weekly[0]!.weekStart).toBe("2026-08-31");
    expect(r.weekly.at(-1)!.weekStart).toBe("2026-09-28");
    expect(r.weekly).toHaveLength(5);
  });

  it("is deterministic given the demo clock", () => {
    expect(timeliness(createSeed(), {}, createDemoClock().now())).toEqual(t);
  });
});

describe("Kigali calendar helpers", () => {
  it("uses UTC+2 for the calendar day and ISO week", () => {
    expect(kigaliDate("2026-10-14T21:59:59.999Z")).toBe("2026-10-14");
    expect(kigaliDate("2026-10-14T22:00:00.000Z")).toBe("2026-10-15");
    // Sunday 18 Oct 22:30Z is Monday 19 Oct in Kigali → new ISO week.
    expect(kigaliIsoWeekStart("2026-10-18T21:30:00.000Z")).toBe("2026-10-12");
    expect(kigaliIsoWeekStart("2026-10-18T22:30:00.000Z")).toBe("2026-10-19");
    expect(() => kigaliDate("not a date")).toThrow(RangeError);
  });
});
