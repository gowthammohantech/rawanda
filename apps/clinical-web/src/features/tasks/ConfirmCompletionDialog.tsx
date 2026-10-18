/**
 * Clinician confirmation of a worker-reported completion (CLN-09 task 6, WF-01 step 7): shows the
 * worker's outcome, who recorded it and when, the evidence type and every contact attempt with
 * its timestamp. `Confirm` (FND-03 `confirm_completion`) → `clinicianConfirmation.status =
 * confirmed` with `by` = the clinician; `Return to worker` needs a reason (`return_to_worker`,
 * only while confirmation is pending — FND-02 ★ edge `completed → contacted`). Both audited by
 * the repository (`followup.completion_confirmed` / `followup.returned_to_worker`).
 */
import { MIN_REASON_NON_WHITESPACE_CHARS, type FollowUp } from "@laif/domain";
import { domainKey, formatDateTime, useLanguage } from "@laif/i18n";
import { Button, KeyValueList, Textarea, useToast, useTx, type KeyValueItem } from "@laif/ui-web";
import { useState } from "react";

import { personaName } from "../timeline/people.ts";
import { parseFollowUpUpdate, type FieldErrors } from "./model.ts";
import { TaskDialogFrame } from "./TaskDialogFrame.tsx";
import { useFollowUpAction } from "./useFollowUpAction.ts";

export type ConfirmCompletionDialogProps = {
  followUp: FollowUp;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: (followUp: FollowUp) => void;
};

export function ConfirmCompletionDialog({
  followUp,
  open,
  onOpenChange,
  onSaved,
}: ConfirmCompletionDialogProps) {
  const t = useTx();
  const { language } = useLanguage();
  const { toast } = useToast();
  const [mode, setMode] = useState<"confirm" | "return">("confirm");
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const close = () => onOpenChange(false);
  const action = useFollowUpAction((next) => {
    toast({
      tone: "positive",
      title: t(
        next.clinicianConfirmation.status === "confirmed"
          ? "clinical:tasks.toast.confirmed"
          : "clinical:tasks.toast.returned",
      ),
    });
    onSaved?.(next);
    close();
  });

  const outcome = followUp.outcome;
  const items: KeyValueItem[] = [
    {
      id: "outcome",
      label: t("clinical:tasks.confirm.outcome"),
      value: outcome === null ? "—" : t(domainKey("followUpOutcome", outcome.kind)),
    },
    {
      id: "recordedBy",
      label: t("clinical:tasks.confirm.recordedBy"),
      value:
        outcome === null
          ? "—"
          : t("clinical:tasks.drawer.byAt", {
              name: personaName(outcome.recordedBy) ?? "—",
              when: formatDateTime(outcome.occurredAt, language),
            }),
    },
    {
      id: "evidence",
      label: t("clinical:tasks.confirm.evidenceType"),
      value:
        outcome?.evidenceType === null || outcome?.evidenceType === undefined
          ? t("clinical:tasks.confirm.noEvidence")
          : t(`clinical:tasks.complete.evidenceType.${outcome.evidenceType}`),
    },
  ];
  if (outcome !== null && outcome.note !== "") {
    items.push({ id: "note", label: t("clinical:tasks.confirm.workerNote"), value: outcome.note });
  }

  const confirm = async () => {
    const parsed =
      mode === "confirm"
        ? parseFollowUpUpdate({
            followUpId: followUp.id,
            expectedVersion: followUp.version,
            action: "confirm_completion",
          })
        : parseFollowUpUpdate({
            followUpId: followUp.id,
            expectedVersion: followUp.version,
            action: "return_to_worker",
            reason,
          });
    setErrors(parsed.ok ? {} : parsed.errors);
    if (!parsed.ok) return;
    await action.submit(parsed.value);
  };

  return (
    <TaskDialogFrame
      followUp={followUp}
      action={action}
      open={open}
      onClose={close}
      testId="confirm-completion-form"
      title={t(
        mode === "confirm" ? "clinical:tasks.confirm.title" : "clinical:tasks.returnToWorker.title",
      )}
      description={t(
        mode === "confirm" ? "clinical:tasks.confirm.body" : "clinical:tasks.returnToWorker.body",
      )}
      confirmLabel={t(
        mode === "confirm"
          ? "clinical:tasks.confirm.confirm"
          : "clinical:tasks.returnToWorker.confirm",
      )}
      {...(mode === "return" ? { variant: "destructive" as const } : {})}
      onConfirm={confirm}
      changeSummary={t(
        mode === "confirm"
          ? "clinical:tasks.confirm.change"
          : "clinical:tasks.returnToWorker.change",
      )}
    >
      <div data-testid="worker-outcome">
        <KeyValueList items={items} />
      </div>
      <section aria-labelledby="confirm-attempts-title" className="space-y-1">
        <h3 id="confirm-attempts-title" className="micro-label text-muted m-0">
          {t("clinical:tasks.confirm.attempts")}
        </h3>
        {followUp.attempts.length === 0 ? (
          <p className="text-muted m-0 text-[13px]">{t("clinical:tasks.confirm.noAttempts")}</p>
        ) : (
          <ul className="m-0 list-none space-y-1 p-0 text-[13px]" data-testid="confirm-attempts">
            {followUp.attempts.map((attempt) => (
              <li key={attempt.id} className="text-ink">
                {t("clinical:tasks.confirm.attempt", {
                  when: formatDateTime(attempt.at, language),
                  method: t(domainKey("contactMethod", attempt.method)),
                  result: t(domainKey("contactResult", attempt.result)),
                  name: personaName(attempt.recordedBy) ?? "—",
                })}
              </li>
            ))}
          </ul>
        )}
      </section>
      {mode === "return" ? (
        <Textarea
          id="task-return-reason"
          label={t("clinical:tasks.returnToWorker.reason")}
          hint={t("clinical:tasks.dialog.reasonHint", { min: MIN_REASON_NON_WHITESPACE_CHARS })}
          required
          rows={3}
          maxLength={500}
          value={reason}
          error={errors["reason"]}
          onChange={(event) => setReason(event.target.value)}
        />
      ) : (
        <Button
          variant="secondary"
          size="sm"
          data-testid="return-to-worker"
          onClick={() => setMode("return")}
        >
          {t("clinical:tasks.returnToWorker.open")}
        </Button>
      )}
    </TaskDialogFrame>
  );
}
