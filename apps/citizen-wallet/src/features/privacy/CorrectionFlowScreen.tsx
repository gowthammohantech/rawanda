/**
 * Ask for a correction (CTZ-07 tasks 5–10) — one screen, three steps with a stepper:
 * 1. pick the item (released result, approved next step or "My personal details"; preselected
 *    when opened from a result / next step via `?targetType=&targetId=`),
 * 2. describe it (10–500 letters, optional suggestion ≤ 200, required "I understand" tick),
 * 3. review → Send request.
 *
 * Sending creates a care-team task and NEVER changes the record. An open request for the same
 * item is shown before anything is typed (and the repository blocks it as a backstop). A
 * conflict (item changed, or the demo `conflict-next-write` toggle) writes nothing and returns to
 * step 1 with the refreshed item. A server error keeps the idempotency key (Retry = same key).
 */
import type { CitizenCareTask, CorrectionRequest } from "@laif/contracts";
import { formatDate, useLanguage } from "@laif/i18n";
import type { CorrectionTarget } from "@laif/repositories/citizen";
import {
  AppText,
  Button,
  ErrorState,
  Icon,
  InfoCallout,
  KeyValueList,
  LoadingState,
  Screen,
  Section,
  Stepper,
  announce,
  spacing,
  useTx,
  type TranslationKey,
  usePalette,
  type Palette,
} from "@laif/ui-native";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View, type TextInputInstance } from "react-native";

import { ConsentRequiredState } from "../../components/ConsentRequiredState.tsx";
import { InlineError } from "../../components/InlineError.tsx";
import { WalletHeader } from "../../components/WalletHeader.tsx";
import { useCorrectionRequests, useCorrectionTargets } from "../../data/queries.ts";
import { RepresentativeBanner } from "../health/RepresentativeBanner.tsx";
import { resultErrorKind, useActivePatient } from "../health/useResults.ts";
import { ConflictNotice } from "../next-steps/ConflictNotice.tsx";
import { CorrectionForm, type CorrectionDetailsValues } from "./CorrectionForm.tsx";
import { CorrectionItemPicker, targetValueOf } from "./CorrectionItemPicker.tsx";
import {
  correctionDetailsSchema,
  correctionErrorsOf,
  correctionTargetSchema,
  type CorrectionErrors,
} from "./correctionSchema.ts";
import { correctionRef, isOpenRequest, targetLabel } from "./copy.ts";
import { RecordUnchangedNote } from "./RecordUnchangedNote.tsx";
import { useCorrectionSend } from "./usePrivacy.ts";
import { useThemedStyles } from "../../theme/useThemedStyles.ts";

type Step = 0 | 1 | 2;
type Tx = ReturnType<typeof useTx>;

const detailHref = (requestId: string) => ({
  pathname: "/more/privacy/corrections/[requestId]" as const,
  params: { requestId },
});

export type CorrectionFlowScreenProps = {
  initialTargetType?: string;
  initialTargetId?: string;
};

/** "You already asked about this on {date}" + link to the open request. */
function DuplicateNotice({ date, onOpen }: { date: string; onOpen: () => void }) {
  const styles = useThemedStyles(makeStyles);
  const t = useTx();
  return (
    <View style={styles.notice} accessibilityRole="alert" testID="duplicate-notice">
      <InfoCallout icon="info" title={t("citizen:correction.duplicate.title")}>
        {t("citizen:correction.duplicate.body", { date })}
      </InfoCallout>
      <Button variant="secondary" icon="file" onPress={onOpen} testID="duplicate-open">
        {t("citizen:correction.duplicate.view")}
      </Button>
    </View>
  );
}

const translate = (t: Tx, key: string | undefined): string | null =>
  key === undefined ? null : t(key as TranslationKey);

