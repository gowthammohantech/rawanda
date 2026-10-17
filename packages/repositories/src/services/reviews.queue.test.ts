/**
 * CLN-05 queue extensions of `listReviews` / `countReviews`: `tab` uses the shared domain
 * predicate (rows across all pages == count for the same filter), `q` matches the patient name or
 * synthetic id, `sort` orders, `decidedSince` feeds "reviewed this week". Scope still applies.
 */
import { REVIEW_QUEUE_TABS, type Patient, type Review, type ReviewQueueSort } from "@laif/domain";
import { FACILITY_IDS, PERSONA_IDS, SEED_ANCHORS } from "@laif/mock-data";
import { describe, expect, it } from "vitest";

import type { ReviewFilterInput } from "../care-repository.ts";
import { createHarness } from "../testing/harness.ts";

type Harness = Awaited<ReturnType<typeof createHarness>>;

async function allRows(h: Harness, filter: ReviewFilterInput): Promise<Review[]> {
  const rows: Review[] = [];
  for (let page = 1; ; page += 1) {
    const result = await h.repo.listReviews({ ...filter, page, pageSize: 2 });
    rows.push(...result.items);
    if (rows.length >= result.total || result.items.length === 0) return rows;
  }
}

describe("reviews service — CLN-05 queue filters", () => {
  it("for every tab and filter combination, rows across all pages == countReviews", async () => {
    const h = await createHarness({ personaId: PERSONA_IDS.coordAlpha });
    const filters: ReviewFilterInput[] = [
      {},
      { facilityIds: [FACILITY_IDS.alpha1] },
      { facilityIds: [FACILITY_IDS.alpha2] },
      { assignedClinicianId: PERSONA_IDS.clinAlpha1 },
      { assignedClinicianId: null },
      { q: "demo-p" },
      { q: "zz-no-such-patient" },
    ];
    for (const filter of filters) {
      const counts = await h.repo.countReviews(filter);
      for (const tab of REVIEW_QUEUE_TABS) {
        const rows = await allRows(h, { ...filter, tab });
        expect(rows.length, `${JSON.stringify(filter)} ${tab}`).toBe(counts[tab]);
        expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
      }
    }
  });

  it("WF-04: Alpha personas never see the Beta-1 review in any tab or count", async () => {
    const wf04 = SEED_ANCHORS.WF04_OTHER_FACILITY_PATIENT;
    for (const personaId of [PERSONA_IDS.clinAlpha1, PERSONA_IDS.coordAlpha]) {
      const h = await createHarness({ personaId });
      for (const tab of REVIEW_QUEUE_TABS) {
        const rows = await allRows(h, { tab });
        expect(rows.some((r) => r.facilityId === FACILITY_IDS.beta1)).toBe(false);
        expect(rows.some((r) => r.patientId === wf04.patientId)).toBe(false);
      }
      const all = await h.repo.countReviews({});
      const own = (await h.repo.listReviews({ pageSize: 200 })).items;
      expect(all.all).toBe(own.length);
    }
  });

  it("WF01_FLAGGED_REVIEW is in Pending and Assigned to me for the clinician", async () => {
    const h = await createHarness({ personaId: PERSONA_IDS.clinAlpha1 });
    const id = SEED_ANCHORS.WF01_FLAGGED_REVIEW.reviewId;
    expect((await allRows(h, { tab: "pending" })).map((r) => r.id)).toContain(id);
    expect((await allRows(h, { tab: "assigned" })).map((r) => r.id)).toContain(id);
  });

  it("q matches display name and synthetic id case-insensitively, scoped", async () => {
    const h = await createHarness({ personaId: PERSONA_IDS.clinAlpha1 });
    const patients = await h.store.getAll<Patient>("patients");
    const anchor = SEED_ANCHORS.WF01_FLAGGED_REVIEW;
    const patient = patients.find((p) => p.id === anchor.patientId) as Patient;
    const byName = await h.repo.listReviews({ q: patient.displayName.toUpperCase(), tab: "all" });
    expect(byName.items.length).toBeGreaterThan(0);
    expect(byName.items.every((r) => r.patientId === patient.id)).toBe(true);
    const byId = await h.repo.listReviews({ q: patient.syntheticIdentifier, tab: "all" });
    expect(byId.items.map((r) => r.id)).toContain(anchor.reviewId);
    const wf04 = patients.find(
      (p) => p.id === SEED_ANCHORS.WF04_OTHER_FACILITY_PATIENT.patientId,
    ) as Patient;
    expect((await h.repo.countReviews({ q: wf04.displayName })).all).toBe(0);
  });

  it("sort orders: flag time asc / desc, due date (none last), patient name", async () => {
    const h = await createHarness({ personaId: PERSONA_IDS.coordAlpha });
    const patients = new Map(
      (await h.store.getAll<Patient>("patients")).map((p) => [p.id as string, p.displayName]),
    );
    const list = (sort: ReviewQueueSort) =>
      h.repo.listReviews({ tab: "all", sort, pageSize: 200 }).then((p) => p.items);
    const asc = (await list("flaggedAt_asc")).map((r) => r.createdAt);
    expect(asc).toEqual([...asc].sort());
    const desc = (await list("flaggedAt_desc")).map((r) => r.createdAt);
    expect(desc).toEqual([...asc].sort().reverse());
    const due = (await list("dueAt_asc")).map((r) => r.reviewDueAt);
    const dated = due.filter((d): d is string => d !== null);
    expect(due.slice(0, dated.length)).toEqual([...dated].sort());
    const names = (await list("patient_asc")).map((r) =>
      (patients.get(r.patientId) ?? "").toLowerCase(),
    );
    expect(names).toEqual([...names].sort());
  });

  it("decidedSince keeps reviews decided at or after the instant", async () => {
    const h = await createHarness({ personaId: PERSONA_IDS.clinAlpha1 });
    const since = "2026-10-11T22:00:00.000Z";
    const page = await h.repo.listReviews({ decidedSince: since, pageSize: 200 });
    const all = (await h.repo.listReviews({ pageSize: 200 })).items;
    const expected = all.filter((r) => r.reviewedAt !== null && r.reviewedAt >= since);
    expect(page.total).toBe(expected.length);
    expect(page.items.every((r) => r.reviewedAt !== null && r.reviewedAt >= since)).toBe(true);
  });
});
