/**
 * Building blocks of the per-outcome field groups (CLN-07): a reason/note textarea with a live
 * counter, the explicit due date (Kigali wall time → UTC, `min` = demo now, never pre-filled — no
 * protocol interval is inferred) and the authorised-worker select (CL-07: `listWorkers` of the
 * active facility only).
 */
import { REASON_MAX_LENGTH } from "@laif/contracts";
import { MIN_REASON_NON_WHITESPACE_CHARS, type DemoPersona } from "@laif/domain";
import { DateTimeInput, LoadingSkeleton, Select, Textarea, useTx } from "@laif/ui-web";
import type { ReactNode } from "react";
import { Controller, useWatch, type UseFormReturn } from "react-hook-form";

import {
  fieldDomId,
  type DecisionFieldName,
  type DecisionFormOutput,
  type DecisionFormValues,
} from "../form.ts";

export type DecisionForm = UseFormReturn<DecisionFormValues, unknown, DecisionFormOutput>;

export type DecisionFieldsProps = {
  form: DecisionForm;
  /** Demo "now" (UTC ISO). */
  nowIso: string;
  disabled?: boolean;
};

export type WorkerOptionsState = {
  workers: readonly Pick<DemoPersona, "id" | "displayName">[] | undefined;
  loading: boolean;
};

export function ReasonField({
  form,
  name,
  label,
  maxLength = REASON_MAX_LENGTH,
  minHint = true,
  disabled,
}: {
  form: DecisionForm;
  name: DecisionFieldName;
  label: ReactNode;
  maxLength?: number;
  minHint?: boolean;
  disabled?: boolean | undefined;
}) {
  const t = useTx();
  const value = useWatch({ control: form.control, name });
  return (
    <Textarea
      id={fieldDomId(name)}
      label={label}
      required
      rows={3}
      maxLength={maxLength}
      value={value}
      disabled={disabled}
      {...(minHint
        ? {
            hint: t("clinical:decision.fields.reasonHint", {
              min: MIN_REASON_NON_WHITESPACE_CHARS,
            }),
          }
        : {})}
      error={form.formState.errors[name]}
      {...form.register(name)}
    />
  );
}

export function DueAtField({ form, nowIso, disabled }: DecisionFieldsProps) {
  const t = useTx();
  return (
    <Controller
      control={form.control}
      name="dueAt"
      render={({ field, fieldState }) => (
        <DateTimeInput
          id={fieldDomId("dueAt")}
          label={t("clinical:decision.fields.dueAt")}
          hint={t("clinical:decision.fields.dueAtHint")}
          required
          min={nowIso}
          disabled={disabled}
          error={fieldState.error}
          value={field.value === "" ? null : field.value}
          onChange={(iso) => field.onChange(iso ?? "")}
          onBlur={field.onBlur}
          name={field.name}
          ref={field.ref}
        />
      )}
    />
  );
}

export function WorkerField({
  form,
  workers,
  required,
  disabled,
}: {
  form: DecisionForm;
  workers: WorkerOptionsState;
  required: boolean;
  disabled?: boolean | undefined;
}) {
  const t = useTx();
  if (workers.loading) {
    return (
      <div
        data-testid="workers-loading"
        role="group"
        aria-busy="true"
        aria-label={t("clinical:decision.fields.workersLoading")}
      >
        <LoadingSkeleton variant="lines" lines={2} />
      </div>
    );
  }
  const list = workers.workers ?? [];
  return (
    <Select
      id={fieldDomId("assignedWorkerId")}
      label={
        required
          ? t("clinical:decision.fields.assignedWorker")
          : t("clinical:decision.fields.assignedWorkerOptional")
      }
      hint={
        list.length === 0
          ? t("clinical:decision.fields.workersEmpty")
          : t("clinical:decision.fields.workersHint")
      }
      required={required}
      disabled={disabled}
      placeholder={
        required
          ? t("clinical:decision.fields.workerPlaceholder")
          : t("clinical:decision.fields.workerNone")
      }
      options={list.map((worker) => ({ value: worker.id, label: worker.displayName }))}
      error={form.formState.errors.assignedWorkerId}
      {...form.register("assignedWorkerId")}
    />
  );
}