export function CorrectionFlowScreen({
  initialTargetType,
  initialTargetId,
}: CorrectionFlowScreenProps) {
  const palette = usePalette();
  const styles = useThemedStyles(makeStyles);
  const t = useTx();
  const { language } = useLanguage();
  const router = useRouter();
  const patient = useActivePatient();
  const patientId = patient?.patientId ?? null;
  const targets = useCorrectionTargets(patientId);
  const requests = useCorrectionRequests(patientId);

  // `null` / `undefined` = not chosen by the citizen yet → derived from the preselection.
  const [stepState, setStep] = useState<Step | null>(null);
  const [pickedState, setPicked] = useState<string | null | undefined>(undefined);
  const [values, setValues] = useState<CorrectionDetailsValues>({
    description: "",
    suggestedValue: "",
    understood: false,
  });
  const [errors, setErrors] = useState<CorrectionErrors>({});
  const [conflict, setConflict] = useState(false);
  const [sent, setSent] = useState<CitizenCareTask | null>(null);
  const descriptionRef = useRef<TextInputInstance | null>(null);
  const suggestedRef = useRef<TextInputInstance | null>(null);

  const openRequestFor = useCallback(
    (x: Pick<CorrectionTarget, "targetType" | "targetId"> | null): CorrectionRequest | null =>
      x === null
        ? null
        : (requests.data?.find(
            (r) => isOpenRequest(r) && r.targetType === x.targetType && r.targetId === x.targetId,
          ) ?? null),
    [requests.data],
  );

  // Entered from a result / next step: that item is preselected and the flow starts at
  // "describe" — unless it already has an open request (then the duplicate notice shows).
  const preselect = useMemo(() => {
    if (initialTargetType === undefined || initialTargetId === undefined) return null;
    const match = targets.data?.find(
      (x) => x.targetType === initialTargetType && x.targetId === initialTargetId,
    );
    return match === undefined ? null : match;
  }, [targets.data, initialTargetType, initialTargetId]);
  const picked =
    pickedState === undefined
      ? preselect === null
        ? null
        : targetValueOf(preselect)
      : pickedState;
  const step: Step =
    stepState ?? (preselect !== null && openRequestFor(preselect) === null ? 1 : 0);

  const target: CorrectionTarget | null =
    targets.data?.find((x) => targetValueOf(x) === picked) ?? null;
  const openRequest = openRequestFor(target);

  const back = () => (router.canGoBack() ? router.back() : router.replace("/more/privacy"));

  const continueFromPick = () => {
    const parsed = correctionTargetSchema.safeParse({
      targetType: target?.targetType,
      targetId: target?.targetId ?? "",
    });
    if (!parsed.success) {
      const next = correctionErrorsOf(parsed.error);
      setErrors(next);
      const message = translate(t, next.targetId);
      if (message !== null) announce(message);
      return;
    }
    if (openRequest !== null) return;
    setErrors({});
    setConflict(false);
    setStep(1);
  };

  const continueFromDescribe = () => {
    const parsed = correctionDetailsSchema.safeParse(values);
    if (!parsed.success) {
      const next = correctionErrorsOf(parsed.error);
      setErrors(next);
      // Focus moves to the first error (the tick box has no focus API: announce instead).
      if (next.description !== undefined) descriptionRef.current?.focus();
      else if (next.suggestedValue !== undefined) suggestedRef.current?.focus();
      else {
        const message = translate(t, next.understood);
        if (message !== null) announce(message);
      }
      return;
    }
    setErrors({});
    setStep(2);
  };

  const onConflict = async () => {
    setConflict(true);
    setStep(0);
    await Promise.all([targets.refetch(), requests.refetch()]);
  };

  let body;
  const errorKind = targets.isError ? resultErrorKind(targets.error) : null;
  if (sent !== null) {
    body = (
      <View style={styles.success} testID="correction-success">
        <View style={styles.successIcon}>
          <Icon name="check" size={32} strokeWidth={2.6} color={palette.onPrimary} />
        </View>
        <AppText variant="display" accessibilityRole="header" testID="correction-success-title">
          {t("citizen:correction.success.title")}
        </AppText>
        <AppText variant="bodyLarge" weight="semibold" testID="correction-reference">
          {t("citizen:correction.success.reference", { ref: correctionRef(sent.id) })}
        </AppText>
        <RecordUnchangedNote />
        <Button
          fullWidth
          icon="file"
          onPress={() => router.replace(detailHref(sent.id))}
          testID="correction-view-request"
        >
          {t("citizen:correction.success.view")}
        </Button>
        <Button
          fullWidth
          variant="secondary"
          onPress={() => router.replace("/more/privacy")}
          testID="correction-done"
        >
          {t("citizen:correction.success.done")}
        </Button>
      </View>
    );
  } else if (errorKind === "consent") {
    body = <ConsentRequiredState />;
  } else if (targets.isError || requests.isError) {
    body = (
      <ErrorState
        message={t("citizen:privacy.error")}
        onRetry={() => Promise.all([targets.refetch(), requests.refetch()])}
      />
    );
  } else if (targets.data === undefined || requests.data === undefined) {
    body = <LoadingState variant="skeleton" rows={3} label={t("citizen:correction.new.loading")} />;
  } else {
    body = (
      <View style={styles.flow}>
        <RepresentativeBanner patient={patient} />
        <Stepper
          testID="correction-form-stepper"
          currentIndex={step}
          steps={[
            { id: "pick", label: t("citizen:correction.new.steps.pick") },
            { id: "describe", label: t("citizen:correction.new.steps.describe") },
            { id: "review", label: t("citizen:correction.new.steps.review") },
          ]}
        />
        {step === 0 ? (
          <>
            {conflict ? (
              <ConflictNotice
                title={t("citizen:correction.conflict.title")}
                body={t("citizen:correction.conflict.body")}
                reloadLabel={t("citizen:correction.conflict.reload")}
                onReload={async () => {
                  await targets.refetch();
                  setConflict(false);
                }}
              />
            ) : null}
            <CorrectionItemPicker
              targets={targets.data}
              value={picked}
              onChange={(next) => {
                setPicked(targetValueOf(next));
                setErrors({});
              }}
              error={translate(t, errors.targetId)}
            />
            {openRequest === null ? null : (
              <DuplicateNotice
                date={formatDate(openRequest.createdAt, language)}
                onOpen={() => router.push(detailHref(openRequest.id))}
              />
            )}
            <Button
              fullWidth
              icon="chevron"
              iconPosition="end"
              disabled={openRequest !== null}
              onPress={continueFromPick}
              testID="correction-continue-pick"
            >
              {t("citizen:correction.new.continue")}
            </Button>
          </>
        ) : null}
        {step === 1 ? (
          <>
            {target === null ? null : (
              <Section title={t("citizen:correction.new.reviewItem")}>
                <AppText weight="semibold" testID="correction-picked">
                  {targetLabel(t, target, language)}
                </AppText>
              </Section>
            )}
            <CorrectionForm
              values={values}
              onChange={(patch) => setValues((v) => ({ ...v, ...patch }))}
              errors={{
                description: translate(t, errors.description),
                suggestedValue: translate(t, errors.suggestedValue),
                understood: translate(t, errors.understood),
              }}
              descriptionRef={descriptionRef}
              suggestedRef={suggestedRef}
            />
            <View style={styles.actions}>
              <Button
                variant="secondary"
                icon="chevron-left"
                onPress={() => setStep(0)}
                testID="correction-back-describe"
              >
                {t("citizen:correction.new.back")}
              </Button>
              <Button
                icon="chevron"
                iconPosition="end"
                onPress={continueFromDescribe}
                testID="correction-continue-describe"
              >
                {t("citizen:correction.new.continue")}
              </Button>
            </View>
          </>
        ) : null}
        {step === 2 && target !== null && patientId !== null ? (
          <ReviewStep
            patientId={patientId}
            target={target}
            values={values}
            onEdit={() => setStep(1)}
            onSent={setSent}
            onConflict={onConflict}
            onOpenRequest={(id) => router.push(detailHref(id))}
          />
        ) : null}
      </View>
    );
  }

  return (
    <Screen
      testID="correction-new-screen"
      edges={["top", "left", "right"]}
      header={<WalletHeader title={t("citizen:correction.new.title")} onBack={back} />}
    >
      {body}
    </Screen>
  );
}

