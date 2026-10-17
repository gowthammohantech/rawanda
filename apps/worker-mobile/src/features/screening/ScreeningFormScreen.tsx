/**
 * Screening form (HWM-05): `/screenings/draft/[draftId]`. Loads the draft and RE-CHECKS the
 * patient scope (out of scope → `/denied`), then the form: blood pressure, glucose + unit +
 * context, measured-at, observations, source fixed "entered manually on this device".
 *
 * React Hook Form + `zodResolver(createScreeningFormSchema)` in `mode: 'onTouched'`; errors are
 * i18n keys translated at render (EN⇄RW switch re-translates, values untouched). Every change
 * is autosaved as the device-local draft (`useDraftAutosave`; flushed on blur, background,
 * back). "Review" runs the full validation: errors → summary banner with tap-to-focus links and
 * Review disabled until resolved; valid → `/screenings/draft/[draftId]/review` (HWM-06).
 * Header menu → "Discard draft" (ConfirmSheet, audit `screening.draft_discarded`).
 * `revalidate` (HWM-06: the review screen found the draft stale / invalid) opens the form with the
 * full validation already run, i.e. the error summary visible.
 */
import { zodResolver } from "@hookform/resolvers/zod";
import type { Patient, Screening } from "@laif/domain";
import {
  announce,
  AppText,
  Button,
  colors,
  ConfirmSheet,
  EmptyState,
  ErrorState,
  errorCodeOf,
  Icon,
  IconButton,
  InfoCallout,
  LoadingState,
  radii,
  Screen,
  Sheet,
  spacing,
  touchTarget,
  useToast,
  useTx,
  type TranslationKey,
} from "@laif/ui-native";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { useForm, useWatch, type FieldErrors } from "react-hook-form";
import { Pressable, StyleSheet, View } from "react-native";

import { AppHeader } from "../../components/AppHeader.tsx";
import { platform } from "../../platform";
import { useDemoNow } from "../patients/usePatients.ts";
import { BloodPressureSection } from "./BloodPressureSection.tsx";
import { DraftStatusLine } from "./DraftStatusLine.tsx";
import { GlucoseSection } from "./GlucoseSection.tsx";
import { MeasuredAtField } from "./MeasuredAtField.tsx";
import { ObservationsField } from "./ObservationsField.tsx";
import { PatientMiniCard } from "./PatientMiniCard.tsx";
import {
  createScreeningFormSchema,
  draftSignature,
  draftToFormValues,
  SCREENING_FORM_FIELDS,
  type ScreeningFormField,
  type ScreeningFormValues,
} from "./screeningSchema.ts";
import { useDraftAutosave } from "./useDraftAutosave.ts";
import { useDraftAccess, useDraftActions } from "./useScreeningDrafts.ts";

const FIELD_LABEL: Record<ScreeningFormField, TranslationKey> = {
  systolic: "worker:screening.systolic",
  diastolic: "worker:screening.diastolic",
  glucoseValue: "worker:screening.glucoseValue",
  glucoseUnit: "worker:screening.unit.label",
  glucoseContext: "worker:screening.context.label",
  measuredAt: "worker:screening.measuredAt",
  notes: "worker:screening.observations",
};

/** Fields with a focusable text input (the segmented pickers / date field are not). */
const FOCUSABLE: ReadonlySet<ScreeningFormField> = new Set([
  "systolic",
  "diastolic",
  "glucoseValue",
  "notes",
]);

