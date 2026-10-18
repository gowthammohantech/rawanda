/**
 * Step 2 of a correction request (CTZ-07 task 5): "What is wrong?" (required, 10–500), "What
 * should it say?" (optional, ≤ 200) and the required "I understand…" tick. Errors are translated
 * inline and announced (polite live region); the screen moves focus to the first one. The
 * citizen's text is stored and shown verbatim — never translated.
 */
import { AppText, CheckboxField, TextField, spacing, useTx } from "@laif/ui-native";
import type { RefObject } from "react";
import { StyleSheet, View, type TextInputInstance } from "react-native";

import { InlineError } from "../../components/InlineError.tsx";
import { CORRECTION_DESCRIPTION_MAX, CORRECTION_SUGGESTED_MAX } from "./correctionSchema.ts";

export type CorrectionDetailsValues = {
  description: string;
  suggestedValue: string;
  understood: boolean;
};

export type CorrectionFormProps = {
  values: CorrectionDetailsValues;
  onChange: (patch: Partial<CorrectionDetailsValues>) => void;
  /** Translated errors per field (null = none). */
  errors: { description: string | null; suggestedValue: string | null; understood: string | null };
  descriptionRef?: RefObject<TextInputInstance | null>;
  suggestedRef?: RefObject<TextInputInstance | null>;
};

function Counter({ count, max, testID }: { count: number; max: number; testID: string }) {
  const t = useTx();
  return (
    <AppText variant="caption" color={count > max ? "danger" : "subtle"} testID={testID}>
      {t("citizen:correction.new.counter", { count, max })}
    </AppText>
  );
}

export function CorrectionForm({
  values,
  onChange,
  errors,
  descriptionRef,
  suggestedRef,
}: CorrectionFormProps) {
  const t = useTx();
  return (
    <View style={styles.root} testID="correction-form">
      <View>
        <TextField
          ref={descriptionRef}
          label={t("citizen:correction.new.whatWrong")}
          hint={t("citizen:correction.new.whatWrongHint")}
          required
          multiline
          value={values.description}
          onChangeText={(description) => onChange({ description })}
          aside={
            <Counter
              count={values.description.trim().length}
              max={CORRECTION_DESCRIPTION_MAX}
              testID="description-counter"
            />
          }
          testID="correction-description"
        />
        <InlineError message={errors.description} testID="error-description" />
      </View>
      <View>
        <TextField
          ref={suggestedRef}
          label={t("citizen:correction.new.shouldSay")}
          hint={t("citizen:correction.new.shouldSayHint")}
          value={values.suggestedValue}
          onChangeText={(suggestedValue) => onChange({ suggestedValue })}
          aside={
            <Counter
              count={values.suggestedValue.trim().length}
              max={CORRECTION_SUGGESTED_MAX}
              testID="suggested-counter"
            />
          }
          testID="correction-suggested"
        />
        <InlineError message={errors.suggestedValue} testID="error-suggestedValue" />
      </View>
      <View>
        <CheckboxField
          label={t("citizen:correction.new.understand")}
          checked={values.understood}
          onChange={(understood) => onChange({ understood })}
          testID="correction-understood"
        />
        <InlineError message={errors.understood} testID="error-understood" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({ root: { gap: spacing.lg } });
