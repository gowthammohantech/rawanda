/**
 * Cancel a referral with a reason (CLN-08, PRD §10 "canceled referral"): reason code
 * (`REFERRAL_CANCEL_REASON_CODES`, demo placeholders) + rationale (≥ 10 non-space characters,
 * FND-03 `Reason`). Irreversible (destructive `ConfirmDialog`); the repository audits
 * `referral.transitioned` with the reason as justification. Same idempotency / conflict / retry
 * behaviour as the other referral dialogs.
 */
import { zodResolver } from "@hookform/resolvers/zod";
import type { WriteResult } from "@laif/contracts";
import {
  REFERRAL_CANCEL_REASON_CODES,
  MIN_REASON_NON_WHITESPACE_CHARS,
  type Referral,
} from "@laif/domain";
import { domainKey } from "@laif/i18n";
import { ConfirmDialog, Select, Textarea, useToast, useTx } from "@laif/ui-web";
import { useMemo } from "react";
import { useForm, useWatch } from "react-hook-form";

import { DialogFeedback } from "./DialogFeedback.tsx";
import { serverFieldError, useReloadableReferral } from "./dialogShared.ts";
import {
  createTransitionFormSchema,
  emptyTransitionValues,
  type TransitionFormValues,
  type TransitionVariables,
} from "./forms.ts";
import { useTransitionReferral } from "./hooks.ts";

type Values = TransitionFormValues<"cancelled_with_reason">;

export type CancelReferralDialogProps = {
  referral: Referral;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nowIso: string;
  onSaved?: (referral: Referral) => void;
};

export function CancelReferralDialog({
  referral: fromProps,
  open,
  onOpenChange,
  nowIso,
  onSaved,
}: CancelReferralDialogProps) {
  const t = useTx();
  const { toast } = useToast();
  const { current: referral, setReloaded, clear } = useReloadableReferral(fromProps);
  const schema = useMemo(
    () => createTransitionFormSchema("cancelled_with_reason", { referral, nowIso }),
    [referral, nowIso],
  );
  const form = useForm<Values, unknown, TransitionVariables>({
    resolver: zodResolver(schema),
    defaultValues: emptyTransitionValues("cancelled_with_reason"),
  });
  const { register, handleSubmit, control, formState, reset } = form;
  const reason = useWatch({ control, name: "reason" });
  const mutation = useTransitionReferral();
  const error = mutation.error;

  const close = () => {
    mutation.reset();
    reset(emptyTransitionValues("cancelled_with_reason"));
    clear();
    onOpenChange(false);
  };
  const finish = (result: WriteResult<Referral> | undefined) => {
    if (result === undefined) return;
    toast({ tone: "positive", title: t("clinical:referrals.toast.cancelled") });
    onSaved?.(result.data);
    close();
  };
  const onValid = async (variables: TransitionVariables) =>
    finish(await mutation.submit(variables));
  const fieldError = (name: keyof Values) =>
    formState.errors[name] ?? serverFieldError(error, name);

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => (next ? onOpenChange(true) : close())}
      variant="destructive"
      title={t("clinical:referrals.cancel.title")}
      description={t("clinical:referrals.cancel.description")}
      confirmLabel={t("clinical:referrals.cancel.confirm")}
      loading={mutation.isSubmitting}
      confirmDisabled={error?.code === "CONFLICT"}
      onConfirm={() => handleSubmit(onValid)()}
    >
      <form
        noValidate
        data-testid="cancel-form"
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void handleSubmit(onValid)();
        }}
      >
        <Select
          id="referral-cancel-reasonCode"
          label={t("clinical:referrals.cancel.reasonCode")}
          required
          placeholder={t("clinical:referrals.dialog.choose")}
          options={REFERRAL_CANCEL_REASON_CODES.map((value) => ({
            value,
            label: t(domainKey("referralCancelReason", value)),
          }))}
          error={fieldError("cancelReasonCode")}
          {...register("cancelReasonCode")}
        />
        <Textarea
          id="referral-cancel-reason"
          label={t("clinical:referrals.cancel.rationale")}
          hint={t("clinical:referrals.dialog.reasonHint", { min: MIN_REASON_NON_WHITESPACE_CHARS })}
          required
          rows={3}
          maxLength={500}
          value={reason}
          error={fieldError("reason")}
          {...register("reason")}
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
          }}
          onCancel={close}
        />
        <button type="submit" hidden tabIndex={-1} aria-hidden="true" />
      </form>
    </ConfirmDialog>
  );
}
