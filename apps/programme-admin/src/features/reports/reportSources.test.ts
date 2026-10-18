/**
 * ADM-07 parity: report rows carry exactly the cells the dashboard pages show (same selectors,
 * same scope-wide suppression pass) for every template and granularity; suppressed dashboard
 * cells are blank with `suppressed=true`; worker rows are never exported.
 */
import { funnelHierarchy, type AggregateCell, type ReportRow } from "@laif/analytics";
import { DISTRICT_IDS, FACILITY_IDS, PERSONA_IDS } from "@laif/mock-data";
import { describe, expect, it } from "vitest";

import { datasetOptions } from "../metrics/queries.ts";
import { selectOverview } from "../metrics/selectOverview.ts";
import { selectQuality } from "../quality/selectQuality.ts";
import { selectTimeliness } from "../timeliness/selectTimeliness.ts";
import { scopeKeyOf } from "../../lib/queryKeys.ts";
import { reportRowsOf } from "./exportCsv.ts";
import { REPORT_TEMPLATES } from "./templates.ts";
import { filtersOf, loadReport, signedInServices } from "./testing.ts";

const shown = (row: ReportRow | undefined, cell: AggregateCell) => {
  expect(row, cell.key).toBeDefined();
  if (cell.suppressed) {
    expect(row).toMatchObject({ suppressed: true, value: null });
  } else {
    expect(row).toMatchObject({ suppressed: false, value: cell.value });
  }
};

async function scopeDataset(services: Awaited<ReturnType<typeof signedInServices>>["services"]) {
  const state = services.session.getState();
  const access = { persona: state.persona!, grant: state.grant };
  const loaded = await services.queryClient.fetchQuery(
    datasetOptions(services.repo, access, scopeKeyOf(state.grant), filtersOf()),
  );
  return loaded.dataset;
}

describe("report rows = dashboard cells (programme lead, 90 days)", () => {
  it("programme summary by facility equals the overview's facility table", async () => {
    const { services, t } = await signedInServices(PERSONA_IDS.leadProgramme);
    const rows = reportRowsOf(await loadReport(services, "programme_summary", "facility"), t);
    const o = selectOverview(await scopeDataset(services), 5);
    for (const f of o.facilities) {
      const of = (id: string) =>
        rows.find((r) => r.facility_id === f.facilityId && r.metric_id === id);
      shown(of("screened"), f.cells.screened);
      shown(of("flagged"), f.cells.flagged);
      shown(of("referred"), f.cells.referred);
      shown(of("follow_up_completed"), f.cells.followUpCompleted);
    }
    // Some figures are hidden on screen → blank in the file.
    expect(rows.some((r) => r.suppressed)).toBe(true);
    // Scope total = the overview KPI strip.
    const total = reportRowsOf(await loadReport(services, "programme_summary", "scope_total"), t);
    shown(
      total.find((r) => r.metric_id === "screened"),
      o.totals.screened,
    );
    shown(
      total.find((r) => r.metric_id === "median_days_to_review"),
      o.medianDaysToReview,
    );
    // Weekly = the overview trend.
    const weekly = reportRowsOf(await loadReport(services, "programme_summary", "week"), t);
    for (const w of o.weekly) {
      shown(
        weekly.find((r) => r.week_start === w.weekStart && r.metric_id === "flagged"),
        w.flagged,
      );
    }
  });

  it("funnel by district / facility equals the funnel hierarchy", async () => {
    const { services, t } = await signedInServices(PERSONA_IDS.leadProgramme);
    const h = funnelHierarchy(await scopeDataset(services), 5);
    const byDistrict = reportRowsOf(
      await loadReport(services, "funnel_by_facility", "district"),
      t,
    );
    const byFacility = reportRowsOf(
      await loadReport(services, "funnel_by_facility", "facility"),
      t,
    );
    for (const d of h.districts) {
      shown(
        byDistrict.find((r) => r.district_id === d.key && r.metric_id === "funnel.referred"),
        d.cells.referred,
      );
      for (const f of d.facilities) {
        shown(
          byFacility.find((r) => r.facility_id === f.key && r.metric_id === "funnel.dismissed"),
          f.cells.dismissed,
        );
      }
    }
  });

  it("timeliness and quality (with fairness) follow their page selectors", async () => {
    const { services, t } = await signedInServices(PERSONA_IDS.leadProgramme);
    const ds = await scopeDataset(services);
    const view = { district: DISTRICT_IDS.beta, facility: null };
    const tv = selectTimeliness(ds, view, 5);
    const tRows = reportRowsOf(
      await loadReport(services, "timeliness", "scope_total", { district: DISTRICT_IDS.beta }),
      t,
    );
    shown(
      tRows.find((r) => r.metric_id === "median_days_to_review"),
      tv.kpis.median,
    );
    shown(
      tRows.find((r) => r.metric_id === "overdue_referrals"),
      tv.kpis.overdueReferrals,
    );
    shown(
      tRows.find((r) => r.metric_id === "pending_reviews.8-14"),
      tv.aging["8-14"],
    );
    const q = selectQuality(ds, { district: null, facility: null }, 5);
    const qRows = reportRowsOf(await loadReport(services, "quality", "scope_total"), t);
    shown(
      qRows.find((r) => r.metric_id === "missing_field.glucoseUnit"),
      q.byField.glucoseUnit,
    );
    shown(
      qRows.find((r) => r.metric_id === "fairness.sex.female.flagged"),
      q.fairness.sex.female.flagged,
    );
    shown(
      qRows.find((r) => r.metric_id === "fairness.age.60+.overturned"),
      q.fairness.age["60+"].overturned,
    );
    shown(
      qRows.find((r) => r.metric_id === "overturned_flag_rate"),
      q.kpis.overturnedRate,
    );
  });

  it("every template / granularity builds; workload stays at facility level", async () => {
    const { services, t } = await signedInServices(PERSONA_IDS.analystAlpha);
    for (const tpl of REPORT_TEMPLATES) {
      for (const g of tpl.granularities) {
        const data = await loadReport(services, tpl.id, g);
        const rows = reportRowsOf(data, t);
        expect(rows.length, `${tpl.id}/${g}`).toBeGreaterThan(0);
        expect(rows.every((r) => r.district_id !== DISTRICT_IDS.beta)).toBe(true);
        expect(data.districtIds).toEqual([DISTRICT_IDS.alpha]);
        expect(data.facilityIds).toEqual([FACILITY_IDS.alpha1, FACILITY_IDS.alpha2]);
      }
    }
    const workload = reportRowsOf(await loadReport(services, "workload_facility", "facility"), t);
    expect(JSON.stringify(workload)).not.toMatch(/HW-\d{3}|persona-/);
  });

  it("an out-of-grant view is refused before any read (FORBIDDEN)", async () => {
    const { services } = await signedInServices(PERSONA_IDS.analystAlpha);
    await expect(
      loadReport(services, "programme_summary", "scope_total", { district: DISTRICT_IDS.beta }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
