/**
 * Frame shared by the task dialogs (CLN-09): the FND-09 `ConfirmDialog` around the form, the
 * failure feedback (translated error, retry with the SAME key after timeout / offline / 503,
 * `WORKER_NOT_AUTHORISED`, illegal transition) and — after a `CONFLICT` — the
 * `ConflictResolutionDialog` in its place (one dialog open at a time). The conflict rows compare
 * the user's copy WITH their change against the latest version, and preview the latest version
 * with the change re-applied.
 */
import type { FollowUp, PersonaId } from "@laif/domain";
import type { FollowUpUpdateCall } from "@laif/repositories";
import { domainKey, formatDateTime, useLanguage } from "@laif/i18n";
import { Button, ConfirmDialog, useToast, useTx } from "@laif/ui-web";
import type { ReactNode } from "react";

import {
  ConflictResolutionDialog,
  type ConflictField,
} from "../../components/ConflictResolutionDialog.tsx";
import { clinicalErrorKeys, type ClinicalError } from "../../data/errors.ts";
import { personaName } from "../timeline/people.ts";
import { allowedTaskActions, type TaskAction } from "./model.ts";
import type { useFollowUpAction } from "./useFollowUpAction.ts";

type Action = ReturnType<typeof useFollowUpAction>;

/** The follow-up as it would be after `change` (preview only; the repository decides). */
export function applyChange(fu: FollowUp, change: FollowUpUpdateCall): FollowUp {
  switch (change.action) {
    case "assign":
      return { ...fu, assignedWorkerId: change.assignedWorkerId as PersonaId, dueAt: change.dueAt };
    case "reassign":
      return {
        ...fu,
        assignedWorkerId: change.assignedWorkerId as PersonaId,
        dueAt: change.dueAt ?? fu.dueAt,
        status: fu.status === "unable_to_reach" ? "reassigned" : fu.status,
      };
    case "set_due_date":
      return { ...fu, dueAt: change.dueAt };
    case "record_attempt":
      return {
        ...fu,
        status:
          change.result === "reached" && (fu.status === "assigned" || fu.status === "reassigned")
            ? "contacted"
            : fu.status,
      };
    case "record_outcome":
      return {
        ...fu,
        status:
          change.outcome === "unable_to_reach"
            ? "unable_to_reach"
            : change.outcome === "referred_onward"
              ? "contacted"
              : "completed",
      };
    case "add_note":
      return { ...fu, notes: [...fu.notes, { at: "", by: "" as PersonaId, text: change.note }] };
    case "confirm_completion":
      return { ...fu, clinicianConfirmation: { status: "confirmed" } };
    case "return_to_worker":
      return { ...fu, status: "contacted", clinicianConfirmation: { status: "returned" } };
  }
}

const ACTION_OF: Record<FollowUpUpdateCall["action"], TaskAction> = {
  assign: "assign",
  reassign: "reassign",
  set_due_date: "setDueDate",
  record_attempt: "updateStatus",
  record_outcome: "updateStatus",
  add_note: "note",
  confirm_completion: "confirm",
  return_to_worker: "confirm",
};

/** Whether `change` is still a legal step on the latest version. */
export function canReapplyOn(latest: FollowUp, change: FollowUpUpdateCall): boolean {
  const allowed = allowedTaskActions(latest, true);
  const wanted = ACTION_OF[change.action];
  if (wanted === "assign" || wanted === "reassign") {
    return allowed.includes("assign") || allowed.includes("reassign");
  }
  if (change.action === "record_outcome" && change.outcome !== "unable_to_reach") {
    return allowed.includes("complete");
  }
  return allowed.includes(wanted);
}

function useConflictFields() {
  const t = useTx();
  const { language } = useLanguage();
  const worker = (fu: FollowUp) =>
    fu.assignedWorkerId === null
      ? t("clinical:tasks.table.unassigned")
      : (personaName(fu.assignedWorkerId) ?? fu.assignedWorkerId);
  const lastNote = (fu: FollowUp) => fu.notes.at(-1)?.text ?? "—";
  return (mine: FollowUp, latest: FollowUp, change: FollowUpUpdateCall): ConflictField[] => {
    const yours = applyChange(mine, change);
    const merged = applyChange(latest, change);
    const row = (id: string, label: string, get: (fu: FollowUp) => string): ConflictField => ({
      id,
      label,
      yours: get(yours),
      latest: get(latest),
      merged: get(merged),
    });
    return [
      row("status", t("clinical:tasks.table.status"), (fu) =>
        t(domainKey("status.followUp", fu.status)),
      ),
      row("assignee", t("clinical:tasks.table.assignedTo"), worker),
      row("due", t("clinical:tasks.table.due"), (fu) => formatDateTime(fu.dueAt, language)),
      row("note", t("clinical:tasks.conflict.lastNote"), lastNote),
      row("confirmation", t("clinical:tasks.conflict.confirmation"), (fu) =>
        t(domainKey("clinicianConfirmation", fu.clinicianConfirmation.status)),
      ),
    ];
  };
}

