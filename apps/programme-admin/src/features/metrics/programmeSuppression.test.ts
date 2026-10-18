/**
 * ADM-09 open item: the Overview and the Funnel share ONE suppression pass, so a figure both
 * publish is hidden on both or on neither (no differencing between the two pages).
 */
import {
  funnelCountsByGroup,
  kigaliDate,
  type OVERVIEW_COUNT_METRICS,
  type FunnelColumn,
  type MetricsDataset,
} from "@laif/analytics";
import { DISTRICT_IDS, FACILITY_IDS, PERSONA_IDS } from "@laif/mock-data";
import { describe, expect, it } from "vitest";

import { createTestServices, signIn } from "../../test/app.tsx";
import { DEFAULT_FILTERS, resolvePeriod } from "../filters/filterSchema.ts";
import { selectFunnel } from "../funnel/selectFunnel.ts";
import { loadMetricsDataset } from "./loadMetricsDataset.ts";
import { FUNNEL_ALIAS, programmeSuppression } from "./programmeSuppression.ts";
import { facilityNode } from "./scopeSuppression.ts";
import { selectOverview } from "./selectOverview.ts";

async function leadDataset(): Promise<MetricsDataset> {
  const services = await createTestServices();
  await signIn(services, PERSONA_IDS.leadProgramme, null);
  const { persona, grant } = services.session.getState();
  if (persona === null) throw new Error("not signed in");
  const period = resolvePeriod(DEFAULT_FILTERS, kigaliDate(services.clock.now()));
  return (await loadMetricsDataset(services.repo, { persona, grant }, DEFAULT_FILTERS, period))
    .dataset;
}

const SHARED: ReadonlyArray<[FunnelColumn, (typeof OVERVIEW_COUNT_METRICS)[number]]> = [
  ["recorded", "screened"],
  ["flagged", "flagged"],
  ["reviewed", "reviewed"],
  ["referred", "referred"],
  ["dismissed", "dismissed"],
];

describe("joint overview + funnel suppression (ADM-09)", () => {
  it("shared figures have identical definitions (raw funnel counts = overview measures)", async () => {
    const ds = await leadDataset();
    const pass = programmeSuppression(ds, 5);
    for (const row of funnelCountsByGroup(ds, "facility")) {
      for (const [column] of SHARED) {
        expect(pass.rawOf(facilityNode(row.key), FUNNEL_ALIAS[column]), column).toBe(
          row.counts[column],
        );
      }
      expect(pass.rawOf(facilityNode(row.key), FUNNEL_ALIAS.completed)).toBe(row.counts.completed);
    }
  });

  it.each([3, 5, 10, 20])(
    "k = %i: every view hides the same shared cells on both pages",
    async (k) => {
      const ds = await leadDataset();
      const views = [
        { district: null, facility: null },
        { district: DISTRICT_IDS.alpha, facility: null },
        { district: DISTRICT_IDS.beta, facility: null },
        { district: DISTRICT_IDS.alpha, facility: FACILITY_IDS.alpha1 },
        { district: DISTRICT_IDS.alpha, facility: FACILITY_IDS.alpha2 },
      ];
      for (const view of views) {
        const overview = selectOverview(ds, k, { view });
        const funnel = selectFunnel(ds, view, k);
        for (const [column, metric] of SHARED) {
          const o = overview.totals[metric];
          const f = funnel.node.cells[column];
          expect(
            { suppressed: f.suppressed, value: f.value },
            `${metric} ${JSON.stringify(view)}`,
          ).toEqual({ suppressed: o.suppressed, value: o.value });
        }
        funnel.weeks.forEach((week, i) => {
          const fac = funnel.districts.flatMap((d) => d.facilities);
          if (view.facility === null || fac.length !== 1) return;
          const weekly = fac[0]?.weekly[i];
          expect(weekly?.recorded.suppressed, week).toBe(overview.weekly[i]?.screened.suppressed);
          expect(weekly?.flagged.suppressed, week).toBe(overview.weekly[i]?.flagged.suppressed);
        });
      }
    },
  );

  it("a higher threshold never hides fewer cells", async () => {
    const ds = await leadDataset();
    const at = (k: number) => selectOverview(ds, k).suppressedCount;
    expect(at(10)).toBeGreaterThan(at(5));
  });
});
