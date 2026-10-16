import { Pressable, StyleSheet, View } from "react-native";

import { a11yState, touchTarget } from "../a11y.ts";
import { colors, radii, spacing } from "../tokens.ts";
import { AppText } from "./AppText.tsx";

export type ToggleProps = {
  /** Translated label (accessible name). */
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  testID?: string;
};

/** Switch row: the whole ≥ 44 pt row toggles (role `switch`, checked state). */
export function Toggle({
  label,
  description,
  value,
  onValueChange,
  disabled = false,
  testID,
}: ToggleProps) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="switch"
      accessibilityLabel={label}
      {...(description === undefined ? {} : { accessibilityHint: description })}
      {...a11yState({ checked: value, disabled })}
      disabled={disabled}
      onPress={() => onValueChange(!value)}
      style={[touchTarget, styles.row, disabled ? styles.disabled : null]}
    >
      <View style={styles.text}>
        <AppText weight="medium">{label}</AppText>
        {description === undefined ? null : (
          <AppText variant="caption" color="muted">
            {description}
          </AppText>
        )}
      </View>
      <View style={[styles.track, value ? styles.trackOn : null]}>
        <View style={[styles.thumb, value ? styles.thumbOn : null]} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.xs },
  text: { flex: 1, gap: spacing.xxs },
  track: {
    width: 48,
    height: 28,
    borderRadius: radii.pill,
    padding: 3,
    backgroundColor: colors.border,
    justifyContent: "center",
  },
  trackOn: { backgroundColor: colors.primary },
  thumb: { width: 22, height: 22, borderRadius: radii.pill, backgroundColor: colors.surface },
  thumbOn: { alignSelf: "flex-end" },
  disabled: { opacity: 0.6 },
});
