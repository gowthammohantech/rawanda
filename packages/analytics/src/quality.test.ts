/**
 * ADM-06 safety & quality calculators over the ADM-02 dataset: the mandatory-field matrix and
 * conditional glucose / blood-pressure rules, identity-mismatch detection, stable and idempotent
 * issue detection (no PII in subject refs), funnel-consistent overturned rate, the invariant
 * check, trend / fairness / reason sums and the open-issue count shared with the overview.
 */
import { MANDATORY_SCREENING_FIELDS, SUBJECT_REF_PATTERN } from "@laif/contracts";
import { fnv1a64Hex, type Screening } from "@laif/domain";
import { createSeed, DISTRICT_IDS, FACILITY_IDS, sliceForApp } from "@laif/mock-data";
import { describe, expect, it } from "vitest";

import {
  ageBandOf,
  duplicateIdentifierGroupsOf,
  filterDataset,
  type MetricsRecords,
} from "./dataset.ts";
import { computeFunnel } from "./metrics/funnel.ts";
import {
  completedWithoutEvidence,
  detectQualityIssues,
  DISMISSAL_REASON_BUCKETS,
  dismissalReasonDistribution,
  duplicateSubmissionsPrevented,
  FAIRNESS_PROXY_LABEL,
  flagReviewOutcomesByGroup,
  identityMismatchSignals,
  missedFlagProxy,
  missingFieldsFor,
  openQualityIssueCount,
  OVERTURN_PROXY_LABEL,
  overturnedFlagRate,
  qualityIssueId,
  screeningsWithMissingFields,
  subjectRefOf,
  weeklyQualityTrend,
} from "./metrics/quality.ts";
import { needsAttention } from "./metrics/screening-overview.ts";

const slice = sliceForApp(createSeed(), "admin");
const records: MetricsRecords = {
  ...slice,
  timeEntries: (slice.extraCollections["timeEntries"] ?? []) as MetricsRecords["timeEntries"],
  duplicateSubmissions: slice.auditEvents
    .filter((e) => e.action === "sync.duplicate_suppressed" && e.facilityId !== null)
    .map((e) => ({ facilityId: e.facilityId as string, occurredAt: e.occurredAt })),
};
const now = new Date("2026-10-14T06:00:00.000Z");
const PERIOD = { from: "2026-07-17", to: "2026-10-14" } as const;
const ds = (r: MetricsRecords = records, extra: { districtIds?: string[] } = {}) =>
  filterDataset(
    r,
    {
      ...PERIOD,
      ...(extra.districtIds === undefined ? {} : { districtIds: extra.districtIds as never }),
    },
    now,
  );

const complete: Parameters<typeof missingFieldsFor>[0] = {
  patientId: "p1" as Screening["patientId"],
  facilityId: FACILITY_IDS.alpha1,
  workerId: "persona-chw-1" as Screening["workerId"],
  measuredAt: "2026-10-01T08:00:00.000Z",
  source: "worker_mobile",
  rulesetVersion: "demo-ruleset-2026.10-v1",
  glucoseValue: null,
  glucoseUnit: null,
  glucoseContext: null,
  systolic: 120,
  diastolic: 80,
};

describe("missingFieldsFor (mandatory-field matrix)", () => {
  it("a complete BP-only screening misses nothing", () => {
    expect(missingFieldsFor(complete)).toEqual([]);
  });

  it.each([
    ["patientId", { patientId: "" }],
    ["facilityId", { facilityId: " " }],
    ["workerId", { workerId: "" }],
    ["measuredAt", { measuredAt: "" }],
    ["source", { source: "" }],
    ["rulesetVersion", { rulesetVersion: null }],
  ] as const)("always-required field %s", (field, patch) => {
    expect(missingFieldsFor({ ...complete, ...(patch as object) })).toEqual([field]);
  });

  it("glucose unit and context are required only when a glucose value is present", () => {
    expect(missingFieldsFor({ ...complete, glucoseUnit: null, glucoseContext: null })).toEqual([]);
    expect(missingFieldsFor({ ...complete, glucoseValue: 9.2, glucoseContext: "fasting" })).toEqual(
      ["glucoseUnit"],
    );
    expect(missingFieldsFor({ ...complete, glucoseValue: 9.2 })).toEqual([
      "glucoseUnit",
      "glucoseContext",
    ]);
    expect(
      missingFieldsFor({
        ...complete,
        glucoseValue: 9.2,
        glucoseUnit: "mmol_per_l" as never,
        glucoseContext: "fasting",
      }),
    ).toEqual([]);
  });

  it("systolic and diastolic are required together", () => {
    expect(missingFieldsFor({ ...complete, diastolic: null })).toEqual(["diastolic"]);
    expect(missingFieldsFor({ ...complete, systolic: null })).toEqual(["systolic"]);
    expect(missingFieldsFor({ ...complete, systolic: null, diastolic: null })).toEqual([]);
  });

  it("returns fields in MANDATORY_SCREENING_FIELDS order", () => {
    const all = missingFieldsFor({
      ...complete,
      patientId: "" as never,
      rulesetVersion: null,
      glucoseValue: 5,
      systolic: null,
    });
    expect(all).toEqual(MANDATORY_SCREENING_FIELDS.filter((f) => all.includes(f)));
  });
});

