import { useFieldErrorText, type FieldErrorLike } from "@laif/i18n";
import { Pressable, StyleSheet, View } from "react-native";

import { a11yState, touchTarget } from "../a11y.ts";
import { Icon } from "../icons/Icon.tsx";
import { colors, radii, spacing } from "../tokens.ts";
import { AppText } from "./AppText.tsx";

export type CheckboxFieldProps = {
  /** Translated label (the accessible name). */
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  error?: FieldErrorLike;
  testID?: string;
};

/** Checkbox row (≥ 44 pt) with label, description and translated error. */
export function CheckboxField({
  label,
  description,
  checked,
  onChange,
  disabled = false,
  error,
  testID,
}: CheckboxFieldProps) {
  const errorText = useFieldErrorText(error);
  return (
    <View style={styles.wrap}>
      <Pressable
        testID={testID}
        accessibilityRole="checkbox"
        accessibilityLabel={label}
        {...(description === undefined && errorText === undefined
          ? {}
          : { accessibilityHint: [errorText, description].filter(Boolean).join(". ") })}
        {...a11yState({ checked, disabled })}
        disabled={disabled}
        onPress={() => onChange(!checked)}
        style={[touchTarget, styles.row, disabled ? styles.disabled : null]}
      >
        <View
          style={[
            styles.box,
            checked ? styles.boxChecked : null,
            errorText === undefined ? null : styles.boxInvalid,
          ]}
        >
          {checked ? (
            <Icon name="check" size={16} strokeWidth={2.6} color={colors.onPrimary} />
          ) : null}
        </View>
        <View style={styles.text}>
          <AppText weight="medium">{label}</AppText>
          {description === undefined ? null : (
            <AppText variant="caption" color="muted">
              {description}
            </AppText>
          )}
        </View>
      </Pressable>
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
  wrap: { gap: spacing.xs },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.xs },
  box: {
    width: 24,
    height: 24,
    borderRadius: radii.sm / 2,
    borderWidth: 2,
    borderColor: colors.muted,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  boxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
  boxInvalid: { borderColor: colors.danger },
  text: { flex: 1, gap: spacing.xxs },
  disabled: { opacity: 0.6 },
});
