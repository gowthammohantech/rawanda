/**
 * Correct a value of a submitted screening (HWM-06 task 8): `/screenings/[screeningId]/amend`.
 *
 * Choose the field (systolic, diastolic, glucose value, glucose unit, context, measured-at; each
 * with its current effective value), enter the new value (same refinements as the form,
 * `amendSchema.ts`) and a REQUIRED reason (≥ 10 characters; presets "Typing error", "Wrong unit
 * selected", "Wrong time" fill the text, which stays editable). Without a reason the save is
 * blocked with "Give a reason for the correction". Saving appends an amendment through
 * `repo.amendScreening` (`screening.amend` op with `baseVersion = screening.version`, audit
 * `screening.amended` with the justification); the original values are never changed.
 */
import {
  AMENDABLE_SCREENING_FIELDS,
  effectiveReadings,
  type AmendableScreeningField,
  type EffectiveReadings,
  type GlucoseContext,
  type GlucoseUnit,
  type Screening,
} from "@laif/domain";
import { domainKey, useLanguage } from "@laif/i18n";
import { RepositoryError } from "@laif/repositories";
import {
  announce,
  AppText,
  Button,
  colors,
  DateTimeField,
  EmptyState,
  ErrorState,
  errorCodeOf,
  Icon,
  InfoCallout,
  LoadingState,
  NumberField,
  RadioCardGroup,
  radii,
  ReasonField,
  Screen,
  SegmentedControl,
  spacing,
  useToast,
  useTx,
} from "@laif/ui-native";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { AppHeader } from "../../components/AppHeader.tsx";
import { platform } from "../../platform";
import { useDemoNow } from "../patients/usePatients.ts";
import {
  amendIssues,
  amendValuesFor,
  createAmendSchema,
  EMPTY_AMEND_VALUES,
  toAmendCall,
  type AmendFormField,
  type AmendFormValues,
} from "./amendSchema.ts";
import { formatAmendValue } from "./AmendmentList.tsx";
import { FieldError } from "./FieldError.tsx";
import { sanitiseGlucoseInput } from "./screeningSchema.ts";
import { useAmendScreening, useScreening } from "./useScreenings.ts";

export function AmendScreeningScreen({ screeningId }: { screeningId: string }) {
  const t = useTx();
  const router = useRouter();
  const access = useScreening(screeningId);
  const now = useDemoNow();
  const status = access.data?.status;

  useEffect(() => {
    if (status === "denied") router.replace({ pathname: "/denied", params: { reason: "patient" } });
  }, [status, router]);

  const back = () =>
    router.canGoBack()
      ? router.back()
      : router.replace({ pathname: "/screenings/[screeningId]", params: { screeningId } });
  const header = <AppHeader title={t("worker:review.amend.title")} onBack={back} />;

  if (access.isError) {
    const code = errorCodeOf(access.error);
    return (
      <Screen testID="amend-error" header={header}>
        <ErrorState
          title={t("worker:review.detail.openFailed")}
          {...(code === undefined ? {} : { code })}
          onRetry={() => access.refetch()}
        />
      </Screen>
    );
  }
  if (status === "missing" || status === "draft") {
    return (
      <Screen testID="amend-missing" header={header}>
        <EmptyState icon="file" title={t("worker:review.detail.notFound")} />
      </Screen>
    );
  }
  if (access.data?.status !== "ok" || now === null) {
    return (
      <Screen testID="amend-loading" header={header}>
        <LoadingState variant="skeleton" rows={3} label={t("worker:review.detail.loading")} />
      </Screen>
    );
  }
  return <AmendScreeningForm screening={access.data.screening} now={now} header={header} />;
}

