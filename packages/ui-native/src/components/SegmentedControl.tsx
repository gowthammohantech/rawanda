import { Pressable, StyleSheet, View } from "react-native";

import { a11yState, touchTarget } from "../a11y.ts";
import { colors, radii, spacing } from "../tokens.ts";
import { AppText } from "./AppText.tsx";

export type SegmentedOption<V extends string = string> = {
  value: V;
  /** Visible translated label (e.g. "mmol/L", "Fasting"). */
  label: string;
  /** Spoken label when the visible one is an abbreviation. */
  accessibilityLabel?: string;
  disabled?: boolean;
};

export type SegmentedControlProps<V extends string = string> = {
  options: readonly SegmentedOption<V>[];
  /** `null` = nothing chosen yet (e.g. glucose context must be an explicit choice). */
  value: V | null;
  onChange: (value: V) => void;
  /** Accessible group name (translated). */
  label: string;
  testID?: string;
};

/** Unit and context pickers: equal-width segments with radio semantics. */
export function SegmentedControl<V extends string = string>({
  options,
  value,
  onChange,
  label,
  testID,
}: SegmentedControlProps<V>) {
  return (
    <View
      testID={testID}
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={styles.group}
    >
      {options.map((option) => {
        const active = option.value === value;
        const disabled = option.disabled === true;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityLabel={option.accessibilityLabel ?? option.label}
            {...a11yState({ checked: active, selected: active, disabled })}
            disabled={disabled}
            onPress={() => onChange(option.value)}
            style={[
              touchTarget,
              styles.segment,
              active ? styles.active : null,
              disabled ? styles.disabled : null,
            ]}
          >
            <AppText
              variant="caption"
              weight={active ? "semibold" : "medium"}
              dense
              align="center"
              colorValue={active ? colors.onPrimary : colors.ink}
            >
              {option.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    flexDirection: "row",
    gap: spacing.xxs,
    padding: spacing.xxs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    backgroundColor: colors.background,
  },
  segment: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
    borderRadius: radii.sm - 2,
  },
  active: { backgroundColor: colors.primary },
  disabled: { opacity: 0.6 },
});
