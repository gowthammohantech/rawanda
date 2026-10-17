/**
 * `dismiss`: a dismiss reason code (`DISMISS_REASON_CODES`, demo placeholders) and a mandatory
 * rationale (≥ 10 characters). Creates nothing else (WF-03); the review becomes
 * `dismissed_with_reason`.
 */
import { DISMISS_REASON_CODES } from "@laif/domain";
import { Select, useTx } from "@laif/ui-web";

import { fieldDomId } from "../form.ts";
import { ReasonField, type DecisionFieldsProps } from "./shared.tsx";

export function DismissFields({ form, disabled }: DecisionFieldsProps) {
  const t = useTx();
  return (
    <>
      <Select
        id={fieldDomId("dismissReasonCode")}
        label={t("clinical:decision.fields.dismissReasonCode.label")}
        required
        disabled={disabled}
        placeholder={t("clinical:decision.fields.dismissReasonCode.placeholder")}
        options={DISMISS_REASON_CODES.map((code) => ({
          value: code,
          label: t(`clinical:decision.fields.dismissReasonCode.${code}`),
        }))}
        error={form.formState.errors.dismissReasonCode}
        {...form.register("dismissReasonCode")}
      />
      <ReasonField
        form={form}
        name="reason"
        label={t("clinical:decision.fields.dismissRationale")}
        disabled={disabled}
      />
    </>
  );
}
