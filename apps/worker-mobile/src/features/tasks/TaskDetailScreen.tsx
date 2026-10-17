/**
 * Task detail (HWM-07 task 5–7). Loading re-checks scope (assigned to me + my facility): anything
 * else → `router.replace('/denied?reason=task')` with an `access.denied` audit and NOTHING of the
 * patient rendered (T-02). A successful open audits `followup.viewed` once. Shows the header
 * (status, due, assigned by, created, derived overdue), patient context with the latest reading
 * + units, the linked referral ("Set by clinician"), the attempt timeline and the sticky actions.
 *
 * States: loading → skeleton cards; conflict → `NEEDS DECISION` banner linking to Sync; offline →
 * full read access, actions stay enabled; read failure → ErrorState + Retry.
 */
import {
  Button,
  Card,
  ErrorState,
  errorCodeOf,
  LoadingState,
  Screen,
  StatusChip,
  AppText,
  spacing,
  useTx,
} from "@laif/ui-native";
import { useRouter } from "expo-router";
import { useEffect } from "react";
import { StyleSheet, View } from "react-native";

import { AppHeader } from "../../components/AppHeader.tsx";
import { useSyncStatus } from "../../data/hooks/useSyncStatus.ts";
import { AttemptTimeline } from "./AttemptTimeline.tsx";
import { PatientContextCard } from "./PatientContextCard.tsx";
import { ReferralContextCard } from "./ReferralContextCard.tsx";
import { TaskActionsBar } from "./TaskActionsBar.tsx";
import { TaskHeaderCard } from "./TaskHeaderCard.tsx";
import { useTaskDetail } from "./useTaskDetail.ts";

export function TaskDetailScreen({ followUpId }: { followUpId: string }) {
  const t = useTx();
  const router = useRouter();
  const sync = useSyncStatus();
  const view = useTaskDetail(followUpId);
  const denied = view.status === "denied";

  useEffect(() => {
    if (denied) router.replace({ pathname: "/denied", params: { reason: "task" } });
  }, [denied, router]);

  const back = () => (router.canGoBack() ? router.back() : router.replace("/tasks"));
  const header = <AppHeader title={t("worker:tasks.detail.title")} onBack={back} />;

  if (view.status === "error") {
    const code = errorCodeOf(view.error);
    return (
      <Screen testID="task-detail-error" header={header} offline={sync.offline}>
        <ErrorState
          title={t("worker:tasks.detail.error")}
          {...(code === undefined ? {} : { code })}
          onRetry={() => view.refetch()}
        />
      </Screen>
    );
  }
  if (view.status !== "ready" || view.detail === undefined) {
    // Loading, or denied (redirecting): never any patient detail.
    return (
      <Screen testID="task-detail-loading" header={header} offline={sync.offline}>
        <LoadingState variant="skeleton" rows={3} label={t("worker:tasks.detail.loading")} />
      </Screen>
    );
  }

  const detail = view.detail;
  const { followUp } = detail;
  const name = detail.patient?.displayName ?? t("worker:tasks.row.unknownPatient");
  const params = { followUpId: followUp.id };

  return (
    <Screen
      testID="task-detail-screen"
      header={header}
      offline={sync.offline}
      footer={
        <TaskActionsBar
          followUp={followUp}
          onRecordAttempt={() => router.push({ pathname: "/tasks/[followUpId]/attempt", params })}
          onRecordOutcome={() => router.push({ pathname: "/tasks/[followUpId]/outcome", params })}
        />
      }
    >
      {detail.syncState === "conflict" ? (
        <Card testID="task-conflict-banner">
          <View style={styles.banner}>
            <StatusChip tone="danger" icon="alert">
              {t("worker:tasks.needsDecision")}
            </StatusChip>
            <AppText weight="semibold">{t("worker:tasks.detail.conflictTitle")}</AppText>
            <AppText color="muted">{t("worker:tasks.detail.conflictBody")}</AppText>
            <Button
              variant="secondary"
              icon="sync"
              testID="task-open-sync"
              onPress={() => router.push("/sync")}
            >
              {t("worker:tasks.detail.openSync")}
            </Button>
          </View>
        </Card>
      ) : null}
      <TaskHeaderCard detail={detail} name={name} />
      <PatientContextCard
        patient={detail.patient}
        latestScreening={detail.latestScreening}
        clinicianReason={detail.referral?.referralReason ?? null}
        now={new Date(Date.parse(detail.nowIso))}
        onOpenPatient={(patientId) =>
          router.push({ pathname: "/patients/[patientId]", params: { patientId } })
        }
      />
      {detail.referral === null ? null : <ReferralContextCard referral={detail.referral} />}
      <AttemptTimeline detail={detail} />
    </Screen>
  );
}

const styles = StyleSheet.create({ banner: { gap: spacing.sm, alignItems: "flex-start" } });
