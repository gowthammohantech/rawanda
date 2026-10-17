/**
 * Patient context (HWM-04 task 3): header card, "Recent screenings" (read-only), "Open
 * follow-ups" (→ task detail) and the primary "New screening" (→ `/screenings/new?patientId=`).
 *
 * Loading by id re-checks the facility scope (`data/patients.get`): outside the signed-in
 * facility, or not on this device → `router.replace('/denied?reason=patient')` with an
 * `access.denied` audit; nothing of the patient (name, id) is ever rendered. A successful open
 * audits `patient.viewed` (sensitive read, FRD §7) and marks the patient as Recent.
 */
import { domainKey, formatDate, useLanguage } from "@laif/i18n";
import {
  Button,
  EmptyState,
  ErrorState,
  errorCodeOf,
  ListRow,
  LoadingState,
  Screen,
  Section,
  spacing,
  useTx,
} from "@laif/ui-native";
import { useRouter } from "expo-router";
import { useEffect } from "react";
import { StyleSheet, View } from "react-native";

import { AppHeader } from "../../components/AppHeader.tsx";
import { PatientHeaderCard } from "./PatientHeaderCard.tsx";
import { ScreeningHistoryList } from "./ScreeningHistoryList.tsx";
import { useDemoNow, usePatientAccess, usePatientHistory } from "./usePatients.ts";

export function PatientContextScreen({ patientId }: { patientId: string }) {
  const t = useTx();
  const router = useRouter();
  const { language } = useLanguage();
  const now = useDemoNow();
  const access = usePatientAccess(patientId);
  const allowed = access.data?.status === "ok";
  const history = usePatientHistory(patientId, allowed);
  const denied = access.data?.status === "denied";

  useEffect(() => {
    if (denied) router.replace({ pathname: "/denied", params: { reason: "patient" } });
  }, [denied, router]);

  const back = () => (router.canGoBack() ? router.back() : router.replace("/patients"));
  const header = <AppHeader title={t("worker:patients.context.title")} onBack={back} />;

  if (access.isError) {
    const code = errorCodeOf(access.error);
    return (
      <Screen testID="patient-context-error" header={header}>
        <ErrorState
          title={t("worker:patients.context.error")}
          {...(code === undefined ? {} : { code })}
          onRetry={() => access.refetch()}
        />
      </Screen>
    );
  }
  if (access.data?.status !== "ok") {
    // Loading, or denied (redirecting): never any patient detail.
    return (
      <Screen testID="patient-context-loading" header={header}>
        <LoadingState variant="skeleton" rows={3} label={t("worker:patients.context.loading")} />
      </Screen>
    );
  }

  const patient = access.data.patient;
  const data = history.data;
  return (
    <Screen
      testID="patient-context-screen"
      header={header}
      footer={
        <Button
          icon="plus"
          fullWidth
          testID="new-screening"
          onPress={() =>
            router.push({ pathname: "/screenings/new", params: { patientId: patient.id } })
          }
        >
          {t("worker:patients.context.newScreening")}
        </Button>
      }
    >
      <PatientHeaderCard patient={patient} now={now} onOpenSync={() => router.push("/sync")} />
      <Section title={t("worker:patients.context.recentScreenings")} testID="section-screenings">
        {history.isError ? (
          <ErrorState
            title={t("worker:patients.context.error")}
            onRetry={() => history.refetch()}
          />
        ) : data === undefined ? (
          <LoadingState variant="skeleton" rows={2} label={t("worker:patients.context.loading")} />
        ) : (
          <ScreeningHistoryList screenings={data.screenings} />
        )}
      </Section>
      <Section title={t("worker:patients.context.openFollowUps")} testID="section-follow-ups">
        {data === undefined ? (
          history.isError ? null : (
            <LoadingState
              variant="skeleton"
              rows={1}
              label={t("worker:patients.context.loading")}
            />
          )
        ) : data.openFollowUps.length === 0 ? (
          <View testID="follow-ups-empty">
            <EmptyState icon="clipboard" title={t("worker:patients.context.noFollowUps")} />
          </View>
        ) : (
          <View style={styles.list} testID="open-follow-ups">
            {data.openFollowUps.map((followUp) => {
              const purpose = t(domainKey("followUpPurpose", followUp.purpose));
              const due = t("worker:patients.context.followUpDue", {
                date: formatDate(followUp.dueAt, language),
              });
              return (
                <ListRow
                  key={followUp.id}
                  testID={`patient-follow-up-${followUp.id}`}
                  icon="clipboard"
                  title={purpose}
                  subtitle={due}
                  meta={t(domainKey("status.followUp", followUp.status))}
                  accessibilityHint={t("worker:patients.context.followUpHint")}
                  onPress={() =>
                    router.push({
                      pathname: "/tasks/[followUpId]",
                      params: { followUpId: followUp.id },
                    })
                  }
                />
              );
            })}
          </View>
        )}
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({ list: { gap: spacing.sm } });
