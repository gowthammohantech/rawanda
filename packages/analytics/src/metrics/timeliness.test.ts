import { createDemoClock, isFollowUpOverdue, isReferralOverdue } from "@laif/domain";
import {
  adminMetricsFixture,
  ADMIN_METRICS_FIXTURE_NOW,
  ADMIN_METRICS_FIXTURE_PERIOD,
  createSeed,
  DISTRICT_IDS,
  FACILITY_IDS,
  sliceForApp,
} from "@laif/mock-data";
import { describe, expect, it } from "vitest";

import { filterDataset, type MetricsRecords } from "../dataset.ts";
import { kigaliDate, kigaliIsoWeekStart } from "../filters.ts";
import { needsAttention } from "./screening-overview.ts";
import { median } from "./shared.ts";
import {
  medianDaysByFacility,
  medianDaysToReferralCompletion,
  medianDaysToReview,
  OVERDUE_TREND_WEEKS,
  overdueSnapshot,
  p90DaysToReview,
  pendingAgeBucketOf,
  pendingAgeBuckets,
  pendingReviews,
  percentile,
  percentileValue,
  referralCompletionDelaysDays,
  reviewDelaysDays,
  timeliness,
  weeklyMedianDaysToReview,
  weeklyOverdueTrend,
} from "./timeliness.ts";

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

// ── ADM-04 ──────────────────────────────────────────────────────────────────

describe("ADM-04 percentile (linear interpolation between closest ranks)", () => {
  it("n = 1, 2, 5, 10 and the empty list", () => {
    expect(percentile([], 50)).toBeNull();
    expect(percentile([3], 50)).toBe(3);
    expect(percentile([3], 90)).toBe(3);
    // n = 2: h = 0.5 (p50) → midway; h = 0.9 (p90) → 1 + 0.9 × (3 − 1) = 2.8.
    expect(percentile([3, 1], 50)).toBe(2);
    expect(percentile([1, 3], 90)).toBeCloseTo(2.8, 10);
    // n = 5: h = 2 (p50) → x[2]; h = 3.6 (p90) → 2 + 0.6 × (4 − 2) = 3.2.
    expect(percentile([4, 0.5, 2, 1, 1.5], 50)).toBe(1.5);
    expect(percentile([0.5, 1, 1.5, 2, 4], 90)).toBeCloseTo(3.2, 10);
    // n = 10 (1…10): p50 h = 4.5 → 5.5; p90 h = 8.1 → 9.1; p0 / p100 are the extremes.
    const ten = Array.from({ length: 10 }, (_, i) => 10 - i);
    expect(percentile(ten, 50)).toBe(5.5);
    expect(percentile(ten, 90)).toBeCloseTo(9.1, 10);
    expect(percentile(ten, 0)).toBe(1);
    expect(percentile(ten, 100)).toBe(10);
    // p50 is always the median.
    for (const list of [[1], [1, 2], [5, 1, 4, 2, 3], ten]) {
      expect(percentile(list, 50)).toBe(median(list));
    }
    expect(() => percentile([1], 101)).toThrow(RangeError);
  });

  it("percentileValue: n = 0 → nothing to show; 0 < n < k → suppressed; else 1 dp", () => {
    expect(percentileValue([], 50, 5)).toEqual({ value: null, suppressed: false });
    expect(percentileValue([1, 2], 50, 5)).toEqual({
      value: null,
      suppressed: true,
      reason: "PRIMARY",
    });
    expect(percentileValue([0.5, 1, 1.5, 2, 4], 90, 5)).toEqual({ value: 3.2, suppressed: false });
  });
});