describe("calculators on the admin seed", () => {
  const d = ds();

  it("the seeded missing-unit screenings appear under glucoseUnit and match the issues", () => {
    const m = screeningsWithMissingFields(d);
    expect(m.byField.glucoseUnit).toBeGreaterThanOrEqual(2);
    expect(m.n).toBe(detectQualityIssues(d).filter((i) => i.type === "missing_field").length);
    expect(m.rate).toBe(Math.round((m.n / m.screened) * 10_000) / 10_000);
  });

  it("the seeded duplicate identifier pair is one group; no orphans in the seed", () => {
    expect(identityMismatchSignals(d)).toEqual({ duplicateIdentifier: 1, orphanScreening: 0 });
    const dup = detectQualityIssues(d).filter((i) => i.type === "duplicate_identifier");
    expect(dup).toHaveLength(1);
    expect(dup[0]?.facilityId).toBe(FACILITY_IDS.alpha2);
    expect(dup[0]?.details.records).toBe(2);
  });

  it("repository-shaped records (identifiers blanked, groups supplied) give the same result", () => {
    const groups = duplicateIdentifierGroupsOf(records.patients);
    const blanked: MetricsRecords = {
      ...records,
      patients: records.patients.map((p) => ({
        ...p,
        displayName: "",
        syntheticIdentifier: "",
        dateOfBirth: null,
      })),
      duplicateIdentifierGroups: groups,
      patientAgeBands: Object.fromEntries(
        records.patients.map((p) => [p.id, ageBandOf(p, now.toISOString())]),
      ),
    };
    expect(detectQualityIssues(ds(blanked))).toEqual(detectQualityIssues(d));
    expect(flagReviewOutcomesByGroup(ds(blanked))).toEqual(flagReviewOutcomesByGroup(d));
  });

  it("detects an orphan screening (no patient record in scope)", () => {
    const victim = d.cohort.screenings[0];
    if (victim === undefined) throw new Error("no screening");
    const orphaned: MetricsRecords = {
      ...records,
      patients: records.patients.filter((p) => p.id !== victim.patientId),
    };
    const od = ds(orphaned);
    expect(identityMismatchSignals(od).orphanScreening).toBeGreaterThanOrEqual(1);
    expect(detectQualityIssues(od).some((i) => i.type === "orphan_screening")).toBe(true);
  });

  it("overturned rate equals the funnel's dismissed / reviewed; labelled PROXY", () => {
    const o = overturnedFlagRate(d);
    const funnel = computeFunnel(d);
    const reviewed = funnel.stages.find((s) => s.id === "reviewed")?.n;
    expect(o.dismissed).toBe(funnel.dismissed.n);
    expect(o.reviewed).toBe(reviewed);
    expect(o.label).toBe(OVERTURN_PROXY_LABEL);
    expect(o.label).toBe("PROXY · not clinical accuracy");
  });

  it("missed-flag proxy counts the manual escalation of a no-review-required screening", () => {
    expect(missedFlagProxy(d).n).toBe(1);
    expect(detectQualityIssues(d).filter((i) => i.type === "manual_escalation")).toHaveLength(1);
  });

  it("duplicate submissions prevented = sync.duplicate_suppressed events in the period", () => {
    expect(duplicateSubmissionsPrevented(d)).toBe(records.duplicateSubmissions?.length);
    expect(duplicateSubmissionsPrevented(d)).toBeGreaterThanOrEqual(1);
    const empty = filterDataset(records, { from: "2020-01-01", to: "2020-01-31" }, now);
    expect(duplicateSubmissionsPrevented(empty)).toBe(0);
  });

  it("invariant check: no completed referral lacks evidence; a broken record is counted", () => {
    expect(completedWithoutEvidence(d)).toBe(0);
    const completed = d.cohort.referrals.find((r) => r.status === "completed");
    if (completed === undefined) throw new Error("no completed referral");
    const broken = {
      ...d,
      cohort: {
        ...d.cohort,
        referrals: d.cohort.referrals.map((r) =>
          r.id === completed.id ? { ...r, completionEvidence: null } : r,
        ),
      },
    };
    expect(completedWithoutEvidence(broken)).toBe(1);
  });

  it("weekly trend sums to the KPIs", () => {
    const weeks = weeklyQualityTrend(d);
    const mismatch = identityMismatchSignals(d);
    expect(weeks.reduce((a, w) => a + w.missingFields, 0)).toBe(screeningsWithMissingFields(d).n);
    expect(weeks.reduce((a, w) => a + w.mismatches, 0)).toBe(
      mismatch.duplicateIdentifier + mismatch.orphanScreening,
    );
  });

  it("fairness disaggregation: each dimension sums to the total; labelled PROXY", () => {
    const f = flagReviewOutcomesByGroup(d);
    expect(f.label).toBe(FAIRNESS_PROXY_LABEL);
    for (const column of ["flagged", "overturned", "manualEscalation"] as const) {
      expect(Object.values(f.sex).reduce((a, g) => a + g[column], 0)).toBe(f.total[column]);
      expect(Object.values(f.age).reduce((a, g) => a + g[column], 0)).toBe(f.total[column]);
    }
    expect(f.total.overturned).toBe(overturnedFlagRate(d).dismissed);
    expect(f.total.manualEscalation).toBe(1);
  });

  it("dismissal reasons are structured codes summing to dismissed", () => {
    const r = dismissalReasonDistribution(d);
    expect(Object.keys(r)).toEqual([...DISMISSAL_REASON_BUCKETS]);
    expect(Object.values(r).reduce((a, n) => a + n, 0)).toBe(overturnedFlagRate(d).dismissed);
  });

  it("is additive across districts", () => {
    const a = ds(records, { districtIds: [DISTRICT_IDS.alpha] });
    const b = ds(records, { districtIds: [DISTRICT_IDS.beta] });
    expect(detectQualityIssues(a).length + detectQualityIssues(b).length).toBe(
      detectQualityIssues(d).length,
    );
  });
});

