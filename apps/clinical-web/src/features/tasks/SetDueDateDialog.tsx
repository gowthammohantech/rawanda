/**
 * Change a follow-up's due date with a reason (CLN-09, FND-03 `set_due_date { dueAt, reason }`).
 * The new date must be later than demo now; overdue is re-derived from it (never stored).
 */
import { vMsg } from "@laif/contracts";
import { MIN_REASON_NON_WHITESPACE_CHARS, type FollowUp } from "@laif/domain";
import { formatDateTime, useLanguage } from "@laif/i18n";
import { DateTimeInput, Textarea, useToast, useTx } from "@laif/ui-web";
import { useState } from "react";

import { isFutureIso, parseFollowUpUpdate, type FieldErrors } from "./model.ts";
import { TaskDialogFrame } from "./TaskDialogFrame.tsx";
import { useFollowUpAction } from "./useFollowUpAction.ts";

export type SetDueDateDialogProps = {
  followUp: FollowUp;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nowIso: string;
  onSaved?: (followUp: FollowUp) => void;
};

export function SetDueDateDialog({
  followUp,
  open,
  onOpenChange,
  nowIso,
  onSaved,
}: SetDueDateDialogProps) {
  const t = useTx();
  const { language } = useLanguage();
  const { toast } = useToast();
  const [dueAt, setDueAt] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const close = () => onOpenChange(false);
  const action = useFollowUpAction((next) => {
    toast({ tone: "positive", title: t("clinical:tasks.toast.dueChanged") });
    onSaved?.(next);
    close();
  });

  const confirm = async () => {
    const parsed = parseFollowUpUpdate({
      followUpId: followUp.id,
      expectedVersion: followUp.version,
      action: "set_due_date",
      dueAt,
      reason,
    });
    const next: FieldErrors = parsed.ok ? {} : { ...parsed.errors };
    if (dueAt !== null && !isFutureIso(dueAt, nowIso)) next["dueAt"] = vMsg("dateMustBeFuture");
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
      testId="due-form"
      title={t("clinical:tasks.due.title")}
      description={t("clinical:tasks.due.body", {
        current: formatDateTime(followUp.dueAt, language),
      })}
      confirmLabel={t("clinical:tasks.due.confirm")}
      onConfirm={confirm}
      changeSummary={
        dueAt === null
          ? undefined
          : t("clinical:tasks.due.change", { when: formatDateTime(dueAt, language) })
      }
    >
      <DateTimeInput
        id="task-due-at"
        label={t("clinical:tasks.assign.dueAt")}
        required
        min={nowIso}
        value={dueAt}
        error={errors["dueAt"]}
        onChange={setDueAt}
      />
      <Textarea
        id="task-due-reason"
        label={t("clinical:tasks.due.reason")}
        hint={t("clinical:tasks.dialog.reasonHint", { min: MIN_REASON_NON_WHITESPACE_CHARS })}
        required
        rows={3}
        maxLength={500}
        value={reason}
        error={errors["reason"]}
        onChange={(event) => setReason(event.target.value)}
      />
    </TaskDialogFrame>
  );
}
