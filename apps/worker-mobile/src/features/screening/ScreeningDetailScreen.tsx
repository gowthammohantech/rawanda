/**
 * Submitted screening (HWM-06 tasks 6–7): `/screenings/[screeningId]`.
 *
 * Status pills: while the `screening.submit` op is pending → `SUBMITTED` + "Waiting for the
 * server…" and the flag marked as a device PREVIEW; once acknowledged → the server-derived
 * `REVIEW REQUIRED` (+ "Sent to clinician queue (simulated)") or `NO REVIEW REQUIRED` with the
 * server flag. `AMENDED` when corrected; `NEEDS DECISION` (amendment 409) links to the Sync
 * center; `NOT ACCEPTED` (server `FORBIDDEN` / validation) explains that the record is kept on
 * the device. Then the reading card (effective values = original + amendments), the flag card
 * (flag-time inputs, disclaimer always), the sync timeline and the corrections list.
 * "Correct a value" (header + body) → `/screenings/[screeningId]/amend`.
 */
import { domainKey } from "@laif/i18n";
import { effectiveReadings, type Patient, type Screening } from "@laif/domain";
import {
  AppText,
  Button,
  colors,
  EmptyState,
  ErrorState,
  errorCodeOf,
  LoadingState,
  radii,
  Screen,
  Section,
  spacing,
  StatusChip,
  SyncStatusPill,
  useTx,
} from "@laif/ui-native";
import { useRouter } from "expo-router";
import { useEffect } from "react";
import { StyleSheet, View } from "react-native";

import { AppHeader } from "../../components/AppHeader.tsx";
import type { ScreeningSyncView } from "../../data/screenings.ts";
import { useDemoNow } from "../patients/usePatients.ts";
import { AmendmentList } from "./AmendmentList.tsx";
import { ExplainableFlagCard } from "./ExplainableFlagCard.tsx";
import { PatientMiniCard } from "./PatientMiniCard.tsx";
import { ReadingSummaryCard } from "./ReadingSummaryCard.tsx";
import { SyncTimeline } from "./SyncTimeline.tsx";
import { useScreening, useScreeningSync } from "./useScreenings.ts";

export function ScreeningDetailScreen({ screeningId }: { screeningId: string }) {
  const t = useTx();
  const router = useRouter();
  const access = useScreening(screeningId);
  const status = access.data?.status;
  const draftId = access.data?.status === "draft" ? access.data.draftId : null;

  useEffect(() => {
    if (status === "denied") router.replace({ pathname: "/denied", params: { reason: "patient" } });
    else if (draftId !== null) {
      router.replace({ pathname: "/screenings/draft/[draftId]", params: { draftId } });
    }
  }, [status, draftId, router]);

  const header = (
    <AppHeader
      title={t("worker:review.detail.title")}
      onBack={() => (router.canGoBack() ? router.back() : router.replace("/"))}
    />
  );
  if (access.isError) {
    const code = errorCodeOf(access.error);
    return (
      <Screen testID="screening-detail-error" header={header}>
        <ErrorState
          title={t("worker:review.detail.openFailed")}
          {...(code === undefined ? {} : { code })}
          onRetry={() => access.refetch()}
        />
      </Screen>
    );
  }
  if (status === "missing") {
    return (
      <Screen testID="screening-detail-missing" header={header}>
        <EmptyState icon="file" title={t("worker:review.detail.notFound")} />
      </Screen>
    );
  }
  if (access.data?.status !== "ok") {
    return (
      <Screen testID="screening-detail-loading" header={header}>
        <LoadingState variant="skeleton" rows={4} label={t("worker:review.detail.loading")} />
      </Screen>
    );
  }
  return <Detail screening={access.data.screening} patient={access.data.patient} />;
}

