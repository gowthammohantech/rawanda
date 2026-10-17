/**
 * Complete a referral WITH evidence (CLN-08 task 6, FRD §4): completedAt (≤ demo now), outcome,
 * evidence type (FND-02 `REFERRAL_EVIDENCE_TYPES`, demo placeholders pending approval) and an
 * evidence reference are required; a note is optional. The copy states that a reminder or a
 * message being sent is not evidence of completion.
 *
 * Two steps inside the FND-09 `ConfirmDialog`: the evidence form, then an irreversible
 * confirmation summarising the evidence. Confirm goes through `useTransitionReferral`
 * (`useIdempotentMutation`): one key per dialog session, re-entry blocked while pending (a double
 * click = one `referral.transitioned` event), `expectedVersion` = the copy shown (stale →
 * `ConflictPanel`), server error / timeout → values kept, retry with the same key.
 */
import { zodResolver } from "@hookform/resolvers/zod";
import type { WriteResult } from "@laif/contracts";
import { REFERRAL_EVIDENCE_TYPES, REFERRAL_OUTCOMES, type Referral } from "@laif/domain";
import { domainKey, formatDateTime, useLanguage } from "@laif/i18n";
import {
  ConfirmDialog,
  DateTimeInput,
  InfoCallout,
  KeyValueList,
  Select,
  TextInput,
  Textarea,
  useToast,
  useTx,
} from "@laif/ui-web";
import { useMemo, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";

import { DialogFeedback } from "./DialogFeedback.tsx";
import { serverFieldError, useReloadableReferral } from "./dialogShared.ts";
import {
  createTransitionFormSchema,
  emptyTransitionValues,
  type TransitionFormValues,
  type TransitionVariables,
} from "./forms.ts";
import { useTransitionReferral } from "./hooks.ts";

type Values = TransitionFormValues<"completed">;

export type CompleteReferralDialogProps = {
  referral: Referral;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Demo "now" (UTC ISO). */
  nowIso: string;
  onSaved?: (referral: Referral) => void;
};

export const fieldId = (name: keyof Values) => `referral-complete-${name}`;

export function CompleteReferralDialog({
  referral: fromProps,
  open,
  onOpenChange,
  nowIso,
  onSaved,
}: CompleteReferralDialogProps) {
  const t = useTx();
  const { language } = useLanguage();
  const { toast } = useToast();
  const { current: referral, setReloaded, clear } = useReloadableReferral(fromProps);
  const [pending, setPending] = useState<TransitionVariables | null>(null);

  const schema = useMemo(
    () => createTransitionFormSchema("completed", { referral, nowIso }),
    [referral, nowIso],
  );
  const form = useForm<Values, unknown, TransitionVariables>({
    resolver: zodResolver(schema),
    defaultValues: emptyTransitionValues("completed"),
  });
  const { register, handleSubmit, control, formState, reset } = form;
  const note = useWatch({ control, name: "note" });
  const mutation = useTransitionReferral();
  const error = mutation.error;
  const conflict = error?.code === "CONFLICT";

  const close = () => {
    mutation.reset();
    reset(emptyTransitionValues("completed"));
    setPending(null);
    clear();
    onOpenChange(false);
  };

  const finish = (result: WriteResult<Referral> | undefined) => {
    if (result === undefined) return;
    toast({ tone: "positive", title: t("clinical:referrals.toast.completed") });
    onSaved?.(result.data);
    close();
  };

  const onValid = (variables: TransitionVariables) => {
    mutation.reset();
    setPending(variables);
  };

  const fieldError = (name: keyof Values) =>
    formState.errors[name] ?? serverFieldError(error, name);

  if (pending !== null && pending.to === "completed") {
    return (
      <ConfirmDialog
        open={open}
        onOpenChange={(next) => {
          if (next) return onOpenChange(true);
          // "Back" / Escape returns to the evidence form with the values kept.
          mutation.reset();
          setPending(null);
        }}
        variant="destructive"
        title={t("clinical:referrals.complete.confirmTitle")}
        description={t("clinical:referrals.complete.confirmBody")}
        confirmLabel={t("clinical:referrals.complete.confirm")}
        cancelLabel={t("clinical:referrals.complete.back")}
        loading={mutation.isSubmitting}
        confirmDisabled={conflict}
        onConfirm={() => void mutation.submit(pending).then(finish)}
      >
        <div className="space-y-3" data-testid="complete-confirm">
          <KeyValueList
            items={[
              {
                id: "completedAt",
                label: t("clinical:referrals.complete.completedAt"),
                value: formatDateTime(pending.completedAt, language),
              },
              {
                id: "outcome",
                label: t("clinical:referrals.complete.outcomeLabel"),
                value: t(domainKey("referralOutcome", pending.outcome)),
              },
              {
                id: "evidenceType",
                label: t("clinical:referrals.complete.evidenceTypeLabel"),
                value: t(domainKey("evidence", pending.evidenceType)),
              },
              {
                id: "evidenceReference",
                label: t("clinical:referrals.complete.evidenceReference"),
                value: pending.evidenceReference,
              },
            ]}
          />
          <DialogFeedback
            error={error}
            mine={referral}
            canRetry={mutation.canRetry}
            retrying={mutation.isSubmitting}
            onRetry={() => mutation.retry().then(finish)}
            onReload={(latest) => {
              setReloaded(latest);
              mutation.reset();
              setPending(null);
            }}
            onCancel={close}
          />
        </div>
      </ConfirmDialog>
    );
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => (next ? onOpenChange(true) : close())}
      title={t("clinical:referrals.complete.title")}
      description={t("clinical:referrals.complete.description")}
      confirmLabel={t("clinical:referrals.complete.review")}
      onConfirm={() => handleSubmit(onValid)()}
    >
      <form
        noValidate
        data-testid="complete-form"
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void handleSubmit(onValid)();
        }}
      >
        <InfoCallout icon="alert">
          <p className="m-0" data-testid="not-evidence-notice">
            {t("clinical:referrals.complete.notEvidenceNotice")}
          </p>
        </InfoCallout>
        <Controller
          control={control}
          name="completedAt"
          render={({ field }) => (
            <DateTimeInput
              id={fieldId("completedAt")}
              label={t("clinical:referrals.complete.completedAt")}
              hint={t("clinical:referrals.complete.completedAtHint")}
              required
              max={nowIso}
              error={fieldError("completedAt")}
              value={field.value === "" ? null : field.value}
              onChange={(iso) => field.onChange(iso ?? "")}
              onBlur={field.onBlur}
              name={field.name}
              ref={field.ref}
            />
          )}
        />
        <Select
          id={fieldId("outcome")}
          label={t("clinical:referrals.complete.outcomeLabel")}
          required
          placeholder={t("clinical:referrals.dialog.choose")}
          options={REFERRAL_OUTCOMES.map((value) => ({
            value,
            label: t(domainKey("referralOutcome", value)),
          }))}
          error={fieldError("outcome")}
          {...register("outcome")}
        />
        <Select
          id={fieldId("evidenceType")}
          label={t("clinical:referrals.complete.evidenceTypeLabel")}
          hint={t("clinical:referrals.complete.evidenceTypeHint")}
          required
          placeholder={t("clinical:referrals.dialog.choose")}
          options={REFERRAL_EVIDENCE_TYPES.map((value) => ({
            value,
            label: t(domainKey("evidence", value)),
          }))}
          error={fieldError("evidenceType")}
          {...register("evidenceType")}
        />
        <TextInput
          id={fieldId("evidenceReference")}
          label={t("clinical:referrals.complete.evidenceReference")}
          hint={t("clinical:referrals.complete.evidenceReferenceHint")}
          required
          maxLength={100}
          autoComplete="off"
          error={fieldError("evidenceReference")}
          {...register("evidenceReference")}
        />
        <Textarea
          id={fieldId("note")}
          label={t("clinical:referrals.complete.note")}
          rows={2}
          maxLength={500}
          value={note}
          error={fieldError("note")}
          {...register("note")}
        />
        <DialogFeedback
          error={error}
          mine={referral}
          canRetry={false}
          retrying={false}
          onRetry={() => undefined}
          onReload={(latest) => {
            setReloaded(latest);
            mutation.reset();
          }}
          onCancel={close}
        />
        <button type="submit" hidden tabIndex={-1} aria-hidden="true" />
      </form>
    </ConfirmDialog>
  );
}
