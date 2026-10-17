/**
 * Record outcome (HWM-08 tasks 2–4, 7–8): `/tasks/[followUpId]/outcome`.
 *
 * Initial: outcome cards unselected; evidence / reason fields hidden until an outcome that needs
 * them is chosen. Attended → occurred-at + "How was this confirmed?" (worker evidence list) →
 * "Review and complete" opens `ConfirmCompletionSheet` → Confirm writes. Referred onward →
 * occurred-at + read-only clinician destination + evidence, caption "The clinician confirms when
 * the referral is complete". Unable to reach → reason (+ text for Other) and, without a recorded
 * unsuccessful attempt, the inline "Record the unsuccessful attempt now" (else the save is
 * blocked with "Record at least one unsuccessful attempt first"), caption "Your supervisor or
 * clinician will decide next steps".
 *
 * The client guard (`outcomeGuard`) disables outcomes this task cannot take (with the reason) and
 * replaces the form by a message when none is possible (completed task). Saving is local-first
 * (`recordOutcome`), the form key is the op's idempotency key (double tap → one op), then the
 * toast "Saved on this device" and back to the task (a completed task moves to Completed).
 */
import {
  CONTACT_METHODS,
  UNABLE_TO_REACH_REASONS,
  type ContactMethod,
  type UnableToReachReason,
} from "@laif/domain";
import { domainKey } from "@laif/i18n";
import {
  AppText,
  Button,
  Card,
  CheckboxField,
  InfoCallout,
  Screen,
  SegmentedControl,
  SelectSheet,
  spacing,
  TextField,
  useToast,
  useTx,
} from "@laif/ui-native";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";

import { platform } from "../../platform";
import { FieldError } from "../screening/FieldError.tsx";
import { ConfirmCompletionSheet } from "./ConfirmCompletionSheet.tsx";
import { EvidenceTypePicker } from "./EvidenceTypePicker.tsx";
import {
  ErrorSummary,
  FollowUpFormFrame,
  FormBanner,
  type FormContext,
} from "./FollowUpFormFrame.tsx";
import { OccurredAtField } from "./OccurredAtField.tsx";
import {
  hasUnsuccessfulAttempt,
  initialOutcomeValues,
  OTHER_REASON_MAX,
  OUTCOME_NOTE_MAX,
  OUTCOMES_NEEDING_EVIDENCE,
  outcomeGuard,
  outcomeIssues,
  taskBlock,
  WORKER_OUTCOMES,
  type OutcomeBlock,
  type OutcomeFormField,
  type OutcomeFormValues,
  type WorkerOutcome,
} from "./outcomeSchema.ts";
import { OutcomeTypePicker } from "./OutcomeTypePicker.tsx";
import { useRecordOutcome } from "./useFollowUpForms.ts";

export function RecordOutcomeScreen({ followUpId }: { followUpId: string }) {
  const t = useTx();
  return (
    <FollowUpFormFrame
      followUpId={followUpId}
      title={t("worker:followup.outcome.title")}
      testID="outcome"
    >
      {(ctx) => <RecordOutcomeForm {...ctx} />}
    </FollowUpFormFrame>
  );
}

type Failure = { kind: "conflict" | "failed" } | { kind: "blocked"; block: OutcomeBlock } | null;

