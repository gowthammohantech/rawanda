import type { MetricsFilter } from "@laif/contracts";
import type { SeedDataset } from "@laif/mock-data";

/**
 * What every calculator reads (FND-06 task 6). Results expose only counts, rates, medians and
 * facility / district / worker-persona ids — never patient names or identifiers.
 */
export type AnalyticsInput = Pick<
  SeedDataset,
  "patients" | "screenings" | "reviews" | "referrals" | "followUps" | "facilities" | "districts"
>;

export type { MetricsFilter };

/** A ratio in [0, 1] rounded to 4 decimals, or null when the denominator is 0. */
export type Rate = number | null;

/** Version stamp of the metric definitions (CSV `metric_version`, ADM-02 catalogue). */
export const METRIC_VERSION = "demo-metrics-1" as const;

/** Every calculator has this signature. */
export type MetricCalculator<R> = (data: AnalyticsInput, filter: MetricsFilter, now: Date) => R;
