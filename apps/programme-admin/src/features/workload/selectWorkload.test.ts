/**
 * selectWorkload (ADM-05 §6, §9): hand-computed fixture values, the invariants (per-worker
 * assigned sums to the total pre-suppression; pooled minutes / patient-day = Σ minutes ÷ Σ
 * patient-days), the low-volume Beta-1 worker (`<k` + one complementary cell), worker codes only
 * (no persona ids, names or patient ids), the auditor variant and the empty period.
 */
import { filterDataset, workloadBaselineWindow, type MetricsRecords } from "@laif/analytics";
import {
  ADMIN_METRICS_FIXTURE_NOW,
  ADMIN_METRICS_FIXTURE_PERIOD,
  adminMetricsFixture,
  createSeed,
  DEMO_PERSONAS,
  DISTRICT_IDS,
  FACILITY_IDS,
  sliceForApp,
} from "@laif/mock-data";
import { describe, expect, it } from "vitest";

import { selectWorkload } from "./selectWorkload.ts";

const ALL = { district: null, facility: null };

describe("selectWorkload on adminMetricsFixture (hand-computed)", () => {
  const now = new Date(ADMIN_METRICS_FIXTURE_NOW);
  const ds = filterDataset(adminMetricsFixture(), ADMIN_METRICS_FIXTURE_PERIOD, now);
  const window = workloadBaselineWindow(now);
  const baseline = filterDataset(adminMetricsFixture(), window, now);
  const view = (k: number, includeWorkers = true) =>
    selectWorkload(ds, ALL, k, { includeWorkers, baseline, baselineWindow: window });

  it("k = 1: KPIs and per-worker rows equal the fixture's hand calculation", () => {
    const v = view(1);
    expect(v.kpis.activeWorkers.value).toBe(3);
    expect(v.kpis.assigned.value).toBe(8);
    expect(v.kpis.completed.value).toBe(3);
    expect(v.kpis.completionRate.value).toBe(0.375);
    expect(v.kpis.unableToReach.value).toBe(2);
    expect(v.kpis.overdue.value).toBe(2);
    expect(v.kpis.patientDays.value).toBe(14);
    expect(v.kpis.minutesPerPatientDay.value).toBe(34.3);
    expect(v.minutesByActivity.travel.value).toBe(80);
    expect(v.weekly.map((w) => w.value.value)).toEqual([39, 28.3, null]);
    const rows = v.workers ?? [];
    expect(rows.map((r) => [r.workerCode, r.assigned.value, r.completed.value])).toEqual([
      ["HW-014", 2, 1],
      ["HW-015", 5, 1],
      ["HW-021", 1, 1],
    ]);
    expect(rows.map((r) => r.minutesPerPatientDay.value)).toEqual([30, 30, 50]);
  });

  it("k = 5: small worker cells are hidden, minutes follow their patient-day cell", () => {
    const v = view(5);
    const rows = v.workers ?? [];
    const hw015 = rows.find((r) => r.workerCode === "HW-015")!;
    // HW-014's 2 tasks are < k, so one more Alpha-1 cell of the line [HW-014, HW-015] → 7 hides.
    expect(hw015.assigned).toMatchObject({ suppressed: true, reason: "COMPLEMENTARY" });
    expect(hw015.completed).toMatchObject({ suppressed: true, reason: "PRIMARY" });
    expect(hw015.completionRate.suppressed).toBe(true);
    // 3 patient-days < 5 → minutes per patient-day hidden with them.
    expect(hw015.minutesPerPatientDay.suppressed).toBe(true);
    // HW-014: 8 patient-days, hidden as the complement of HW-015's 3 in Alpha-1 → minutes too.
    expect(rows.find((r) => r.workerCode === "HW-014")!.minutesPerPatientDay).toMatchObject({
      suppressed: true,
      reason: "COMPLEMENTARY",
    });
    // The pooled programme value (14 patient-days) is shown.
    expect(v.kpis.minutesPerPatientDay.value).toBe(34.3);
  });

  it("no worker persona ids, names or patient identifiers in the output", () => {
    const json = JSON.stringify(view(1));
    for (const w of ds.cohort.workers ?? []) expect(json).not.toContain(w.id);
    for (const p of DEMO_PERSONAS) expect(json).not.toContain(p.displayName);
    for (const p of ds.cohort.patients) expect(json).not.toContain(p.id);
  });

  it("without metrics.drilldown no worker rows are produced", () => {
    expect(view(5, false).workers).toBeNull();
  });

  it("empty period: noTasks, minutes '—'", () => {
    const empty = filterDataset(
      adminMetricsFixture(),
      { from: "2030-01-01", to: "2030-01-31" },
      now,
    );
    const v = selectWorkload(empty, ALL, 5, {
      includeWorkers: true,
      baseline,
      baselineWindow: window,
    });
    expect(v.noTasks).toBe(true);
    expect(v.kpis.minutesPerPatientDay).toMatchObject({ value: null, suppressed: false });
    expect(v.workers).toEqual([]);
  });
});

