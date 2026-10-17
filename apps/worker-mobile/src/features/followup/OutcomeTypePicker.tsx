/**
 * Outcome radio cards (HWM-08 task 2): Attended · Referred onward · Unable to reach, each with an
 * icon and a description. Outcomes the client guard blocks for this task are disabled and their
 * description says why (no write is attempted).
 */
import type { FieldErrorLike } from "@laif/i18n";
import { RadioCardGroup, useTx, type IconName, type TranslationKey } from "@laif/ui-native";

import { WORKER_OUTCOMES, type OutcomeBlock, type WorkerOutcome } from "./outcomeSchema.ts";

const LABEL: Record<
  WorkerOutcome,
  { label: TranslationKey; hint: TranslationKey; icon: IconName }
> = {
  attended: {
    label: "worker:followup.outcome.attended",
    hint: "worker:followup.outcome.attendedHint",
    icon: "check",
  },
  referred_onward: {
    label: "worker:followup.outcome.referredOnward",
    hint: "worker:followup.outcome.referredOnwardHint",
    icon: "arrow",
  },
  unable_to_reach: {
    label: "worker:followup.outcome.unableToReach",
    hint: "worker:followup.outcome.unableToReachHint",
    icon: "octagon-alert",
  },
};

export type OutcomeTypePickerProps = {
  value: WorkerOutcome | null;
  onChange: (value: WorkerOutcome) => void;
  /** Guard result per outcome (null = allowed). */
  blocks: Record<WorkerOutcome, OutcomeBlock | null>;
  error?: FieldErrorLike;
};

export function OutcomeTypePicker({ value, onChange, blocks, error }: OutcomeTypePickerProps) {
  const t = useTx();
  return (
    <RadioCardGroup<WorkerOutcome>
      legend={t("worker:followup.outcome.legend")}
      testID="outcome-type"
      required
      value={value}
      onChange={onChange}
      {...(error === undefined ? {} : { error })}
      options={WORKER_OUTCOMES.map((outcome) => {
        const block = blocks[outcome];
        return {
          value: outcome,
          label: t(LABEL[outcome].label),
          description:
            block === null ? t(LABEL[outcome].hint) : t(`worker:followup.blocked.${block}`),
          icon: LABEL[outcome].icon,
          disabled: block !== null,
        };
      })}
    />
  );
}
