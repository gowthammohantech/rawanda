/**
 * `selectTimeliness` (ADM-04): exact fixture values, the scope-wide suppression shared with the
 * overview's "Needs attention" card (identical cells in every view), last trend week = KPI,
 * facility n's = overall n, and District Beta's suppressed median for the programme lead.
 */
import {
  filterDataset,
  overdueSnapshot,
  reviewDelaysDays,
  type AggregateCell,
  type MetricsRecords,
} from "@laif/analytics";
import { createSeed, DISTRICT_IDS, FACILITY_IDS, sliceForApp } from "@laif/mock-data";
import {
  adminMetricsFixture,
  ADMIN_METRICS_FIXTURE_NOW,
  ADMIN_METRICS_FIXTURE_PERIOD,
} from "@laif/test-utils";
import { describe, expect, it } from "vitest";

import { selectOverview } from "../metrics/selectOverview.ts";
import { selectTimeliness } from "./selectTimeliness.ts";

const ALL = { district: null, facility: null };
const fixtureDs = filterDataset(
  adminMetricsFixture(),
  ADMIN_METRICS_FIXTURE_PERIOD,
  new Date(ADMIN_METRICS_FIXTURE_NOW),
);

describe("selectTimeliness on adminMetricsFixture", () => {
  it("k = 5: median 1.5 and p90 3.2 days with n = 5; tiny samples hidden", () => {
    const v = selectTimeliness(fixtureDs, ALL, 5);
    expect(v.kpis.reviews).toMatchObject({ value: 5, suppressed: false });
    expect(v.kpis.median).toMatchObject({ value: 1.5, suppressed: false });
    expect(v.kpis.p90).toMatchObject({ value: 3.2, suppressed: false });
    // One completed referral (n = 1 < 5): the completion median is hidden with its n.
    expect(v.kpis.referralCompletions.suppressed).toBe(true);
    expect(v.kpis.referralCompletionMedian).toMatchObject({ value: null, suppressed: true });
    expect(selectTimeliness(fixtureDs, ALL, 1).kpis.referralCompletionMedian.value).toBe(2.5);
    // Weekly medians of 1–2 reviews are hidden.
    expect(v.medianTrend.every((w) => w.median.suppressed || w.n.value === 0)).toBe(true);
    expect(v.noReviews).toBe(false);
  });

  it("pending by age (no target) and overdue: last trend week = KPI = overview card", () => {
    const v = selectTimeliness(fixtureDs, ALL, 1);
    expect(v.aging["8-14"].value).toBe(1);
    expect(v.kpis.pending.value).toBe(1);
    expect(v.kpis.pendingAged8Plus.value).toBe(1);
    const last = v.overdueTrend.at(-1)!;
    expect(last.current).toBe(true);
    expect(last.at).toBe(ADMIN_METRICS_FIXTURE_NOW);
    expect(last.referrals).toEqual({ ...v.kpis.overdueReferrals, key: last.weekStart });
    expect(v.kpis.overdueReferrals.value).toBe(overdueSnapshot(fixtureDs).referrals);
    const o = selectOverview(fixtureDs, 1);
    expect(v.kpis.overdueReferrals).toEqual(o.needsAttention.overdueReferrals);
    expect(v.kpis.overdueFollowUps).toEqual(o.needsAttention.overdueFollowUps);
    expect(v.kpis.pendingAged8Plus.value).toBe(o.needsAttention.pendingReviewAges["8+"].value);
  });

  it("output holds no patient or record identifiers", () => {
    const json = JSON.stringify(selectTimeliness(fixtureDs, ALL, 5));
    for (const p of fixtureDs.cohort.patients) expect(json).not.toContain(p.id);
    for (const s of fixtureDs.cohort.screenings) expect(json).not.toContain(s.id);
    for (const r of fixtureDs.cohort.referrals) expect(json).not.toContain(r.id);
  });

  it("empty period: median '—' (null, not hidden), zero overdue", () => {
    const empty = filterDataset(
      adminMetricsFixture(),
      { from: "2030-01-01", to: "2030-01-31" },
      new Date(ADMIN_METRICS_FIXTURE_NOW),
    );
    const v = selectTimeliness(empty, ALL, 5);
    expect(v.noReviews).toBe(true);
    expect(v.kpis.median).toEqual({ key: "median", value: null, suppressed: false });
    expect(v.kpis.overdueReferrals.value).toBe(0);
  });
});

