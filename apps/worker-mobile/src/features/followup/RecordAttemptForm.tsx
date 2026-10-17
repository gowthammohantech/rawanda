/**
 * Record contact attempt (HWM-08 task 1): `/tasks/[followUpId]/attempt`.
 *
 * When (Kigali wall time, defaults to the demo now; ≤ now + 5 min, ≥ task creation), how (home
 * visit · phone (simulated) · at the facility), result (reached · not reached · declined) and an
 * optional note (≤ 300, "Do not record diagnoses"). A reached attempt moves `assigned →
 * contacted`. Saving writes locally first (`recordAttempt`, baseVersion = the version the form
 * opened on), toasts "Saved on this device" and returns to the task, whose timeline shows the new
 * item with its own sync pill. Field errors + summary; Save disabled while errors remain.
 */
import {
  CONTACT_METHODS,
  CONTACT_RESULTS,
  type ContactMethod,
  type ContactResult,
} from "@laif/domain";
import { domainKey } from "@laif/i18n";
import {
  AppText,
  Button,
  InfoCallout,
  Screen,
  SegmentedControl,
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
import {
  ATTEMPT_NOTE_MAX,
  attemptIssues,
  initialAttemptValues,
  type AttemptFormField,
  type AttemptFormValues,
} from "./attemptSchema.ts";
import {
  ErrorSummary,
  FollowUpFormFrame,
  FormBanner,
  type FormContext,
} from "./FollowUpFormFrame.tsx";
import { OccurredAtField } from "./OccurredAtField.tsx";
import { useRecordAttempt } from "./useFollowUpForms.ts";

export function RecordAttemptScreen({ followUpId }: { followUpId: string }) {
  const t = useTx();
  return (
    <FollowUpFormFrame
      followUpId={followUpId}
      title={t("worker:followup.attempt.title")}
      testID="attempt"
    >
      {(ctx) => <RecordAttemptForm {...ctx} />}
    </FollowUpFormFrame>
  );
}

type Failure = "conflict" | "failed" | "completed" | null;

export function RecordAttemptForm({ detail, now, header, offline, back }: FormContext) {
  const t = useTx();
  const router = useRouter();
  const { toast } = useToast();
  const record = useRecordAttempt();
  // The task as opened: its version is the write's base version (never re-read while open).
  const [target] = useState(() => ({ id: detail.followUp.id, version: detail.followUp.version }));
  const createdAt = detail.followUp.createdAt;
  // One key per form instance = the op's idempotency key (double tap → one op, T-04).
  const [key] = useState(() => platform.createIds()());
  const [values, setValues] = useState<AttemptFormValues>(() => initialAttemptValues(now));
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<Failure>(
    detail.followUp.status === "completed" ? "completed" : null,
  );
  const nowMs = now.getTime();
  const issues = useMemo(
    () => attemptIssues(values, { now: () => new Date(nowMs), createdAt }),
    [values, nowMs, createdAt],
  );
  const errorOf = (field: AttemptFormField) =>
    attempted ? issues.find((issue) => issue.field === field)?.message : undefined;
  const patch = (next: Partial<AttemptFormValues>) => setValues((v) => ({ ...v, ...next }));

  const save = async () => {
    setAttempted(true);
    if (issues.length > 0 || saving) return;
    setSaving(true);
    setFailure(null);
    try {
      const outcome = await record(target, values, key, new Date(nowMs));
      switch (outcome.status) {
        case "saved":
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
          setFailure("conflict");
          break;
        case "blocked":
          setFailure("completed");
          break;
        case "invalid":
          break;
      }
    } catch {
      setFailure("failed");
    }
    setSaving(false);
  };

  const blocked = failure === "completed";

  return (
    <Screen
      testID="attempt-screen"
      keyboardAvoiding
      header={header}
      offline={offline}
      footer={
        <Button
          icon="check"
          fullWidth
          testID="attempt-save"
          loading={saving}
          disabled={blocked || (attempted && issues.length > 0)}
          onPress={save}
        >
          {t("worker:followup.attempt.save")}
        </Button>
      }
    >
      {failure === null ? null : (
        <FormBanner testID={`attempt-${failure}`}>
          {failure === "conflict"
            ? t("worker:followup.errors.conflict")
            : failure === "completed"
              ? t("worker:followup.blocked.completed")
              : t("worker:followup.errors.failed")}
        </FormBanner>
      )}
      {attempted ? <ErrorSummary errors={issues.map((issue) => issue.message)} /> : null}
      <AppText color="muted">{t("worker:followup.attempt.intro")}</AppText>

      <OccurredAtField
        testID="attempt-at"
        label={t("worker:followup.attempt.attemptedAt")}
        value={values.attemptedAt}
        onChange={(attemptedAt) => patch({ attemptedAt })}
        now={now}
        error={errorOf("attemptedAt")}
      />

      <View style={styles.group}>
        <AppText weight="medium">{t("worker:followup.attempt.method")}</AppText>
        <SegmentedControl<ContactMethod>
          label={t("worker:followup.attempt.method")}
          testID="attempt-method"
          value={values.method}
          onChange={(method) => patch({ method })}
          options={CONTACT_METHODS.map((method) => ({
            value: method,
            label: t(domainKey("contactMethod", method)),
          }))}
        />
        <FieldError error={errorOf("method")} />
        {values.method === "phone" ? (
          <InfoCallout icon="info" testID="attempt-phone-simulated">
            {t("worker:followup.attempt.phoneSimulated")}
          </InfoCallout>
        ) : null}
      </View>

      <View style={styles.group}>
        <AppText weight="medium">{t("worker:followup.attempt.result")}</AppText>
        <SegmentedControl<ContactResult>
          label={t("worker:followup.attempt.result")}
          testID="attempt-result"
          value={values.result}
          onChange={(result) => patch({ result })}
          options={CONTACT_RESULTS.map((result) => ({
            value: result,
            label: t(domainKey("contactResult", result)),
          }))}
        />
        <FieldError error={errorOf("result")} />
        {values.result === "reached" && detail.followUp.status !== "contacted" ? (
          <AppText variant="caption" color="muted" testID="attempt-reached-hint">
            {t("worker:followup.attempt.reachedHint")}
          </AppText>
        ) : null}
      </View>

      <TextField
        testID="attempt-note"
        label={t("worker:followup.attempt.note")}
        hint={t("worker:followup.attempt.noteHint")}
        multiline
        maxLength={ATTEMPT_NOTE_MAX}
        value={values.note}
        onChangeText={(note) => patch({ note })}
        error={errorOf("note")}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({ group: { gap: spacing.xs } });
