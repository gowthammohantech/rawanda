import { createDemoClock } from "@laif/domain";
import {
  createSeed,
  DEMO_SMALL_CELL_THRESHOLD,
  DISTRICT_IDS,
  FACILITY_IDS,
  getScenario,
} from "@laif/mock-data";
import { describe, expect, it } from "vitest";

import { COUNT_METRIC_KEYS, type CountMetricKey } from "../metric-keys.ts";
import { cellAt, suppressCells } from "../suppression.ts";
import { METRIC_VERSION } from "../types.ts";
import { countMetric, getProgrammeMetrics, metricTable } from "./programme.ts";

const seed = createSeed();
const clock = createDemoClock();
const now = clock.now();

describe("getProgrammeMetrics", () => {
  it("bundles every calculator and is deterministic given the demo clock", () => {
    const m = getProgrammeMetrics(seed, {}, now);
    expect(m.metricVersion).toBe(METRIC_VERSION);
    expect(m.computedAt).toBe("2026-10-14T06:00:00.000Z");
    expect(m.filter).toEqual({ from: null, to: null, districtIds: null, facilityIds: null });
    expect(m.funnel.stages[0]!.count).toBe(57);
    expect(m.overview.screeningsRecorded).toBe(57);
    expect(getProgrammeMetrics(createSeed(), {}, createDemoClock().now())).toEqual(m);
  });

  it("does not mutate its input", () => {
    const copy = structuredClone(seed);
    getProgrammeMetrics(seed, { districtIds: [DISTRICT_IDS.alpha] }, now);
    expect(seed).toEqual(copy);
  });

  it("countMetric covers every count metric and is additive across districts", () => {
    for (const key of COUNT_METRIC_KEYS) {
      const total = countMetric(key, seed, {}, now);
      const parts =
        countMetric(key, seed, { districtIds: [DISTRICT_IDS.alpha] }, now) +
        countMetric(key, seed, { districtIds: [DISTRICT_IDS.beta] }, now);
      expect(parts, key).toBe(total);
    }
    expect(countMetric("follow_ups_completed", seed, {}, now)).toBe(6);
  });
});

describe("metricTable + SCN-12 suppressed small aggregate", () => {
  const scn = getScenario("SCN-12-suppressed-small-aggregate");
  const metricKey = scn.anchors.metricKey as CountMetricKey;

  it("anchors a count metric key of this package", () => {
    expect(metricKey).toBe("follow_ups_completed");
    expect(COUNT_METRIC_KEYS).toContain(metricKey);
    expect(countMetric(metricKey, seed, { facilityIds: [scn.anchors.facilityId!] }, now)).toBe(1);
  });

  it("renders the District Beta cell suppressed and its complementary cell when a total is shown", () => {
    const table = metricTable(seed, {}, now, { groupBy: "district", metricKeys: [metricKey] });
    expect(table.rowKeys).toEqual([DISTRICT_IDS.alpha, DISTRICT_IDS.beta]);
    expect(table.cells).toEqual([[5], [1]]);
    const s = suppressCells(table, DEMO_SMALL_CELL_THRESHOLD);
    expect(cellAt(s, scn.anchors.districtId!, metricKey)).toEqual({
      value: null,
      suppressed: true,
      reason: "PRIMARY",
    });
    expect(cellAt(s, DISTRICT_IDS.alpha, metricKey)).toEqual({
      value: null,
      suppressed: true,
      reason: "COMPLEMENTARY",
    });
    expect(s.columnTotals).toEqual([{ value: 6, suppressed: false }]);
    // Without a published total there is nothing to protect: Alpha (5) is shown.
    const noTotal = suppressCells({ ...table, columnTotals: false });
    expect(cellAt(noTotal, DISTRICT_IDS.alpha, metricKey)).toEqual({ value: 5, suppressed: false });
    expect(cellAt(noTotal, DISTRICT_IDS.beta, metricKey).suppressed).toBe(true);
  });

  it("facility grouping suppresses the Beta-1 cell", () => {
    const table = metricTable(seed, {}, now, {
      groupBy: "facility",
      metricKeys: ["screenings_recorded", metricKey],
    });
    expect(table.rowKeys).toEqual([FACILITY_IDS.alpha1, FACILITY_IDS.alpha2, FACILITY_IDS.beta1]);
    const s = suppressCells(table);
    expect(cellAt(s, FACILITY_IDS.beta1, metricKey).suppressed).toBe(true);
    expect(cellAt(s, FACILITY_IDS.beta1, "screenings_recorded")).toEqual({
      value: 17,
      suppressed: false,
    });
  });

  it("respects the filter scope", () => {
    const table = metricTable(seed, { districtIds: [DISTRICT_IDS.alpha] }, now, {
      groupBy: "facility",
      metricKeys: ["screenings_recorded"],
    });
    expect(table.rowKeys).toEqual([FACILITY_IDS.alpha1, FACILITY_IDS.alpha2]);
    expect(table.cells).toEqual([[22], [18]]);
  });
});
