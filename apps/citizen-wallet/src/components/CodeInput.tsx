/**
 * Six-box numeric code input (CTZ-02): one `TextInput` per digit with its own
 * `accessibilityLabel` ("Digit 1 of 6"), auto-advance, backspace to the previous box and paste
 * of the whole code into any box. Value is the digits string (0–6 characters).
 */
import { controlStyle, minTouchTarget, radii, spacing, useTx, type Palette } from "@laif/ui-native";
import { useRef } from "react";
import { StyleSheet, TextInput, View, type TextInputInstance } from "react-native";
import { useThemedStyles } from "../theme/useThemedStyles.ts";

export const CODE_LENGTH = 6;

export type CodeInputProps = {
  value: string;
  onChange: (value: string) => void;
  /** Return key on the last box. */
  onSubmit?: () => void;
  invalid?: boolean;
  disabled?: boolean;
  /** Accessible group label (translated). */
  label: string;
  testID?: string;
};

export function CodeInput({
  value,
  onChange,
  onSubmit,
  invalid = false,
  disabled = false,
  label,
  testID = "code-input",
}: CodeInputProps) {
  const styles = useThemedStyles(makeStyles);
  const t = useTx();
  const refs = useRef<(TextInputInstance | null)[]>([]);
  const digits = Array.from({ length: CODE_LENGTH }, (_, i) => value[i] ?? "");

  const focus = (index: number) =>
    refs.current[Math.max(0, Math.min(CODE_LENGTH - 1, index))]?.focus();

  const setAt = (index: number, text: string) => {
    const clean = text.replace(/\D/gu, "");
    if (clean.length > 1) {
      // Paste (or autofill): fill from this box onwards.
      const next = (value.slice(0, index) + clean).slice(0, CODE_LENGTH);
      onChange(next);
      focus(next.length);
      return;
    }
    const chars = digits.slice();
    chars[index] = clean;
    // Keep the value contiguous: a cleared box truncates the rest.
    const next =
      clean === "" ? chars.slice(0, index).join("") : chars.join("").slice(0, CODE_LENGTH);
    onChange(next);
    if (clean !== "" && index < CODE_LENGTH - 1) focus(index + 1);
  };

  return (
    <View accessibilityRole="none" accessibilityLabel={label} testID={testID} style={styles.row}>
      {digits.map((digit, index) => (
        <TextInput
          // Fixed-length list of boxes: the index is the identity.
          key={index}
          ref={(node) => {
            refs.current[index] = node;
          }}
          testID={`${testID}-digit-${index + 1}`}
          accessibilityLabel={t("citizen:onboarding.verify.digitLabel", { n: index + 1 })}
          value={digit}
          editable={!disabled}
          onChangeText={(text) => setAt(index, text)}
          onKeyPress={(event) => {
            if (event.nativeEvent.key === "Backspace" && digit === "" && index > 0) {
              onChange(value.slice(0, index - 1));
              focus(index - 1);
            }
          }}
          onSubmitEditing={index === CODE_LENGTH - 1 ? onSubmit : undefined}
          keyboardType="number-pad"
          inputMode="numeric"
          textContentType="oneTimeCode"
          autoComplete="one-time-code"
          maxLength={index === 0 ? CODE_LENGTH : 1}
          allowFontScaling
          selectTextOnFocus
          style={[
            controlStyle.input,
            styles.box,
            invalid ? controlStyle.invalid : null,
            disabled ? controlStyle.disabled : null,
          ]}
        />
      ))}
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    row: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
    box: {
      minWidth: minTouchTarget,
      minHeight: 52,
      paddingHorizontal: spacing.xs,
      textAlign: "center",
      fontSize: 22,
      borderRadius: radii.sm,
      borderColor: c.border,
    },
  });
