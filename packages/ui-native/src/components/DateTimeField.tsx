import { useFieldErrorText, type FieldErrorLike } from "@laif/i18n";
import { useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";

import { useTx } from "../i18n.ts";
import { kigaliWallTimeToUtcIso, utcIsoToKigaliWallTime } from "../kigali-time.ts";
import { colors, spacing } from "../tokens.ts";
import { AppText } from "./AppText.tsx";
import { controlStyle } from "./Field.tsx";

export type DateTimeFieldProps = {
  /** Translated label. */
  label: string;
  /** UTC ISO string (or null when empty). */
  value: string | null;
  /** Receives UTC ISO, or null while incomplete/invalid. */
  onChange: (utcIso: string | null) => void;
  /** Defaults to "Kigali time (UTC+2)". */
  hint?: string;
  error?: FieldErrorLike;
  required?: boolean;
  editable?: boolean;
  testID?: string;
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{1,2}:\d{2}$/;

function split(iso: string | null): { date: string; time: string } {
  const wall = utcIsoToKigaliWallTime(iso);
  return wall === ""
    ? { date: "", time: "" }
    : { date: wall.slice(0, 10), time: wall.slice(11, 16) };
}

/** Date + time entry in Africa/Kigali wall time (no picker library); emits UTC ISO. */
export function DateTimeField({
  label,
  value,
  onChange,
  hint,
  error,
  required = false,
  editable = true,
  testID,
}: DateTimeFieldProps) {
  const t = useTx();
  const [raw, setRaw] = useState(() => split(value));
  const [lastValue, setLastValue] = useState(value);
  // Follow external value changes (state adjustment during render, no effect). Values this
  // field emitted itself are recorded in `lastValue` first, so echoes do not reset typing.
  if (value !== lastValue) {
    setLastValue(value);
    setRaw(split(value));
  }
  const errorText = useFieldErrorText(error);
  const complete = DATE.test(raw.date) && TIME.test(raw.time);
  const parsed = complete
    ? kigaliWallTimeToUtcIso(`${raw.date}T${raw.time.padStart(5, "0")}`)
    : null;
  const invalidLocal = (raw.date !== "" || raw.time !== "") && complete && parsed === null;
  const message = errorText ?? (invalidLocal ? t("common:ui.invalidDateTime") : undefined);

  const update = (next: { date: string; time: string }) => {
    setRaw(next);
    const ok = DATE.test(next.date) && TIME.test(next.time);
    const iso = ok ? kigaliWallTimeToUtcIso(`${next.date}T${next.time.padStart(5, "0")}`) : null;
    setLastValue(iso);
    onChange(iso);
  };

  const requiredSuffix = required ? `, ${t("common:ui.required")}` : "";
  return (
    <View testID={testID} style={styles.field}>
      <AppText weight="medium">
        {label}
        {required ? <AppText colorValue={colors.danger}>{" *"}</AppText> : null}
      </AppText>
      <View style={styles.row}>
        <TextInput
          testID={testID === undefined ? undefined : `${testID}-date`}
          accessibilityLabel={`${label}, ${t("common:ui.date")}${requiredSuffix}`}
          accessibilityHint={message ?? t("common:ui.datePlaceholder")}
          allowFontScaling
          editable={editable}
          value={raw.date}
          placeholder={t("common:ui.datePlaceholder")}
          placeholderTextColor={colors.subtle}
          inputMode="numeric"
          maxLength={10}
          onChangeText={(date) => update({ ...raw, date })}
          style={[
            controlStyle.input,
            styles.date,
            message === undefined ? null : controlStyle.invalid,
          ]}
        />
        <TextInput
          testID={testID === undefined ? undefined : `${testID}-time`}
          accessibilityLabel={`${label}, ${t("common:ui.time")}${requiredSuffix}`}
          accessibilityHint={message ?? t("common:ui.timePlaceholder")}
          allowFontScaling
          editable={editable}
          value={raw.time}
          placeholder={t("common:ui.timePlaceholder")}
          placeholderTextColor={colors.subtle}
          inputMode="numeric"
          maxLength={5}
          onChangeText={(time) => update({ ...raw, time })}
          style={[
            controlStyle.input,
            styles.time,
            message === undefined ? null : controlStyle.invalid,
          ]}
        />
      </View>
      <AppText variant="caption" color="muted">
        {hint ?? t("common:ui.kigaliTime")}
      </AppText>
      {message === undefined ? null : (
        <AppText
          variant="caption"
          weight="medium"
          colorValue={colors.danger}
          accessibilityLiveRegion="polite"
        >
          {message}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: spacing.xs },
  row: { flexDirection: "row", gap: spacing.sm },
  date: { flex: 3 },
  time: { flex: 2 },
});