export function ScreeningFormScreen({
  draftId,
  revalidate = false,
}: {
  draftId: string;
  /** Opened from the review screen with a stale / invalid draft: show the error summary. */
  revalidate?: boolean;
}) {
  const t = useTx();
  const router = useRouter();
  const access = useDraftAccess(draftId);
  const now = useDemoNow();
  const denied = access.data?.status === "denied";

  useEffect(() => {
    if (denied) router.replace({ pathname: "/denied", params: { reason: "patient" } });
  }, [denied, router]);

  const toScreenTab = () => router.replace("/screen");
  const header = (
    <AppHeader
      title={t("worker:screening.title")}
      onBack={() => (router.canGoBack() ? router.back() : toScreenTab())}
    />
  );

  if (access.isError) {
    const code = errorCodeOf(access.error);
    return (
      <Screen testID="screening-form-error" header={header}>
        <ErrorState
          title={t("worker:screening.openFailed")}
          {...(code === undefined ? {} : { code })}
          onRetry={() => access.refetch()}
        />
      </Screen>
    );
  }
  if (access.data?.status === "missing") {
    return (
      <Screen testID="screening-draft-missing" header={header}>
        <EmptyState
          icon="file"
          title={t("worker:screening.notFound")}
          description={t("worker:screening.notFoundHint")}
          action={
            <Button testID="back-to-screen" onPress={toScreenTab}>
              {t("worker:screening.backToScreen")}
            </Button>
          }
        />
      </Screen>
    );
  }
  if (access.data?.status !== "ok" || now === null) {
    // Loading (< 1 frame typical), or denied (redirecting): never any patient detail.
    return (
      <Screen testID="screening-form-loading" header={header}>
        <LoadingState variant="skeleton" rows={4} label={t("worker:screening.loading")} />
      </Screen>
    );
  }
  return (
    <ScreeningForm
      key={access.data.draft.id}
      draft={access.data.draft}
      patient={access.data.patient}
      now={now}
      revalidate={revalidate}
    />
  );
}