describe("ADM-04 calculators on adminMetricsFixture", () => {
  const fxNow = new Date(ADMIN_METRICS_FIXTURE_NOW);
  const fx = (mutate?: (d: ReturnType<typeof adminMetricsFixture>) => void) => {
    const data = adminMetricsFixture();
    mutate?.(data);
    return filterDataset(data, ADMIN_METRICS_FIXTURE_PERIOD, fxNow);
  };

  it("median = 1.5 days and p90 = 3.2 days (type-7 interpolation, exact)", () => {
    const ds = fx();
    expect([...reviewDelaysDays(ds)].sort((a, b) => a - b)).toEqual([0.5, 1, 1.5, 2, 4]);
    expect(medianDaysToReview(ds)).toBe(1.5);
    expect(p90DaysToReview(ds)).toBe(3.2);
  });

  it("dismissed reviews count as clinical reviews (both decided statuses)", () => {
    const ds = fx((d) => {
      d.reviews = d.reviews.filter((r) => r.status !== "dismissed_with_reason");
    });
    expect(reviewDelaysDays(ds)).toHaveLength(4);
  });

  it("pending reviews are bucketed by age (s9: 10 days → 8-14), never overdue", () => {
    const ds = fx();
    expect(pendingReviews(ds)).toEqual([
      { facilityId: FACILITY_IDS.alpha2, districtId: DISTRICT_IDS.alpha, ageDays: 10 },
    ]);
    expect(pendingAgeBuckets(ds)).toEqual({ "0-2": 0, "3-7": 0, "8-14": 1, "15+": 0 });
    expect(pendingAgeBucketOf(2)).toBe("0-2");
    expect(pendingAgeBucketOf(3)).toBe("3-7");
    expect(pendingAgeBucketOf(14)).toBe("8-14");
    expect(pendingAgeBucketOf(15)).toBe("15+");
    // The overview card is wired to the same calculators (8+ = 8-14 + 15+).
    expect(needsAttention(ds).pendingReviewAges["8+"]).toBe(1);
  });

  it("overdue snapshot uses the FND-02 helpers (s3's referral past dueAt)", () => {
    expect(overdueSnapshot(fx())).toEqual({ referrals: 1, followUps: 0 });
    expect(needsAttention(fx()).overdueReferrals).toBe(1);
  });

  it("weekly overdue trend reconstructs history; the last point = now = the snapshot", () => {
    const ds = fx();
    const trend = weeklyOverdueTrend(ds, 3);
    expect(trend.map((p) => p.weekStart)).toEqual(["2026-09-28", "2026-10-05", "2026-10-12"]);
    // Week of 28 Sep ends before the referral was requested (6 Oct); week of 5 Oct ends after
    // its dueAt (10 Oct); the last point is now.
    expect(trend.map((p) => p.referrals)).toEqual([0, 1, 1]);
    expect(trend[1]!.at).toBe("2026-10-11T21:59:59.999Z"); // Sunday 23:59:59.999 Kigali
    expect(trend.at(-1)!.at).toBe(ADMIN_METRICS_FIXTURE_NOW);
    expect({ referrals: trend.at(-1)!.referrals, followUps: trend.at(-1)!.followUps }).toEqual(
      overdueSnapshot(ds),
    );
    expect(weeklyOverdueTrend(ds)).toHaveLength(OVERDUE_TREND_WEEKS);
  });

  it("completing a referral before now removes it from the current week only", () => {
    const ds = fx((d) => {
      const ref = d.referrals.find((r) => r.id === "fx-referral-03")!;
      ref.status = "completed";
      ref.completedAt = "2026-10-13T08:00:00.000Z";
      ref.updatedAt = ref.completedAt;
      ref.completionEvidence = {
        type: "facility_attendance_record",
        reference: "FX-REF-3",
        outcome: "attended_seen",
        note: "",
        recordedBy: d.referrals[0]!.completionEvidence!.recordedBy,
        recordedAt: ref.completedAt,
      };
    });
    expect(weeklyOverdueTrend(ds, 3).map((p) => p.referrals)).toEqual([0, 1, 0]);
    expect(overdueSnapshot(ds).referrals).toBe(0);
  });

  it("cancelled items are excluded from the week they were cancelled in onwards", () => {
    const cancelAt = (iso: string) =>
      fx((d) => {
        const ref = d.referrals.find((r) => r.id === "fx-referral-03")!;
        ref.status = "cancelled_with_reason";
        ref.cancelled = { reasonCode: "patient_declined", reason: "Declined (fixture)" };
        ref.updatedAt = iso;
      });
    expect(
      weeklyOverdueTrend(cancelAt("2026-10-12T08:00:00.000Z"), 3).map((p) => p.referrals),
    ).toEqual([0, 1, 0]);
    expect(
      weeklyOverdueTrend(cancelAt("2026-10-11T08:00:00.000Z"), 3).map((p) => p.referrals),
    ).toEqual([0, 0, 0]);
  });

  it("follow-ups: past due while open; completion ends it", () => {
    const ds = fx((d) => {
      const f = d.followUps[0]!;
      f.createdAt = "2026-10-01T00:00:00.000Z";
      f.dueAt = "2026-10-08T00:00:00.000Z";
      f.completedAt = "2026-10-13T00:00:00.000Z";
    });
    expect(weeklyOverdueTrend(ds, 3).map((p) => p.followUps)).toEqual([0, 1, 0]);
    expect(overdueSnapshot(ds).followUps).toBe(0);
  });

  it("weekly medians group by the Kigali ISO week of reviewedAt (Sunday 23:30 Kigali)", () => {
    const at = (iso: string) =>
      fx((d) => {
        d.reviews.find((r) => r.id === "fx-review-07")!.reviewedAt = iso;
      });
    // Sunday 11 Oct 21:30Z = Sunday 23:30 Kigali → still the week of 5 Oct.
    const sunday = weeklyMedianDaysToReview(at("2026-10-11T21:30:00.000Z"));
    // Baseline: week of 28 Sep = s1, s2; week of 5 Oct = s3, s4; s7 (reviewed 12 Oct) moves.
    expect(sunday.find((w) => w.weekStart === "2026-10-05")!.n).toBe(3);
    expect(sunday.find((w) => w.weekStart === "2026-10-12")?.n ?? 0).toBe(0);
    // 22:30Z = Monday 00:30 Kigali → the week of 12 Oct.
    const monday = weeklyMedianDaysToReview(at("2026-10-11T22:30:00.000Z"));
    expect(monday.find((w) => w.weekStart === "2026-10-05")!.n).toBe(2);
    expect(monday.find((w) => w.weekStart === "2026-10-12")!.n).toBe(1);
    const all = weeklyMedianDaysToReview(fx());
    expect(all.reduce((a, w) => a + w.n, 0)).toBe(5);
    expect(all.map((w) => w.weekStart)).toEqual(["2026-09-28", "2026-10-05", "2026-10-12"]);
  });

  it("median days to referral completion (KPI 02): completion evidence − measurement", () => {
    const ds = fx();
    // s1: measured 2 Oct 07:00, reviewed +0.5 d, referral completed +2 d → 2.5 days (n = 1).
    expect(referralCompletionDelaysDays(ds)).toEqual([2.5]);
    expect(medianDaysToReferralCompletion(ds)).toBe(2.5);
    expect(percentileValue(referralCompletionDelaysDays(ds), 50, 5).suppressed).toBe(true);
  });

  it("medians by facility: n < k suppressed; facility n's sum to the overall n", () => {
    const ds = fx();
    const rows = medianDaysByFacility(ds, 5);
    expect(rows.map((r) => [r.facilityId, r.n.value, r.median.value])).toEqual([
      [FACILITY_IDS.alpha1, 5, 1.5],
      [FACILITY_IDS.alpha2, 0, null],
      [FACILITY_IDS.beta1, 0, null],
    ]);
    const k6 = medianDaysByFacility(ds, 6)[0]!;
    expect(k6.median).toMatchObject({ value: null, suppressed: true });
    expect(k6.n.suppressed).toBe(true);
    const total = medianDaysByFacility(ds, 1).reduce((a, r) => a + (r.n.value ?? 0), 0);
    expect(total).toBe(reviewDelaysDays(ds).length);
  });
});

