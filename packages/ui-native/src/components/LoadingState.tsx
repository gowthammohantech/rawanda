import { ActivityIndicator, StyleSheet, View } from "react-native";

import { a11yState, useReduceMotion } from "../a11y.ts";
import { useTx } from "../i18n.ts";
import { colors, radii, spacing } from "../tokens.ts";
import { AppText } from "./AppText.tsx";

export type LoadingStateProps = {
  /** Translated label; defaults to `common:state.loading`. */
  label?: string;
  /** `skeleton` = static grey cards (lists/summaries) instead of a spinner. */
  variant?: "spinner" | "skeleton";
  /** Number of skeleton cards. */
  rows?: number;
};

/** Accessible loading state: `ActivityIndicator` + label, or static skeleton cards. */
export function LoadingState({ label, variant = "spinner", rows = 3 }: LoadingStateProps) {
  const t = useTx();
  const text = label ?? t("common:state.loading");
  // HWM-10: "Reduce motion" on → no spinning indicator (the label still announces progress).
  const reduceMotion = useReduceMotion();
  if (variant === "skeleton") {
    return (
      <View
        testID="loading-state"
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={text}
        {...a11yState({ busy: true })}
        style={styles.skeletons}
      >
        {Array.from({ length: rows }, (_, index) => (
          <View key={index} style={styles.skeletonCard}>
            <View style={[styles.bar, styles.barShort]} />
            <View style={styles.bar} />
          </View>
        ))}
      </View>
    );
  }
  return (
    <View
      testID="loading-state"
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={text}
      {...a11yState({ busy: true })}
      style={styles.spinner}
    >
      {reduceMotion ? null : (
        <ActivityIndicator testID="loading-spinner" size="large" color={colors.primary} />
      )}
      <AppText color="muted">{text}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  spinner: {
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    padding: spacing.xxl,
  },
  skeletons: { gap: spacing.md },
  skeletonCard: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
  },
  bar: { height: 12, borderRadius: radii.sm, backgroundColor: colors.canvas },
  barShort: { width: "45%" },
});