function ScreeningForm({
  draft,
  patient,
  now,
  revalidate,
}: {
  draft: Screening;
  patient: Patient;
  now: Date;
  revalidate: boolean;
}) {
  const t = useTx();
  const router = useRouter();
  const { toast } = useToast();
  const { save, discard } = useDraftActions();
  const nowMs = now.getTime();
  const schema = useMemo(() => createScreeningFormSchema({ now: () => new Date(nowMs) }), [nowMs]);
  const form = useForm<ScreeningFormValues>({
    resolver: zodResolver(schema),
    defaultValues: draftToFormValues(draft),
    mode: "onTouched",
    reValidateMode: "onChange",
    shouldFocusError: false,
  });
  const { control, handleSubmit, formState, setFocus } = form;
  const values = useWatch({ control }) as ScreeningFormValues;
  const autosave = useDraftAutosave({
    values,
    save: (v) => save(draft, v),
    signature: draftSignature,
    initialSavedAt: draft.updatedAt,
  });
  const flush = () => void autosave.flush();

  const [submitAttempted, setSubmitAttempted] = useState(revalidate);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [discardFailed, setDiscardFailed] = useState(false);
  const [discardKey] = useState(() => platform.createIds()());

  // After a Review attempt, every change re-validates ALL fields (cross-field rules such as
  // "diastolic below systolic" clear as soon as either value is fixed).
  const signature = JSON.stringify(values);
  const { trigger } = form;
  useEffect(() => {
    if (submitAttempted) void trigger();
  }, [signature, submitAttempted, trigger]);

  const errorFields = SCREENING_FORM_FIELDS.filter((name) => formState.errors[name] !== undefined);
  const blocked = submitAttempted && errorFields.length > 0;

  const back = async () => {
    await autosave.flush();
    if (router.canGoBack()) router.back();
    else router.replace("/screen");
  };

  const focusField = (name: ScreeningFormField) => {
    // After the press settles (the pressed link keeps focus otherwise).
    if (FOCUSABLE.has(name)) setTimeout(() => setFocus(name), 0);
    else announce(t(FIELD_LABEL[name]));
  };

  const onValid = async () => {
    await autosave.flush();
    router.push({
      pathname: "/screenings/draft/[draftId]/review",
      params: { draftId: draft.id },
    });
  };
  const onInvalid = (errors: FieldErrors<ScreeningFormValues>) => {
    const invalid = SCREENING_FORM_FIELDS.filter((name) => errors[name] !== undefined);
    announce(t("worker:screening.errorSummary", { count: invalid.length }));
    const first = invalid.find((name) => FOCUSABLE.has(name));
    if (first !== undefined) setFocus(first);
  };
  const review = () => {
    setSubmitAttempted(true);
    void handleSubmit(onValid, onInvalid)();
  };

  const confirmDiscard = async () => {
    setDiscarding(true);
    setDiscardFailed(false);
    try {
      await autosave.flush();
      await discard(draft.id, discardKey);
      toast({ title: (tx) => tx("worker:screening.discarded") });
      router.replace("/screen");
    } catch {
      setDiscardFailed(true);
      setDiscarding(false);
    }
  };

  return (
    <Screen
      testID="screening-form-screen"
      keyboardAvoiding
      header={
        <AppHeader
          title={t("worker:screening.title")}
          onBack={() => void back()}
          actions={
            <IconButton
              icon="more"
              label={t("worker:screening.options")}
              testID="draft-options"
              onPress={() => setMenuOpen(true)}
            />
          }
        />
      }
      footer={
        <View style={styles.footer}>
          <DraftStatusLine status={autosave.status} savedAt={autosave.savedAt} />
          <Button
            icon="check"
            fullWidth
            testID="screening-review"
            disabled={blocked}
            accessibilityHint={t("worker:screening.reviewHint")}
            onPress={review}
          >
            {t("worker:screening.review")}
          </Button>
        </View>
      }
    >
      {blocked ? (
        <View
          style={styles.summary}
          testID="error-summary"
          accessibilityLiveRegion="polite"
          aria-live="polite"
        >
          <View style={styles.summaryHead}>
            <Icon name="alert" size={18} color={colors.danger} />
            <AppText weight="semibold" colorValue={colors.danger} testID="error-summary-title">
              {t("worker:screening.errorSummary", { count: errorFields.length })}
            </AppText>
          </View>
          {errorFields.map((name) => (
            <Pressable
              key={name}
              testID={`error-link-${name}`}
              accessibilityRole="button"
              accessibilityHint={t("worker:screening.errorLinkHint")}
              onPress={() => focusField(name)}
              style={[touchTarget, styles.link]}
            >
              <AppText variant="caption" weight="medium" colorValue={colors.danger}>
                {`• ${t(FIELD_LABEL[name])}`}
              </AppText>
            </Pressable>
          ))}
        </View>
      ) : null}
      <PatientMiniCard patient={patient} now={now} />
      <BloodPressureSection control={control} onFieldBlur={flush} />
      <GlucoseSection control={control} onFieldBlur={flush} unit={values.glucoseUnit} />
      <MeasuredAtField control={control} onFieldBlur={flush} now={now} />
      <ObservationsField control={control} onFieldBlur={flush} />
      <AppText variant="caption" color="muted" testID="screening-source">
        {t("worker:screening.source")}
      </AppText>
      <InfoCallout icon="info" testID="entry-range-note">
        {t("worker:screening.entryRangeNote")}
      </InfoCallout>

      <Sheet
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        title={t("worker:screening.options")}
        testID="draft-options-sheet"
      >
        <Button
          variant="danger"
          fullWidth
          testID="discard-draft"
          onPress={() => {
            setMenuOpen(false);
            setConfirmOpen(true);
          }}
        >
          {t("worker:screening.discard")}
        </Button>
      </Sheet>
      <ConfirmSheet
        visible={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        variant="destructive"
        title={t("worker:screening.discardTitle")}
        description={t("worker:screening.discardDescription", { name: patient.displayName })}
        confirmLabel={t("worker:screening.discard")}
        loading={discarding}
        onConfirm={() => confirmDiscard()}
        testID="discard-confirm"
      >
        {discardFailed ? (
          <AppText colorValue={colors.danger} testID="discard-failed">
            {t("worker:screening.discardFailed")}
          </AppText>
        ) : null}
      </ConfirmSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  footer: { gap: spacing.sm },
  summary: {
    gap: spacing.xs,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: radii.md,
    backgroundColor: colors.dangerSoft,
  },
  summaryHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  link: { justifyContent: "center" },
});
