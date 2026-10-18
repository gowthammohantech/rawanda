/**
 * Clinician-recorded completion of a follow-up (CLN-09): completed-at (≤ demo now), outcome
 * (`attended | repeat_screening_done | declined`) and an evidence type (FND-02
 * `COMPLETION_EVIDENCE_TYPES`, demo placeholders pending clinical sign-off) are ALL required — a
 * reminder or message being sent is not evidence. FND-03 `record_outcome`; a clinician's
 * completion is confirmed at once by the repository (no worker confirmation step).
 * Decision: `referred_onward` is not offered here — it never completes a task (PO 14, the
 * repository moves it to `contacted`).
 */
import { vMsg } from "@laif/contracts";
import { COMPLETION_EVIDENCE_TYPES, type FollowUp } from "@laif/domain";
import { DateTimeInput, InfoCallout, Select, Textarea, useToast, useTx } from "@laif/ui-web";
import { useState } from "react";

import { parseFollowUpUpdate, type FieldErrors } from "./model.ts";
import { TaskDialogFrame } from "./TaskDialogFrame.tsx";
import { useFollowUpAction } from "./useFollowUpAction.ts";

export const CLINICIAN_COMPLETION_OUTCOMES = [
  "attended",
  "repeat_screening_done",
  "declined",
] as const;

export type CompleteTaskDialogProps = {
  followUp: FollowUp;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nowIso: string;
  onSaved?: (followUp: FollowUp) => void;
};

export function CompleteTaskDialog({
  followUp,
  open,
  onOpenChange,
  nowIso,
  onSaved,
}: CompleteTaskDialogProps) {
  const t = useTx();
  const { toast } = useToast();
  const [completedAt, setCompletedAt] = useState<string | null>(null);
  const [outcome, setOutcome] = useState("");
  const [evidenceType, setEvidenceType] = useState("");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const close = () => onOpenChange(false);
  const action = useFollowUpAction((next) => {
    toast({ tone: "positive", title: t("clinical:tasks.toast.completed") });
    onSaved?.(next);
    close();
  });

  const confirm = async () => {
    const parsed = parseFollowUpUpdate({
      followUpId: followUp.id,
      expectedVersion: followUp.version,
      action: "record_outcome",
      outcome,
      occurredAt: completedAt,
      evidenceType,
      note,
    });
    const next: FieldErrors = parsed.ok ? {} : { ...parsed.errors };
    if (next["occurredAt"] !== undefined) next["completedAt"] = next["occurredAt"];
    if (completedAt === null) next["completedAt"] = vMsg("required");
    else if (Date.parse(completedAt) > Date.parse(nowIso))
      next["completedAt"] = vMsg("dateInFuture");
    // Completion always needs an evidence type in the portal (not only for attended outcomes).
    if (evidenceType === "") next["evidenceType"] = vMsg("evidenceTypeRequired");
    setErrors(next);
    if (!parsed.ok || Object.keys(next).length > 0) return;
    await action.submit(parsed.value);
  };

  return (
    <TaskDialogFrame
      followUp={followUp}
      action={action}
      open={open}
      onClose={close}
      testId="complete-task-form"
      title={t("clinical:tasks.complete.title")}
      description={t("clinical:tasks.complete.body")}
      confirmLabel={t("clinical:tasks.complete.confirm")}
      variant="destructive"
      onConfirm={confirm}
      changeSummary={t("clinical:tasks.complete.change")}
    >
      <InfoCallout icon="alert">
        <p className="m-0">{t("clinical:tasks.complete.notEvidence")}</p>
      </InfoCallout>
      <DateTimeInput
        id="task-complete-at"
        label={t("clinical:tasks.complete.completedAt")}
        required
        max={nowIso}
        value={completedAt}
        error={errors["completedAt"]}
        onChange={setCompletedAt}
      />
      <Select
        id="task-complete-outcome"
        label={t("clinical:tasks.complete.outcomeLabel")}
        required
        placeholder={t("clinical:tasks.dialog.choose")}
        options={CLINICIAN_COMPLETION_OUTCOMES.map((value) => ({
          value,
          label: t(`clinical:tasks.complete.outcome.${value}`),
        }))}
        value={outcome}
        error={errors["outcome"]}
        onChange={(event) => setOutcome(event.target.value)}
      />
      <Select
        id="task-complete-evidence"
        label={t("clinical:tasks.complete.evidenceTypeLabel")}
        required
        placeholder={t("clinical:tasks.dialog.choose")}
        options={COMPLETION_EVIDENCE_TYPES.map((value) => ({
          value,
          label: t(`clinical:tasks.complete.evidenceType.${value}`),
        }))}
        value={evidenceType}
        error={errors["evidenceType"]}
        onChange={(event) => setEvidenceType(event.target.value)}
      />
      <Textarea
        id="task-complete-note"
        label={t("clinical:tasks.complete.note")}
        rows={3}
        maxLength={500}
        value={note}
        error={errors["note"]}
        onChange={(event) => setNote(event.target.value)}
      />
    </TaskDialogFrame>
  );
}
