/**
 * Assign a programme follow-up (ADM-03 task 7): react-hook-form + the `@laif/contracts`
 * `createProgrammeActionInputSchema` rules (category required, title 5–120, note ≤ 500, due date
 * demo today … +180 days). Field errors show admin copy (EN / RW) and focus moves to the first
 * invalid field.
 *
 * - Banner `PROGRAMME ACTION — NOT A CLINICAL DECISION`; the facility comes from the row and
 *   `sourceContext` captures the page, stage and filters (aggregate context only).
 * - The idempotency key is created when the dialog opens (`crypto.randomUUID()`) and reused by
 *   every retry, so a double click or a timeout + retry gives exactly one record.
 * - Submit is disabled while pending. A failed save keeps the dialog open with the input
 *   ("Not saved — retry"). Success: toast, close, `adminKeys.programmeActions` invalidated.
 */
import { zodResolver } from "@hookform/resolvers/zod";
import {
  createProgrammeActionInputSchema,
  PROGRAMME_ACTION_CATEGORIES,
  PROGRAMME_ACTION_NOTE_MAX,
  PROGRAMME_ACTION_TITLE_MAX,
  PROGRAMME_ACTION_TITLE_MIN,
  programmeActionDueWindow,
  type ProgrammeAction,
  type ProgrammeActionSourceContext,
} from "@laif/contracts";
import { formatDate, useLanguage } from "@laif/i18n";
import { isRepositoryError } from "@laif/repositories";
import {
  ConfirmDialog,
  CONTROL_CLASS,
  cx,
  Icon,
  useToast,
  useTx,
  type TranslationKey,
} from "@laif/ui-web";
import { useId, useMemo, useState, type ReactNode } from "react";
import { useForm, type FieldErrors } from "react-hook-form";
import { z } from "zod";

import { facilityLabel } from "../../app/persona-labels.ts";
import { useServices } from "../../app/providers.tsx";
import { isRetryableWriteError, useCreateProgrammeAction } from "./mutations.ts";

type FormValues = { category: string; title: string; note: string; dueDate: string };
type FieldName = keyof FormValues;
const FIELDS: readonly FieldName[] = ["category", "title", "note", "dueDate"];

export type ProgrammeActionDialogProps = {
  facilityId: string;
  sourceContext: ProgrammeActionSourceContext;
  onClose: () => void;
  onAssigned?: (action: ProgrammeAction) => void;
  /** Test seam (default `crypto.randomUUID`). */
  createKey?: () => string;
};