describe("detectQualityIssues", () => {
  const d = ds();

  it("ids are stable: dqi_ + FNV-1a 64 of type:subjectRef", () => {
    for (const issue of detectQualityIssues(d)) {
      expect(issue.id).toBe(qualityIssueId(issue.type, issue.subjectRef));
      expect(issue.id).toBe(`dqi_${fnv1a64Hex(`${issue.type}:${issue.subjectRef}`)}`);
    }
  });

  it("is idempotent: running twice gives the same issues and count, no duplicate ids", () => {
    const first = detectQualityIssues(d);
    const second = detectQualityIssues(ds());
    expect(second).toEqual(first);
    expect(new Set(first.map((i) => i.id)).size).toBe(first.length);
  });

  it("subject refs are opaque record refs — never a name or synthetic identifier", () => {
    const issues = detectQualityIssues(d);
    const json = JSON.stringify(issues);
    for (const p of records.patients) {
      expect(json).not.toContain(p.syntheticIdentifier);
      if (p.displayName !== "") expect(json).not.toContain(p.displayName);
    }
    for (const issue of issues) expect(SUBJECT_REF_PATTERN.test(issue.subjectRef)).toBe(true);
    expect(subjectRefOf("SCR", "6e4e8f18-391d-5ebf-ae40-8d1839117dfd")).toBe("SCR-6e4e8f18");
    expect(subjectRefOf("REV", "fx-review-04")).not.toBe(subjectRefOf("REV", "fx-review-05"));
  });

  it("missing-field issues carry the field ids, rule and ruleset version", () => {
    const missing = detectQualityIssues(d).filter((i) => i.type === "missing_field");
    expect(missing.length).toBeGreaterThanOrEqual(2);
    for (const issue of missing) {
      expect(issue.details.rule).toBe("DQ-01-MANDATORY-FIELDS");
      expect(issue.details.fields).toContain("glucoseUnit");
      expect(issue.details.rulesetVersion).not.toBeNull();
    }
  });
});

describe("openQualityIssueCount (overview + Safety & quality Open tab)", () => {
  it("counts detected issues whose stored status is open (never triaged = open)", () => {
    const d = ds();
    const issues = detectQualityIssues(d);
    expect(openQualityIssueCount(d)).toBe(issues.length);
    expect(needsAttention(d).openQualityIssues).toBe(issues.length);
    const first = issues[0];
    if (first === undefined) throw new Error("no issue");
    const triaged = ds({
      ...records,
      qualityIssueStatus: { [first.id]: "acknowledged", dqi_unknown: "resolved_with_note" },
    });
    expect(openQualityIssueCount(triaged)).toBe(issues.length - 1);
    expect(needsAttention(triaged).openQualityIssues).toBe(issues.length - 1);
  });
});
