/**
 * Settings → Activity log (HWM-10 task 8): the device's audit events + events mirrored from the
 * simulated sync server, newest first, filterable by type (session, patient, screening,
 * follow-up, sync, settings). Each row: action label (`domain:audit.<action>`), actor, time
 * (Africa/Kigali), source, entity short id and correlation id. Read-only. Data from FND-07
 * `repo.device.listActivity()` — audit metadata only (no snapshots, notes or free text).
 */
import { formatDateTime, useLanguage } from "@laif/i18n";
import { DEMO_PERSONAS } from "@laif/mock-data";
import {
  auditActionLabelKey,
  type AuditAction,
  type DeviceActivityEntry,
} from "@laif/repositories";
import {
  AppText,
  Card,
  EmptyState,
  ErrorState,
  errorCodeOf,
  InfoCallout,
  LoadingState,
  Screen,
  spacing,
  StatusChip,
  TabbedFilter,
  useTx,
  type TranslationKey,
} from "@laif/ui-native";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";

import { AppHeader } from "../../components/AppHeader.tsx";
import { useNetwork } from "../../network/NetworkProvider.tsx";
import { useRepository } from "../../providers.tsx";

export const ACTIVITY_TYPES = [
  "all",
  "session",
  "patient",
  "screening",
  "followUp",
  "sync",
  "settings",
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

/** Filter bucket of one audit action. */
export function activityTypeOf(entry: Pick<DeviceActivityEntry, "action" | "entityType">) {
  const { action } = entry;
  const type: Exclude<ActivityType, "all"> =
    action.startsWith("session.") || action.startsWith("device.") || action === "access.denied"
      ? "session"
      : action.startsWith("patient.")
        ? "patient"
        : action.startsWith("screening.") || action.startsWith("review.")
          ? "screening"
          : action.startsWith("followup.") || entry.entityType === "follow_up"
            ? "followUp"
            : action.startsWith("sync.") ||
                action.startsWith("conflict.") ||
                action.startsWith("worker.sync.")
              ? "sync"
              : "settings";
  return type;
}

/** `XXXXXXXX` — the first 8 characters of an id (enough to match records in the demo). */
export function shortId(id: string): string {
  return id.length > 8 ? id.slice(0, 8).toUpperCase() : id.toUpperCase();
}

const personaNames = new Map<string, string>(DEMO_PERSONAS.map((p) => [p.id, p.displayName]));

export const activityKeys = { list: ["settings", "activity"] as const };

export function ActivityLogScreen({ onBack }: { onBack?: () => void }) {
  const t = useTx();
  const { language } = useLanguage();
  const repo = useRepository();
  const { offline } = useNetwork();
  const [filter, setFilter] = useState<ActivityType>("all");
  const query = useQuery({
    queryKey: activityKeys.list,
    queryFn: () => repo.device.listActivity(),
  });

  const counts = useMemo(() => {
    const out = Object.fromEntries(ACTIVITY_TYPES.map((type) => [type, 0])) as Record<
      ActivityType,
      number
    >;
    for (const entry of query.data ?? []) {
      out.all += 1;
      out[activityTypeOf(entry)] += 1;
    }
    return out;
  }, [query.data]);
  const rows = (query.data ?? []).filter(
    (entry) => filter === "all" || activityTypeOf(entry) === filter,
  );

  return (
    <Screen
      testID="activity-log-screen"
      offline={offline}
      header={
        <AppHeader
          title={t("worker:settings.activity.title")}
          showAvatar={false}
          {...(onBack === undefined ? {} : { onBack })}
        />
      }
    >
      <InfoCallout icon="info">{t("worker:settings.activity.intro")}</InfoCallout>
      <TabbedFilter<ActivityType>
        testID="activity-filter"
        label={t("worker:a11y.activityFilter")}
        value={filter}
        onChange={setFilter}
        tabs={ACTIVITY_TYPES.map((type) => ({
          value: type,
          label: t(`worker:settings.activity.type.${type}` as TranslationKey),
          ...(query.data === undefined ? {} : { count: counts[type] }),
        }))}
      />
      {query.status === "error" ? (
        <ErrorState
          title={t("worker:settings.activity.loadError")}
          {...(errorCodeOf(query.error) === undefined
            ? {}
            : { code: errorCodeOf(query.error) as string })}
          onRetry={() => query.refetch()}
        />
      ) : query.data === undefined ? (
        <LoadingState variant="skeleton" rows={3} label={t("worker:settings.activity.loading")} />
      ) : rows.length === 0 ? (
        <EmptyState icon="activity" title={t("worker:settings.activity.empty")} />
      ) : (
        <View testID="activity-list" style={styles.list}>
          {rows.map((entry) => (
            <ActivityRow key={`${entry.source}-${entry.id}`} entry={entry} language={language} />
          ))}
        </View>
      )}
    </Screen>
  );
}

function ActivityRow({
  entry,
  language,
}: {
  entry: DeviceActivityEntry;
  language: ReturnType<typeof useLanguage>["language"];
}) {
  const t = useTx();
  const action = t(auditActionLabelKey(entry.action as AuditAction));
  const actor =
    entry.actorId === null
      ? t("worker:settings.activity.system")
      : (personaNames.get(entry.actorId) ?? entry.actorId);
  const time = formatDateTime(entry.occurredAt, language);
  const source = t(`worker:settings.activity.source.${entry.source}`);
  return (
    <View
      testID={`activity-row-${entry.id}`}
      accessible
      accessibilityLabel={t("worker:settings.activity.rowLabel", { action, time, actor, source })}
    >
      <Card>
        <View style={styles.head}>
          <AppText weight="semibold" style={styles.flex}>
            {action}
          </AppText>
          <StatusChip tone={entry.source === "server" ? "info" : "neutral"}>{source}</StatusChip>
        </View>
        <AppText variant="caption" color="muted">
          {`${time} · ${t("worker:settings.activity.actor", { actor })}`}
        </AppText>
        <AppText variant="caption" mono color="muted">
          {`${t("worker:settings.activity.entity", { id: shortId(entry.entityId) })} · ${t(
            "worker:settings.activity.correlation",
            { id: shortId(entry.correlationId) },
          )}`}
        </AppText>
        {entry.outcome === "denied" ? (
          <StatusChip tone="danger" icon="lock">
            {t("worker:settings.activity.denied")}
          </StatusChip>
        ) : null}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  head: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, flexWrap: "wrap" },
  flex: { flexGrow: 1, flexShrink: 1 },
});
