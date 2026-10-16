import { useFieldErrorText, type FieldErrorLike } from "@laif/i18n";
import { Pressable, StyleSheet, View } from "react-native";

import { a11yState, touchTarget } from "../a11y.ts";
import { useTx } from "../i18n.ts";
import { Icon } from "../icons/Icon.tsx";
import type { IconName } from "../icons/icon-data.ts";
import { colors, radii, spacing } from "../tokens.ts";
import { AppText } from "./AppText.tsx";

export type RadioCardOption<V extends string = string> = {
  value: V;
  label: string;
  description?: string;
  icon?: IconName;
  disabled?: boolean;
};

export type RadioCardGroupProps<V extends string = string> = {
  /** Translated group legend. */
  legend: string;
  options: readonly RadioCardOption<V>[];
  value: V | null;
  onChange: (value: V) => void;
  error?: FieldErrorLike;
  required?: boolean;
  testID?: string;
};

/** Selectable cards with radio semantics (decision options, outcomes). */
export function RadioCardGroup<V extends string = string>({
  legend,
  options,
  value,
  onChange,
  error,
  required = false,
  testID,
}: RadioCardGroupProps<V>) {
  const t = useTx();
  const errorText = useFieldErrorText(error);
  return (
    <View
      testID={testID}
      accessibilityRole="radiogroup"
      accessibilityLabel={required ? `${legend}, ${t("common:ui.required")}` : legend}
      style={styles.group}
    >
      <AppText weight="medium">{legend}</AppText>
      {options.map((option) => {
        const checked = value === option.value;
        const disabled = option.disabled === true;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            {...(option.description === undefined ? {} : { accessibilityHint: option.description })}
            {...a11yState({ checked, selected: checked, disabled })}
            disabled={disabled}
            onPress={() => onChange(option.value)}
            style={[
              touchTarget,
              styles.card,
              checked ? styles.checked : null,
              disabled ? styles.disabled : null,
            ]}
          >
            <View style={[styles.radio, checked ? styles.radioOn : null]}>
              {checked ? <View style={styles.radioDot} /> : null}
            </View>
            {option.icon === undefined ? null : (
              <Icon
                name={option.icon}
                size={20}
                color={checked ? colors.primaryDark : colors.muted}
              />
            )}
            <View style={styles.text}>
              <AppText weight="semibold">{option.label}</AppText>
              {option.description === undefined ? null : (
                <AppText variant="caption" color="muted">
                  {option.description}
                </AppText>
              )}
            </View>
          </Pressable>
        );
      })}
      {errorText === undefined ? null : (
        <AppText
          variant="caption"
          weight="medium"
          colorValue={colors.danger}
          accessibilityLiveRegion="polite"
        >
          {errorText}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.sm },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
  },
  checked: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  disabled: { opacity: 0.6 },
  radio: {
    width: 22,
    height: 22,
    borderRadius: radii.pill,
    borderWidth: 2,
    borderColor: colors.muted,
    alignItems: "center",
    justifyContent: "center",
  },
  radioOn: { borderColor: colors.primary },
  radioDot: { width: 10, height: 10, borderRadius: radii.pill, backgroundColor: colors.primary },
  text: { flex: 1, gap: spacing.xxs },
});