export function TaskFeedback({
  error,
  canRetry,
  retrying,
  onRetry,
}: {
  error: ClinicalError | null;
  canRetry: boolean;
  retrying: boolean;
  onRetry: () => unknown;
}) {
  const t = useTx();
  if (error === null || error.code === "CONFLICT") return null;
  if (error.code === "VALIDATION_ERROR") {
    if (error.reason === "INVALID_TRANSITION" || error.invariantCode !== undefined) {
      return (
        <p role="alert" data-testid="task-invalid" className="text-danger m-0 text-[13px]">
          {t("clinical:tasks.errors.invalidTransition")}
        </p>
      );
    }
    return null;
  }
  if (error.code === "FORBIDDEN" && error.reason === "WORKER_NOT_AUTHORISED") {
    return (
      <p role="alert" data-testid="task-worker-denied" className="text-danger m-0 text-[13px]">
        {t("clinical:tasks.errors.workerNotAuthorised")}
      </p>
    );
  }
  return (
    <section
      role="alert"
      data-testid="task-dialog-failed"
      className="border-risk-danger/25 bg-risk-danger-soft space-y-2 rounded-md border p-3 text-[13px]"
    >
      <p className="text-risk-danger m-0 font-semibold">{t(clinicalErrorKeys(error.code).title)}</p>
      <p className="text-ink m-0">{t("clinical:tasks.dialog.failed")}</p>
      {canRetry ? (
        <Button
          variant="secondary"
          size="sm"
          icon="refresh"
          loading={retrying}
          onClick={() => void onRetry()}
        >
          {t("clinical:tasks.dialog.retry")}
        </Button>
      ) : null}
    </section>
  );
}

export type TaskDialogFrameProps = {
  followUp: FollowUp;
  action: Action;
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  variant?: "default" | "destructive";
  onConfirm: () => unknown;
  /** Summary of the attempted change (shown in the conflict dialog). */
  changeSummary?: ReactNode;
  children: ReactNode;
  testId: string;
};

export function TaskDialogFrame({
  followUp,
  action,
  open,
  onClose,
  title,
  description,
  confirmLabel,
  variant = "default",
  onConfirm,
  changeSummary,
  children,
  testId,
}: TaskDialogFrameProps) {
  const t = useTx();
  const { toast } = useToast();
  const fields = useConflictFields();
  const { mutation, pending } = action;

  const close = () => {
    action.cancelConflict();
    onClose();
  };

  if (pending !== null) {
    const reapplyAllowed = canReapplyOn(pending.latest, pending.variables);
    return (
      <ConflictResolutionDialog
        open={open}
        conflict={pending.conflict}
        fields={fields(followUp, pending.latest, pending.variables)}
        {...(changeSummary === undefined ? {} : { change: changeSummary })}
        busy={action.busy}
        canReapply={reapplyAllowed}
        reapplyBlockedReason={t("clinical:tasks.conflict.reapplyBlocked")}
        onKeepLatest={async () => {
          await action.keepLatest();
          toast({ tone: "info", title: t("clinical:tasks.toast.keptLatest") });
          onClose();
        }}
        onReapply={async () => {
          const result = await action.reapply();
          if (result !== undefined) {
            toast({ tone: "positive", title: t("clinical:tasks.toast.reapplied") });
            onClose();
          }
        }}
        onCancel={close}
      />
    );
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
      title={title}
      {...(description === undefined ? {} : { description })}
      confirmLabel={confirmLabel}
      variant={variant}
      loading={mutation.isSubmitting}
      onConfirm={() => onConfirm()}
    >
      <form
        noValidate
        data-testid={testId}
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void onConfirm();
        }}
      >
        {children}
        <TaskFeedback
          error={mutation.error}
          canRetry={mutation.canRetry}
          retrying={mutation.isSubmitting}
          onRetry={() => action.retry()}
        />
        <button type="submit" hidden tabIndex={-1} aria-hidden="true" />
      </form>
    </ConfirmDialog>
  );
}
