/**
 * HWM-04 matcher refinements: component breakdown + reason codes, the DEMO threshold alias and
 * age at the demo date (Africa/Kigali calendar day).
 */
import { describe, expect, it } from "vitest";

import {
  DEMO_MATCH_THRESHOLD,
  explainPatientMatch,
  PATIENT_MATCH_THRESHOLD,
  patientAgeYears,
  scorePatientMatch,
} from "../matching.ts";

const now = new Date("2026-10-14T06:00:00.000Z");
const existing = {
  displayName: "Qorvox Zelqarqo",
  dateOfBirth: "1981-12-11",
  sexOptional: "male" as const,
};

describe("explainPatientMatch / scorePatientMatch (HWM-04)", () => {
  it("DEMO_MATCH_THRESHOLD is the PO-decision placeholder 0.75", () => {
    expect(DEMO_MATCH_THRESHOLD).toBe(PATIENT_MATCH_THRESHOLD);
    expect(DEMO_MATCH_THRESHOLD).toBe(0.75);
  });

  it("same DOB + similar name → above threshold with both reasons, score equals scorePatientMatch", () => {
    const candidate = { name: "Qorvoks Zelqarqo", dateOfBirth: "1981-12-11", sex: "male" as const };
    const result = explainPatientMatch(candidate, existing, now);
    expect(result.reasons).toEqual(["similar_name", "same_date_of_birth", "same_sex"]);
    expect(result.birth).toBe(1);
    expect(result.score).toBeGreaterThanOrEqual(DEMO_MATCH_THRESHOLD);
    expect(scorePatientMatch(candidate, existing, now)).toBe(result.score);
  });

  it("identical name in another order is `same_name`; estimated age within a year is `similar_age`", () => {
    const candidate = {
      name: "zelqarqo QORVOX",
      dateOfBirth: null,
      estimatedAgeYears: 45,
      sex: "not_recorded" as const,
    };
    const result = explainPatientMatch(candidate, existing, now);
    expect(result.reasons).toEqual(["same_name", "similar_age"]);
    expect(result.sex).toBe(0.5);
    expect(result.score).toBe(Math.round((0.6 + 0.3 * 0.8 + 0.05) * 10_000) / 10_000);
  });

  it("a different person stays below the threshold with no reasons", () => {
    const candidate = { name: "Xelrix Quorezo", dateOfBirth: "1953-04-04", sex: "female" as const };
    const result = explainPatientMatch(candidate, existing, now);
    expect(result.reasons).toEqual([]);
    expect(result.score).toBeLessThan(DEMO_MATCH_THRESHOLD);
  });

  it("same name but a very different age and sex is not enough on its own", () => {
    const candidate = {
      name: "Qorvox Zelqarqo",
      dateOfBirth: "2001-01-01",
      sex: "female" as const,
    };
    expect(scorePatientMatch(candidate, existing, now)).toBeLessThan(DEMO_MATCH_THRESHOLD);
  });
});

describe("patientAgeYears", () => {
  it("counts whole years at the Kigali calendar day", () => {
    expect(patientAgeYears({ dateOfBirth: "1981-12-11" }, now)).toBe(44);
    expect(patientAgeYears({ dateOfBirth: "1980-10-14" }, now)).toBe(46);
    expect(patientAgeYears({ dateOfBirth: "1980-10-15" }, now)).toBe(45);
    // 23:30 UTC on 13 Oct is already 14 Oct in Kigali (UTC+2).
    expect(
      patientAgeYears({ dateOfBirth: "1980-10-14" }, new Date("2026-10-13T23:30:00.000Z")),
    ).toBe(46);
  });

  it("falls back to the estimate, else null; malformed dates are null", () => {
    expect(patientAgeYears({ dateOfBirth: null, estimatedAgeYears: 59 }, now)).toBe(59);
    expect(patientAgeYears({ dateOfBirth: null }, now)).toBeNull();
    expect(patientAgeYears({ dateOfBirth: "14/10/1980" }, now)).toBeNull();
  });
});
