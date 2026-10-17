/**
 * selectQuality (ADM-06 §9): the missing-field KPI equals the MISSING FIELD queue rows for the
 * same filters; the overturned values equal the funnel's dismissed / reviewed; the open-issue
 * count is the same measure and suppression as the overview's needs-attention card; the queue
 * tabs / type filter / pages of 20; no patient identifier in any output.
 */
import { computeFunnel, filterDataset, type MetricsRecords } from "@laif/analytics";
import { createSeed, DISTRICT_IDS, FACILITY_IDS, sliceForApp } from "@laif/mock-data";
import { describe, expect, it } from "vitest";

import { selectOverview } from "../metrics/selectOverview.ts";
import { queueIssues, selectQuality, selectQueue, QUEUE_PAGE_SIZE } from "./selectQuality.ts";

const slice = sliceForApp(createSeed(), "admin");
const records: MetricsRecords = {
  ...slice,
  timeEntries: (slice.extraCollections["timeEntries"] ?? []) as MetricsRecords["timeEntries"],
};
const now = new Date("2026-10-14T06:00:00.000Z");
const ds = filterDataset(records, { from: "2026-07-17", to: "2026-10-14" }, now);
const ALL = { district: null, facility: null };
const ALPHA = { district: DISTRICT_IDS.alpha, facility: null };

describe("selectQuality", () => {
  it("missing-field KPI = number of MISSING FIELD queue rows (raw and, when shown, published)", () => {
    for (const [view, k] of [
      [ALL, 1],
      [ALPHA, 1],
      [ALL, 5],
    ] as const) {
      const v = selectQuality(ds, view, k);
      const rows = queueIssues(ds, view, []).filter((i) => i.type === "missing_field");
      if (!v.kpis.missing.suppressed) expect(v.kpis.missing.value).toBe(rows.length);
      expect(v.byField.glucoseUnit.suppressed || (v.byField.glucoseUnit.value ?? 0) >= 1).toBe(
        true,
      );
    }
    const open = selectQuality(ds, ALL, 1);
    expect(open.kpis.missing.value).toBe(
      queueIssues(ds, ALL, []).filter((i) => i.type === "missing_field").length,
    );
    expect(open.byField.glucoseUnit.value).toBeGreaterThanOrEqual(2);
  });

  it("overturned / reviewed equal the funnel's dismissed / reviewed for the same filters", () => {
    const v = selectQuality(ds, ALL, 1);
    const funnel = computeFunnel(ds);
    expect(v.kpis.overturned.value).toBe(funnel.dismissed.n);
    expect(v.kpis.reviewed.value).toBe(funnel.stages.find((s) => s.id === "reviewed")?.n);
    expect(v.kpis.overturnedRate.value).toBe(
      Math.round((funnel.dismissed.n / (v.kpis.reviewed.value ?? 1)) * 10_000) / 10_000,
    );
  });

  it("open issues: the same cells as the overview's needs-attention card (k = 5)", () => {
    for (const view of [ALL, ALPHA, { district: null, facility: FACILITY_IDS.beta1 }]) {
      const quality = selectQuality(ds, view, 5);
      const overview = selectOverview(ds, 5, { view });
      expect({ ...quality.openTotal, key: "x" }).toEqual({
        ...overview.needsAttention.openQualityIssues,
        key: "x",
      });
    }
    const raw = selectQuality(ds, ALL, 1);
    expect(raw.openTotal.value).toBe(queueIssues(ds, ALL, []).length);
  });

  it("the duplicate identifier pair gives one DUPLICATE ID issue; the invariant check is 0", () => {
    const v = selectQuality(ds, ALL, 1);
    expect(v.kpis.duplicateIdentifier.value).toBe(1);
    expect(v.invariants.completedWithoutEvidence.value).toBe(0);
    expect(v.kpis.duplicateSubmissions.value).toBe(0); // the seed read has no audit source here
    expect(queueIssues(ds, ALL, []).filter((i) => i.type === "duplicate_identifier")).toHaveLength(
      1,
    );
  });

  it("the queue: tab counts, type filter, pages of 20", () => {
    const issues = queueIssues(ds, ALL, []);
    const q = selectQueue(issues, "open", null, 1);
    expect(q.counts.open).toBe(issues.length);
    expect(q.counts.resolved_with_note).toBe(0);
    expect(q.rows.length).toBe(Math.min(QUEUE_PAGE_SIZE, issues.length));
    const typed = selectQueue(issues, "open", "missing_field", 1);
    expect(typed.rows.every((i) => i.type === "missing_field")).toBe(true);
    const many = Array.from({ length: 45 }, (_, n) => ({
      ...issues[0]!,
      id: `dqi_${String(n).padStart(16, "0")}`,
    }));
    expect(selectQueue(many, "open", null, 3).rows).toHaveLength(5);
    expect(selectQueue(many, "open", null, 9).page).toBe(3);
  });

  it("no patient name, synthetic identifier or patient id in the view or the queue", () => {
    const json = JSON.stringify([selectQuality(ds, ALL, 1), queueIssues(ds, ALL, [])]);
    for (const p of records.patients) {
      expect(json).not.toContain(p.id);
      expect(json).not.toContain(p.syntheticIdentifier);
      expect(json).not.toContain(p.displayName);
    }
  });
});