export function RecordOutcomeForm({ detail, now, header, offline, back }: FormContext) {
  const t = useTx();
  const router = useRouter();
  const { toast } = useToast();
  const record = useRecordOutcome();
  const { followUp, referral } = detail;
  const [target] = useState(() => ({ id: followUp.id, version: followUp.version }));
  const [key] = useState(() => platform.createIds()());
  const [values, setValues] = useState<OutcomeFormValues>(() => initialOutcomeValues(now));
  const [attempted, setAttempted] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<Failure>(null);

  const unsuccessful = hasUnsuccessfulAttempt(followUp);
  const unsuccessfulCount = followUp.attempts.filter((a) => a.result === "not_reached").length;
  const blocks = useMemo(
    () =>
      Object.fromEntries(
        WORKER_OUTCOMES.map((outcome) => [outcome, outcomeGuard(followUp, outcome)]),
      ) as Record<WorkerOutcome, OutcomeBlock | null>,
    [followUp],
  );
  const wholeTaskBlock = taskBlock(followUp);
  const nowMs = now.getTime();
  const issues = useMemo(
    () =>
      outcomeIssues(values, {
        now: () => new Date(nowMs),
        createdAt: followUp.createdAt,
        hasUnsuccessfulAttempt: unsuccessful,
      }),
    [values, nowMs, followUp.createdAt, unsuccessful],
  );
  const errorOf = (field: OutcomeFormField) =>
    attempted ? issues.find((issue) => issue.field === field)?.message : undefined;
  const patch = (next: Partial<OutcomeFormValues>) => setValues((v) => ({ ...v, ...next }));
  const chooseOutcome = (outcome: WorkerOutcome) => {
    setFailure(null);
    patch({ outcome });
  };

  const write = async () => {
    if (saving) return;
    setSaving(true);
    setFailure(null);
    try {
      const outcome = await record(target, values, key, new Date(nowMs));
      switch (outcome.status) {
        case "saved":
          setConfirming(false);
          toast({
            title: (tx) => tx("worker:followup.savedOnDevice"),
            description: (tx) => tx("worker:followup.savedOnDeviceBody"),
          });
          back();
          return;
        case "denied":
          router.replace({ pathname: "/denied", params: { reason: "task" } });
          return;
        case "conflict":
          setFailure({ kind: "conflict" });
          break;
        case "blocked":
          setFailure({ kind: "blocked", block: outcome.block });
          break;
        case "invalid":
          setAttempted(true);
          break;
      }
    } catch {
      setFailure({ kind: "failed" });
    }
    setConfirming(false);
    setSaving(false);
  };

  const submit = () => {
    setAttempted(true);
    if (issues.length > 0 || values.outcome === null) return;
    const block = outcomeGuard(followUp, values.outcome);
    if (block !== null) {
      setFailure({ kind: "blocked", block });
      return;
    }
    if (values.outcome === "attended") setConfirming(true);
    else void write();
  };

  if (wholeTaskBlock !== null) {
    return (
      <Screen testID="outcome-screen" header={header} offline={offline}>
        <FormBanner testID={`outcome-blocked-${wholeTaskBlock}`}>
          {t(`worker:followup.blocked.${wholeTaskBlock}`)}
        </FormBanner>
        <Button variant="secondary" icon="chevron-left" testID="outcome-back" onPress={back}>
          {t("worker:followup.confirm.back")}
        </Button>
      </Screen>
    );
  }

  const outcome = values.outcome;
  const needsEvidence = outcome !== null && OUTCOMES_NEEDING_EVIDENCE.has(outcome);

  return (
    <Screen
      testID="outcome-screen"
      keyboardAvoiding
      header={header}
      offline={offline}
      footer={
        <Button
          icon="check"
          fullWidth
          testID="outcome-save"
          loading={saving && !confirming}
          disabled={attempted && issues.length > 0}
          onPress={submit}
        >
          {outcome === "attended"
            ? t("worker:followup.outcome.review")
            : t("worker:followup.outcome.save")}
        </Button>
      }
    >
      {failure === null ? null : (
        <FormBanner
          testID={
            failure.kind === "blocked"
              ? `outcome-blocked-${failure.block}`
              : `outcome-${failure.kind}`
          }
        >
          {failure.kind === "blocked"
            ? t(`worker:followup.blocked.${failure.block}`)
            : failure.kind === "conflict"
              ? t("worker:followup.errors.conflict")
              : t("worker:followup.errors.failed")}
        </FormBanner>
      )}
      {attempted ? <ErrorSummary errors={issues.map((issue) => issue.message)} /> : null}

      <OutcomeTypePicker
        value={outcome}
        onChange={chooseOutcome}
        blocks={blocks}
        error={errorOf("outcome")}
      />

      {outcome === null ? null : (
        <OccurredAtField
          testID="outcome-occurredAt"
          label={t("worker:followup.outcome.occurredAt")}
          value={values.occurredAt}
          onChange={(occurredAt) => patch({ occurredAt })}
          now={now}
          error={errorOf("occurredAt")}
        />
      )}

      {outcome === "referred_onward" ? (
        <Card testID="outcome-destination">
          <AppText variant="caption" color="muted">
            {t("worker:followup.outcome.destination")}
          </AppText>
          <AppText weight="semibold" testID="outcome-destination-value">
            {referral?.destination ?? t("worker:followup.outcome.noDestination")}
          </AppText>
        </Card>
      ) : null}

      {needsEvidence ? (
        <EvidenceTypePicker
          value={values.evidenceType}
          onChange={(evidenceType) => patch({ evidenceType })}
          error={errorOf("evidenceType")}
        />
      ) : null}

      {outcome === "unable_to_reach" ? (
        <UnableToReachFields
          values={values}
          patch={patch}
          errorOf={errorOf}
          unsuccessfulCount={unsuccessfulCount}
        />
      ) : null}

      {outcome === null ? null : (
        <TextField
          testID="outcome-note"
          label={t("worker:followup.outcome.note")}
          hint={t("worker:followup.outcome.noteHint")}
          multiline
          maxLength={OUTCOME_NOTE_MAX}
          value={values.note}
          onChangeText={(note) => patch({ note })}
          error={errorOf("note")}
        />
      )}

      {outcome === "referred_onward" ? (
        <InfoCallout icon="info" testID="outcome-caption-referred">
          {t("worker:followup.outcome.referredCaption")}
        </InfoCallout>
      ) : outcome === "unable_to_reach" ? (
        <InfoCallout icon="info" testID="outcome-caption-unable">
          {t("worker:followup.outcome.unableCaption")}
        </InfoCallout>
      ) : outcome === "attended" ? (
        <InfoCallout icon="info" testID="outcome-caption-attended">
          {t("worker:followup.outcome.attendedCaption")}
        </InfoCallout>
      ) : null}

      {/* Mounted only while open: a fresh sheet per review (no stale summary). */}
      {confirming ? (
        <ConfirmCompletionSheet
          visible
          evidenceType={values.evidenceType}
          occurredAt={values.occurredAt}
          saving={saving}
          onConfirm={() => void write()}
          onBack={() => setConfirming(false)}
        />
      ) : null}
    </Screen>
  );
}