export function AmendScreeningForm({
  screening,
  now,
  header,
}: {
  screening: Screening;
  now: Date;
  header: ReactNode;
}) {
  const t = useTx();
  const { language } = useLanguage();
  const router = useRouter();
  const { toast } = useToast();
  const amend = useAmendScreening();
  const current = useMemo(() => effectiveReadings(screening), [screening]);
  const [values, setValues] = useState<AmendFormValues>(EMPTY_AMEND_VALUES);
  const [attempted, setAttempted] = useState(false);
  const [failure, setFailure] = useState<"conflict" | "failed" | null>(null);
  // One key per correction attempt: a retry after a failure re-sends the same write.
  const [key] = useState(() => platform.createIds()());
  const nowMs = now.getTime();
  const schema = useMemo(
    () => createAmendSchema({ now: () => new Date(nowMs), current }),
    [nowMs, current],
  );
  const issues = useMemo(() => {
    const parsed = schema.safeParse(values);
    return parsed.success ? [] : amendIssues(parsed.error.issues);
  }, [schema, values]);
  const errorOf = (field: AmendFormField) =>
    attempted ? issues.find((issue) => issue.field === field)?.message : undefined;
  const reasonMissing = attempted && issues.some((issue) => issue.field === "reason");

  const currentText = (field: AmendableScreeningField) =>
    formatAmendValue(field, current[field], t, language, current.glucoseUnit);

  const chooseField = (field: AmendableScreeningField) =>
    setValues((v) => amendValuesFor(field, current, v.reason));
  const patch = (next: Partial<AmendFormValues>) => setValues((v) => ({ ...v, ...next }));

  const save = async () => {
    setAttempted(true);
    setFailure(null);
    if (issues.length > 0) {
      announce(t("worker:a11y.errorCount", { count: issues.length }));
      return;
    }
    try {
      await amend(screening, toAmendCall(values), key);
      toast({ title: (tx) => tx("worker:review.amend.saved") });
      router.replace({
        pathname: "/screenings/[screeningId]",
        params: { screeningId: screening.id },
      });
    } catch (error) {
      setFailure(
        error instanceof RepositoryError && error.code === "CONFLICT" ? "conflict" : "failed",
      );
    }
  };

  const presets = [
    t("worker:review.amend.preset.typing"),
    t("worker:review.amend.preset.unit"),
    t("worker:review.amend.preset.time"),
  ];

  return (
    <Screen
      testID="amend-screen"
      keyboardAvoiding
      header={header}
      footer={
        <Button icon="check" fullWidth testID="amend-save" onPress={save}>
          {t("worker:review.amend.save")}
        </Button>
      }
    >
      {reasonMissing ? (
        <View style={styles.banner} testID="amend-reason-required" accessibilityLiveRegion="polite">
          <Icon name="alert" size={18} color={colors.danger} />
          <AppText weight="semibold" colorValue={colors.danger} style={styles.flex}>
            {t("worker:review.amend.reasonRequired")}
          </AppText>
        </View>
      ) : null}
      {failure !== null ? (
        <View style={styles.banner} testID={`amend-${failure}`} accessibilityLiveRegion="polite">
          <Icon name="alert" size={18} color={colors.danger} />
          <AppText colorValue={colors.danger} style={styles.flex}>
            {failure === "conflict"
              ? t("worker:review.amend.conflict")
              : t("worker:review.amend.failed")}
          </AppText>
        </View>
      ) : null}

      <RadioCardGroup<AmendableScreeningField>
        legend={t("worker:review.amend.field")}
        testID="amend-field"
        required
        value={values.field}
        onChange={chooseField}
        error={errorOf("field")}
        options={AMENDABLE_SCREENING_FIELDS.map((field) => ({
          value: field,
          label: t(domainKey("amendableField", field)),
          description: t("worker:review.amend.current", { value: currentText(field) }),
        }))}
      />

      {values.field === null ? null : (
        <ValueControl
          field={values.field}
          values={values}
          current={current}
          error={errorOf(
            values.field === "glucoseUnit"
              ? "unit"
              : values.field === "glucoseContext"
                ? "context"
                : values.field === "measuredAt"
                  ? "measuredAt"
                  : "value",
          )}
          onChange={patch}
        />
      )}

      <View style={styles.group}>
        <AppText weight="medium">{t("worker:review.amend.presets")}</AppText>
        <View style={styles.presets}>
          {presets.map((preset, index) => (
            <Button
              key={preset}
              size="sm"
              variant="secondary"
              testID={`amend-preset-${index}`}
              onPress={() => patch({ reason: preset })}
            >
              {preset}
            </Button>
          ))}
        </View>
      </View>
      <ReasonField
        testID="amend-reason"
        label={t("worker:review.amend.reason")}
        value={values.reason}
        onChangeText={(reason) => patch({ reason })}
        error={errorOf("reason")}
      />
      <InfoCallout icon="info" testID="amend-keeps-original">
        {t("worker:review.amend.keepsOriginal")}
      </InfoCallout>
    </Screen>
  );
}

function ValueControl({
  field,
  values,
  current,
  error,
  onChange,
}: {
  field: AmendableScreeningField;
  values: AmendFormValues;
  current: EffectiveReadings;
  error: string | undefined;
  onChange: (patch: Partial<AmendFormValues>) => void;
}) {
  const t = useTx();
  const label = t("worker:review.amend.newValue");
  switch (field) {
    case "systolic":
    case "diastolic":
      return (
        <NumberField
          testID="amend-value"
          label={label}
          integer
          maxLength={3}
          unit="mmHg"
          value={values.value}
          onChangeText={(value) => onChange({ value })}
          error={error}
        />
      );
    case "glucoseValue":
      return (
        <NumberField
          testID="amend-value"
          label={label}
          maxLength={5}
          unit={current.glucoseUnit ?? "—"}
          value={values.value}
          onChangeText={(value) => onChange({ value: sanitiseGlucoseInput(value) })}
          error={error}
        />
      );
    case "glucoseUnit":
      return (
        <View style={styles.group}>
          <AppText weight="medium">{label}</AppText>
          <SegmentedControl<GlucoseUnit>
            label={label}
            testID="amend-unit"
            value={values.unit}
            onChange={(unit) => onChange({ unit })}
            options={[
              { value: "mmol/L", label: t("worker:screening.unit.mmolL") },
              { value: "mg/dL", label: t("worker:screening.unit.mgdL") },
            ]}
          />
          <FieldError error={error} />
        </View>
      );
    case "glucoseContext":
      return (
        <View style={styles.group}>
          <AppText weight="medium">{label}</AppText>
          <SegmentedControl<GlucoseContext>
            label={label}
            testID="amend-context"
            value={values.context}
            onChange={(context) => onChange({ context })}
            options={[
              { value: "fasting", label: t("worker:screening.context.fasting") },
              { value: "non_fasting", label: t("worker:screening.context.notFasting") },
              { value: "not_recorded", label: t("worker:screening.context.notRecorded") },
            ]}
          />
          <FieldError error={error} />
        </View>
      );
    case "measuredAt":
      return (
        <DateTimeField
          testID="amend-measuredAt"
          label={label}
          required
          value={values.measuredAt}
          onChange={(measuredAt) => onChange({ measuredAt })}
          error={error}
        />
      );
  }
}

const styles = StyleSheet.create({
  group: { gap: spacing.xs },
  presets: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  flex: { flex: 1 },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: radii.md,
    backgroundColor: colors.dangerSoft,
  },
});
