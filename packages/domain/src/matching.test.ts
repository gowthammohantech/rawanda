import { describe, expect, it } from "vitest";

import { asId, type PersonaId } from "./ids.ts";
import { nameSimilarity, PATIENT_MATCH_THRESHOLD, scorePatientMatch } from "./matching.ts";
import { matchesReviewQueueTab, REVIEW_QUEUE_TABS } from "./queue.ts";

const now = new Date("2026-10-14T06:00:00.000Z");
const patient = {
  displayName: "Aline Demo-Uwase",
  dateOfBirth: "1980-03-01",
  sexOptional: "female" as const,
};

describe("scorePatientMatch", () => {
  it("scores an identical person 1 and is order/accent insensitive", () => {
    const same = { name: "Aline Demo-Uwase", dateOfBirth: "1980-03-01", sex: "female" as const };
    expect(scorePatientMatch(same, patient, now)).toBe(1);
    expect(nameSimilarity("Demo-Uwase Âline", "aline demo uwase")).toBe(1);
  });

  it("flags close spellings with similar age above the threshold", () => {
    const near = { name: "Alin Demo Uwasse", dateOfBirth: null, estimatedAgeYears: 46, sex: null };
    expect(scorePatientMatch(near, patient, now)).toBeGreaterThanOrEqual(PATIENT_MATCH_THRESHOLD);
  });

  it("keeps different people below the threshold, deterministically", () => {
    const other = { name: "Jean Demo-Habimana", dateOfBirth: "1999-01-01", sex: "male" as const };
    const score = scorePatientMatch(other, patient, now);
    expect(score).toBeLessThan(0.5);
    expect(scorePatientMatch(other, patient, now)).toBe(score);
    expect(nameSimilarity("", "x")).toBe(0);
    expect(nameSimilarity("a", "b")).toBe(0);
  });

  it("uses age bands when birth dates differ", () => {
    const base = { name: "Zzz", sex: "male" as const };
    const twoYears = { ...base, dateOfBirth: "1978-06-01" };
    const far = { ...base, dateOfBirth: "1960-01-01" };
    const s2 = scorePatientMatch(twoYears, { ...patient, sexOptional: "male" }, now);
    const sFar = scorePatientMatch(far, { ...patient, sexOptional: "male" }, now);
    expect(s2).toBeGreaterThan(sFar);
  });
});

describe("matchesReviewQueueTab", () => {
  const me = asId<PersonaId>("persona-clin-alpha1");
  const ctx = { now, personaId: me };
  const review = {
    status: "pending" as const,
    priority: "urgent_demo" as const,
    reviewDueAt: "2026-10-13T06:00:00.000Z",
    assignedClinicianId: me,
  };

  it("matches every tab for an open urgent overdue assigned review", () => {
    for (const tab of REVIEW_QUEUE_TABS) expect(matchesReviewQueueTab(review, tab, ctx)).toBe(true);
  });

  it("only `all` matches a decided review; due exactly now is not overdue", () => {
    const decided = { ...review, status: "action_recorded" as const };
    expect(REVIEW_QUEUE_TABS.filter((t) => matchesReviewQueueTab(decided, t, ctx))).toEqual([
      "all",
    ]);
    const dueNow = { ...review, reviewDueAt: now.toISOString() };
    expect(matchesReviewQueueTab(dueNow, "overdue", ctx)).toBe(false);
    expect(matchesReviewQueueTab(review, "assigned", { now, personaId: null })).toBe(false);
  });
});
