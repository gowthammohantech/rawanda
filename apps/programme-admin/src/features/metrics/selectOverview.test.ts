import { countByFacility, filterDataset, OVERVIEW_COUNT_METRICS } from "@laif/analytics";
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
