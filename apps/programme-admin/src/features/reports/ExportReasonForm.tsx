/**
 * Reason step of the report builder (ADM-07 task 6, FRD Scenario 2 "export with reason"):
 * react-hook-form + the `@laif/contracts` `ExportReasonSchema` — a reason code (required), free
 * text (required for `other`, 10–300 characters) and the aggregate-only acknowledgement (must be
 * ticked). Errors are shown inline in admin copy (EN / RW); focus moves to the first error.
 */
import { zodResolver } from "@hookform/resolvers/zod";
import {
  EXPORT_REASON_CODES,
  EXPORT_REASON_TEXT_MAX,
  EXPORT_REASON_TEXT_MIN,
  ExportReasonSchema,
  type ExportReason,
  type ExportReasonCode,
} from "@laif/contracts";
import { Button, CONTROL_CLASS, cx, Icon, useTx, type TranslationKey } from "@laif/ui-web";
import { useEffect, useId } from "react";
import { useForm, useWatch, type FieldErrors } from "react-hook-form";

export type ExportReasonValues = {
  reasonCode: ExportReasonCode | "";
  reasonText: string;
  acknowledgeAggregateOnly: boolean;
};

export const EMPTY_REASON: ExportReasonValues = {
  reasonCode: "",
  reasonText: "",
  acknowledgeAggregateOnly: false,
};

export type ExportReasonFormProps = {
  defaultValues: ExportReasonValues;
  onBack: () => void;
  onSubmit: (reason: ExportReason, values: ExportReasonValues) => void;
  /** ADM-09: every change (the builder keeps a sessionStorage draft for an expired session). */
  onChange?: (values: ExportReasonValues) => void;
};

function ErrorText({ id, children }: { id: string; children: string }) {
  return (
    <p
      id={id}
      data-testid={id}
      className="text-danger m-0 flex items-center gap-1 text-xs font-medium"
    >
      <Icon name="alert" size={14} />
      {children}
    </p>
  );
}

export function ExportReasonForm({
  defaultValues,
  onBack,
  onSubmit,
  onChange,
}: ExportReasonFormProps) {
  const t = useTx();
  const id = useId();
  const form = useForm<ExportReasonValues, unknown, ExportReason>({
    resolver: zodResolver(ExportReasonSchema) as never,
    defaultValues,
    shouldFocusError: true,
  });
  const { register, handleSubmit, formState, control, subscribe } = form;
  useEffect(() => {
    if (onChange === undefined) return;
    return subscribe({
      formState: { values: true },
      callback: ({ values }) => onChange({ ...EMPTY_REASON, ...values }),
    });
  }, [subscribe, onChange]);
  const errors: FieldErrors<ExportReasonValues> = formState.errors;
  const code = useWatch({ control, name: "reasonCode" });
  const text = useWatch({ control, name: "reasonText" });
  const ids = {
    code: `${id}-code-error`,
    text: `${id}-text-error`,
    ack: `${id}-ack-error`,
  };

  return (
    <form
      noValidate
      data-testid="export-reason-form"
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        void handleSubmit((reason) => {
          onSubmit(reason, form.getValues());
        })(event);
      }}
    >
      <fieldset
        className="m-0 flex flex-col gap-2 border-0 p-0"
        aria-describedby={errors.reasonCode ? ids.code : undefined}
      >
        <legend className="text-ink mb-1 text-[13px] font-medium">
          {t("admin:reports.reason.label")}
          <span className="text-danger ms-1" aria-hidden="true">
            *
          </span>
        </legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {EXPORT_REASON_CODES.map((value) => (
            <label
              key={value}
              className={cx(
                "border-border bg-surface flex min-h-11 cursor-pointer items-center gap-3 rounded-sm border px-3 py-2 text-sm",
                code === value && "border-primary bg-primary-soft",
              )}
            >
              <input type="radio" value={value} {...register("reasonCode")} />
              <span className="text-ink">
                {t(`admin:reports.reason.code.${value}` as TranslationKey)}
              </span>
            </label>
          ))}
        </div>
        {errors.reasonCode ? (
          <ErrorText id={ids.code}>{t("admin:reports.validation.reasonCode")}</ErrorText>
        ) : null}
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <label htmlFor={`${id}-text`} className="text-ink text-[13px] font-medium">
            {t("admin:reports.reason.textLabel")}
            {code === "other" ? (
              <span className="text-danger ms-1" aria-hidden="true">
                *
              </span>
            ) : null}
          </label>
          <span className="text-muted text-xs tabular-nums" aria-live="polite">
            {t("common:ui.charCount", { count: text.length, max: EXPORT_REASON_TEXT_MAX })}
          </span>
        </div>
        <textarea
          id={`${id}-text`}
          rows={3}
          maxLength={EXPORT_REASON_TEXT_MAX}
          className={cx(CONTROL_CLASS, "border-border resize-y")}
          aria-invalid={errors.reasonText ? true : undefined}
          aria-required={code === "other" ? true : undefined}
          aria-describedby={[`${id}-text-hint`, errors.reasonText ? ids.text : null]
            .filter((v): v is string => v !== null)
            .join(" ")}
          {...register("reasonText")}
        />
        <p id={`${id}-text-hint`} className="text-muted m-0 text-xs">
          {t("admin:reports.reason.textHint", {
            min: EXPORT_REASON_TEXT_MIN,
            max: EXPORT_REASON_TEXT_MAX,
          })}
        </p>
        {errors.reasonText ? (
          <ErrorText id={ids.text}>
            {t("admin:reports.validation.reasonText", {
              min: EXPORT_REASON_TEXT_MIN,
              max: EXPORT_REASON_TEXT_MAX,
            })}
          </ErrorText>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            aria-invalid={errors.acknowledgeAggregateOnly ? true : undefined}
            aria-describedby={errors.acknowledgeAggregateOnly ? ids.ack : undefined}
            {...register("acknowledgeAggregateOnly")}
          />
          <span className="text-ink">{t("admin:reports.ack")}</span>
        </label>
        {errors.acknowledgeAggregateOnly ? (
          <ErrorText id={ids.ack}>{t("admin:reports.validation.ack")}</ErrorText>
        ) : null}
      </div>

      <div className="flex flex-wrap justify-between gap-2">
        <Button variant="secondary" icon="chevron-left" onClick={onBack}>
          {t("admin:reports.stepper.back")}
        </Button>
        <Button type="submit" icon="chevron" iconPosition="end">
          {t("admin:reports.stepper.next")}
        </Button>
      </div>
    </form>
  );
}