function UnableToReachFields({
  values,
  patch,
  errorOf,
  unsuccessfulCount,
}: {
  values: OutcomeFormValues;
  patch: (next: Partial<OutcomeFormValues>) => void;
  errorOf: (field: OutcomeFormField) => string | undefined;
  unsuccessfulCount: number;
}) {
  const t = useTx();
  return (
    <View style={styles.group}>
      <SelectSheet<UnableToReachReason>
        testID="outcome-reason"
        label={t("worker:followup.outcome.reason")}
        required
        value={values.reasonCode}
        onChange={(reasonCode) => patch({ reasonCode })}
        error={errorOf("reasonCode")}
        options={UNABLE_TO_REACH_REASONS.map((reason) => ({
          value: reason,
          label: t(domainKey("unableToReachReason", reason)),
        }))}
      />
      {values.reasonCode === "other" ? (
        <TextField
          testID="outcome-reason-text"
          label={t("worker:followup.outcome.reasonText")}
          required
          maxLength={OTHER_REASON_MAX}
          value={values.reasonText}
          onChangeText={(reasonText) => patch({ reasonText })}
          error={errorOf("reasonText")}
        />
      ) : null}
      {unsuccessfulCount > 0 ? (
        <AppText variant="caption" color="muted" testID="outcome-attempts-recorded">
          {t("worker:followup.outcome.attemptsRecorded", { count: unsuccessfulCount })}
        </AppText>
      ) : (
        <View style={styles.group} testID="outcome-inline-attempt">
          <CheckboxField
            testID="outcome-inline-attempt-toggle"
            label={t("worker:followup.outcome.inlineAttempt")}
            description={t("worker:followup.outcome.inlineAttemptHint")}
            checked={values.inlineAttempt}
            onChange={(inlineAttempt) => patch({ inlineAttempt })}
            error={errorOf("inlineAttempt")}
          />
          {values.inlineAttempt ? (
            <View style={styles.group}>
              <AppText weight="medium">{t("worker:followup.outcome.inlineMethod")}</AppText>
              <SegmentedControl<ContactMethod>
                label={t("worker:followup.outcome.inlineMethod")}
                testID="outcome-inline-method"
                value={values.inlineMethod}
                onChange={(inlineMethod) => patch({ inlineMethod })}
                options={CONTACT_METHODS.map((method) => ({
                  value: method,
                  label: t(domainKey("contactMethod", method)),
                }))}
              />
              <FieldError error={errorOf("inlineMethod")} />
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({ group: { gap: spacing.sm } });
