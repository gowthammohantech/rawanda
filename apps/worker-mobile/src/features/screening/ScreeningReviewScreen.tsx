/**
 * Screening review (HWM-06 tasks 1–5): `/screenings/draft/[draftId]/review`.
 *
 * Loads the draft (author + patient scope re-checked; out of scope → `/denied`) and RE-VALIDATES
 * it with the form schema and the stored ruleset's entry ranges (guards against a stale draft —
 * invalid → banner + "Back to the form", which re-opens the form with its error summary). Then a
 * read-only `ReadingSummaryCard` (values with units, context, measured-at in Kigali time) and the
 * on-device `ExplainableFlagCard` preview (stored demo ruleset; disclaimer always shown).
 *
 * "Save screening" → `submitFromDraft` (one store transaction; double taps are ignored by the
 * busy button, coalesced in the data layer and idempotent by key) → `SubmitSuccess`, bound to the
 * live sync state. A draft already submitted (second visit, restart) shows the result directly.
 */
import type { Screening } from "@laif/domain";
import {
  AppText,
  Button,
  colors,
  EmptyState,
  ErrorState,
  errorCodeOf,
  Icon,
  LoadingState,
  radii,
  Screen,
  spacing,
  useTx,
} from "@laif/ui-native";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { AppHeader } from "../../components/AppHeader.tsx";
import { evaluationInputOf, invalidDraftFields, previewFlag } from "../../data/screenings.ts";
import { useDemoNow } from "../patients/usePatients.ts";
import { ExplainableFlagCard } from "./ExplainableFlagCard.tsx";
import { PatientMiniCard } from "./PatientMiniCard.tsx";
import { ReadingSummaryCard } from "./ReadingSummaryCard.tsx";
import { draftToFormValues } from "./screeningSchema.ts";
import { SubmitSuccess } from "./SubmitSuccess.tsx";
import {
  useReviewDraft,
  useScreeningSync,
  useSubmitScreening,
  type ReviewData,
} from "./useScreenings.ts";

export function ScreeningReviewScreen({ draftId }: { draftId: string }) {
  const t = useTx();
  const router = useRouter();
  const review = useReviewDraft(draftId);
  const now = useDemoNow();
  const [submitted, setSubmitted] = useState<Screening | null>(null);
  const denied = review.data?.status === "denied";

  useEffect(() => {
    if (denied) router.replace({ pathname: "/denied", params: { reason: "patient" } });
  }, [denied, router]);

  const toForm = (revalidate: boolean) =>
    router.replace({
      pathname: "/screenings/draft/[draftId]",
      params: revalidate ? { draftId, revalidate: "1" } : { draftId },
    });
  const header = (
    <AppHeader
      title={t("worker:review.title")}
      onBack={() => (router.canGoBack() ? router.back() : toForm(false))}
    />
  );

  const done = submitted ?? (review.data?.status === "submitted" ? review.data.screening : null);
  if (done !== null) return <SuccessView screening={done} />;

  if (review.isError) {
    const code = errorCodeOf(review.error);
    return (
      <Screen testID="review-error" header={header}>
        <ErrorState
          title={t("worker:review.openFailed")}
          {...(code === undefined ? {} : { code })}
          onRetry={() => review.refetch()}
        />
      </Screen>
    );
  }
  if (review.data?.status === "missing") {
    return (
      <Screen testID="review-missing" header={header}>
        <EmptyState
          icon="file"
          title={t("worker:screening.notFound")}
          description={t("worker:screening.notFoundHint")}
          action={
            <Button testID="back-to-screen" onPress={() => router.replace("/screen")}>
              {t("worker:screening.backToScreen")}
            </Button>
          }
        />
      </Screen>
    );
  }
  if (review.data?.status !== "ok" || now === null) {
    return (
      <Screen testID="review-loading" header={header}>
        <LoadingState variant="skeleton" rows={4} label={t("worker:review.loading")} />
      </Screen>
    );
  }
  return (
    <ReviewBody
      data={review.data}
      now={now}
      header={header}
      onEdit={() => (router.canGoBack() ? router.back() : toForm(false))}
      onInvalid={() => toForm(true)}
      onSubmitted={setSubmitted}
    />
  );
}

