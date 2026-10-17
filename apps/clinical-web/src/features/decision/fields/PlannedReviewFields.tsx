/**
 * `plan_follow_up`: an explicit due date, a note (≥ 10) and optionally an authorised CHW. Creates a
 * FollowUp `planned_review` (unassigned when no worker is chosen).
 */
import { useTx } from "@laif/ui-web";

import {
  DueAtField,
  ReasonField,
  WorkerField,
  type DecisionFieldsProps,
  type WorkerOptionsState,
} from "./shared.tsx";

export function PlannedReviewFields(props: DecisionFieldsProps & { workers: WorkerOptionsState }) {
  const { form, disabled, workers } = props;
  const t = useTx();
  return (
    <>
      <DueAtField {...props} />
      <ReasonField
        form={form}
        name="note"
        label={t("clinical:decision.fields.clinicalNote")}
        disabled={disabled}
      />
      <WorkerField form={form} workers={workers} required={false} disabled={disabled} />
    </>
  );
}
