import { formatNumber, useLanguage } from "@laif/i18n";
import { useCallback } from "react";

import { useTx } from "../i18n.ts";

/** Structural twin of `@laif/analytics` `SuppressedNumber` (no dependency on analytics). */
export type SuppressedValue = { value: number | null; suppressed: boolean };

/** A number (formatted per language), a pre-formatted string, or a suppressible count. */
export type MetricValue = number | string | SuppressedValue;

/** Default small-cell threshold shown in "Suppressed (<5)"; apps pass `DEMO_SMALL_CELL_THRESHOLD`. */
export const DEFAULT_SUPPRESSION_THRESHOLD = 5;

export function isSuppressedValue(value: unknown): value is SuppressedValue {
  return typeof value === "object" && value !== null && "suppressed" in value;
}

export type FormattedMetric = { text: string; suppressed: boolean; numeric: number | null };

/** Formats a `MetricValue`; suppressed values render `common:suppressed`. */
export function useMetricFormatter(): (value: MetricValue, threshold?: number) => FormattedMetric {
  const t = useTx();
  const { language } = useLanguage();
  return useCallback(
    (value: MetricValue, threshold = DEFAULT_SUPPRESSION_THRESHOLD): FormattedMetric => {
      if (typeof value === "string") return { text: value, suppressed: false, numeric: null };
      if (typeof value === "number") {
        return { text: formatNumber(value, language), suppressed: false, numeric: value };
      }
      if (value.suppressed || value.value === null) {
        return { text: t("common:suppressed", { threshold }), suppressed: true, numeric: null };
      }
      return { text: formatNumber(value.value, language), suppressed: false, numeric: value.value };
    },
    [language, t],
  );
}
