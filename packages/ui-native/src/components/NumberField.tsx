import {
  forwardRef,
  type ReactNode,
  type ForwardRefExoticComponent,
  type RefAttributes,
} from "react";
import {
  StyleSheet,
  TextInput,
  View,
  type TextInputInstance,
  type TextInputProps,
} from "react-native";

import { colors, radii, spacing } from "../tokens.ts";
import { AppText } from "./AppText.tsx";
import { controlStyle, Field, type FieldProps } from "./Field.tsx";

/** Parses "7,8" or "7.8" → 7.8; empty/invalid → null. */
export function parseDecimal(raw: string): number | null {
  const normalised = raw.trim().replace(",", ".");
  if (normalised === "" || !/^-?\d*\.?\d+$/.test(normalised)) return null;
  const value = Number(normalised);
  return Number.isFinite(value) ? value : null;
}

/** Keeps digits and ONE decimal separator (`,` or `.`) while typing. */
export function sanitiseDecimalInput(raw: string, allowDecimal = true): string {
  let seen = false;
  let out = "";
  for (const ch of raw) {
    if (ch >= "0" && ch <= "9") out += ch;
    else if (allowDecimal && (ch === "," || ch === ".") && !seen) {
      seen = true;
      out += ch;
    }
  }
  return out;
}

export type NumberFieldProps = Omit<
  TextInputProps,
  "allowFontScaling" | "style" | "value" | "onChangeText" | "keyboardType"
> &
  Pick<FieldProps, "label" | "hint" | "error" | "required" | "id" | "testID"> & {
    /** Raw text as typed (keep it in form state; parse with `parseDecimal`). */
    value: string;
    onChangeText: (text: string) => void;
    /** Parsed value on every change (`null` when empty/invalid). */
    onValueChange?: (value: number | null) => void;
    /** Unit adornment — always visible (e.g. "mmHg", or a SegmentedControl for glucose). */
    unit?: ReactNode;
    /** Integer-only fields (blood pressure) use the number pad. */
    integer?: boolean;
  };

/** Numeric field (HWM `NumericUnitField`): numeric keyboard, `,` or `.` decimals, unit adornment. */
export const NumberField: ForwardRefExoticComponent<
  NumberFieldProps & RefAttributes<TextInputInstance>
> = forwardRef<TextInputInstance, NumberFieldProps>(function NumberField(
  {
    label,
    hint,
    error,
    required,
    id,
    testID,
    value,
    onChangeText,
    onValueChange,
    unit,
    integer = false,
    editable = true,
    ...rest
  },
  ref,
) {
  return (
    <Field
      label={label}
      {...(hint === undefined ? {} : { hint })}
      error={error}
      {...(required === undefined ? {} : { required })}
      {...(id === undefined ? {} : { id })}
    >
      {({ invalid, ...control }) => (
        <View style={styles.row}>
          <TextInput
            ref={ref}
            {...(testID === undefined ? {} : { testID })}
            {...control}
            {...rest}
            allowFontScaling
            editable={editable}
            value={value}
            inputMode={integer ? "numeric" : "decimal"}
            keyboardType={integer ? "number-pad" : "decimal-pad"}
            onChangeText={(text) => {
              const next = sanitiseDecimalInput(text, !integer);
              onChangeText(next);
              onValueChange?.(parseDecimal(next));
            }}
            placeholderTextColor={colors.subtle}
            style={[
              controlStyle.input,
              styles.input,
              unit === undefined ? null : styles.withUnit,
              invalid ? controlStyle.invalid : null,
              editable ? null : controlStyle.disabled,
            ]}
          />
          {unit === undefined ? null : (
            <View style={styles.unit}>
              {typeof unit === "string" ? (
                <AppText color="muted" dense>
                  {unit}
                </AppText>
              ) : (
                unit
              )}
            </View>
          )}
        </View>
      )}
    </Field>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "stretch" },
  input: { flex: 1, fontVariant: ["tabular-nums"] },
  withUnit: { borderTopRightRadius: 0, borderBottomRightRadius: 0 },
  unit: {
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderLeftWidth: 0,
    borderColor: colors.border,
    borderTopRightRadius: radii.sm,
    borderBottomRightRadius: radii.sm,
    backgroundColor: colors.background,
  },
});
