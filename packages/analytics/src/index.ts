/**
 * @laif/analytics — deterministic programme metric calculators, small-cell suppression and the
 * watermarked aggregate CSV (FND-06). Pure: no I/O, time only from the `now` argument.
 * Outputs carry counts, rates, medians and facility / district / worker-persona ids only.
 */
export const PACKAGE = "@laif/analytics" as const;

export * from "./types.ts";
export * from "./metric-keys.ts";
export * from "./filters.ts";
export * from "./dataset.ts";
export * from "./metrics/shared.ts";
export * from "./metrics/screening-overview.ts";
export * from "./metrics/funnel.ts";
export * from "./metrics/timeliness.ts";
export * from "./metrics/workload.ts";
export * from "./metrics/quality.ts";
export * from "./metrics/programme.ts";
export * from "./suppression.ts";
export * from "./aggregate-cells.ts";
export * from "./catalogue.ts";
export * from "./csv.ts";
export * from "./sha256.ts";
export * from "./reports.ts";