const addDays = (day: string, n: number): string =>
  new Date(Date.parse(`${day}T00:00:00.000Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** The form checked field by field with the contract's rules (its `validation:*` messages). */
function formSchema(now: () => Date) {
  const contract = createProgrammeActionInputSchema({ now }).shape;
  return z
    .object({ category: z.string(), title: z.string(), note: z.string(), dueDate: z.string() })
    .superRefine((values, ctx) => {
      for (const field of FIELDS) {
        const value = field === "category" && values.category === "" ? undefined : values[field];
        const parsed = contract[field].safeParse(value);
        if (parsed.success) continue;
        ctx.addIssue({
          code: "custom",
          path: [field],
          message: parsed.error.issues[0]?.message ?? "",
        });
      }
    });
}

const MESSAGE_KEYS: Record<FieldName, TranslationKey> = {
  category: "admin:actions.validation.categoryRequired",
  title: "admin:actions.validation.titleLength",
  note: "admin:actions.validation.noteLength",
  dueDate: "admin:actions.validation.dueDateRange",
};

function Row({
  id,
  label,
  hint,
  error,
  required = false,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string | undefined;
  required?: boolean;
  children: (control: {
    id: string;
    "aria-invalid"?: true;
    "aria-describedby"?: string;
    "aria-required"?: true;
  }) => ReactNode;
}) {
  const t = useTx();
  const describedBy = [
    hint === undefined ? null : `${id}-hint`,
    error === undefined ? null : `${id}-error`,
  ]
    .filter((v): v is string => v !== null)
    .join(" ");
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-ink text-[13px] font-medium">
        {label}
        {required ? (
          <span className="text-danger ms-1">
            <span aria-hidden="true">*</span>
            <span className="sr-only">{t("common:ui.required")}</span>
          </span>
        ) : null}
      </label>
      {children({
        id,
        ...(error === undefined ? {} : { "aria-invalid": true as const }),
        ...(describedBy === "" ? {} : { "aria-describedby": describedBy }),
        ...(required ? { "aria-required": true as const } : {}),
      })}
      {hint === undefined ? null : (
        <p id={`${id}-hint`} className="text-muted m-0 text-xs">
          {hint}
        </p>
      )}
      {error === undefined ? null : (
        <p
          id={`${id}-error`}
          className="text-danger m-0 flex items-center gap-1 text-xs font-medium"
        >
          <Icon name="alert" size={14} />
          {error}
        </p>
      )}
    </div>
  );
}

export function ProgrammeActionDialog({
  facilityId,
  sourceContext,
  onClose,
  onAssigned,
  createKey,
}: ProgrammeActionDialogProps) {
  const t = useTx();
  const { language } = useLanguage();
  const { toast } = useToast();
  const { clock } = useServices();
  const baseId = useId();
  // One key per dialog opening, reused by every retry.
  const [key] = useState(() => (createKey ?? (() => crypto.randomUUID()))());
  const [failure, setFailure] = useState<"retry" | "forbidden" | "other" | null>(null);
  const mutation = useCreateProgrammeAction();
  const dueWindow = programmeActionDueWindow(clock.now());
  const schema = useMemo(() => formSchema(() => clock.now()), [clock]);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { category: "", title: "", note: "", dueDate: addDays(dueWindow.from, 14) },
    shouldFocusError: true,
  });
  const { register, handleSubmit, formState, setError, setFocus } = form;
  const errors: FieldErrors<FormValues> = formState.errors;
  const dateText = (day: string) => formatDate(`${day}T12:00:00.000Z`, language);
  const errorText = (field: FieldName): string | undefined =>
    errors[field] === undefined
      ? undefined
      : t(MESSAGE_KEYS[field], {
          min: PROGRAMME_ACTION_TITLE_MIN,
          max: field === "note" ? PROGRAMME_ACTION_NOTE_MAX : PROGRAMME_ACTION_TITLE_MAX,
          from: dateText(dueWindow.from),
          to: dateText(dueWindow.to),
        });

  const submit = handleSubmit(async (values) => {
    setFailure(null);
    try {
      const result = await mutation.mutateAsync({
        key,
        input: {
          facilityId,
          category: values.category as ProgrammeAction["category"],
          title: values.title,
          note: values.note,
          dueDate: values.dueDate,
          sourceContext,
        },
      });
      toast({ title: t("admin:actions.toast.assigned"), tone: "positive" });
      onAssigned?.(result.data);
      onClose();
    } catch (error) {
      if (isRepositoryError(error) && error.code === "VALIDATION_ERROR" && error.fieldErrors) {
        const fields = FIELDS.filter((f) => error.fieldErrors?.[f] !== undefined);
        for (const field of fields) setError(field, { type: "server", message: field });
        if (fields[0] !== undefined) setFocus(fields[0]);
        if (fields.length > 0) return;
      }
      if (isRetryableWriteError(error)) setFailure("retry");
      else if (isRepositoryError(error) && error.code === "FORBIDDEN") setFailure("forbidden");
      else setFailure("other");
    }
  });

  const categoryOptions = PROGRAMME_ACTION_CATEGORIES.map((c) => ({
    value: c,
    label: t(`admin:actions.category.${c}` as TranslationKey),
  }));

  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={t("admin:actions.dialog.title")}
      description={t("admin:actions.dialog.description", {
        facility: facilityLabel(facilityId, t),
      })}
      confirmLabel={
        failure === "retry" ? t("admin:actions.dialog.retry") : t("admin:actions.dialog.submit")
      }
      loading={mutation.isPending}
      onConfirm={() => submit()}
    >
      <form
        noValidate
        data-testid="programme-action-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (!mutation.isPending) void submit();
        }}
        className="flex flex-col gap-4"
      >
        <p
          data-testid="programme-action-banner"
          className="border-info/30 bg-info-soft text-ink m-0 rounded-sm border px-3 py-2 font-mono text-[11px] font-semibold tracking-wide uppercase"
        >
          {t("admin:actions.banner")}
        </p>
        <div className="text-[13px]">
          <span className="text-muted">{t("admin:actions.field.facility")}: </span>
          <span className="text-ink font-medium">{facilityLabel(facilityId, t)}</span>
        </div>
        <Row
          id={`${baseId}-category`}
          label={t("admin:actions.field.category")}
          error={errorText("category")}
          required
        >
          {(control) => (
            <select
              {...control}
              {...register("category")}
              className={cx(CONTROL_CLASS, "border-border")}
            >
              <option value="">{t("admin:actions.field.categoryPlaceholder")}</option>
              {categoryOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          )}
        </Row>
        <Row
          id={`${baseId}-title`}
          label={t("admin:actions.field.title")}
          hint={t("admin:actions.field.titleHint")}
          error={errorText("title")}
          required
        >
          {(control) => (
            <input
              type="text"
              {...control}
              {...register("title")}
              className={cx(CONTROL_CLASS, "border-border")}
            />
          )}
        </Row>
        <Row
          id={`${baseId}-note`}
          label={t("admin:actions.field.note")}
          hint={t("admin:actions.field.noteHint")}
          error={errorText("note")}
        >
          {(control) => (
            <textarea
              rows={3}
              {...control}
              {...register("note")}
              className={cx(CONTROL_CLASS, "border-border")}
            />
          )}
        </Row>
        <Row
          id={`${baseId}-due`}
          label={t("admin:actions.field.dueDate")}
          hint={t("admin:actions.field.dueDateHint", {
            from: dateText(dueWindow.from),
            to: dateText(dueWindow.to),
          })}
          error={errorText("dueDate")}
          required
        >
          {(control) => (
            <input
              type="date"
              min={dueWindow.from}
              max={dueWindow.to}
              {...control}
              {...register("dueDate")}
              className={cx(CONTROL_CLASS, "border-border")}
            />
          )}
        </Row>
        <p className="text-muted m-0 text-xs">{t("admin:actions.field.owner")}</p>
        {failure === null ? null : (
          <div
            role="alert"
            data-testid="programme-action-error"
            className="border-danger/30 bg-danger-soft text-ink rounded-sm border px-3 py-2 text-[13px]"
          >
            <p className="m-0 font-semibold">
              {failure === "retry"
                ? t("admin:actions.dialog.notSaved")
                : failure === "forbidden"
                  ? t("admin:actions.denied.scope")
                  : t("admin:actions.dialog.failed")}
            </p>
            {failure === "retry" ? (
              <p className="text-muted m-0 mt-1 text-xs">
                {t("admin:actions.dialog.notSavedHint")}
              </p>
            ) : null}
          </div>
        )}
        {/* Enter in a field submits; the visible button is the dialog's confirm button. */}
        <button type="submit" hidden tabIndex={-1} aria-hidden="true" />
      </form>
    </ConfirmDialog>
  );
}