function Detail({ screening, patient }: { screening: Screening; patient: Patient }) {
  const t = useTx();
  const router = useRouter();
  const now = useDemoNow();
  const sync = useScreeningSync(screening);
  const effective = effectiveReadings(screening);
  const amend = () =>
    router.push({
      pathname: "/screenings/[screeningId]/amend",
      params: { screeningId: screening.id },
    });

  return (
    <Screen
      testID="screening-detail-screen"
      header={
        <AppHeader
          title={t("worker:review.detail.title")}
          onBack={() => (router.canGoBack() ? router.back() : router.replace("/"))}
          actions={
            <Button size="sm" variant="ghost" testID="detail-correct-header" onPress={amend}>
              {t("worker:review.detail.correct")}
            </Button>
          }
        />
      }
    >
      <PatientMiniCard patient={patient} now={now} />
      {sync === null ? (
        <LoadingState variant="skeleton" rows={1} label={t("worker:review.detail.loading")} />
      ) : (
        <StatusBlock screening={screening} sync={sync} onOpenSync={() => router.push("/sync")} />
      )}

      <ReadingSummaryCard
        values={effective}
        amendedFields={effective.amendedFields}
        testID="detail-readings"
      />
      {effective.amendedFields.length > 0 ? (
        <AppText variant="caption" color="muted" testID="amended-note">
          {t("worker:review.detail.amendedNote")}
        </AppText>
      ) : null}

      {sync?.flag ? (
        <ExplainableFlagCard
          flag={sync.flag}
          inputs={{
            systolic: screening.systolic,
            diastolic: screening.diastolic,
            glucoseValue: screening.glucoseValue,
            glucoseUnit: screening.glucoseUnit,
            glucoseContext: screening.glucoseContext,
          }}
          preview={sync.preview}
        />
      ) : null}

      {sync === null ? null : (
        <Section title={t("worker:review.timeline.title")} testID="section-sync">
          <SyncTimeline sync={sync} />
        </Section>
      )}

      <Section
        title={t("worker:review.amendments.title")}
        testID="section-amendments"
        action={
          <Button size="sm" variant="ghost" testID="detail-correct" onPress={amend}>
            {t("worker:review.detail.correct")}
          </Button>
        }
      >
        <AmendmentList screening={screening} />
      </Section>
      <AppText variant="caption" color="muted" testID="immutable-note">
        {t("worker:review.detail.immutable")}
      </AppText>
    </Screen>
  );
}

function StatusBlock({
  screening,
  sync,
  onOpenSync,
}: {
  screening: Screening;
  sync: ScreeningSyncView;
  onOpenSync: () => void;
}) {
  const t = useTx();
  const reviewRequired = sync.serverStatus === "review_required";
  return (
    <View style={styles.status} testID="detail-status">
      <View style={styles.pills}>
        {sync.serverStatus === null ? (
          <StatusChip tone="neutral" testID="status-submitted">
            {t(domainKey("status.screening", "submitted"))}
          </StatusChip>
        ) : (
          <StatusChip
            tone={reviewRequired ? "info" : "positive"}
            testID={reviewRequired ? "status-review-required" : "status-no-review-required"}
          >
            {t(domainKey("status.screening", sync.serverStatus))}
          </StatusChip>
        )}
        {screening.amendments.length > 0 ? (
          <StatusChip tone="info" icon="file" testID="status-amended">
            {t("worker:review.detail.amended")}
          </StatusChip>
        ) : null}
        {sync.needsDecision ? (
          <StatusChip tone="danger" testID="status-needs-decision">
            {t("worker:review.detail.needsDecision")}
          </StatusChip>
        ) : sync.rejected ? (
          <StatusChip tone="danger" icon="octagon-alert" testID="status-not-accepted">
            {t("worker:review.detail.notAccepted")}
          </StatusChip>
        ) : sync.willRetry ? (
          <StatusChip tone="warning" icon="refresh" testID="status-will-retry">
            {t("worker:review.detail.willRetry")}
          </StatusChip>
        ) : null}
      </View>
      <SyncStatusPill state={sync.state} announceChanges testID="detail-sync-pill" />
      <AppText
        variant="caption"
        color="muted"
        testID="status-note"
        accessibilityLiveRegion="polite"
      >
        {sync.serverStatus === null
          ? t("worker:review.detail.awaitingServer")
          : reviewRequired
            ? t("worker:review.detail.sentToQueue")
            : t("worker:review.detail.noReviewRequested")}
      </AppText>
      {sync.needsDecision ? (
        <View style={[styles.callout, styles.danger]} testID="needs-decision-callout">
          <AppText>{t("worker:review.detail.needsDecisionBody")}</AppText>
          <Button size="sm" variant="secondary" testID="open-sync-center" onPress={onOpenSync}>
            {t("worker:review.detail.openSync")}
          </Button>
        </View>
      ) : null}
      {sync.rejected ? (
        <View style={[styles.callout, styles.danger]} testID="not-accepted-callout">
          <AppText>
            {t("worker:review.detail.notAcceptedBody", {
              code: sync.createOp?.lastError?.reason ?? sync.createOp?.lastError?.code ?? "—",
            })}
          </AppText>
          <Button size="sm" variant="secondary" testID="open-sync-center" onPress={onOpenSync}>
            {t("worker:review.detail.openSync")}
          </Button>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  status: { gap: spacing.sm },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  callout: { gap: spacing.sm, padding: spacing.md, borderWidth: 1, borderRadius: radii.md },
  danger: { borderColor: colors.danger, backgroundColor: colors.dangerSoft },
});