describe("selectWorkload on the admin seed (scope-wide suppression)", () => {
  const slice = sliceForApp(createSeed(), "admin");
  const personas = [...DEMO_PERSONAS, ...(slice.personas ?? [])];
  const records: MetricsRecords = {
    ...slice,
    timeEntries: (slice.extraCollections["timeEntries"] ?? []) as MetricsRecords["timeEntries"],
    workers: personas
      .filter((p) => p.workerCode !== null && p.facilityIds.length > 0)
      .map((p) => ({
        id: p.id,
        workerCode: p.workerCode as string,
        facilityIds: [...p.facilityIds],
      })),
  };
  const now = new Date("2026-10-14T06:00:00.000Z");
  const ds = filterDataset(records, { from: "2026-07-17", to: "2026-10-14" }, now);
  const window = workloadBaselineWindow(now);
  const baseline = filterDataset(records, window, now);
  const select = (v: { district: string | null; facility: string | null }, k = 5) =>
    selectWorkload(ds, v, k, { includeWorkers: true, baseline, baselineWindow: window });

  it("per-worker assigned sums to the total and pooled minutes = Σ minutes ÷ Σ patient-days", () => {
    const raw = select(ALL, 1);
    const rows = raw.workers ?? [];
    expect(rows.reduce((n, r) => n + (r.assigned.value ?? 0), 0)).toBe(raw.kpis.assigned.value);
    const minutes = ds.cohort.timeEntries.reduce((n, e) => n + e.minutes, 0);
    expect(raw.kpis.minutesPerPatientDay.value).toBe(
      Math.round((minutes / (raw.kpis.patientDays.value as number)) * 10) / 10,
    );
    expect(raw.kpis.index.value).not.toBeNull();
  });

  it("the low-volume Beta-1 worker shows <k and complementary suppression hides one more", () => {
    const beta = select({ district: DISTRICT_IDS.beta, facility: null });
    const rows = beta.workers ?? [];
    expect(rows.map((r) => r.workerCode)).toEqual(["HW-031", "HW-032"]);
    const small = rows.find((r) => r.workerCode === "HW-032")!;
    expect(small.assigned).toMatchObject({ suppressed: true, reason: "PRIMARY" });
    const assignedCells = [...rows.map((r) => r.assigned), beta.kpis.assigned];
    expect(assignedCells.filter((c) => c.reason === "COMPLEMENTARY").length).toBeGreaterThanOrEqual(
      1,
    );
  });

  it("the same cells in every view (one pass); facility rows only in the facility view", () => {
    const all = select(ALL).workers ?? [];
    const alpha1 = select({ district: null, facility: FACILITY_IDS.alpha1 }).workers ?? [];
    expect(alpha1.every((r) => r.facilityId === FACILITY_IDS.alpha1)).toBe(true);
    for (const r of alpha1) expect(all.find((x) => x.key === r.key)).toEqual(r);
  });
});
