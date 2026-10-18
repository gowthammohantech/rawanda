/**
 * Step 1 of a correction request (CTZ-07 task 5): one radio group over the released results,
 * the approved next steps and "My personal details" (synthetic name / date of birth). Only the
 * active patient's items are listed (a representative sees only the represented person's).
 */
import { useLanguage } from "@laif/i18n";
import type { CorrectionTarget } from "@laif/repositories/citizen";
import { RadioCardGroup, useTx, type RadioCardOption } from "@laif/ui-native";
import { View } from "react-native";

import { InlineError } from "../../components/InlineError.tsx";
import { targetLabel } from "./copy.ts";

/** `screening:<id>` / `care_instruction:<id>` / `patient:<id>`. */
export const targetValueOf = (t: Pick<CorrectionTarget, "targetType" | "targetId">) =>
  `${t.targetType}:${t.targetId}`;

export type CorrectionItemPickerProps = {
  targets: readonly CorrectionTarget[];
  value: string | null;
  onChange: (target: CorrectionTarget) => void;
  /** Translated error (or null). */
  error: string | null;
};

export function CorrectionItemPicker({
  targets,
  value,
  onChange,
  error,
}: CorrectionItemPickerProps) {
  const t = useTx();
  const { language } = useLanguage();
  const options: RadioCardOption[] = targets.map((target) => ({
    value: targetValueOf(target),
    label:
      target.targetType === "patient"
        ? t("citizen:correction.new.personalDetails")
        : targetLabel(t, target, language),
    description:
      target.targetType === "screening"
        ? t("citizen:correction.new.groups.results")
        : target.targetType === "care_instruction"
          ? t("citizen:correction.new.groups.steps")
          : t("citizen:correction.new.personalDetailsBody"),
    icon:
      target.targetType === "screening"
        ? "activity"
        : target.targetType === "care_instruction"
          ? "calendar"
          : "user",
  }));
  return (
    <View testID="correction-picker">
      <RadioCardGroup
        legend={t("citizen:correction.new.pickLegend")}
        options={options}
        value={value}
        required
        onChange={(next) => {
          const target = targets.find((x) => targetValueOf(x) === next);
          if (target) onChange(target);
        }}
        testID="correction-picker-group"
      />
      <InlineError message={error} testID="error-targetId" />
    </View>
  );
}
