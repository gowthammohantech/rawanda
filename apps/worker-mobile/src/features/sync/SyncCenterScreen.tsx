/**
 * Sync center (HWM-09): the worker's one place for "saved on this device" vs "synced". CONNECTION
 * card, Sync now, then the queue — Needs your decision (first, danger) · Waiting to sync · Not
 * accepted · Synced recently. Every action goes through the FND-07 sync queue against the
 * SIMULATED sync server.
 *
 * States: loading → section skeletons; empty → "Everything on this device is synced" with the
 * last sync time; offline → Sync now disabled with the reason (OfflineBanner); server error →
 * result toast + rows with plain-language error and next retry; conflict → decision section
 * first; permission denied → Not accepted with explanation; success → toast, rows move to Synced
 * recently, the live region announces the counts. HWM-10: a device clock more than 5 min off the
 * simulated server shows the clock-drift warning row.
 */
import { formatDateTime, useLanguage } from "@laif/i18n";
import {
  colors,
  EmptyState,
  ErrorState,
  errorCodeOf,
  LoadingState,
  Screen,
  spacing,
  useTx,
} from "@laif/ui-native";
import { useRouter } from "expo-router";
import { useState } from "react";
import { RefreshControl, ScrollView, StyleSheet } from "react-native";

import { AppHeader } from "../../components/AppHeader.tsx";
import { ClockDriftNotice } from "../../components/ClockDriftNotice.tsx";
import type { SyncOpRow } from "../../data/syncCenter.ts";
import { useNetwork } from "../../network/NetworkProvider.tsx";
import { useSyncRunning } from "../../sync/SyncTriggersProvider.tsx";
import { ConnectionCard } from "./ConnectionCard.tsx";
import { OpRow } from "./OpRow.tsx";
import { QueueSection } from "./QueueSection.tsx";
import { SyncHistoryList } from "./SyncHistoryList.tsx";
import { SyncNowButton } from "./SyncNowButton.tsx";
import { useRetryNow, useSyncCenter, useSyncNow } from "./useSyncCenter.ts";

export function SyncCenterScreen() {
  const t = useTx();
  const router = useRouter();
  const { language } = useLanguage();
  const { offline } = useNetwork();
  const running = useSyncRunning();
  const center = useSyncCenter();
  const syncNow = useSyncNow();
  const retryNow = useRetryNow();
  const [retrying, setRetrying] = useState<string | null>(null);
  const data = center.data;

  const openOp = (opId: string) => router.push({ pathname: "/sync/[opId]", params: { opId } });
  const openConflict = (opId: string) =>
    router.push({ pathname: "/sync/conflicts/[opId]", params: { opId } });
  const retry = (row: SyncOpRow) => {
    setRetrying(row.op.id);
    void retryNow(row.op).finally(() => setRetrying(null));
  };

  const lastSyncedAt = data?.status.lastSyncedAt ?? null;
  const open =
    data === undefined
      ? 0
      : data.sections.decision.length +
        data.sections.waiting.length +
        data.sections.notAccepted.length;

  return (
    <Screen
      testID="sync-screen"
      edges={["top", "left", "right"]}
      scroll={false}
      offline={offline}
      {...(lastSyncedAt === null
        ? {}
        : { lastSyncedLabel: formatDateTime(lastSyncedAt, language) })}
      header={<AppHeader title={t("worker:sync.title")} />}
    >
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={center.isRefetching && !running}
            onRefresh={() => void center.refetch()}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        <ConnectionCard
          offline={offline}
          lastSyncedAt={lastSyncedAt}
          pending={data?.badgeCount ?? 0}
          onOpenNetwork={() => router.push("/settings/network")}
        />
        <ClockDriftNotice testID="sync-clock-drift" />
        <SyncNowButton offline={offline} running={running} onPress={() => void syncNow()} />

        {center.status === "error" ? (
          <ErrorState
            title={t("worker:sync.loadError")}
            {...(errorCodeOf(center.error) === undefined
              ? {}
              : { code: errorCodeOf(center.error) as string })}
            onRetry={() => center.refetch()}
          />
        ) : data === undefined ? (
          <LoadingState variant="skeleton" rows={3} label={t("worker:sync.loading")} />
        ) : (
          <>
            {open === 0 ? (
              <EmptyState
                icon="check"
                title={t("worker:sync.empty.title")}
                description={
                  lastSyncedAt === null
                    ? t("worker:sync.empty.never")
                    : t("worker:sync.empty.lastSync", {
                        time: formatDateTime(lastSyncedAt, language),
                      })
                }
              />
            ) : null}
            {data.sections.decision.length > 0 ? (
              <QueueSection section="decision" count={data.sections.decision.length}>
                {data.sections.decision.map((row) => (
                  <OpRow
                    key={row.op.id}
                    row={row}
                    section="decision"
                    onOpen={openOp}
                    onResolve={openConflict}
                  />
                ))}
              </QueueSection>
            ) : null}
            {data.sections.waiting.length > 0 ? (
              <QueueSection section="waiting" count={data.sections.waiting.length}>
                {data.sections.waiting.map((row) => (
                  <OpRow
                    key={row.op.id}
                    row={row}
                    section="waiting"
                    onOpen={openOp}
                    onRetry={retry}
                    retrying={retrying === row.op.id}
                  />
                ))}
              </QueueSection>
            ) : null}
            {data.sections.notAccepted.length > 0 ? (
              <QueueSection section="notAccepted" count={data.sections.notAccepted.length}>
                {data.sections.notAccepted.map((row) => (
                  <OpRow key={row.op.id} row={row} section="notAccepted" onOpen={openOp} />
                ))}
              </QueueSection>
            ) : null}
            <SyncHistoryList rows={data.sections.synced} onOpen={openOp} />
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.lg },
});
