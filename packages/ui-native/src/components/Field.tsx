import { useFieldErrorText, type FieldErrorLike } from "@laif/i18n";
import { useId, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { useTx } from "../i18n.ts";
import { Icon } from "../icons/Icon.tsx";
import { colors, radii, spacing } from "../tokens.ts";
import { AppText } from "./AppText.tsx";

/** Props a control spreads to be announced with its label, hint and error. */
export type FieldControlProps = {
  nativeID: string;
  accessibilityLabel: string;
  accessibilityHint?: string;
  /** True when a validation error is shown (style the control's border). */
  invalid: boolean;
};

export type FieldProps = {
  /** Translated label. */
  label: string;
  /** Translated hint below the control. */
  hint?: string;
  /** react-hook-form `FieldError`, parsed message or raw `vMsg` string (translated here). */
  error?: FieldErrorLike;
  required?: boolean;
  /** Extra content right of the label (e.g. a character counter). */
  aside?: ReactNode;
  id?: string;
  children: (control: FieldControlProps) => ReactNode;
  testID?: string;
};

/** Shared control frame for text-like inputs. */
export const controlStyle = StyleSheet.create({
  input: {
    minHeight: 48,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    backgroundColor: colors.surface,
    color: colors.ink,
    fontSize: 16,
  },
  invalid: { borderColor: colors.danger },
  disabled: { backgroundColor: colors.background, color: colors.muted },
});

/** Label + control + hint + translated validation error (polite live region). */
export function Field({
  label,
  hint,
  error,
  required = false,
  aside,
  id,
  children,
  testID,
}: FieldProps) {
  const t = useTx();
  const autoId = useId();
  const controlId = id ?? autoId;
  const errorText = useFieldErrorText(error);
  const spokenLabel = required ? `${label}, ${t("common:ui.required")}` : label;
  const spokenHint = [errorText, hint]
    .filter((part): part is string => part !== undefined)
    .join(". ");
  return (
    <View testID={testID} style={styles.field}>
      <View style={styles.labelRow}>
        <AppText weight="medium" nativeID={`${controlId}-label`} style={styles.label}>
          {label}
          {required ? <AppText colorValue={colors.danger}>{" *"}</AppText> : null}
        </AppText>
        {aside ?? null}
      </View>
      {children({
        nativeID: controlId,
        accessibilityLabel: spokenLabel,
        ...(spokenHint === "" ? {} : { accessibilityHint: spokenHint }),
        invalid: errorText !== undefined,
      })}
      {hint === undefined ? null : (
        <AppText variant="caption" color="muted">
          {hint}
        </AppText>
      )}
      {errorText === undefined ? null : (
        <View
          style={styles.error}
          accessibilityLiveRegion="polite"
          aria-live="polite"
          testID="field-error"
        >
          <Icon name="alert" size={14} color={colors.danger} />
          <AppText variant="caption" weight="medium" colorValue={colors.danger} style={styles.flex}>
            {errorText}
          </AppText>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: spacing.xs },
  labelRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  label: { flex: 1 },
  error: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  flex: { flex: 1 },
});