function ReviewBody({
  data,
  now,
  header,
  onEdit,
  onInvalid,
  onSubmitted,
}: {
  data: Extract<ReviewData, { status: "ok" }>;
  now: Date;
  header: ReactNode;
  onEdit: () => void;
  onInvalid: () => void;
  onSubmitted: (screening: Screening) => void;
}) {
  const t = useTx();
  const router = useRouter();
  const submit = useSubmitScreening();
  const { draft, patient } = data.access;
  const [stale, setStale] = useState(false);
  const [failed, setFailed] = useState(false);
  const invalid = useMemo(
    () => invalidDraftFields(draft, data.ruleset, now).length > 0,
    [draft, data.ruleset, now],
  );
  const values = draftToFormValues(draft);
  const inputs = evaluationInputOf(values);
  const flag = useMemo(() => previewFlag(draft, data.ruleset), [draft, data.ruleset]);

  const save = async () => {
    setFailed(false);
    try {
      const outcome = await submit(draft.id, now);
      if (outcome.status === "submitted") onSubmitted(outcome.screening);
      else if (outcome.status === "invalid") setStale(true);
      else if (outcome.status === "denied") {
        router.replace({ pathname: "/denied", params: { reason: "patient" } });
      } else setStale(true);
    } catch {
      setFailed(true);
    }
  };

  if (invalid || stale) {
    return (
      <Screen testID="review-invalid" header={header}>
        <View style={styles.banner} testID="review-invalid-banner" accessibilityLiveRegion="polite">
          <View style={styles.bannerHead}>
            <Icon name="alert" size={18} color={colors.danger} />
            <AppText weight="semibold" colorValue={colors.danger}>
              {t("worker:review.invalid.title")}
            </AppText>
          </View>
          <AppText>{t("worker:review.invalid.body")}</AppText>
        </View>
        <Button testID="review-back-to-form" icon="chevron-left" onPress={onInvalid}>
          {t("worker:review.invalid.back")}
        </Button>
      </Screen>
    );
  }

  return (
    <Screen
      testID="review-screen"
      header={header}
      footer={
        <View style={styles.footer}>
          {failed ? (
            <AppText
              colorValue={colors.danger}
              testID="submit-failed"
              accessibilityLiveRegion="polite"
            >
              {t("worker:review.submitFailed")}
            </AppText>
          ) : null}
          <View style={styles.actions}>
            <Button
              variant="secondary"
              testID="review-edit"
              accessibilityHint={t("worker:review.editHint")}
              onPress={onEdit}
              style={styles.flex}
            >
              {t("worker:review.edit")}
            </Button>
            <Button
              icon="check"
              testID="review-submit"
              accessibilityHint={t("worker:review.submitHint")}
              onPress={save}
              style={styles.flex}
            >
              {t("worker:review.submit")}
            </Button>
          </View>
        </View>
      }
    >
      <PatientMiniCard patient={patient} now={now} />
      <AppText variant="caption" color="muted">
        {t("worker:review.readOnly")}
      </AppText>
      <ReadingSummaryCard
        values={{ ...inputs, measuredAt: draft.measuredAt }}
        notes={draft.notes}
        action={
          <Button size="sm" variant="ghost" testID="review-edit-inline" onPress={onEdit}>
            {t("worker:review.edit")}
          </Button>
        }
      />
      <ExplainableFlagCard flag={flag} inputs={inputs} />
    </Screen>
  );
}

function SuccessView({ screening }: { screening: Screening }) {
  const t = useTx();
  const router = useRouter();
  const sync = useScreeningSync(screening);
  return (
    <Screen testID="review-success" header={<AppHeader title={t("worker:review.savedOnDevice")} />}>
      <SubmitSuccess
        sync={sync}
        onBackToToday={() => router.replace("/")}
        onView={() =>
          router.replace({
            pathname: "/screenings/[screeningId]",
            params: { screeningId: screening.id },
          })
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  footer: { gap: spacing.sm },
  actions: { flexDirection: "row", gap: spacing.sm },
  flex: { flex: 1 },
  banner: {
    gap: spacing.xs,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: radii.md,
    backgroundColor: colors.dangerSoft,
  },
  bannerHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
});
