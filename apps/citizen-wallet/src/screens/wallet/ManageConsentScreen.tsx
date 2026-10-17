/**
 * More → Consent (CTZ-02 task 9): current state + date; "Stop sharing" → ConfirmSheet (explains
 * the effect and that clinical records are NOT deleted) → `recordConsent({ action: 'withdrawn' })`
 * → `consentWithdrawn` event (CTZ-05 reminder hook) → consent-withdrawn screen.
 *
 * The sheet uses the default (not "destructive") variant: the kit's destructive variant adds
 * "This cannot be undone." — untrue here (consent can be given again). The confirm button is
 * still labelled with the effect ("Stop sharing").
 */
import { CITIZEN_NOTICE_VERSION } from "@laif/contracts";
import { formatDate, useLanguage } from "@laif/i18n";
import {
  AppText,
  Button,
  Card,
  ConfirmSheet,
  ErrorState,
  LoadingState,
  Screen,
  StatusChip,
  useToast,
  useTx,
} from "@laif/ui-native";
import { useRouter } from "expo-router";
import { useRef, useState } from "react";

import { InlineError } from "../../components/InlineError.tsx";
import { WalletHeader } from "../../components/WalletHeader.tsx";
import { newIdempotencyKey } from "../../data/keys.ts";
import { useConsent, useRecordConsent } from "../../data/queries.ts";
import { usePersona, useWallet } from "../../providers.tsx";
import { HREFS } from "../../state/access.ts";
import { emitConsentWithdrawn } from "../../state/events.ts";

export function ManageConsentScreen() {
  const t = useTx();
  const router = useRouter();
  const { toast } = useToast();
  const { language } = useLanguage();
  const persona = usePersona();
  const patientId = useWallet((s) => s.activePatientId);
  const consent = useConsent(patientId);
  const record = useRecordConsent();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const keyRef = useRef(newIdempotencyKey());

  const header = (
    <WalletHeader
      title={t("citizen:consent.manageTitle")}
      onBack={() => (router.canGoBack() ? router.back() : router.replace("/more"))}
    />
  );

  const withdraw = async () => {
    if (patientId === null) return;
    setFailed(false);
    try {
      await record.mutateAsync({
        input: { patientId, action: "withdrawn", noticeVersion: CITIZEN_NOTICE_VERSION },
        key: keyRef.current,
      });
      keyRef.current = newIdempotencyKey();
      setConfirmOpen(false);
      emitConsentWithdrawn({ patientId, personaId: persona?.id ?? null });
      toast({ title: t("citizen:consent.withdrawnTitle") });
      router.replace(HREFS.withdrawn);
    } catch {
      setConfirmOpen(false);
      setFailed(true);
    }
  };

  if (consent.isPending) {
    return (
      <Screen testID="manage-consent-screen" header={header} edges={["top", "left", "right"]}>
        <LoadingState />
      </Screen>
    );
  }
  if (consent.isError) {
    return (
      <Screen testID="manage-consent-screen" header={header} edges={["top", "left", "right"]}>
        <ErrorState onRetry={() => consent.refetch()} />
      </Screen>
    );
  }
  const { state, latest } = consent.data;
  const granted = state === "granted";

  return (
    <Screen
      testID="manage-consent-screen"
      header={header}
      edges={["top", "left", "right"]}
      footer={
        granted ? (
          <Button variant="danger" fullWidth onPress={() => setConfirmOpen(true)} testID="withdraw">
            {t("citizen:consent.withdraw")}
          </Button>
        ) : (
          <Button fullWidth onPress={() => router.push(HREFS.consent)}>
            {t("citizen:consent.give")}
          </Button>
        )
      }
    >
      <Card
        title={
          granted
            ? t("citizen:consent.stateGranted")
            : state === "withdrawn"
              ? t("citizen:consent.stateWithdrawn")
              : t("citizen:consent.stateNone")
        }
        meta={
          <StatusChip tone={granted ? "positive" : "neutral"}>
            {granted
              ? t("citizen:onboarding.persona.stateConsentGiven")
              : t("citizen:onboarding.persona.stateConsentWithdrawn")}
          </StatusChip>
        }
        testID="consent-state"
      >
        {latest === null ? null : (
          <AppText color="muted">
            {t("citizen:consent.since", { date: formatDate(latest.recordedAt, language) })}
          </AppText>
        )}
      </Card>
      <AppText color="muted">{t("citizen:consent.summaryWithdrawBody")}</AppText>
      <InlineError message={failed ? t("citizen:consent.withdrawError") : null} />
      <ConfirmSheet
        visible={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={t("citizen:consent.confirmTitle")}
        description={t("citizen:consent.confirmBody")}
        confirmLabel={t("citizen:consent.withdraw")}
        loading={record.isPending}
        onConfirm={withdraw}
        testID="withdraw-confirm"
      />
    </Screen>
  );
}
