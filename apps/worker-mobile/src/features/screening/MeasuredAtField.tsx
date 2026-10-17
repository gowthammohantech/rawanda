/**
 * Measured-at (HWM-05 task 2): defaults to demo now (set when the draft is created), editable in
 * Africa/Kigali wall time, stored UTC. More than 24 h ago → NON-blocking "Check the date".
 */
import { AppText, colors, DateTimeField, Icon, radii, spacing, useTx } from "@laif/ui-native";
import { Controller } from "react-hook-form";
import { StyleSheet, View } from "react-native";

import type { SectionProps } from "./BloodPressureSection.tsx";
import { measuredAtWarning } from "./screeningSchema.ts";

export function MeasuredAtField({
  control,
  onFieldBlur,
  now,
}: SectionProps & { now: Date | null }) {
  const t = useTx();
  return (
    <Controller
      control={control}
      name="measuredAt"
      render={({ field, fieldState }) => {
        const warning =
          fieldState.error === undefined && now !== null
            ? measuredAtWarning(field.value, now)
            : null;
        return (
          <View style={styles.group}>
            <DateTimeField
              testID="field-measuredAt"
              label={t("worker:screening.measuredAt")}
              required
              value={field.value}
              onChange={(iso) => {
                field.onChange(iso);
                field.onBlur();
                onFieldBlur();
              }}
              error={fieldState.error}
            />
            {warning === null ? null : (
              <View style={styles.warning} testID="measured-at-warning">
                <Icon name="alert" size={16} color={colors.warning} />
                <AppText variant="caption" weight="medium" style={styles.flex}>
                  {t("validation:measuredAtOld")}
                </AppText>
              </View>
            )}
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.xs },
  warning: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radii.sm,
    backgroundColor: colors.warningSoft,
  },
  flex: { flex: 1 },
});
