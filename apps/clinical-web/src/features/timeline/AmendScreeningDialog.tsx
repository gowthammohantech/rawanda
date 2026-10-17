/**
 * Amend a submitted screening (CLN-04 task 6, FRD §4 "never overwrite", T-03 / T-06).
 * react-hook-form + Zod (`createAmendFormSchema` → FND-03 amendment shape) inside the FND-09
 * `ConfirmDialog`. Field select · current value · new value (typed per field) · mandatory reason.
 *
 * - Submit goes through `useAmendScreening` (`useIdempotentMutation`): one idempotency key per
 *   dialog session, re-entry blocked while pending (a double click = one amendment, one
 *   `screening.amended`), `expectedVersion` = the version the user is looking at.
 * - `CONFLICT` (stale version or the simulated "Conflict on next write") → inline panel "This
 *   screening changed since you opened it" with the latest values and a reload button; nothing
 *   is overwritten, the next save uses the reloaded version.
 * - Server error / timeout / offline → the dialog stays open with the values kept and a retry
 *   button that re-sends with the SAME idempotency key.
 * - Server-side validation (`VALIDATION_ERROR`, e.g. plausibility limits) → field errors.
 * - Open review → info callout "Review uses the evidence snapshot taken at flag time …".
 */
import { zodResolver } from "@hookform/resolvers/zod";
import type { ParsedValidationMessage, WriteResult } from "@laif/contracts";
import {
  AMENDABLE_SCREENING_FIELDS,
  effectiveReadings,
  GLUCOSE_CONTEXTS,
  GLUCOSE_UNITS,
  type AmendableScreeningField,
  type Screening,
} from "@laif/domain";
import { domainKey, useLanguage } from "@laif/i18n";
import {
  Button,
  ConfirmDialog,
  DateTimeInput,
  Icon,
  InfoCallout,
  KeyValueList,
  NumberInput,
  Select,
  Textarea,
  useToast,
  useTx,
} from "@laif/ui-web";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";

import { clinicalErrorKeys } from "../../data/errors.ts";
import { clinicalKeys } from "../../data/queryKeys.ts";
import { useSession } from "../../session/useSession.ts";
import {
  createAmendFormSchema,
  isNumericField,
  type AmendFormOutput,
  type AmendFormValues,
} from "./amendForm.ts";
import { useAmendScreening, type AmendScreeningVariables } from "./hooks.ts";
import { ReadingDisplay } from "./ReadingDisplay.tsx";
import { formatAmendableValue } from "./values.ts";

export type AmendScreeningDialogProps = {
  screening: Screening;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Demo "now" (UTC ISO) — `measuredAt` may not be later. */
  nowIso: string;
  /** The screening's review is still open (pending / in review). */
  hasOpenReview?: boolean;
  /** Called with the saved screening and the id of the new amendment. */
  onSaved?: (screening: Screening, amendmentId: string | null) => void;
};

const REASON_MAX = 500;

function LatestValues({ screening }: { screening: Screening }) {
  const t = useTx();
  const readings = effectiveReadings(screening);
  return (
    <KeyValueList
      items={[
        {
          id: "bp",
          label: t("clinical:timeline.screening.bp"),
          value: (
            <ReadingDisplay
              kind="bloodPressure"
              systolic={readings.systolic}
              diastolic={readings.diastolic}
            />
          ),
        },
        {
          id: "glucose",
          label: t("clinical:timeline.screening.glucose"),
          value: (
            <ReadingDisplay
              kind="glucose"
              value={readings.glucoseValue}
              unit={readings.glucoseUnit}
              context={readings.glucoseContext}
            />
          ),
        },
      ]}
    />
  );
}

