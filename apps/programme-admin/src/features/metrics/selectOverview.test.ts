import {
  countByFacility,
  filterDataset,
  OVERVIEW_COUNT_METRICS,
  type AggregateCell,
  type MetricsRecords,
} from "@laif/analytics";
import { createSeed, DISTRICT_IDS, sliceForApp } from "@laif/mock-data";
import {
  adminMetricsFixture,
  ADMIN_METRICS_FIXTURE_NOW,
  ADMIN_METRICS_FIXTURE_PERIOD,
} from "@laif/test-utils";
import { describe, expect, it } from "vitest";

import { deriveOverviewNote, selectOverview } from "./selectOverview.ts";

const ds = filterDataset(
  adminMetricsFixture(),
  ADMIN_METRICS_FIXTURE_PERIOD,
  new Date(ADMIN_METRICS_FIXTURE_NOW),
);

describe("selectOverview (adminMetricsFixture reconciliation)", () => {
  it("k = 1 shows every exact KPI value", () => {
    const m = selectOverview(ds, 1);
    expect(m.totals.screened.value).toBe(10);
    expect(m.totals.flagged.value).toBe(6);
    expect(m.totals.reviewed.value).toBe(5);
    expect(m.totals.dismissed.value).toBe(1);
    expect(m.totals.referred.value).toBe(3);
    expect(m.totals.followUpCompleted.value).toBe(2);
    expect(m.medianDaysToReview).toEqual({
      key: "medianDaysToReview",
      value: 1.5,
      suppressed: false,
    });
    expect(m.rates.flaggedOfScreened.value).toBe(0.6);
    expect(m.excludedConsentWithdrawn).toBe(1);
  });

  it("totals equal the sum of facility values before masking", () => {
    for (const metric of OVERVIEW_COUNT_METRICS) {
      const raw = countByFacility(ds, metric).reduce((a, r) => a + r.value, 0);
      expect(selectOverview(ds, 1).totals[metric].value).toBe(raw);
    }
  });

  it("k = 5: small cells show as suppressed; no total leaks a hidden cell", () => {
    const m = selectOverview(ds, 5);
    expect(m.totals.screened).toMatchObject({ value: 10, suppressed: false });
    expect(m.totals.followUpCompleted).toMatchObject({ value: null, suppressed: true });
    expect(m.rates.completedOfReferred.suppressed).toBe(true);
    expect(m.medianDaysToReview.value).toBe(1.5); // basis (5 reviewed) is shown
    for (const metric of OVERVIEW_COUNT_METRICS) {
      const total = m.totals[metric];
      const cells = m.facilities.map((f) => f.cells[metric]);
      const hidden = cells.filter((c) => c.suppressed).length + (total.suppressed ? 1 : 0);
      expect(hidden === 0 || hidden >= 2, metric).toBe(true);
    }
  });

  it("output holds no patient or record identifiers", () => {
    const json = JSON.stringify(selectOverview(ds, 5));
    for (const p of ds.cohort.patients) expect(json).not.toContain(p.id);
    for (const s of ds.cohort.screenings) expect(json).not.toContain(s.id);
  });

  it("data note: lowest unsuppressed completion rate, omitted when nothing is shown", () => {
    expect(deriveOverviewNote(selectOverview(ds, 1))).toEqual({
      facilityId: "fac-alpha-1",
      completed: 2,
      referred: 3,
      pct: 67,
    });
    expect(deriveOverviewNote(selectOverview(ds, 5))).toBeNull();
  });
});

describe("selectOverview: scope-wide suppression (no differencing across views)", () => {
  const slice = sliceForApp(createSeed(), "admin");
  const records: MetricsRecords = {
    ...slice,
    timeEntries: (slice.extraCollections["timeEntries"] ?? []) as MetricsRecords["timeEntries"],
  };
  const now = new Date("2026-10-14T06:00:00.000Z");
  const period = { from: "2026-09-15", to: "2026-10-14" };
  const scope = filterDataset(records, period, now);
  const viewOf = (district: string | null, facility: string | null = null) =>
    selectOverview(scope, 5, {
      view: { district, facility },
      viewDataset: filterDataset(
        records,
        {
          ...period,
          ...(district === null ? {} : { districtIds: [district as never] }),
          ...(facility === null ? {} : { facilityIds: [facility as never] }),
        },
        now,
      ),
    });
  const all = viewOf(null);
  const alpha = viewOf(DISTRICT_IDS.alpha);
  const beta = viewOf(DISTRICT_IDS.beta);

  it("a facility cell is hidden identically in the programme and district views", () => {
    expect(all.totals.screened.value ?? 0).toBeGreaterThan(20);
    expect(all.suppressedCount + alpha.suppressedCount + beta.suppressedCount).toBeGreaterThan(0);
    for (const row of [...alpha.facilities, ...beta.facilities]) {
      const same = all.facilities.find((f) => f.facilityId === row.facilityId);
      expect(same?.cells).toEqual(row.cells);
    }
  });

  it("programme − district never reveals the other district's hidden total", () => {
    const check = (a: AggregateCell, b: AggregateCell, total: AggregateCell, label: string) => {
      const hidden = [a, b, total].filter((c) => c.suppressed).length;
      expect(hidden === 0 || hidden >= 2, label).toBe(true);
      if (hidden === 0) expect((a.value ?? 0) + (b.value ?? 0), label).toBe(total.value);
    };
    for (const m of OVERVIEW_COUNT_METRICS)
      check(alpha.totals[m], beta.totals[m], all.totals[m], m);
    all.weekly.forEach((w, i) => {
      check(alpha.weekly[i]!.screened, beta.weekly[i]!.screened, w.screened, `wS ${w.weekStart}`);
      check(alpha.weekly[i]!.flagged, beta.weekly[i]!.flagged, w.flagged, `wF ${w.weekStart}`);
    });
    for (const key of ["overdueReferrals", "overdueFollowUps", "openQualityIssues"] as const) {
      check(alpha.needsAttention[key], beta.needsAttention[key], all.needsAttention[key], key);
    }
  });

  it("the view's KPIs and footnotes come from the view (raw values at k = 1)", () => {
    const alphaDs = filterDataset(records, { ...period, districtIds: [DISTRICT_IDS.alpha] }, now);
    const m = selectOverview(scope, 1, {
      view: { district: DISTRICT_IDS.alpha, facility: null },
      viewDataset: alphaDs,
    });
    for (const metric of OVERVIEW_COUNT_METRICS) {
      expect(m.totals[metric].value, metric).toBe(
        countByFacility(alphaDs, metric).reduce((a, r) => a + r.value, 0),
      );
    }
    expect(m.facilities.every((f) => f.districtId === DISTRICT_IDS.alpha)).toBe(true);
    expect(m.excludedConsentWithdrawn).toBe(alphaDs.excludedConsentWithdrawn);
  });
});
