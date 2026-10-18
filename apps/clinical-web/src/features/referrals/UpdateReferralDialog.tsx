/**
 * Update a referral (CLN-08 deliverable): `accept` (optional note), `schedule` (appointment
 * date/time, Kigali wall time → UTC) and `edit` (destination and/or due date, with a mandatory
 * change reason; the previous values are shown and stay in the audit history). Status changes go
 * through `useTransitionReferral`, edits through `useEditReferral` — both `useIdempotentMutation`
 * with `expectedVersion` (stale → `ConflictPanel`, reload latest), same-key retry after a
 * server error / timeout, re-entry blocked while saving.
 */
import { zodResolver } from "@hookform/resolvers/zod";
import type { WriteResult } from "@laif/contracts";
import { MIN_REASON_NON_WHITESPACE_CHARS, type Referral } from "@laif/domain";
import { formatDateTime, useLanguage } from "@laif/i18n";
import { FACILITIES_REFERENCE } from "@laif/mock-data";
import {
  ConfirmDialog,
  DateTimeInput,
  KeyValueList,
  Select,
  Textarea,
  useToast,
  useTx,
} from "@laif/ui-web";
import { useMemo } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";

import { facilityLabel } from "../../app/persona-labels.ts";
import { DialogFeedback } from "./DialogFeedback.tsx";
import { serverFieldError, useReloadableReferral } from "./dialogShared.ts";
import {
  createEditFormSchema,
  createTransitionFormSchema,
  editDefaults,
  emptyTransitionValues,
  type EditFormValues,
  type EditVariables,
  type TransitionFormValues,
  type TransitionVariables,
} from "./forms.ts";
import { useEditReferral, useTransitionReferral } from "./hooks.ts";

export type UpdateMode = "accept" | "schedule" | "edit";

export type UpdateReferralDialogProps = {
  mode: UpdateMode;
  referral: Referral;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nowIso: string;
  onSaved?: (referral: Referral) => void;
};

export function UpdateReferralDialog(props: UpdateReferralDialogProps) {
  if (props.mode === "edit") return <EditDialog {...props} />;
  if (props.mode === "schedule") return <ScheduleDialog {...props} />;
  return <AcceptDialog {...props} />;
}

function useFinish(
  close: () => void,
  toastKey: "accepted" | "scheduled" | "edited",
  onSaved?: (referral: Referral) => void,
) {
  const t = useTx();
  const { toast } = useToast();
  return (result: WriteResult<Referral> | undefined) => {
    if (result === undefined) return;
    toast({ tone: "positive", title: t(`clinical:referrals.toast.${toastKey}`) });
    onSaved?.(result.data);
    close();
  };
}

function AcceptDialog({
  referral: fromProps,
  open,
  onOpenChange,
  nowIso,
  onSaved,
}: UpdateReferralDialogProps) {
  const t = useTx();
  const { current: referral, setReloaded, clear } = useReloadableReferral(fromProps);
  const schema = useMemo(
    () => createTransitionFormSchema("accepted", { referral, nowIso }),
    [referral, nowIso],
  );
  const form = useForm<TransitionFormValues<"accepted">, unknown, TransitionVariables>({
    resolver: zodResolver(schema),
    defaultValues: emptyTransitionValues("accepted"),
  });
  const note = useWatch({ control: form.control, name: "note" });
  const mutation = useTransitionReferral();
  const close = () => {
    mutation.reset();
    form.reset(emptyTransitionValues("accepted"));
    clear();
    onOpenChange(false);
  };
  const finish = useFinish(close, "accepted", onSaved);
  const onValid = async (v: TransitionVariables) => finish(await mutation.submit(v));

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => (next ? onOpenChange(true) : close())}
      title={t("clinical:referrals.update.acceptTitle")}
      description={t("clinical:referrals.update.acceptBody", {
        destination: facilityLabel(referral.destinationFacilityId, t),
      })}
      confirmLabel={t("clinical:referrals.actions.accept")}
      loading={mutation.isSubmitting}
      confirmDisabled={mutation.error?.code === "CONFLICT"}
      onConfirm={() => form.handleSubmit(onValid)()}
    >
      <form
        noValidate
        data-testid="accept-form"
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit(onValid)();
        }}
      >
        <Textarea
          id="referral-accept-note"
          label={t("clinical:referrals.update.note")}
          rows={2}
          maxLength={500}
          value={note}
          error={form.formState.errors.note ?? serverFieldError(mutation.error, "note")}
          {...form.register("note")}
        />
        <DialogFeedback
          error={mutation.error}
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