export function AmendScreeningDialog({
  screening: fromProps,
  open,
  onOpenChange,
  nowIso,
  hasOpenReview = false,
  onSaved,
}: AmendScreeningDialogProps) {
  const t = useTx();
  const { language } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { activeFacilityId } = useSession();
  // The copy loaded after a conflict ("reload latest") until the list catches up.
  const [reloaded, setReloaded] = useState<Screening | null>(null);
  const screening =
    reloaded !== null && reloaded.version >= fromProps.version ? reloaded : fromProps;
  const readings = useMemo(() => effectiveReadings(screening), [screening]);

  const schema = useMemo(() => createAmendFormSchema({ nowIso, readings }), [nowIso, readings]);
  const form = useForm<AmendFormValues, unknown, AmendFormOutput>({
    resolver: zodResolver(schema),
    defaultValues: { field: "systolic", value: "", reason: "" },
  });
  const { register, handleSubmit, control, formState, reset, setValue, clearErrors } = form;
  const field = useWatch({ control, name: "field" });
  const reason = useWatch({ control, name: "reason" });

  const mutation = useAmendScreening();
  const error = mutation.error;
  const conflict = error?.code === "CONFLICT" ? error : null;
  const latest = (conflict?.latest ?? null) as Screening | null;
  const serverField = (name: string): ParsedValidationMessage | undefined =>
    error?.code === "VALIDATION_ERROR" ? error.fieldErrors?.[name] : undefined;

  const close = () => {
    mutation.reset();
    reset();
    setReloaded(null);
    onOpenChange(false);
  };

  const finish = (result: WriteResult<Screening> | undefined) => {
    if (result === undefined) return; // failed (panel shown) or a blocked double submit
    const saved = result.data;
    const amendment = saved.amendments[saved.amendments.length - 1] ?? null;
    toast({
      tone: "positive",
      title: t("clinical:timeline.amend.success"),
      description: t("clinical:timeline.amend.successBody"),
    });
    onSaved?.(saved, amendment?.id ?? null);
    close();
  };

  const onValid = async (output: AmendFormOutput) => {
    const variables: AmendScreeningVariables = {
      screeningId: screening.id,
      expectedVersion: screening.version,
      field: output.field,
      after: output.after,
      reason: output.reason,
    } as AmendScreeningVariables;
    finish(await mutation.submit(variables));
  };

  const reload = async () => {
    if (latest !== null) setReloaded(latest);
    mutation.reset();
    await queryClient.invalidateQueries({
      queryKey: clinicalKeys.screenings(activeFacilityId ?? "none", screening.patientId),
    });
  };

  const fieldOptions = AMENDABLE_SCREENING_FIELDS.map((value) => ({
    value,
    label: t(domainKey("amendableField", value)),
  }));
  const valueError = formState.errors.value ?? serverField("after");
  const reasonError = formState.errors.reason ?? serverField("reason");
  const valueLabel = t("clinical:timeline.amend.newValue");

  const valueInput = (current: AmendableScreeningField) => {
    if (isNumericField(current)) {
      const unit =
        current === "glucoseValue" ? (readings.glucoseUnit ?? undefined) : ("mmHg" as const);
      return (
        <NumberInput
          key={current}
          label={valueLabel}
          required
          error={valueError}
          {...(unit === undefined ? {} : { unit })}
          {...register("value")}
        />
      );
    }
    if (current === "glucoseUnit" || current === "glucoseContext") {
      const options =
        current === "glucoseUnit"
          ? GLUCOSE_UNITS.map((unit) => ({ value: unit, label: unit }))
          : GLUCOSE_CONTEXTS.map((value) => ({
              value,
              label: t(domainKey("glucoseContext", value)),
            }));
      return (
        <Select
          key={current}
          label={valueLabel}
          required
          error={valueError}
          placeholder={t("clinical:timeline.amend.choose")}
          options={options}
          {...register("value")}
        />
      );
    }
    return (
      <Controller
        key={current}
        control={control}
        name="value"
        render={({ field: input }) => (
          <DateTimeInput
            label={valueLabel}
            required
            error={valueError}
            max={nowIso}
            value={input.value === "" ? null : input.value}
            onChange={(iso) => input.onChange(iso ?? "")}
            onBlur={input.onBlur}
            name={input.name}
            ref={input.ref}
          />
        )}
      />
    );
  };

  const failed = error !== null && conflict === null && error.code !== "VALIDATION_ERROR";

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
        else onOpenChange(true);
      }}
      title={t("clinical:timeline.amend.title")}
      description={t("clinical:timeline.amend.description")}
      confirmLabel={t("clinical:timeline.amend.submit")}
      loading={mutation.isSubmitting}
      confirmDisabled={conflict !== null}
      onConfirm={() => handleSubmit(onValid)()}
    >
      <form
        noValidate
        data-testid="amend-form"
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void handleSubmit(onValid)();
        }}
      >
        {hasOpenReview ? (
          <InfoCallout>{t("clinical:timeline.amend.openReview")}</InfoCallout>
        ) : null}

        {conflict !== null ? (
          <section
            role="alert"
            data-testid="amend-conflict"
            className="border-sync-conflict/30 bg-sync-conflict-soft/40 space-y-3 rounded-md border p-3"
          >
            <div className="flex items-start gap-2">
              <Icon name="alert" size={18} className="text-sync-conflict mt-0.5 shrink-0" />
              <div>
                <p className="text-ink m-0 font-semibold">
                  {t("clinical:timeline.amend.conflict.title")}
                </p>
                <p className="text-muted m-0 text-[13px]">
                  {t("clinical:timeline.amend.conflict.body")}
                </p>
              </div>
            </div>
            {latest === null ? null : (
              <div>
                <p className="micro-label text-muted m-0 mb-1">
                  {t("clinical:timeline.amend.conflict.latest")}
                </p>
                <LatestValues screening={latest} />
              </div>
            )}
            <Button variant="secondary" size="sm" icon="refresh" onClick={() => void reload()}>
              {t("clinical:timeline.amend.conflict.reload")}
            </Button>
          </section>
        ) : null}

        {failed ? (
          <section
            role="alert"
            data-testid="amend-failed"
            className="border-risk-danger/25 bg-risk-danger-soft space-y-2 rounded-md border p-3 text-[13px]"
          >
            <p className="text-risk-danger m-0 font-semibold">
              {t(clinicalErrorKeys(error.code).title)}
            </p>
            <p className="text-ink m-0">{t("clinical:timeline.amend.failed")}</p>
            {mutation.canRetry ? (
              <Button
                variant="secondary"
                size="sm"
                icon="refresh"
                loading={mutation.isSubmitting}
                onClick={() => void mutation.retry().then(finish)}
              >
                {t("clinical:timeline.amend.retry")}
              </Button>
            ) : null}
          </section>
        ) : null}

        <Select
          label={t("clinical:timeline.amend.field")}
          required
          options={fieldOptions}
          {...register("field", {
            onChange: () => {
              setValue("value", "");
              clearErrors("value");
            },
          })}
        />
        <p className="text-muted m-0 text-[13px]" data-testid="amend-current-value">
          <span className="font-medium">{t("clinical:timeline.amend.currentValue")}: </span>
          <span className="text-ink">
            {formatAmendableValue(field, readings[field], {
              glucoseUnit: readings.glucoseUnit,
              t,
              language,
            })}
          </span>
        </p>
        {valueInput(field)}
        <Textarea
          label={t("clinical:timeline.amend.reason")}
          hint={t("clinical:timeline.amend.reasonHint")}
          required
          maxLength={REASON_MAX}
          value={reason}
          error={reasonError}
          {...register("reason")}
        />
        {/* Enter in a text input submits the form (the dialog's Confirm button is outside it). */}
        <button type="submit" hidden tabIndex={-1} aria-hidden="true" />
      </form>
    </ConfirmDialog>
  );
}
