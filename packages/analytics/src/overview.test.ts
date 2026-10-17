import { createSeed, FACILITY_IDS, sliceForApp } from "@laif/mock-data";
import {
  adminMetricsFixture,
  ADMIN_METRICS_FIXTURE_NOW,
  ADMIN_METRICS_FIXTURE_PERIOD,
} from "@laif/mock-data";
import { describe, expect, it } from "vitest";

import { catalogueKeys, METRIC_DEFINITIONS, pilotKpis } from "./catalogue.ts";
import { filterDataset, type MetricsRecords } from "./dataset.ts";
import {
  countActioned,
  countByFacility,
  countByScreeningType,
  countDismissed,
  countDistinctPeopleScreened,
  countFlagged,
  countFollowUpCompleted,
  countReferred,
  countReviewed,
  countScreened,
  needsAttention,
  OVERVIEW_COUNT_METRICS,
  weeklyScreenedVsFlagged,
} from "./metrics/screening-overview.ts";
import { medianDaysToReview } from "./metrics/timeliness.ts";

const now = new Date(ADMIN_METRICS_FIXTURE_NOW);
const fixtureDs = (type: "all" | "bp" | "glucose" = "all") =>
  filterDataset(adminMetricsFixture(), { ...ADMIN_METRICS_FIXTURE_PERIOD, type }, now);

describe("ADM-02 calculators on adminMetricsFixture", () => {
  const ds = fixtureDs();

  it("exact KPI values", () => {
    expect(countScreened(ds)).toBe(10);
    expect(countDistinctPeopleScreened(ds)).toBe(10);
    expect(countFlagged(ds)).toBe(6);
    expect(countReviewed(ds)).toBe(5);
    expect(countDismissed(ds)).toBe(1);
    expect(countActioned(ds)).toBe(4);
    expect(countReferred(ds)).toBe(3);
    expect(countFollowUpCompleted(ds)).toBe(2);
    expect(medianDaysToReview(ds)).toBe(1.5);
  });

  it("dismissed reviews never count as follow-up completed (WF-03)", () => {
    const dismissedFacility = countByFacility(ds, "dismissed");
    expect(dismissedFacility.reduce((a, r) => a + r.value, 0)).toBe(1);
    expect(countFollowUpCompleted(ds)).toBe(2);
  });

  it("consent-withdrawn records and drafts are excluded and counted", () => {
    expect(ds.excludedConsentWithdrawn).toBe(1);
    expect(ds.cohort.screenings.some((s) => s.id === "fx-screening-11")).toBe(false);
    expect(ds.cohort.screenings.some((s) => s.status === "draft")).toBe(false);
    expect(ds.cohort.referrals.some((r) => r.id === "fx-referral-11")).toBe(false);
    expect(ds.rulesetVersions).toEqual(["demo-ruleset-2026.10-v1"]);
  });

  it("type filter: bp = systolic present, glucose = glucose present (both in each)", () => {
    expect(countScreened(fixtureDs("bp"))).toBe(8);
    expect(countScreened(fixtureDs("glucose"))).toBe(4);
    expect(countFlagged(fixtureDs("glucose"))).toBe(2);
    expect(countByScreeningType(ds)).toEqual({ bpOnly: 6, glucoseOnly: 2, both: 2, neither: 0 });
  });

  it("by facility and weekly series sum to the totals", () => {
    for (const metric of OVERVIEW_COUNT_METRICS) {
      const rows = countByFacility(ds, metric);
      expect(rows.map((r) => r.facilityId)).toEqual([
        FACILITY_IDS.alpha1,
        FACILITY_IDS.alpha2,
        FACILITY_IDS.beta1,
      ]);
    }
    expect(countByFacility(ds, "screened").map((r) => r.value)).toEqual([8, 2, 0]);
    const weeks = weeklyScreenedVsFlagged(ds);
    expect(weeks.map((w) => w.weekStart)).toEqual(["2026-09-28", "2026-10-05", "2026-10-12"]);
    expect(weeks.reduce((a, w) => a + w.screened, 0)).toBe(10);
    expect(weeks.reduce((a, w) => a + w.flagged, 0)).toBe(6);
  });

  it("needs attention: overdue only from explicit dueAt; pending age buckets", () => {
    expect(needsAttention(ds)).toEqual({
      overdueReferrals: 1,
      overdueFollowUps: 0,
      pendingReviewAges: { "0-2": 0, "3-7": 0, "8+": 1 },
      pendingReviewsAged8Plus: 1,
      // ADM-06: detected issues not yet triaged — here the fixture's one dismissed flag.
      openQualityIssues: 1,
    });
  });

  it("median: even n is the mean of the middle values; empty → null", () => {
    const data = adminMetricsFixture();
    // Drop the 4-day review → delays [0.5, 1, 1.5, 2] → (1 + 1.5) / 2 = 1.25 → 1.3 (1 dp).
    data.reviews = data.reviews.filter((r) => r.id !== "fx-review-07");
    const even = filterDataset(data, ADMIN_METRICS_FIXTURE_PERIOD, now);
    expect(medianDaysToReview(even)).toBe(1.3);
    const empty = filterDataset(
      adminMetricsFixture(),
      { from: "2030-01-01", to: "2030-01-31" },
      now,
    );
    expect(medianDaysToReview(empty)).toBeNull();
    expect(countScreened(empty)).toBe(0);
    expect(weeklyScreenedVsFlagged(empty).every((w) => w.screened === 0)).toBe(true);
  });
});

