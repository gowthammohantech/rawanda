/**
 * "How was this confirmed?" (HWM-08): radio cards of the FND-02 `WORKER_EVIDENCE_TYPES` demo
 * list (facility register, appointment card, accompanied visit, patient's verbal confirmation),
 * each with a one-line description. Demo values pending clinical sign-off (INDEX Q5).
 */
import { WORKER_EVIDENCE_TYPES, type WorkerEvidenceType } from "@laif/domain";
import { domainKey, type FieldErrorLike } from "@laif/i18n";
import { RadioCardGroup, useTx } from "@laif/ui-native";

export type EvidenceTypePickerProps = {
  value: WorkerEvidenceType | null;
  onChange: (value: WorkerEvidenceType) => void;
  error?: FieldErrorLike;
};

export function EvidenceTypePicker({ value, onChange, error }: EvidenceTypePickerProps) {
  const t = useTx();
  return (
    <RadioCardGroup<WorkerEvidenceType>
      legend={t("worker:followup.evidenceType")}
      testID="outcome-evidence"
      required
      value={value}
      onChange={onChange}
      {...(error === undefined ? {} : { error })}
      options={WORKER_EVIDENCE_TYPES.map((type) => ({
        value: type,
        label: t(domainKey("evidence", type)),
        description: t(`worker:followup.evidence.${type}`),
        icon: "clipboard",
      }))}
    />
  );
}
