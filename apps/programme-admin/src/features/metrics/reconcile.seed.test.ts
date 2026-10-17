/**
 * Seed reconciliation (ADM-02): the calculators over the seeded Dexie store (fake-indexeddb)
 * agree with naive independent filters, and facility sums = district = overall.
 * ADM-04: Timeliness reconciles with the overview "Needs attention" card in every view.
 */
import {
  countByFacility,
  countFlagged,
  countScreened,
  kigaliDate,
  OVERVIEW_COUNT_METRICS,
  type MetricsDataset,
} from "@laif/analytics";
import { DISTRICT_IDS, PERSONA_IDS } from "@laif/mock-data";
import { createDexieStoreAdapter } from "@laif/repositories/dexie";
import { describe, expect, it } from "vitest";

import { DEFAULT_FILTERS, resolvePeriod } from "../filters/filterSchema.ts";
import { selectTimeliness } from "../timeliness/selectTimeliness.ts";
import { createTestServices, signIn } from "../../test/app.tsx";
import { loadMetricsDataset } from "./loadMetricsDataset.ts";
import { selectOverview } from "./selectOverview.ts";

describe("calculators vs the seeded admin Dexie store", () => {
  it("naive counts, and facility = district = overall", async () => {
    const store = createDexieStoreAdapter({ dbName: `laif-admin-reconcile-${Math.random()}` });
    const services = await createTestServices(store);
    await signIn(services, PERSONA_IDS.leadProgramme, null);
    const { persona, grant } = services.session.getState();
    if (persona === null) throw new Error("not signed in");
    const today = kigaliDate(services.clock.now());
    const period = resolvePeriod(DEFAULT_FILTERS, today);
    const load = async (district: string | null): Promise<MetricsDataset> =>
      (
        await loadMetricsDataset(
          services.repo,
          { persona, grant },
          { ...DEFAULT_FILTERS, district },
          period,
        )
      ).dataset;

    const overall = await load(null);
    const rows = await store.transaction((tx) =>
      Promise.all([
        tx.getAll<{ id: string; consentState: string }>("patients"),
        tx.getAll<{ status: string; measuredAt: string; patientId: string }>("screenings"),
      ]),
    );
    const withdrawn = new Set(
      rows[0].filter((p) => p.consentState === "withdrawn").map((p) => p.id),
    );
    const naive = rows[1].filter((s) => {
      const day = kigaliDate(s.measuredAt);
      return (
        s.status !== "draft" &&
        !withdrawn.has(s.patientId) &&
        day >= period.from &&
        day <= period.to
      );
    });
    expect(countScreened(overall)).toBe(naive.length);
    expect(countFlagged(overall)).toBe(naive.filter((s) => s.status === "review_required").length);
    expect(countScreened(overall)).toBeGreaterThan(100);

    const alpha = await load(DISTRICT_IDS.alpha);
    const beta = await load(DISTRICT_IDS.beta);
    for (const metric of OVERVIEW_COUNT_METRICS) {
      const sum = (ds: MetricsDataset) =>
        countByFacility(ds, metric).reduce((a, r) => a + r.value, 0);
      expect(sum(alpha) + sum(beta), metric).toBe(sum(overall));
    }
  });

  it("ADM-04: timeliness overdue / pending = overview needs attention; n's add up", async () => {
    const store = createDexieStoreAdapter({ dbName: `laif-admin-reconcile-tl-${Math.random()}` });
    const services = await createTestServices(store);
    await signIn(services, PERSONA_IDS.leadProgramme, null);
    const { persona, grant } = services.session.getState();
    if (persona === null) throw new Error("not signed in");
    const period = resolvePeriod(DEFAULT_FILTERS, kigaliDate(services.clock.now()));
    const ds = (
      await loadMetricsDataset(services.repo, { persona, grant }, DEFAULT_FILTERS, period)
    ).dataset;
    const now = Date.parse(ds.nowIso);
    // Naive overdue (explicit dueAt only, never stored): incomplete and dueAt < now.
    const naiveReferrals = ds.cohort.referrals.filter(
      (r) =>
        r.status !== "completed" &&
        r.status !== "cancelled_with_reason" &&
        Date.parse(r.dueAt) < now,
    ).length;
    const naiveFollowUps = ds.cohort.followUps.filter(
      (f) => f.status !== "completed" && Date.parse(f.dueAt) < now,
    ).length;
    const raw = selectTimeliness(ds, { district: null, facility: null }, 1);
    expect(raw.kpis.overdueReferrals.value).toBe(naiveReferrals);
    expect(raw.kpis.overdueFollowUps.value).toBe(naiveFollowUps);
    expect(raw.facilities.reduce((a, f) => a + (f.n.value ?? 0), 0)).toBe(raw.kpis.reviews.value);

    for (const view of [
      { district: null, facility: null },
      { district: DISTRICT_IDS.alpha, facility: null },
      { district: DISTRICT_IDS.beta, facility: null },
    ]) {
      const tl = selectTimeliness(ds, view, 5);
      const ov = selectOverview(ds, 5, { view });
      expect(tl.kpis.overdueReferrals).toEqual(ov.needsAttention.overdueReferrals);
      expect(tl.kpis.overdueFollowUps).toEqual(ov.needsAttention.overdueFollowUps);
      expect(tl.kpis.pendingAged8Plus.value).toBe(ov.needsAttention.pendingReviewAges["8+"].value);
      const last = tl.overdueTrend.at(-1)!;
      expect(last.referrals.value).toBe(tl.kpis.overdueReferrals.value);
      expect(last.followUps.value).toBe(tl.kpis.overdueFollowUps.value);
    }
  });
});
