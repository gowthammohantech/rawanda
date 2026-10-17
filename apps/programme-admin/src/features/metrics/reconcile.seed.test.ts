/**
 * Seed reconciliation (ADM-02): the calculators over the seeded Dexie store (fake-indexeddb)
 * agree with naive independent filters, and facility sums = district = overall.
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
import { createTestServices, signIn } from "../../test/app.tsx";
import { loadMetricsDataset } from "./loadMetricsDataset.ts";

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
});
