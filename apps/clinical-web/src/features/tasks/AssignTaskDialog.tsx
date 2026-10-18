/**
 * Assign / reassign a follow-up (CLN-09 tasks 2–3). The worker select lists ONLY the authorised
 * CHWs of the active facility (`listWorkers`), each with their current load (open · overdue) for
 * fair assignment; the repository rejects anyone else (`FORBIDDEN` / `WORKER_NOT_AUTHORISED`).
 * Assign needs a due date; reassign needs a reason (FND-03 `Reason`, ≥ 10 non-space characters)
 * and keeps the previous assignee in the assignment history. Parsed by the FND-03
 * `FollowUpUpdateInputSchema` (no app-local schema); stale version → `ConflictResolutionDialog`.
 */
import { MIN_REASON_NON_WHITESPACE_CHARS, type FollowUp } from "@laif/domain";
import { vMsg } from "@laif/contracts";
import { DateTimeInput, LoadingSkeleton, Select, Textarea, useToast, useTx } from "@laif/ui-web";
import { useMemo, useState } from "react";

import { personaName } from "../timeline/people.ts";
import { useFollowUps, useWorkers } from "./hooks.ts";
import { isFutureIso, parseFollowUpUpdate, workload, type FieldErrors } from "./model.ts";
import { TaskDialogFrame } from "./TaskDialogFrame.tsx";
import { useFollowUpAction } from "./useFollowUpAction.ts";

export type AssignTaskDialogProps = {
  followUp: FollowUp;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nowIso: string;
  onSaved?: (followUp: FollowUp) => void;
};

export function AssignTaskDialog({
  followUp,
  open,
  onOpenChange,
  nowIso,
  onSaved,
}: AssignTaskDialogProps) {
  const t = useTx();
  const { toast } = useToast();
  const reassign = followUp.assignedWorkerId !== null;
  const workers = useWorkers();
  const all = useFollowUps();
  const [workerId, setWorkerId] = useState("");
  const [dueAt, setDueAt] = useState<string | null>(reassign ? followUp.dueAt : null);
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});

  const close = () => onOpenChange(false);
  const action = useFollowUpAction((next) => {
    toast({
      tone: "positive",
      title: t(reassign ? "clinical:tasks.toast.reassigned" : "clinical:tasks.toast.assigned", {
        name: personaName(next.assignedWorkerId) ?? "—",
      }),
    });
    onSaved?.(next);
    close();
  });

  const loads = useMemo(() => {
    const ids = (workers.data ?? []).map((w) => w.id);
    return new Map(
      workload(all.data ?? [], ids, new Date(nowIso)).map((l) => [l.workerId as string, l]),
    );
  }, [workers.data, all.data, nowIso]);

  const options = (workers.data ?? [])
    .filter((w) => w.id !== followUp.assignedWorkerId)
    .map((w) => {
      const load = loads.get(w.id);
      return {
        value: w.id,
        label: t("clinical:tasks.assign.workerOption", {
          name: w.displayName,
          open: load?.open ?? 0,
          overdue: load?.overdue ?? 0,
        }),
      };
    });

  const confirm = async () => {
    const next: FieldErrors = {};
    if (dueAt !== null && dueAt !== followUp.dueAt && !isFutureIso(dueAt, nowIso)) {
      next["dueAt"] = vMsg("dateMustBeFuture");
    }
    const parsed = parseFollowUpUpdate({
      followUpId: followUp.id,
      expectedVersion: followUp.version,
      action: reassign ? "reassign" : "assign",
      assignedWorkerId: workerId,
      dueAt: reassign && dueAt === followUp.dueAt ? undefined : dueAt,
      ...(reassign ? { reason } : {}),
    });
    const merged = parsed.ok ? next : { ...parsed.errors, ...next };
    setErrors(merged);
    if (!parsed.ok || Object.keys(next).length > 0) return;
    await action.submit(parsed.value);
  };

  const workerName = personaName(workerId === "" ? null : workerId);
  return (
    <TaskDialogFrame
      followUp={followUp}
      action={action}
      open={open}
      onClose={close}
      testId="assign-form"
      title={t(reassign ? "clinical:tasks.assign.reassignTitle" : "clinical:tasks.assign.title")}
      description={
        reassign
          ? t("clinical:tasks.assign.reassignBody", {
              name: personaName(followUp.assignedWorkerId) ?? "—",
            })
          : t("clinical:tasks.assign.body")
      }
      confirmLabel={t(
        reassign ? "clinical:tasks.assign.reassignConfirm" : "clinical:tasks.assign.confirm",
      )}
      onConfirm={confirm}
      changeSummary={
        workerName === null ? undefined : t("clinical:tasks.assign.change", { name: workerName })
      }
    >
      {workers.isPending ? (
        <LoadingSkeleton lines={2} />
      ) : (
        <Select
          id="task-assign-worker"
          label={t("clinical:tasks.assign.worker")}
          hint={t("clinical:tasks.assign.workerHint")}
          required
          placeholder={t("clinical:tasks.dialog.choose")}
          options={options}
          value={workerId}
          error={errors["assignedWorkerId"]}
          onChange={(event) => setWorkerId(event.target.value)}
          data-testid="task-assign-worker"
        />
      )}
      <DateTimeInput
        id="task-assign-due"
        label={t("clinical:tasks.assign.dueAt")}
        hint={t("clinical:tasks.assign.dueHint")}
        required={!reassign}
        min={nowIso}
        value={dueAt}
        error={errors["dueAt"]}
        onChange={setDueAt}
      />
      {reassign ? (
        <Textarea
          id="task-assign-reason"
          label={t("clinical:tasks.reassignReason")}
          hint={t("clinical:tasks.dialog.reasonHint", { min: MIN_REASON_NON_WHITESPACE_CHARS })}
          required
          rows={3}
          maxLength={500}
          value={reason}
          error={errors["reason"]}
          onChange={(event) => setReason(event.target.value)}
        />
      ) : null}
    </TaskDialogFrame>
  );
}
