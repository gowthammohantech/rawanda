import { hasMinimumReason, MIN_REASON_NON_WHITESPACE_CHARS } from "@laif/domain";
import type { FieldErrorLike } from "@laif/i18n";

import { useTx } from "../i18n.ts";
import { colors } from "../tokens.ts";
import { AppText } from "./AppText.tsx";
import { TextField } from "./TextField.tsx";

export type ReasonFieldProps = {
  value: string;
  onChangeText: (text: string) => void;
  /** Defaults to `common:dialog.reasonLabel`. */
  label?: string;
  error?: FieldErrorLike;
  editable?: boolean;
  maxLength?: number;
  testID?: string;
};

/** Non-whitespace characters counted by the FND-02 reason rule. */
export function reasonLength(text: string): number {
  return text.replace(/\s/gu, "").length;
}

/** Multi-line reason with the "≥ 10 characters, spaces not counted" counter (FND-02). */
export function ReasonField({
  value,
  onChangeText,
  label,
  error,
  editable = true,
  maxLength = 500,
  testID,
}: ReasonFieldProps) {
  const t = useTx();
  const valid = hasMinimumReason(value);
  return (
    <TextField
      label={label ?? t("common:dialog.reasonLabel")}
      hint={t("common:dialog.reasonHint", { min: MIN_REASON_NON_WHITESPACE_CHARS })}
      error={error}
      required
      multiline
      maxLength={maxLength}
      editable={editable}
      value={value}
      onChangeText={onChangeText}
      {...(testID === undefined ? {} : { testID })}
      aside={
        <AppText
          variant="caption"
          dense
          accessibilityLiveRegion="polite"
          testID="reason-counter"
          colorValue={valid ? colors.positive : colors.muted}
        >
          {t("common:dialog.reasonProgress", {
            count: reasonLength(value),
            min: MIN_REASON_NON_WHITESPACE_CHARS,
          })}
        </AppText>
      }
    />
  );
}
