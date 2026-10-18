/**
 * Record a follow-up status (CLN-09): `contacted` (FND-03 `record_attempt`, result `reached`, with
 * contact method + time) or `unable_to_reach` (`record_outcome` with an FND-02
 * `UNABLE_TO_REACH_REASONS` code) + an optional note. Only the statuses the FND-02 machine allows
 * from the current status are offered. Audited by the repository as
 * `followup.attempt_recorded` / `followup.outcome_recorded` (the phase's
 * `followup.status_changed` maps onto these registered names).
 */
import { vMsg } from "@laif/contracts";
import {
  CONTACT_METHODS,
  followUpMachine,
  UNABLE_TO_REACH_REASONS,
  type FollowUp,
} from "@laif/domain";
import { domainKey } from "@laif/i18n";
import { DateTimeInput, RadioCardGroup, Select, Textarea, useToast, useTx } from "@laif/ui-web";
import { useState } from "react";

import { parseFollowUpUpdate, type FieldErrors } from "./model.ts";
import { TaskDialogFrame } from "./TaskDialogFrame.tsx";
import { useFollowUpAction } from "./useFollowUpAction.ts";

type StatusChoice = "contacted" | "unable_to_reach";

export type UpdateTaskStatusDialogProps = {
  followUp: FollowUp;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nowIso: string;
  onSaved?: (followUp: FollowUp) => void;
};

/** Statuses offered from the current one (legal next steps; `contacted` again = another reached contact). */
export function statusChoices(followUp: FollowUp): StatusChoice[] {
  const next = followUpMachine.next(followUp.status);
  const out: StatusChoice[] = [];
  if (next.includes("contacted") || followUp.status === "contacted") out.push("contacted");
  if (next.includes("unable_to_reach")) out.push("unable_to_reach");
  return out;
}

export function UpdateTaskStatusDialog({
  followUp,
  open,
  onOpenChange,
  nowIso,
  onSaved,
}: UpdateTaskStatusDialogProps) {
  const t = useTx();
  const { toast } = useToast();
  const choices = statusChoices(followUp);
  const [status, setStatus] = useState<StatusChoice | null>(
    choices.length === 1 ? choices[0]! : null,
  );
  const [at, setAt] = useState<string | null>(nowIso);
  const [method, setMethod] = useState("");
  const [reasonCode, setReasonCode] = useState("");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const close = () => onOpenChange(false);
  const action = useFollowUpAction((next) => {
    toast({ tone: "positive", title: t("clinical:tasks.toast.statusRecorded") });
    onSaved?.(next);
    close();
  });

  const confirm = async () => {
    if (status === null) {
      setErrors({ status: vMsg("required") });
      return;
    }
    const base = { followUpId: followUp.id, expectedVersion: followUp.version, note };
    const parsed =
      status === "contacted"
        ? parseFollowUpUpdate({ ...base, action: "record_attempt", at, method, result: "reached" })
        : parseFollowUpUpdate({
            ...base,
            action: "record_outcome",
            outcome: "unable_to_reach",
            occurredAt: at,
            reasonCode,
          });
    const next: FieldErrors = parsed.ok ? {} : { ...parsed.errors };
    if (next["occurredAt"] !== undefined) next["at"] = next["occurredAt"];
    if (at !== null && Date.parse(at) > Date.parse(nowIso)) next["at"] = vMsg("dateInFuture");
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
      testId="status-form"
      title={t("clinical:tasks.statusDialog.title")}
      description={t("clinical:tasks.statusDialog.body")}
      confirmLabel={t("clinical:tasks.statusDialog.confirm")}
      onConfirm={confirm}
      changeSummary={
        status === null
          ? undefined
          : t("clinical:tasks.statusDialog.change", {
              status: t(domainKey("status.followUp", status)),
            })
      }
    >
      <RadioCardGroup<StatusChoice>
        legend={t("clinical:tasks.statusDialog.status")}
        required
        columns={2}
        options={choices.map((value) => ({
          value,
          label: t(domainKey("status.followUp", value)),
          description: t(`clinical:tasks.statusDialog.hint.${value}`),
        }))}
        value={status}
        onChange={setStatus}
        error={errors["status"]}
      />
      <DateTimeInput
        id="task-status-at"
        label={t("clinical:tasks.statusDialog.at")}
        required
        max={nowIso}
        value={at}
        error={errors["at"]}
        onChange={setAt}
      />
      {status === "contacted" ? (
        <Select
          id="task-status-method"
          label={t("clinical:tasks.statusDialog.method")}
          required
          placeholder={t("clinical:tasks.dialog.choose")}
          options={CONTACT_METHODS.map((value) => ({
            value,
            label: t(domainKey("contactMethod", value)),
          }))}
          value={method}
          error={errors["method"]}
          onChange={(event) => setMethod(event.target.value)}
        />
      ) : null}
      {status === "unable_to_reach" ? (
        <Select
          id="task-status-reason"
          label={t("clinical:tasks.statusDialog.reasonCode")}
          required
          placeholder={t("clinical:tasks.dialog.choose")}
          options={UNABLE_TO_REACH_REASONS.map((value) => ({
            value,
            label: t(domainKey("unableToReachReason", value)),
          }))}
          value={reasonCode}
          error={errors["reasonCode"]}
          onChange={(event) => setReasonCode(event.target.value)}
        />
      ) : null}
      <Textarea
        id="task-status-note"
        label={t("clinical:tasks.statusDialog.note")}
        rows={3}
        maxLength={500}
        value={note}
        error={errors["note"]}
        onChange={(event) => setNote(event.target.value)}
      />
    </TaskDialogFrame>
  );
}
