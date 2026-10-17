/**
 * Systolic / diastolic (HWM-05 task 2): whole numbers, unit fixed `mmHg` as a read-only
 * adornment and announced ("Systolic, millimetres of mercury"), number pad.
 */
import { NumberField, Section, spacing, useTx } from "@laif/ui-native";
import { Controller, type Control } from "react-hook-form";
import { StyleSheet, View } from "react-native";

import type { ScreeningFormValues } from "./screeningSchema.ts";

export type SectionProps = {
  control: Control<ScreeningFormValues>;
  /** Flushes the autosave (blur of any field). */
  onFieldBlur: () => void;
};

export function BloodPressureSection({ control, onFieldBlur }: SectionProps) {
  const t = useTx();
  const unit = t("worker:screening.unit.mmHg");
  const spoken = t("worker:screening.unit.spoken.mmHg");
  const required = t("common:ui.required");
  return (
    <Section title={t("worker:screening.bp")} testID="section-bp">
      <View style={styles.row}>
        {(["systolic", "diastolic"] as const).map((name) => (
          <View key={name} style={styles.cell}>
            <Controller
              control={control}
              name={name}
              render={({ field, fieldState }) => (
                <NumberField
                  ref={field.ref}
                  testID={`field-${name}`}
                  label={t(`worker:screening.${name}`)}
                  accessibilityLabel={`${t("worker:screening.fieldA11y", {
                    label: t(`worker:screening.${name}`),
                    unit: spoken,
                  })}, ${required}`}
                  required
                  integer
                  maxLength={3}
                  unit={unit}
                  value={field.value}
                  onChangeText={field.onChange}
                  onBlur={() => {
                    field.onBlur();
                    onFieldBlur();
                  }}
                  error={fieldState.error}
                />
              )}
            />
          </View>
        ))}
      </View>
    </Section>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: spacing.md },
  cell: { flex: 1 },
});
