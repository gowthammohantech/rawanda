/**
 * Correction request detail (CTZ-07 task 11): stepper Submitted → With care team → Resolved,
 * reference, sent date, the subject, the citizen's own words (verbatim), the status in plain
 * words and — once resolved — the seeded outcome key. `resolved_amended` links to the CTZ-06
 * "what changed" view (original retained, T-06). One mount = one `citizen.correction.viewed`.
 */
import { formatDate, useLanguage } from "@laif/i18n";
import { RepositoryError } from "@laif/repositories";
import {
  AppText,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  PermissionDenied,
  Screen,
  Section,
  spacing,
  useTx,
  type TranslationKey,
} from "@laif/ui-native";
import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { ConsentRequiredState } from "../../components/ConsentRequiredState.tsx";
import { WalletHeader } from "../../components/WalletHeader.tsx";
import { useCorrectionRequest, useCorrectionTargets } from "../../data/queries.ts";
import { RepresentativeBanner } from "../health/RepresentativeBanner.tsx";
import { useActivePatient } from "../health/useResults.ts";
import type { TimelineChange } from "../timeline/buildCitizenTimeline.ts";
import { ChangeDetailSheet } from "../timeline/ChangeDetailSheet.tsx";
import { useChangeViewLog } from "../timeline/useTimeline.ts";
import { correctionRef, requestTargetLabel, resolutionKeyOf } from "./copy.ts";
import { CorrectionStatusChip } from "./CorrectionRequestRow.tsx";
import { CorrectionStatusStepper } from "./CorrectionStatusStepper.tsx";
import { RecordUnchangedNote } from "./RecordUnchangedNote.tsx";

export function CorrectionDetailScreen({ requestId }: { requestId: string }) {
  const t = useTx();
  const { language } = useLanguage();
  const router = useRouter();
  const patient = useActivePatient();
  const patientId = patient?.patientId ?? null;
  const request = useCorrectionRequest(patientId, requestId);
  const targets = useCorrectionTargets(patientId);
  const logChange = useChangeViewLog(patientId);
  const [change, setChange] = useState<TimelineChange | null>(null);
  const back = () =>
    router.canGoBack() ? router.back() : router.replace("/more/privacy/corrections");
  const backButton = (
    <Button variant="secondary" icon="chevron-left" onPress={back} testID="correction-back">
      {t("citizen:correction.detail.back")}
    </Button>
  );

  // The amended result this request is about (for "See what changed").
  const target = targets.data?.find(
    (x) => x.targetType === request.data?.targetType && x.targetId === request.data?.targetId,
  );
  const amendment =
    target?.targetType === "screening" ? (target.observation.amendments.at(-1) ?? null) : null;

  let body;
  const error = request.isError ? request.error : null;
  if (error instanceof RepositoryError && error.code === "FORBIDDEN") {
    body =
      error.reason === "CONSENT_REQUIRED" ? (
        <ConsentRequiredState />
      ) : (
        <PermissionDenied
          title={t("citizen:correction.detail.deniedTitle")}
          message={t("citizen:correction.detail.denied")}
          action={backButton}
        />
      );
  } else if (error instanceof RepositoryError && error.code === "NOT_FOUND") {
    body = (
      <EmptyState
        icon="file"
        title={t("citizen:correction.detail.notFoundTitle")}
        description={t("citizen:correction.detail.notFound")}
        action={backButton}
      />
    );
  } else if (error !== null) {
    body = <ErrorState message={t("citizen:privacy.error")} onRetry={() => request.refetch()} />;
  } else if (request.data === undefined) {
    body = <LoadingState variant="skeleton" rows={2} label={t("citizen:privacy.loading")} />;
  } else {
    const r = request.data;
    const resolved = r.status === "resolved_amended" || r.status === "resolved_no_change";
    body = (
      <View style={styles.root} testID="correction-detail">
        <RepresentativeBanner patient={patient} />
        <Card
          eyebrow={t("citizen:correction.detail.reference", { ref: correctionRef(r.id) })}
          title={requestTargetLabel(t, r, targets.data, language)}
          meta={<CorrectionStatusChip status={r.status} />}
          testID="correction-summary-card"
        >
          <CorrectionStatusStepper status={r.status} />
          <AppText testID="correction-status-body">
            {t(`citizen:correction.statusBody.${r.status}` as TranslationKey)}
          </AppText>
          <AppText variant="caption" color="muted" testID="correction-sent-on">
            {t("citizen:correction.detail.sentOn", { date: formatDate(r.createdAt, language) })}
          </AppText>
        </Card>

        <Section title={t("citizen:correction.detail.description")}>
          {/* The citizen's own words, verbatim (never translated). */}
          <AppText testID="correction-description-text">{r.description}</AppText>
        </Section>
        {r.suggestedText === null ? null : (
          <Section title={t("citizen:correction.detail.suggested")}>
            <AppText testID="correction-suggested-text">{r.suggestedText}</AppText>
          </Section>
        )}

        {resolved ? (
          <Section title={t("citizen:correction.detail.outcome")} testID="correction-outcome">
            <AppText testID="correction-resolution">{t(resolutionKeyOf(r.resolutionKey))}</AppText>
            {r.status === "resolved_amended" && amendment !== null && target !== undefined ? (
              <Button
                variant="secondary"
                icon="eye"
                onPress={() =>
                  setChange({
                    observationId: target.targetId,
                    field: amendment.field,
                    before: amendment.before,
                    after: amendment.after,
                    amendedBy: amendment.amendedBy,
                    amendedAt: amendment.amendedAt,
                    reasonKey: amendment.reasonKey,
                  })
                }
                testID="correction-see-change"
              >
                {t("citizen:correction.detail.seeChange")}
              </Button>
            ) : null}
          </Section>
        ) : (
          <RecordUnchangedNote />
        )}
      </View>
    );
  }

  return (
    <Screen
      testID="correction-detail-screen"
      edges={["top", "left", "right"]}
      header={<WalletHeader title={t("citizen:correction.detail.title")} onBack={back} />}
    >
      {body}
      <ChangeDetailSheet
        change={change}
        onClose={() => setChange(null)}
        onOpened={logChange}
        onOpenResult={(observationId) => {
          setChange(null);
          router.push({ pathname: "/health/[observationId]", params: { observationId } });
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({ root: { gap: spacing.lg } });
