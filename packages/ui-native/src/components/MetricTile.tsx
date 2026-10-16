import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { useTx } from "../i18n.ts";
import { colors, radii, shadows, spacing } from "../tokens.ts";
import { AppText } from "./AppText.tsx";
import {
  DEFAULT_SUPPRESSION_THRESHOLD,
  useMetricFormatter,
  type MetricValue,
} from "./metric-value.ts";
import { TONE_COLORS, type Tone } from "./tone.ts";

export type MetricTileProps = {
  /** Translated label. */
  label: string;
  value: MetricValue;
  /** Small text after the value ("today", "+2"). */
  hint?: string;
  /** Adds a coloured dot before the label (never the only signal: the label is text). */
  tone?: Tone;
  suppressionThreshold?: number;
  /** `card` = standalone white tile; `plain` = no frame (inside a SummaryStrip). */
  variant?: "card" | "plain";
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/** One metric: label, big number, hint. Read as one element: "label, value, hint". */
export function MetricTile({
  label,
  value,
  hint,
  tone,
  suppressionThreshold = DEFAULT_SUPPRESSION_THRESHOLD,
  variant = "card",
  style,
  testID,
}: MetricTileProps) {
  const t = useTx();
  const format = useMetricFormatter();
  const formatted = format(value, suppressionThreshold);
  const spoken = [
    label,
    formatted.suppressed
      ? t("common:suppressedExplanation", { threshold: suppressionThreshold })
      : formatted.text,
    hint,
  ]
    .filter((part): part is string => part !== undefined)
    .join(", ");
  return (
    <View
      testID={testID}
      accessible
      accessibilityLabel={spoken}
      style={[variant === "card" ? styles.card : styles.plain, style]}
    >
      <View style={styles.labelRow}>
        {tone === undefined ? null : (
          <View style={[styles.dot, { backgroundColor: TONE_COLORS[tone].fg }]} />
        )}
        <AppText variant="caption" color="muted" dense>
          {label}
        </AppText>
      </View>
      <View style={styles.valueRow}>
        <AppText
          variant={formatted.suppressed ? "caption" : "display"}
          weight={formatted.suppressed ? "medium" : "bold"}
          color={formatted.suppressed ? "muted" : "ink"}
          heading={!formatted.suppressed}
          dense
        >
          {formatted.text}
        </AppText>
        {hint === undefined ? null : (
          <AppText
            variant="caption"
            dense
            colorValue={tone === undefined ? colors.muted : TONE_COLORS[tone].fg}
          >
            {hint}
          </AppText>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    gap: spacing.xs,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    ...shadows.card,
  },
  plain: { flex: 1, gap: spacing.xs, paddingHorizontal: spacing.md },
  labelRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  dot: { width: 6, height: 6, borderRadius: radii.pill },
  valueRow: { flexDirection: "row", alignItems: "baseline", flexWrap: "wrap", gap: spacing.xs },
});
