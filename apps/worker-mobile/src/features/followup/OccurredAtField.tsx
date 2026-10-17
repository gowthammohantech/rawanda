/**
 * Occurred-at / attempted-at entry (HWM-08): Africa/Kigali wall time (`DateTimeField`, emits
 * UTC ISO) with a "Use current time" shortcut that sets the demo now. Never device time.
 */
import type { FieldErrorLike } from "@laif/i18n";
import { Button, DateTimeField, spacing, useTx } from "@laif/ui-native";
import { StyleSheet, View } from "react-native";

export type OccurredAtFieldProps = {
  label: string;
  value: string | null;
  onChange: (iso: string | null) => void;
  /** The demo now (the shortcut's value). */
  now: Date;
  error?: FieldErrorLike;
  testID: string;
};

export function OccurredAtField({
  label,
  value,
  onChange,
  now,
  error,
  testID,
}: OccurredAtFieldProps) {
  const t = useTx();
  return (
    <View style={styles.group}>
      <DateTimeField
        testID={testID}
        label={label}
        required
        value={value}
        onChange={onChange}
        {...(error === undefined ? {} : { error })}
      />
      <View style={styles.row}>
        <Button
          size="sm"
          variant="secondary"
          icon="clock"
          testID={`${testID}-now`}
          onPress={() => onChange(now.toISOString())}
        >
          {t("worker:followup.outcome.useNow")}
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.xs },
  row: { flexDirection: "row" },
});