describe("ADM-04 invariants on the admin seed slice", () => {
  const slice = sliceForApp(createSeed(), "admin");
  const records: MetricsRecords = {
    ...slice,
    timeEntries: (slice.extraCollections["timeEntries"] ?? []) as MetricsRecords["timeEntries"],
  };
  const ds = filterDataset(records, { from: "2026-07-17", to: "2026-10-14" }, now);

  it("last week of the overdue trend = overdueSnapshot = needsAttention", () => {
    const last = weeklyOverdueTrend(ds).at(-1)!;
    const snap = overdueSnapshot(ds);
    expect({ referrals: last.referrals, followUps: last.followUps }).toEqual(snap);
    expect(needsAttention(ds).overdueReferrals).toBe(snap.referrals);
    expect(needsAttention(ds).overdueFollowUps).toBe(snap.followUps);
    expect(snap.referrals + snap.followUps).toBeGreaterThan(0);
  });

  it("the overdue trend never counts items before they exist", () => {
    const early = weeklyOverdueTrend(ds, 1, new Date("2026-01-01T00:00:00.000Z"));
    expect(early[0]).toMatchObject({ referrals: 0, followUps: 0 });
  });

  it("facility n's sum to the overall n; weekly n's sum to the overall n", () => {
    const rows = medianDaysByFacility(ds, 1);
    expect(rows.reduce((a, r) => a + (r.n.value ?? 0), 0)).toBe(reviewDelaysDays(ds).length);
    expect(weeklyMedianDaysToReview(ds).reduce((a, w) => a + w.n, 0)).toBe(
      reviewDelaysDays(ds).length,
    );
  });
});
