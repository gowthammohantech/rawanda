/** `no_further_action`: a clinical note (≥ 10 characters). Creates nothing. */
import { useTx } from "@laif/ui-web";

import { ReasonField, type DecisionFieldsProps } from "./shared.tsx";

export function AssessmentFields({ form, disabled }: DecisionFieldsProps) {
  const t = useTx();
  return (
    <ReasonField
      form={form}
      name="note"
      label={t("clinical:decision.fields.clinicalNote")}
      disabled={disabled}
    />
  );
}