describe("selectTimeliness on the admin seed (scope-wide suppression)", () => {
  const slice = sliceForApp(createSeed(), "admin");
  const records: MetricsRecords = {
    ...slice,
    timeEntries: (slice.extraCollections["timeEntries"] ?? []) as MetricsRecords["timeEntries"],
  };
  const now = new Date("2026-10-14T06:00:00.000Z");
  const period = { from: "2026-09-15", to: "2026-10-14" };
  const scope = filterDataset(records, period, now);
  const views = [
    ALL,
    { district: DISTRICT_IDS.alpha, facility: null },
    { district: DISTRICT_IDS.beta, facility: null },
    { district: null, facility: FACILITY_IDS.alpha1 },
    { district: null, facility: FACILITY_IDS.beta1 },
  ];

  it("overdue / pending cells equal the overview's in every view (one shared pass)", () => {
    for (const view of views) {
      for (const k of [1, 5, 11]) {
        const tl = selectTimeliness(scope, view, k);
        const ov = selectOverview(scope, k, { view });
        const label = `${JSON.stringify(view)} k=${k}`;
        expect(tl.kpis.overdueReferrals, label).toEqual(ov.needsAttention.overdueReferrals);
        expect(tl.kpis.overdueFollowUps, label).toEqual(ov.needsAttention.overdueFollowUps);
        expect({ ...tl.kpis.pendingAged8Plus, key: "8+" }, label).toEqual(
          ov.needsAttention.pendingReviewAges["8+"],
        );
        const last = tl.overdueTrend.at(-1)!;
        expect(last.referrals.value, label).toBe(tl.kpis.overdueReferrals.value);
        expect(last.followUps.value, label).toBe(tl.kpis.overdueFollowUps.value);
      }
    }
  });

  it("facility n's sum to the overall n (raw, k = 1)", () => {
    const v = selectTimeliness(scope, ALL, 1);
    const sum = v.facilities.reduce((a, f) => a + (f.n.value ?? 0), 0);
    expect(sum).toBe(v.kpis.reviews.value);
    expect(sum).toBe(reviewDelaysDays(scope).length);
    expect(v.medianTrend.reduce((a, w) => a + (w.n.value ?? 0), 0)).toBe(sum);
  });

  it("no hidden cell leaks through programme − district (k = 5)", () => {
    const all = selectTimeliness(scope, ALL, 5);
    const alpha = selectTimeliness(scope, views[1]!, 5);
    const beta = selectTimeliness(scope, views[2]!, 5);
    const check = (a: AggregateCell, b: AggregateCell, total: AggregateCell, label: string) => {
      const hidden = [a, b, total].filter((c) => c.suppressed).length;
      expect(hidden === 0 || hidden >= 2, label).toBe(true);
    };
    check(alpha.kpis.reviews, beta.kpis.reviews, all.kpis.reviews, "reviews");
    all.overdueTrend.forEach((w, i) => {
      check(
        alpha.overdueTrend[i]!.referrals,
        beta.overdueTrend[i]!.referrals,
        w.referrals,
        `r${i}`,
      );
      check(
        alpha.overdueTrend[i]!.followUps,
        beta.overdueTrend[i]!.followUps,
        w.followUps,
        `f${i}`,
      );
    });
  });

  it("District Beta: the median is SUPPRESSED for the programme lead (default k = 5)", () => {
    const beta = selectTimeliness(scope, views[2]!, 5);
    expect(beta.kpis.median.suppressed).toBe(true);
    expect(beta.facilities.every((f) => f.median.suppressed || f.n.value === 0)).toBe(true);
  });
});