type ReviewStepProps = {
  patientId: string;
  target: CorrectionTarget;
  values: CorrectionDetailsValues;
  onEdit: () => void;
  onSent: (task: CitizenCareTask) => void;
  onConflict: () => unknown;
  onOpenRequest: (id: string) => void;
};

/** Step 3. The idempotency key is made when this step mounts (`useCorrectionSend`). */
function ReviewStep({
  patientId,
  target,
  values,
  onEdit,
  onSent,
  onConflict,
  onOpenRequest,
}: ReviewStepProps) {
  const styles = useThemedStyles(makeStyles);
  const t = useTx();
  const { language } = useLanguage();
  const sender = useCorrectionSend();
  const description = values.description.trim();
  const suggested = values.suggestedValue.trim();

  const handled = useRef<string | null>(null);
  useEffect(() => {
    if (handled.current === sender.status) return;
    if (sender.status === "success" && sender.task !== null) {
      handled.current = sender.status;
      announce(t("citizen:correction.success.title"));
      onSent(sender.task);
    } else if (sender.status === "conflict") {
      handled.current = sender.status;
      void onConflict();
    }
  }, [sender.status, sender.task, onSent, onConflict, t]);

  return (
    <View style={styles.flow} testID="correction-review">
      <Section
        title={t("citizen:correction.new.reviewTitle")}
        action={
          <Button variant="ghost" size="sm" onPress={onEdit} testID="correction-edit">
            {t("citizen:correction.new.edit")}
          </Button>
        }
      >
        <KeyValueList
          testID="correction-summary"
          items={[
            {
              id: "item",
              label: t("citizen:correction.new.reviewItem"),
              value: targetLabel(t, target, language),
            },
            {
              id: "wrong",
              label: t("citizen:correction.new.reviewWhatWrong"),
              value: description,
            },
            {
              id: "should",
              label: t("citizen:correction.new.reviewShouldSay"),
              value: suggested === "" ? t("citizen:correction.new.reviewNothing") : suggested,
            },
          ]}
        />
      </Section>
      <RecordUnchangedNote />
      {sender.status === "duplicate" && sender.duplicate !== null ? (
        <DuplicateNotice
          date={formatDate(sender.duplicate.createdAt, language)}
          onOpen={() => onOpenRequest(sender.duplicate!.id)}
        />
      ) : null}
      <InlineError
        testID="correction-send-error"
        message={sender.status === "error" ? t("citizen:correction.new.sendError") : null}
      />
      <Button
        fullWidth
        icon="check"
        loading={sender.status === "pending"}
        disabled={
          sender.status === "pending" ||
          sender.status === "duplicate" ||
          sender.status === "conflict"
        }
        accessibilityHint={t("citizen:correction.new.sendHint")}
        onPress={() =>
          sender.send({
            patientId,
            targetType: target.targetType,
            targetId: target.targetId,
            description,
            suggestedValue: suggested === "" ? null : suggested,
            expectedTargetVersion: target.version,
          })
        }
        testID="correction-send"
      >
        {sender.status === "error"
          ? t("citizen:correction.new.retry")
          : t("citizen:correction.new.send")}
      </Button>
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    flow: { gap: spacing.lg },
    notice: { gap: spacing.sm },
    actions: { flexDirection: "row", justifyContent: "space-between", gap: spacing.sm },
    success: { gap: spacing.lg, alignItems: "stretch" },
    successIcon: {
      width: 64,
      height: 64,
      borderRadius: 32,
      alignSelf: "center",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.positive,
    },
  });
