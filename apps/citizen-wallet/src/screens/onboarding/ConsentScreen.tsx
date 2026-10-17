/**
 * Consent (CTZ-02 task 6): summary, privacy notice (`demo-notice-v0.1`), required "I have read
 * this", Give consent (one record + one audit even on double tap: busy button, submit guard and
 * a stable idempotency key) → toast → tabs. "Not now" ends the session (no data access).
 * Stale state (consent changed elsewhere) → "Here is the latest" notice.
 */
import { CITIZEN_NOTICE_VERSION } from "@laif/contracts";
import { RepositoryError } from "@laif/repositories";
import {
  AppHeader,
  AppText,
  Button,
  CheckboxField,
  EmptyState,
  ErrorState,
  InfoCallout,
  LoadingState,
  Screen,
  spacing,
  useToast,
  useTx,
} from "@laif/ui-native";
import { Redirect, useRouter } from "expo-router";
import { useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { ConsentSummary } from "../../components/ConsentSummary.tsx";
import { InlineError } from "../../components/InlineError.tsx";
import { PrivacyNoticeSheet } from "../../components/PrivacyNoticeSheet.tsx";
import { SyntheticNotice } from "../../components/SyntheticNotice.tsx";
import { newIdempotencyKey } from "../../data/keys.ts";
import { useCitizenSession, useConsent, useRecordConsent } from "../../data/queries.ts";
import { usePersona, useWallet } from "../../providers.tsx";
import { accountGate, HREFS } from "../../state/access.ts";
import { useWalletActions } from "../../state/useWalletActions.ts";

export function ConsentScreen() {
  const t = useTx();
  const router = useRouter();
  const { toast } = useToast();
  const persona = usePersona();
  const lastTab = useWallet((s) => s.lastTab);
  const session = useCitizenSession();
  const patientId = session.data?.activePatientId ?? null;
  const consent = useConsent(patientId);
  const record = useRecordConsent();
  const { endSession } = useWalletActions();
  const [read, setRead] = useState(false);
  const [readError, setReadError] = useState(false);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [saved, setSaved] = useState(false);
  const keyRef = useRef(newIdempotencyKey());
  const submitting = useRef(false);

  const notNow = async () => {
    router.replace(HREFS.persona);
    await endSession();
  };
  const header = <AppHeader title={t("citizen:consent.title")} />;

  if (persona === null) return <Redirect href="/welcome" />;
  if (session.isPending || (patientId !== null && consent.isPending)) {
    return (
      <Screen testID="consent-screen" header={header}>
        <LoadingState variant="skeleton" rows={3} />
      </Screen>
    );
  }
  if (session.isError || consent.isError) {
    return (
      <Screen testID="consent-screen" header={header}>
        <ErrorState onRetry={() => (session.isError ? session.refetch() : consent.refetch())} />
      </Screen>
    );
  }
  const gate = accountGate(session.data);
  if (gate !== null && gate !== HREFS.consent) return <Redirect href={gate} />;

  if (patientId === null) {
    return (
      <Screen
        testID="consent-screen"
        header={header}
        footer={
          <Button variant="secondary" fullWidth onPress={notNow}>
            {t("citizen:consent.backToPersonas")}
          </Button>
        }
      >
        <EmptyState
          icon="shield"
          title={t("citizen:consent.noRecordTitle")}
          description={t("citizen:consent.noRecordBody")}
        />
      </Screen>
    );
  }

  const state = consent.data?.state ?? "not_recorded";
  if (state === "granted" && !conflict && !saved) return <Redirect href={`/${lastTab}`} />;
  const patientName = session.data?.patients.find((p) => p.patientId === patientId)?.displayName;

  const give = async () => {
    if (submitting.current) return;
    if (!read) {
      setReadError(true);
      return;
    }
    submitting.current = true;
    setSaveError(false);
    try {
      await record.mutateAsync({
        input: { patientId, action: "granted", noticeVersion: CITIZEN_NOTICE_VERSION },
        key: keyRef.current,
      });
      setSaved(true);
      toast({ title: t("citizen:consent.saved"), tone: "positive" });
      router.replace("/health");
    } catch (error) {
      if (
        error instanceof RepositoryError &&
        (error.code === "CONFLICT" || error.reason === "INVALID_TRANSITION")
      ) {
        keyRef.current = newIdempotencyKey();
        setConflict(true);
        await consent.refetch();
      } else {
        setSaveError(true);
      }
    } finally {
      submitting.current = false;
    }
  };

  if (conflict) {
    return (
      <Screen
        testID="consent-screen"
        header={header}
        footer={
          state === "granted" ? (
            <Button fullWidth onPress={() => router.replace("/health")}>
              {t("citizen:onboarding.continue")}
            </Button>
          ) : (
            <Button fullWidth onPress={() => setConflict(false)}>
              {t("citizen:consent.give")}
            </Button>
          )
        }
      >
        <InfoCallout icon="refresh" tone="info" testID="consent-conflict">
          {t("citizen:consent.conflict")}
        </InfoCallout>
        <AppText weight="semibold">
          {state === "granted"
            ? t("citizen:consent.stateGranted")
            : state === "withdrawn"
              ? t("citizen:consent.stateWithdrawn")
              : t("citizen:consent.stateNone")}
        </AppText>
      </Screen>
    );
  }

  return (
    <Screen
      testID="consent-screen"
      header={header}
      footer={
        <View style={styles.actions}>
          <Button fullWidth onPress={give} loading={record.isPending} testID="consent-give">
            {t("citizen:consent.give")}
          </Button>
          <Button variant="ghost" fullWidth onPress={notNow} disabled={record.isPending}>
            {t("citizen:consent.notNow")}
          </Button>
        </View>
      }
    >
      <AppText>{t("citizen:consent.intro")}</AppText>
      {patientName === undefined ? null : (
        <AppText variant="caption" color="muted">
          {t("citizen:consent.forPatient", { name: patientName })}
        </AppText>
      )}
      <SyntheticNotice />
      <ConsentSummary />
      <Button variant="secondary" icon="file" onPress={() => setNoticeOpen(true)}>
        {t("citizen:consent.noticeOpen")}
      </Button>
      {saveError ? <ErrorState message={t("citizen:consent.saveError")} onRetry={give} /> : null}
      <View>
        <CheckboxField
          label={t("citizen:consent.confirmRead")}
          checked={read}
          onChange={(checked) => {
            setRead(checked);
            if (checked) setReadError(false);
          }}
          testID="consent-read"
        />
        <InlineError
          message={readError ? t("citizen:validation.mustConfirmRead") : null}
          testID="consent-read-error"
        />
      </View>
      <PrivacyNoticeSheet visible={noticeOpen} onClose={() => setNoticeOpen(false)} />
    </Screen>
  );
}

const styles = StyleSheet.create({ actions: { gap: spacing.sm } });
