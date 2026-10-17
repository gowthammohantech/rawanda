/**
 * Resolve a data-quality issue with a note (ADM-06 task 5): react-hook-form + the
 * `@laif/contracts` `TriageNote` rule (10–500 characters). The field error shows admin copy
 * (EN / RW) and focus moves to the field.
 *
 * - The idempotency key is created when the dialog opens and reused by every retry, so a double
 *   click or a timeout + retry resolves exactly once.
 * - Submit is disabled while pending. A failed save keeps the dialog open with the input
 *   ("Not saved — retry"). A CONFLICT closes the dialog and hands the latest state to the row
 *   (`onConflict` → ConflictNotice). Triage changes the issue state only — never the screening.
 */
import { zodResolver } from "@hookform/resolvers/zod";
import {
  QUALITY_TRIAGE_NOTE_MAX,
  QUALITY_TRIAGE_NOTE_MIN,
  TriageNote,
  type DataQualityIssue,
} from "@laif/contracts";
import { isRepositoryError, type RepositoryError } from "@laif/repositories";
import {
  ConfirmDialog,
  CONTROL_CLASS,
  cx,
  Icon,
  useToast,
  useTx,
  type TranslationKey,
} from "@laif/ui-web";
import { useId, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { facilityLabel } from "../../app/persona-labels.ts";
import { isRetryableWriteError, useTriageIssue } from "./mutations.ts";

type FormValues = { note: string };

const formSchema = z.object({ note: z.string() }).superRefine((values, ctx) => {
  if (!TriageNote.safeParse(values.note).success) {
    ctx.addIssue({ code: "custom", path: ["note"], message: "noteLength" });
  }
});

export type TriageDialogProps = {
  issue: DataQualityIssue;
  onClose: () => void;
  onResolved?: (issue: DataQualityIssue) => void;
  onConflict?: (error: RepositoryError, note: string) => void;
  /** Test seam (default `crypto.randomUUID`). */
  createKey?: () => string;
};

export function TriageDialog({
  issue,
  onClose,
  onResolved,
  onConflict,
  createKey,
}: TriageDialogProps) {
  const t = useTx();
  const { toast } = useToast();
  const id = useId();
  const [key] = useState(() => (createKey ?? (() => crypto.randomUUID()))());
  const [failure, setFailure] = useState<"retry" | "forbidden" | "other" | null>(null);
  const mutation = useTriageIssue();
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { note: "" },
    shouldFocusError: true,
  });
  const { register, handleSubmit, formState, setError, setFocus } = form;
  const noteError =
    formState.errors.note === undefined
      ? undefined
      : t("admin:quality.validation.noteLength", {
          min: QUALITY_TRIAGE_NOTE_MIN,
          max: QUALITY_TRIAGE_NOTE_MAX,
        });

  const submit = handleSubmit(async (values) => {
    setFailure(null);
    try {
      const result = await mutation.mutateAsync({
        key,
        input: {
          action: "resolve",
          id: issue.id,
          expectedVersion: issue.version,
          note: values.note,
        },
      });
      toast({ title: t("admin:quality.toast.resolved"), tone: "positive" });
      onResolved?.(result.data);
      onClose();
    } catch (error) {
      if (
        isRepositoryError(error) &&
        error.code === "VALIDATION_ERROR" &&
        error.fieldErrors?.["note"]
      ) {
        setError("note", { type: "server", message: "noteLength" });
        setFocus("note");
        return;
      }
      if (isRepositoryError(error) && error.code === "CONFLICT") {
        onConflict?.(error, values.note);
        onClose();
        return;
      }
      if (isRetryableWriteError(error)) setFailure("retry");
      else if (isRepositoryError(error) && error.code === "FORBIDDEN") setFailure("forbidden");
      else setFailure("other");
    }
  });

  const describedBy = [`${id}-hint`, noteError === undefined ? null : `${id}-error`]
    .filter((v): v is string => v !== null)
    .join(" ");

  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={t("admin:quality.dialog.resolveTitle")}
      description={t("admin:quality.dialog.resolveDescription", {
        type: t(`admin:quality.type.${issue.type}` as TranslationKey),
        ref: issue.subjectRef,
        facility: facilityLabel(issue.facilityId, t),
      })}
      confirmLabel={
        failure === "retry"
          ? t("admin:quality.dialog.retry")
          : t("admin:quality.dialog.resolveSubmit")
      }
      loading={mutation.isPending}
      onConfirm={() => submit()}
    >
      <form
        noValidate
        data-testid="triage-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (!mutation.isPending) void submit();
        }}
        className="flex flex-col gap-4"
      >
        <p className="border-info/30 bg-info-soft text-ink m-0 rounded-sm border px-3 py-2 text-[13px]">
          {t("admin:quality.correctAtSource")}
        </p>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-note`} className="text-ink text-[13px] font-medium">
            {t("admin:quality.dialog.note")}
            <span className="text-danger ms-1">
              <span aria-hidden="true">*</span>
              <span className="sr-only">{t("common:ui.required")}</span>
            </span>
          </label>
          <textarea
            id={`${id}-note`}
            rows={4}
            aria-required="true"
            aria-describedby={describedBy}
            {...(noteError === undefined ? {} : { "aria-invalid": true })}
            {...register("note")}
            readOnly={mutation.isPending}
            className={cx(CONTROL_CLASS, "border-border")}
          />
          <p id={`${id}-hint`} className="text-muted m-0 text-xs">
            {t("admin:quality.dialog.noteHint", {
              min: QUALITY_TRIAGE_NOTE_MIN,
              max: QUALITY_TRIAGE_NOTE_MAX,
            })}
          </p>
          {noteError === undefined ? null : (
            <p
              id={`${id}-error`}
              data-testid="triage-note-error"
              className="text-danger m-0 flex items-center gap-1 text-xs font-medium"
            >
              <Icon name="alert" size={14} />
              {noteError}
            </p>
          )}
        </div>
        {failure === null ? null : (
          <div
            role="alert"
            data-testid="triage-error"
            className="border-danger/30 bg-danger-soft text-ink rounded-sm border px-3 py-2 text-[13px]"
          >
            <p className="m-0 font-semibold">
              {failure === "retry"
                ? t("admin:quality.dialog.notSaved")
                : failure === "forbidden"
                  ? t("admin:quality.denied")
                  : t("admin:quality.dialog.failed")}
            </p>
            {failure === "retry" ? (
              <p className="text-muted m-0 mt-1 text-xs">
                {t("admin:quality.dialog.notSavedHint")}
              </p>
            ) : null}
          </div>
        )}
        <button type="submit" hidden tabIndex={-1} aria-hidden="true" />
      </form>
    </ConfirmDialog>
  );
}
