/**
 * Data quality (FND-06 task 10). ADM-06 extends this file in place (fairness disaggregation,
 * dismissal-reason distribution, ruleset breakdown).
 */
import { applyMetricsFilter } from "../filters.ts";
import type { AnalyticsInput, MetricsFilter } from "../types.ts";
import { classifyPathway } from "./funnel.ts";
import { isRecorded } from "./shared.ts";

export type DataQuality = {
  /** Submitted screenings with a glucose value but no unit (not evaluable, FND-02). */
  missingGlucoseUnit: number;
  /** Patients in scope with identity status `possible_duplicate`. */
  possibleDuplicateIdentities: number;
  /** Flagged screenings dismissed at review ("flags overturned at review"). */
  flagsOverturnedAtReview: number;
  /** Amendment records on submitted screenings. */
  screeningAmendments: number;
  /** Submitted screenings with at least one amendment. */
  amendedScreenings: number;
};

export function dataQuality(data: AnalyticsInput, filter: MetricsFilter, now: Date): DataQuality {
  void now;
  const d = applyMetricsFilter(data, filter);
  const recorded = d.screenings.filter(isRecorded);
  return {
    missingGlucoseUnit: recorded.filter((s) => s.glucoseValue !== null && s.glucoseUnit === null)
      .length,
    possibleDuplicateIdentities: d.patients.filter((p) => p.identityStatus === "possible_duplicate")
      .length,
    flagsOverturnedAtReview: classifyPathway(d).dismissed.size,
    screeningAmendments: recorded.reduce((n, s) => n + s.amendments.length, 0),
    amendedScreenings: recorded.filter((s) => s.amendments.length > 0).length,
  };
}
