/**
 * Blood glucose (HWM-05 task 2): decimal value (`,` or `.`, one decimal place), REQUIRED unit
 * `mmol/L | mg/dL` and REQUIRED reading context `Fasting | Not fasting | Not recorded`
 * (FND-02 `fasting | non_fasting | not_recorded`) — neither has a default; units are never
 * implied. Missing unit / context is allowed in the saved draft only.
 */
import type { GlucoseContext, GlucoseUnit } from "@laif/domain";
import { AppText, NumberField, Section, SegmentedControl, spacing, useTx } from "@laif/ui-native";
import { Controller } from "react-hook-form";
import { StyleSheet, View } from "react-native";

import type { SectionProps } from "./BloodPressureSection.tsx";
import { FieldError } from "./FieldError.tsx";
import { sanitiseGlucoseInput } from "./screeningSchema.ts";

export function GlucoseSection({
  control,
  onFieldBlur,
  unit,
}: SectionProps & { unit: GlucoseUnit | null }) {
  const t = useTx();
  const spokenUnit =
    unit === "mg/dL"
      ? t("worker:screening.unit.spoken.mgdL")
      : unit === "mmol/L"
        ? t("worker:screening.unit.spoken.mmolL")
        : t("worker:screening.unit.label");
  const unitOptions = [
    {
      value: "mmol/L" as const,
      label: t("worker:screening.unit.mmolL"),
      accessibilityLabel: t("worker:screening.unit.spoken.mmolL"),
    },
    {
      value: "mg/dL" as const,
      label: t("worker:screening.unit.mgdL"),
      accessibilityLabel: t("worker:screening.unit.spoken.mgdL"),
    },
  ];
  const contextOptions: { value: GlucoseContext; label: string }[] = [
    { value: "fasting", label: t("worker:screening.context.fasting") },
    { value: "non_fasting", label: t("worker:screening.context.notFasting") },
    { value: "not_recorded", label: t("worker:screening.context.notRecorded") },
  ];
  return (
    <Section title={t("worker:screening.glucose")} testID="section-glucose">
      <AppText variant="caption" color="muted">
        {t("worker:screening.glucoseHint")}
      </AppText>
      <Controller
        control={control}
        name="glucoseValue"
        render={({ field, fieldState }) => (
          <NumberField
            ref={field.ref}
            testID="field-glucoseValue"
            label={t("worker:screening.glucoseValue")}
            accessibilityLabel={t("worker:screening.fieldA11y", {
              label: t("worker:screening.glucoseValue"),
              unit: spokenUnit,
            })}
            maxLength={5}
            unit={unit ?? "—"}
            value={field.value}
            onChangeText={(text) => field.onChange(sanitiseGlucoseInput(text))}
            onBlur={() => {
              field.onBlur();
              onFieldBlur();
            }}
            error={fieldState.error}
          />
        )}
      />
      <Controller
        control={control}
        name="glucoseUnit"
        render={({ field, fieldState }) => (
          <View style={styles.group}>
            <AppText weight="medium">{t("worker:screening.unit.label")}</AppText>
            <SegmentedControl<GlucoseUnit>
              label={t("worker:screening.unit.label")}
              testID="field-glucoseUnit"
              value={field.value}
              onChange={(value) => {
                field.onChange(value);
                field.onBlur();
                onFieldBlur();
              }}
              options={unitOptions}
            />
            <FieldError error={fieldState.error} />
          </View>
        )}
      />
      <Controller
        control={control}
        name="glucoseContext"
        render={({ field, fieldState }) => (
          <View style={styles.group}>
            <AppText weight="medium">{t("worker:screening.context.label")}</AppText>
            <SegmentedControl<GlucoseContext>
              label={t("worker:screening.context.label")}
              testID="field-glucoseContext"
              value={field.value}
              onChange={(value) => {
                field.onChange(value);
                field.onBlur();
                onFieldBlur();
              }}
              options={contextOptions}
            />
            <FieldError error={fieldState.error} />
          </View>
        )}
      />
    </Section>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.xs },
});
