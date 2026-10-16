import { useFieldErrorText, type FieldErrorLike } from "@laif/i18n";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { a11yState, touchTarget } from "../a11y.ts";
import { useTx } from "../i18n.ts";
import { Icon } from "../icons/Icon.tsx";
import { colors, radii, spacing } from "../tokens.ts";
import { AppText } from "./AppText.tsx";
import { controlStyle } from "./Field.tsx";
import { Sheet } from "./Sheet.tsx";

export type SelectOption<V extends string = string> = {
  value: V;
  label: string;
  description?: string;
};

export type SelectSheetProps<V extends string = string> = {
  /** Translated label. */
  label: string;
  options: readonly SelectOption<V>[];
  value: V | null;
  onChange: (value: V) => void;
  /** Shown when nothing is chosen; defaults to `common:ui.selectPlaceholder`. */
  placeholder?: string;
  hint?: string;
  error?: FieldErrorLike;
  required?: boolean;
  disabled?: boolean;
  testID?: string;
};

/** Select field: a ≥ 44 pt trigger that opens a modal list of radio rows. */
export function SelectSheet<V extends string = string>({
  label,
  options,
  value,
  onChange,
  placeholder,
  hint,
  error,
  required = false,
  disabled = false,
  testID,
}: SelectSheetProps<V>) {
  const t = useTx();
  const [open, setOpen] = useState(false);
  const errorText = useFieldErrorText(error);
  const current = options.find((option) => option.value === value);
  const shown = current?.label ?? placeholder ?? t("common:ui.selectPlaceholder");
  const spokenLabel = required ? `${label}, ${t("common:ui.required")}` : label;
  return (
    <View style={styles.field}>
      <AppText weight="medium">
        {label}
        {required ? <AppText colorValue={colors.danger}>{" *"}</AppText> : null}
      </AppText>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={t("common:a11y.selectedValue", { label: spokenLabel, value: shown })}
        accessibilityHint={[errorText, t("common:a11y.opensOptions")].filter(Boolean).join(". ")}
        {...a11yState({ disabled, expanded: open })}
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={[
          touchTarget,
          controlStyle.input,
          styles.trigger,
          errorText === undefined ? null : controlStyle.invalid,
        ]}
      >
        <AppText color={current === undefined ? "subtle" : "ink"} style={styles.flex}>
          {shown}
        </AppText>
        <Icon name="chevron-down" size={18} color={colors.muted} />
      </Pressable>
      {hint === undefined ? null : (
        <AppText variant="caption" color="muted">
          {hint}
        </AppText>
      )}
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
      <Sheet visible={open} onClose={() => setOpen(false)} title={label}>
        <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.list}>
          {options.map((option) => {
            const selected = option.value === value;
            return (
              <Pressable
                key={option.value}
                accessibilityRole="radio"
                accessibilityLabel={option.label}
                {...(option.description === undefined
                  ? {}
                  : { accessibilityHint: option.description })}
                {...a11yState({ checked: selected, selected })}
                onPress={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                style={[touchTarget, styles.option, selected ? styles.optionOn : null]}
              >
                <View style={styles.flex}>
                  <AppText weight={selected ? "semibold" : "regular"}>{option.label}</AppText>
                  {option.description === undefined ? null : (
                    <AppText variant="caption" color="muted">
                      {option.description}
                    </AppText>
                  )}
                </View>
                {selected ? <Icon name="check" size={18} color={colors.primaryDark} /> : null}
              </Pressable>
            );
          })}
        </View>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: spacing.xs },
  trigger: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  flex: { flex: 1 },
  list: { gap: spacing.xs },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.sm,
  },
  optionOn: { backgroundColor: colors.primarySoft },
});
