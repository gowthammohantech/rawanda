/**
 * Create a referral for a decided review that has none open (CLN-08 task 7). Choose a decided
 * review (in scope, `action_recorded`, outcome ≠ dismiss, no open referral) → destination
 * (seed facilities, "(demo)"), reason (≥ 10), priority, due date (after demo now; never
 * pre-filled). Parsed with the FND-03 `ReferralInputSchema`; the repository enforces one open
 * referral per review (`CONFLICT` / `REFERRAL_ALREADY_OPEN` → message with a link to it).
 * Opened from the referrals page (any eligible review) and the patient record (that patient's).
 */
import { zodResolver } from "@hookform/resolvers/zod";
import type { WriteResult } from "@laif/contracts";
import { MIN_REASON_NON_WHITESPACE_CHARS, REVIEW_PRIORITIES, type Referral } from "@laif/domain";
import { domainKey, formatDate, useLanguage } from "@laif/i18n";
import { FACILITIES_REFERENCE } from "@laif/mock-data";
import {
  ConfirmDialog,
  DateTimeInput,
  InfoCallout,
  LoadingSkeleton,
  Select,
  Textarea,
  useToast,
  useTx,
} from "@laif/ui-web";
import { useMemo } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";

import { facilityLabel } from "../../app/persona-labels.ts";
import { DialogFeedback } from "./DialogFeedback.tsx";
import { serverFieldError } from "./dialogShared.ts";
import {
  createCreateFormSchema,
  EMPTY_CREATE_VALUES,
  type CreateFormValues,
  type CreateVariables,
} from "./forms.ts";
import { useCreateReferral, useEligibleReviews, useReferralPatients } from "./hooks.ts";

export type CreateReferralDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nowIso: string;
  /** Only this patient's decided reviews (patient record); null = all in scope. */
  patientId?: string | null;
  onSaved?: (referral: Referral) => void;
};

export function CreateReferralDialog({
  open,
  onOpenChange,
  nowIso,
  patientId = null,
  onSaved,
}: CreateReferralDialogProps) {
  const t = useTx();
  const { language } = useLanguage();
  const { toast } = useToast();
  const eligible = useEligibleReviews(patientId, open);
  const patients = useReferralPatients();
  const reviews = useMemo(() => eligible.data ?? [], [eligible.data]);
  const schema = useMemo(() => createCreateFormSchema({ nowIso, reviews }), [nowIso, reviews]);
  const form = useForm<CreateFormValues, unknown, CreateVariables>({
    resolver: zodResolver(schema),
    defaultValues: EMPTY_CREATE_VALUES,
  });
  const reason = useWatch({ control: form.control, name: "referralReason" });
  const mutation = useCreateReferral();
  const error = mutation.error;

  const close = () => {
    mutation.reset();
    form.reset(EMPTY_CREATE_VALUES);
    onOpenChange(false);
  };
  const finish = (result: WriteResult<Referral> | undefined) => {
    if (result === undefined) return;
    toast({ tone: "positive", title: t("clinical:referrals.toast.created") });
    onSaved?.(result.data);
    close();
  };
  const onValid = async (v: CreateVariables) => finish(await mutation.submit(v));
  const fieldError = (name: keyof CreateFormValues) =>
    form.formState.errors[name] ?? serverFieldError(error, name);

  const reviewOptions = reviews.map((review) => {
    const patient = patients.data?.get(review.patientId);
    return {
      value: review.id,
      label: t("clinical:referrals.create.reviewOption", {
        patient: patient?.displayName ?? review.patientId,
        outcome:
          review.decision === null
            ? "—"
            : t(`clinical:decision.outcomes.${review.decision.kind}.label`),
        date: review.decision === null ? "—" : formatDate(review.decision.decidedAt, language),
      }),
    };
  });

  const loading = eligible.isPending;
  const none = !loading && reviews.length === 0;

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => (next ? onOpenChange(true) : close())}
      title={t("clinical:referrals.create.title")}
      description={t("clinical:referrals.create.description")}
      confirmLabel={t("clinical:referrals.actions.create")}
      loading={mutation.isSubmitting}
      confirmDisabled={loading || none || error?.reason === "REFERRAL_ALREADY_OPEN"}
      onConfirm={() => form.handleSubmit(onValid)()}
    >
      <form
        noValidate
        data-testid="create-referral-form"
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit(onValid)();
        }}
      >
        {loading ? (
          <div role="group" aria-busy="true" aria-label={t("clinical:referrals.create.loading")}>
            <LoadingSkeleton lines={2} />
          </div>
        ) : none ? (
          <InfoCallout>
            <p className="m-0" data-testid="create-none-eligible">
              {t("clinical:referrals.create.noneEligible")}
            </p>
          </InfoCallout>
        ) : (
          <Select
            id="referral-create-reviewId"
            label={t("clinical:referrals.create.review")}
            hint={t("clinical:referrals.create.reviewHint")}
            required
            placeholder={t("clinical:referrals.dialog.choose")}
            options={reviewOptions}
            error={fieldError("reviewId")}
            {...form.register("reviewId")}
          />
        )}
        <Select
          id="referral-create-destinationFacilityId"
          label={t("clinical:referrals.update.destination")}
          required
          placeholder={t("clinical:referrals.dialog.choose")}
          options={FACILITIES_REFERENCE.map((facility) => ({
            value: facility.id,
            label: t("clinical:referrals.update.destinationOption", {
              name: facilityLabel(facility.id, t),
            }),
          }))}
          error={fieldError("destinationFacilityId")}
          {...form.register("destinationFacilityId")}
        />
        <Textarea
          id="referral-create-referralReason"
          label={t("clinical:referrals.create.reason")}
          hint={t("clinical:referrals.dialog.reasonHint", { min: MIN_REASON_NON_WHITESPACE_CHARS })}
          required
          rows={3}
          maxLength={500}
          value={reason}
          error={fieldError("referralReason")}
          {...form.register("referralReason")}
        />
        <Select
          id="referral-create-priority"
          label={t("clinical:referrals.table.priority")}
          required
          placeholder={t("clinical:referrals.dialog.choose")}
          options={REVIEW_PRIORITIES.map((priority) => ({
            value: priority,
            label: t(domainKey("priority", priority)),
          }))}
          error={fieldError("priority")}
          {...form.register("priority")}
        />
        <Controller
          control={form.control}
          name="dueAt"
          render={({ field }) => (
            <DateTimeInput
              id="referral-create-dueAt"
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
        <DialogFeedback
          error={error}
          canRetry={mutation.canRetry}
          retrying={mutation.isSubmitting}
          onRetry={() => mutation.retry().then(finish)}
          onReload={() => mutation.reset()}
          onCancel={close}
        />
        <button type="submit" hidden tabIndex={-1} aria-hidden="true" />
      </form>
    </ConfirmDialog>
  );
}
