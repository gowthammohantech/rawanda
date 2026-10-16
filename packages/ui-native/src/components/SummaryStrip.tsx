import { StyleSheet, View } from "react-native";

import { colors, radii, shadows, spacing } from "../tokens.ts";
import { MetricTile } from "./MetricTile.tsx";
import { DEFAULT_SUPPRESSION_THRESHOLD, type MetricValue } from "./metric-value.ts";
import type { Tone } from "./tone.ts";

export type SummaryItem = {
  id?: string;
  label: string;
  value: MetricValue;
  hint?: string;
  tone?: Tone;
};

export type SummaryStripProps = {
  items: readonly SummaryItem[];
  /** Accessible name of the strip. */
  label?: string;
  suppressionThreshold?: number;
  testID?: string;
};

/** One white card split by vertical dividers (native `KpiStrip`); wraps at 3 per row. */
export function SummaryStrip({
  items,
  label,
  suppressionThreshold = DEFAULT_SUPPRESSION_THRESHOLD,
  testID,
}: SummaryStripProps) {
  return (
    <View
      testID={testID ?? "summary-strip"}
      {...(label === undefined ? {} : { accessibilityLabel: label })}
      accessibilityRole="summary"
      style={styles.strip}
    >
      {items.map((item, index) => (
        <View key={item.id ?? index} style={[styles.cell, index % 3 !== 0 ? styles.divider : null]}>
          <MetricTile
            variant="plain"
            label={item.label}
            value={item.value}
            {...(item.hint === undefined ? {} : { hint: item.hint })}
            {...(item.tone === undefined ? {} : { tone: item.tone })}
            suppressionThreshold={suppressionThreshold}
          />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: "row",
    flexWrap: "wrap",
    rowGap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    ...shadows.card,
  },
  cell: { flexBasis: "33%", flexGrow: 1 },
  divider: { borderLeftWidth: 1, borderLeftColor: colors.borderSoft },
});