describe("ADM-02 calculators on the admin seed slice", () => {
  const slice = sliceForApp(createSeed(), "admin");
  const records: MetricsRecords = {
    ...slice,
    timeEntries: (slice.extraCollections["timeEntries"] ?? []) as MetricsRecords["timeEntries"],
  };
  const seedNow = new Date("2026-10-14T06:00:00.000Z");
  const ds = filterDataset(records, { from: "2026-07-17", to: "2026-10-14" }, seedNow);

  it("independent naive counts agree", () => {
    const withdrawn = new Set(
      records.patients.filter((p) => p.consentState === "withdrawn").map((p) => p.id),
    );
    const naive = records.screenings.filter((s) => {
      const day = new Date(Date.parse(s.measuredAt) + 2 * 3_600_000).toISOString().slice(0, 10);
      return (
        s.status !== "draft" &&
        !withdrawn.has(s.patientId) &&
        day >= "2026-07-17" &&
        day <= "2026-10-14"
      );
    });
    expect(countScreened(ds)).toBe(naive.length);
    expect(countFlagged(ds)).toBe(naive.filter((s) => s.status === "review_required").length);
    expect(countScreened(ds)).toBeGreaterThan(100);
  });

  it("completed ⊆ referred ⊆ reviewed ⊆ flagged ⊆ screened per facility", () => {
    const col = (m: (typeof OVERVIEW_COUNT_METRICS)[number]) =>
      countByFacility(ds, m).map((r) => r.value);
    const [screened, flagged, reviewed, referred] = [
      col("screened"),
      col("flagged"),
      col("reviewed"),
      col("referred"),
    ];
    screened.forEach((v, i) => {
      expect(flagged[i]).toBeLessThanOrEqual(v);
      expect(reviewed[i]).toBeLessThanOrEqual(flagged[i] as number);
      expect(referred[i]).toBeLessThanOrEqual(reviewed[i] as number);
    });
    expect(col("dismissed").reduce((a, b) => a + b, 0)).toBe(countDismissed(ds));
  });
});

describe("METRIC_DEFINITIONS", () => {
  it("lists all six pilot KPIs; KPI03 and KPI05 are deferred", () => {
    const kpis = pilotKpis();
    expect(kpis.map((k) => k.kpi)).toEqual(["KPI01", "KPI02", "KPI03", "KPI04", "KPI05", "KPI06"]);
    expect(kpis.filter((k) => k.definition.status === "deferred").map((k) => k.kpi)).toEqual([
      "KPI03",
      "KPI05",
    ]);
    expect(METRIC_DEFINITIONS.every((d) => d.version === "demo-metrics-1")).toBe(true);
    expect(catalogueKeys().every((k) => k.startsWith("admin:overview.catalogue."))).toBe(true);
  });
});
