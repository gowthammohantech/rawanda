/**
 * `refer`: destination facility (seed facilities, labelled "(demo)"), referral reason (≥ 10),
 * priority (`routine` / `urgent_demo`) and an explicit due date after demo now. Creates a
 * Referral `created` linked to the patient and the review.
 */
import { REVIEW_PRIORITIES } from "@laif/domain";
import { domainKey } from "@laif/i18n";
import { FACILITIES_REFERENCE } from "@laif/mock-data";
import { Select, useTx } from "@laif/ui-web";

import { facilityLabel } from "../../../app/persona-labels.ts";
import { fieldDomId } from "../form.ts";
import { DueAtField, ReasonField, type DecisionFieldsProps } from "./shared.tsx";

export function ReferFields(props: DecisionFieldsProps) {
  const { form, disabled } = props;
  const t = useTx();
  return (
    <>
      <Select
        id={fieldDomId("destinationFacilityId")}
        label={t("clinical:decision.fields.destination")}
        required
        disabled={disabled}
        placeholder={t("clinical:decision.fields.destinationPlaceholder")}
        options={FACILITIES_REFERENCE.map((facility) => ({
          value: facility.id,
          label: t("clinical:decision.fields.destinationOption", {
            name: facilityLabel(facility.id, t),
          }),
        }))}
        error={form.formState.errors.destinationFacilityId}
        {...form.register("destinationFacilityId")}
      />
      <ReasonField
        form={form}
        name="referralReason"
        label={t("clinical:decision.fields.referralReason")}
        disabled={disabled}
      />
      <Select
        id={fieldDomId("priority")}
        label={t("clinical:decision.fields.priority")}
        required
        disabled={disabled}
        placeholder={t("clinical:decision.fields.priorityPlaceholder")}
        options={REVIEW_PRIORITIES.map((priority) => ({
          value: priority,
          label: t(domainKey("priority", priority)),
        }))}
        error={form.formState.errors.priority}
        {...form.register("priority")}
      />
      <DueAtField {...props} />
    </>
  );
}
