/**
 * `Create task` (CLN-09 task 8): a follow-up for a DECIDED review (not dismissed) of the active
 * facility, reusing the CLN-07 REPEAT_TEST / PLANNED_REVIEW fields (type, due date later than
 * demo now, optional authorised worker, optional note). One OPEN task per (review, type): types
 * already open on a review are not offered. Parsed by FND-03 `FollowUpInputSchema`; audited
 * `followup.created` by the repository; one idempotency key per dialog session.
 */
import { contractsErrorMap, FollowUpInputSchema, vMsg } from "@laif/contracts";
import type { FollowUp } from "@laif/domain";
import { domainKey } from "@laif/i18n";
import {
  ConfirmDialog,
  DateTimeInput,
  LoadingSkeleton,
  Select,
  Textarea,
  useToast,
  useTx,
} from "@laif/ui-web";
import { useState } from "react";

import type { PatientNames } from "../referrals/hooks.ts";
import { useCreateFollowUp, useEligibleTaskReviews, useWorkers } from "./hooks.ts";
import { isFutureIso, type FieldErrors } from "./model.ts";
import { TaskFeedback } from "./TaskDialogFrame.tsx";

const PARSE_KEY = "00000000-0000-4000-8000-000000000000";

export type CreateTaskDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nowIso: string;
  patients: PatientNames | undefined;
  onSaved?: (followUp: FollowUp) => void;
};

export function CreateTaskDialog({
  open,
  onOpenChange,
  nowIso,
  patients,
  onSaved,
}: CreateTaskDialogProps) {
  const t = useTx();
  const { toast } = useToast();
  const eligible = useEligibleTaskReviews(open);
  const workers = useWorkers(open);
  const [reviewId, setReviewId] = useState("");
  const [purpose, setPurpose] = useState("");
  const [dueAt, setDueAt] = useState<string | null>(null);
  const [workerId, setWorkerId] = useState("");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const mutation = useCreateFollowUp();
  const close = () => {
    mutation.reset();
    onOpenChange(false);
  };

  const entry = eligible.data?.find((e) => e.review.id === reviewId) ?? null;

  const finish = (result: { data: FollowUp } | undefined) => {
    if (result === undefined) return;
    toast({ tone: "positive", title: t("clinical:tasks.toast.created") });
    onSaved?.(result.data);
    close();
  };

  const confirm = async () => {
    const next: FieldErrors = {};
    if (entry === null) next["reviewId"] = vMsg("required");
    const raw: Record<string, unknown> = {
      idempotencyKey: PARSE_KEY,
      patientId: entry?.review.patientId ?? "",
      reviewId: entry?.review.id,
      purpose: purpose === "" ? undefined : purpose,
      dueAt: dueAt ?? undefined,
      ...(workerId === "" ? {} : { assignedWorkerId: workerId }),
      ...(note.trim() === "" ? {} : { note }),
    };
    const parsed = FollowUpInputSchema.safeParse(raw, { error: contractsErrorMap });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const head = issue.path[0];
        if (typeof head === "string") next[head] ??= issue.message;
      }
    }
    if (dueAt !== null && !isFutureIso(dueAt, nowIso)) next["dueAt"] = vMsg("dateMustBeFuture");
    setErrors(next);
    if (!parsed.success || Object.keys(next).length > 0) return;
    const value: Record<string, unknown> = { ...parsed.data };
    delete value["idempotencyKey"];
    finish(await mutation.submit(value as Parameters<typeof mutation.submit>[0]));
  };

  const reviewLabel = (e: NonNullable<typeof entry>) => {
    const name = patients?.get(e.review.patientId)?.displayName ?? e.review.patientId;
    const kind = e.review.decision?.kind;
    return kind === undefined
      ? name
      : t("clinical:tasks.create.reviewOption", { name, decision: t(domainKey("decision", kind)) });
  };

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => (next ? onOpenChange(true) : close())}
      title={t("clinical:tasks.create.title")}
      description={t("clinical:tasks.create.body")}
      confirmLabel={t("clinical:tasks.create.confirm")}
      loading={mutation.isSubmitting}
      onConfirm={() => confirm()}
    >
      <form
        noValidate
        data-testid="create-task-form"
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void confirm();
        }}
      >
        {eligible.isPending ? (
          <LoadingSkeleton lines={2} />
        ) : (eligible.data ?? []).length === 0 ? (
          <p className="text-muted m-0 text-[13px]" data-testid="create-task-none">
            {t("clinical:tasks.create.none")}
          </p>
        ) : (
          <Select
            id="task-create-review"
            label={t("clinical:tasks.create.review")}
            required
            placeholder={t("clinical:tasks.dialog.choose")}
            options={(eligible.data ?? []).map((e) => ({
              value: e.review.id,
              label: reviewLabel(e),
            }))}
            value={reviewId}
            error={errors["reviewId"] ?? errors["patientId"]}
            onChange={(event) => {
              setReviewId(event.target.value);
              setPurpose("");
            }}
          />
        )}
        <Select
          id="task-create-purpose"
          label={t("clinical:tasks.create.type")}
          required
          placeholder={t("clinical:tasks.dialog.choose")}
          options={(entry?.purposes ?? []).map((value) => ({
            value,
            label: t(
              value === "repeat_screening"
                ? "clinical:tasks.type.repeatTest"
                : "clinical:tasks.type.plannedReview",
            ),
          }))}
          value={purpose}
          error={errors["purpose"]}
          onChange={(event) => setPurpose(event.target.value)}
        />
        <DateTimeInput
          id="task-create-due"
          label={t("clinical:tasks.assign.dueAt")}
          required
          min={nowIso}
          value={dueAt}
          error={errors["dueAt"]}
          onChange={setDueAt}
        />
        <Select
          id="task-create-worker"
          label={t("clinical:tasks.create.worker")}
          hint={t("clinical:tasks.assign.workerHint")}
          placeholder={t("clinical:tasks.create.noWorker")}
          options={(workers.data ?? []).map((w) => ({ value: w.id, label: w.displayName }))}
          value={workerId}
          error={errors["assignedWorkerId"]}
          onChange={(event) => setWorkerId(event.target.value)}
        />
        <Textarea
          id="task-create-note"
          label={t("clinical:tasks.statusDialog.note")}
          rows={2}
          maxLength={500}
          value={note}
          error={errors["note"]}
          onChange={(event) => setNote(event.target.value)}
        />
        <TaskFeedback
          error={mutation.error}
          canRetry={mutation.canRetry}
          retrying={mutation.isSubmitting}
          onRetry={() => mutation.retry().then(finish)}
        />
        <button type="submit" hidden tabIndex={-1} aria-hidden="true" />
      </form>
    </ConfirmDialog>
  );
}
