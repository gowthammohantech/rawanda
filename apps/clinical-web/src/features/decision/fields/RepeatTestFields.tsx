/**
 * `request_repeat_screening`: an authorised CHW of the active facility (required), an explicit due
 * date and instructions for the worker. Creates a FollowUp `repeat_screening`, `assigned`.
 */
import { INSTRUCTIONS_FOR_WORKER_MAX } from "@laif/contracts";
import { useTx } from "@laif/ui-web";

import {
  DueAtField,
  ReasonField,
  WorkerField,
  type DecisionFieldsProps,
  type WorkerOptionsState,
} from "./shared.tsx";

export function RepeatTestFields(props: DecisionFieldsProps & { workers: WorkerOptionsState }) {
  const { form, disabled, workers } = props;
  const t = useTx();
  return (
    <>
      <WorkerField form={form} workers={workers} required disabled={disabled} />
      <DueAtField {...props} />
      <ReasonField
        form={form}
        name="instructionsForWorker"
        label={t("clinical:decision.fields.instructions")}
        maxLength={INSTRUCTIONS_FOR_WORKER_MAX}
        minHint={false}
        disabled={disabled}
      />
    </>
  );
}