function ScheduleDialog({
  referral: fromProps,
  open,
  onOpenChange,
  nowIso,
  onSaved,
}: UpdateReferralDialogProps) {
  const t = useTx();
  const { current: referral, setReloaded, clear } = useReloadableReferral(fromProps);
  const schema = useMemo(
    () => createTransitionFormSchema("scheduled", { referral, nowIso }),
    [referral, nowIso],
  );
  const form = useForm<TransitionFormValues<"scheduled">, unknown, TransitionVariables>({
    resolver: zodResolver(schema),
    defaultValues: emptyTransitionValues("scheduled"),
  });
  const mutation = useTransitionReferral();
  const close = () => {
    mutation.reset();
    form.reset(emptyTransitionValues("scheduled"));
    clear();
    onOpenChange(false);
  };
  const finish = useFinish(close, "scheduled", onSaved);
  const onValid = async (v: TransitionVariables) => finish(await mutation.submit(v));

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => (next ? onOpenChange(true) : close())}
      title={t("clinical:referrals.update.scheduleTitle")}
      description={t("clinical:referrals.update.scheduleBody")}
      confirmLabel={t("clinical:referrals.actions.schedule")}
      loading={mutation.isSubmitting}
      confirmDisabled={mutation.error?.code === "CONFLICT"}
      onConfirm={() => form.handleSubmit(onValid)()}
    >
      <form
        noValidate
        data-testid="schedule-form"
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit(onValid)();
        }}
      >
        <Controller
          control={form.control}
          name="appointmentAt"
          render={({ field, fieldState }) => (
            <DateTimeInput
              id="referral-schedule-appointmentAt"
              label={t("clinical:referrals.update.appointmentAt")}
              hint={t("clinical:referrals.update.appointmentAtHint")}
              required
              error={fieldState.error ?? serverFieldError(mutation.error, "appointmentAt")}
              value={field.value === "" ? null : field.value}
              onChange={(iso) => field.onChange(iso ?? "")}
              onBlur={field.onBlur}
              name={field.name}
              ref={field.ref}
            />
          )}
        />
        <DialogFeedback
          error={mutation.error}
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

function EditDialog({
  referral: fromProps,
  open,
  onOpenChange,
  nowIso,
  onSaved,
}: UpdateReferralDialogProps) {
  const t = useTx();
  const { language } = useLanguage();
  const { current: referral, setReloaded, clear } = useReloadableReferral(fromProps);
  const schema = useMemo(() => createEditFormSchema({ referral, nowIso }), [referral, nowIso]);
  const form = useForm<EditFormValues, unknown, EditVariables>({
    resolver: zodResolver(schema),
    defaultValues: editDefaults(referral),
  });
  const reason = useWatch({ control: form.control, name: "changeReason" });
  const mutation = useEditReferral();
  const error = mutation.error;
  const close = () => {
    mutation.reset();
    form.reset(editDefaults(fromProps));
    clear();
    onOpenChange(false);
  };
  const finish = useFinish(close, "edited", onSaved);
  const onValid = async (v: EditVariables) => finish(await mutation.submit(v));
  const fieldError = (name: keyof EditFormValues) =>
    form.formState.errors[name] ?? serverFieldError(error, name);

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => (next ? onOpenChange(true) : close())}
      title={t("clinical:referrals.update.editTitle")}
      description={t("clinical:referrals.update.editBody")}
      confirmLabel={t("clinical:referrals.update.editSave")}
      loading={mutation.isSubmitting}
      confirmDisabled={error?.code === "CONFLICT"}
      onConfirm={() => form.handleSubmit(onValid)()}
    >
      <form
        noValidate
        data-testid="edit-form"
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit(onValid)();
        }}
      >
        <KeyValueList
          items={[
            {
              id: "currentDestination",
              label: t("clinical:referrals.update.currentDestination"),
              value: facilityLabel(referral.destinationFacilityId, t),
            },
            {
              id: "currentDue",
              label: t("clinical:referrals.update.currentDue"),
              value: formatDateTime(referral.dueAt, language),
            },
          ]}
        />
        <Select
          id="referral-edit-destinationFacilityId"
          label={t("clinical:referrals.update.destination")}
          required
          options={FACILITIES_REFERENCE.map((facility) => ({
            value: facility.id,
            label: t("clinical:referrals.update.destinationOption", {
              name: facilityLabel(facility.id, t),
            }),
          }))}
          error={fieldError("destinationFacilityId")}
          {...form.register("destinationFacilityId")}
        />
        <Controller
          control={form.control}
          name="dueAt"
          render={({ field }) => (
            <DateTimeInput
              id="referral-edit-dueAt"
              label={t("clinical:referrals.update.dueAt")}
              hint={t("clinical:referrals.update.dueAtHint")}
              required
              min={nowIso}
              error={fieldError("dueAt")}
              value={field.value === "" ? null : field.value}
              onChange={(iso) => field.onChange(iso ?? "")}
              onBlur={field.onBlur}
              name={field.name}
              ref={field.ref}
            />
          )}
        />
        <Textarea
          id="referral-edit-changeReason"
          label={t("clinical:referrals.edit.changeReason")}
          hint={t("clinical:referrals.dialog.reasonHint", { min: MIN_REASON_NON_WHITESPACE_CHARS })}
          required
          rows={3}
          maxLength={500}
          value={reason}
          error={fieldError("changeReason")}
          {...form.register("changeReason")}
        />
        <DialogFeedback
          error={error}
          mine={referral}
          canRetry={mutation.canRetry}
          retrying={mutation.isSubmitting}
          onRetry={() => mutation.retry().then(finish)}
          onReload={(latest) => {
            setReloaded(latest);
            form.reset({ ...editDefaults(latest), changeReason: form.getValues("changeReason") });
            mutation.reset();
          }}
          onCancel={close}
        />
        <button type="submit" hidden tabIndex={-1} aria-hidden="true" />
      </form>
    </ConfirmDialog>
  );
}
