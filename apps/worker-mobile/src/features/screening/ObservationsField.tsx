/** Observation notes (HWM-05 task 2): optional, multiline, ≤ 500 characters with a counter. */
import { SCREENING_NOTES_MAX } from "@laif/contracts";
import { AppText, TextField, useTx } from "@laif/ui-native";
import { Controller } from "react-hook-form";

import type { SectionProps } from "./BloodPressureSection.tsx";

export function ObservationsField({ control, onFieldBlur }: SectionProps) {
  const t = useTx();
  return (
    <Controller
      control={control}
      name="notes"
      render={({ field, fieldState }) => (
        <TextField
          ref={field.ref}
          testID="field-notes"
          label={t("worker:screening.observations")}
          hint={t("worker:screening.observationsHint")}
          multiline
          maxLength={SCREENING_NOTES_MAX}
          aside={
            <AppText variant="caption" color="muted" testID="notes-counter">
              {t("worker:screening.observationsCounter", {
                count: field.value.length,
                max: SCREENING_NOTES_MAX,
              })}
            </AppText>
          }
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
  );
}
