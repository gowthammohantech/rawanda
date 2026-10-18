/**
 * Sync item detail (HWM-09 task 6): op ID, idempotency key, sequence, base version, correlation
 * ID, status, attempts / last error / next attempt, the attempt history from the audit trail
 * (incl. the conflict and its resolution), and a payload summary — coded values only, free-text
 * notes are never shown. A withdrawn ("keep latest") payload stays visible here.
 */
import { formatDateTime, useLanguage } from "@laif/i18n";
import {
  AppText,
  Button,
  Card,
  ErrorState,
  errorCodeOf,
  InfoCallout,
  KeyValueList,
  LoadingState,
  Screen,
  Section,
  spacing,
  StatusChip,
  Timeline,
  useTx,
  type TranslationKey,
} from "@laif/ui-native";
import { useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";

import { AppHeader } from "../../components/AppHeader.tsx";
import type { OpDetailData } from "../../data/syncCenter.ts";
import { useNetwork } from "../../network/NetworkProvider.tsx";
import { canRetryNow } from "../../sync/scheduler.ts";
import { errorWords, opTitle, waitingLine } from "./labels.ts";
import { RejectedExplanation } from "./RejectedExplanation.tsx";
import { useOpDetail, useRetryNow } from "./useSyncCenter.ts";

const mono = (value: string) => (
  <AppText mono selectable>
    {value}
  </AppText>
);

function OpDetailBody({ data }: { data: OpDetailData }) {
  const t = useTx();
  const router = useRouter();
  const { language } = useLanguage();
  const retryNow = useRetryNow();
  const { row, history, payload, resolves, resolvedBy } = data;
  const { op } = row;
  const none = t("worker:sync.detail.none");
  const status = t(`domain:status.syncOp.${op.status}` as TranslationKey);
  const withdrawn = op.status === "superseded" && resolvedBy.every((o) => o.resolvesOpId !== op.id);

  return (
    <>
      <Card testID="op-detail-card">
        <AppText variant="title" weight="semibold" accessibilityRole="header">
          {opTitle(row, t)}
        </AppText>
        <View style={styles.chips}>
          <StatusChip
            tone={
              op.status === "acknowledged"
                ? "positive"
                : op.status === "needs_resolution" || op.status === "conflict"
                  ? "danger"
                  : "neutral"
            }
            testID="op-detail-status"
          >
            {status}
          </StatusChip>
          {op.status === "queued" || op.status === "retryable_failure" ? (
            <StatusChip tone="warning" icon="clock" testID="op-detail-waiting">
              {waitingLine(row, t)}
            </StatusChip>
          ) : null}
        </View>
        <KeyValueList
          testID="op-detail-fields"
          items={[
            {
              id: "patient",
              label: t("worker:sync.detail.patient"),
              value: row.patientName ?? t("worker:sync.noPatient"),
            },
            { id: "opId", label: t("worker:sync.detail.opId"), value: mono(op.id) },
            {
              id: "idempotencyKey",
              label: t("worker:sync.detail.idempotencyKey"),
              value: mono(op.idempotencyKey),
            },
            { id: "seq", label: t("worker:sync.detail.seq"), value: mono(String(op.localSeq)) },
            {
              id: "baseVersion",
              label: t("worker:sync.detail.baseVersion"),
              value: op.baseVersion === null ? none : mono(String(op.baseVersion)),
            },
            {
              id: "correlationId",
              label: t("worker:sync.detail.correlationId"),
              value: mono(op.correlationId),
            },
            {
              id: "savedAt",
              label: t("worker:sync.detail.savedAt"),
              value: formatDateTime(op.deviceTimestamp, language),
            },
            { id: "attempts", label: t("worker:sync.detail.attempts"), value: String(op.attempts) },
            {
              id: "lastError",
              label: t("worker:sync.detail.lastError"),
              value: row.errorCode === null ? none : errorWords(row.errorCode, t),
            },
            {
              id: "nextAttempt",
              label: t("worker:sync.detail.nextAttempt"),
              value:
                op.status === "retryable_failure" && op.nextAttemptAt !== null
                  ? formatDateTime(op.nextAttemptAt, language)
                  : none,
            },
            {
              id: "serverEvent",
              label: t("worker:sync.detail.serverEvent"),
              value: row.serverEventShort === null ? none : mono(row.serverEventShort),
            },
          ]}
        />
        {op.status === "needs_resolution" || op.status === "conflict" ? (
          <Button
            icon="alert"
            testID="op-detail-resolve"
            onPress={() =>
              router.push({ pathname: "/sync/conflicts/[opId]", params: { opId: op.id } })
            }
          >
            {t("worker:sync.detail.resolve")}
          </Button>
        ) : null}
        {canRetryNow(op) ? (
          <Button
            variant="secondary"
            icon="refresh"
            testID="op-detail-retry"
            onPress={() => retryNow(op)}
          >
            {t("worker:sync.retryNow")}
          </Button>
        ) : null}
      </Card>

      {op.status === "rejected" ? <RejectedExplanation row={row} /> : null}

      <Section
        title={
          withdrawn ? t("worker:sync.detail.payloadWithdrawn") : t("worker:sync.detail.payload")
        }
        testID="op-detail-payload"
      >
        <KeyValueList
          items={payload.map((item) => ({
            id: item.field,
            label: item.field,
            value: item.hidden ? t("worker:sync.detail.payloadHidden") : mono(item.value ?? ""),
          }))}
        />
      </Section>

      {resolves !== null || resolvedBy.length > 0 ? (
        <Section title={t("worker:sync.detail.resolvedBy")} testID="op-detail-related">
          {[...(resolves === null ? [] : [resolves]), ...resolvedBy].map((related) => (
            <Button
              key={related.id}
              variant="ghost"
              size="sm"
              icon="external"
              testID={`op-detail-related-${related.id}`}
              onPress={() =>
                router.push({ pathname: "/sync/[opId]", params: { opId: related.id } })
              }
            >
              {`${t("worker:sync.detail.openRelated")} · ${
                related.id === op.resolvesOpId
                  ? t("worker:sync.detail.resolves")
                  : t(`domain:status.syncOp.${related.status}` as TranslationKey)
              } · ${related.id.slice(0, 8)}`}
            </Button>
          ))}
        </Section>
      ) : null}

      <Section title={t("worker:sync.detail.history")} testID="op-detail-history">
        {history.length === 0 ? (
          <InfoCallout icon="info">{t("worker:sync.detail.historyEmpty")}</InfoCallout>
        ) : (
          <Timeline
            label={t("worker:sync.detail.history")}
            testID="op-history"
            items={history.map((event) => ({
              id: event.id,
              dateLabel: formatDateTime(event.occurredAt, language),
              title: t(`domain:audit.${event.action}` as TranslationKey),
              ...(event.outcome === "success"
                ? {}
                : { meta: t(`domain:auditOutcome.${event.outcome}` as TranslationKey) }),
            }))}
          />
        )}
      </Section>
    </>
  );
}

export function OpDetailScreen({ opId }: { opId: string }) {
  const t = useTx();
  const router = useRouter();
  const { offline } = useNetwork();
  const detail = useOpDetail(opId);
  return (
    <Screen
      testID="op-detail-screen"
      offline={offline}
      header={<AppHeader title={t("worker:sync.detail.title")} onBack={() => router.back()} />}
      contentStyle={styles.content}
    >
      {detail.status === "error" ? (
        <ErrorState
          title={t("worker:sync.loadError")}
          {...(errorCodeOf(detail.error) === undefined
            ? {}
            : { code: errorCodeOf(detail.error) as string })}
          onRetry={() => detail.refetch()}
        />
      ) : detail.data === undefined ? (
        <LoadingState variant="skeleton" rows={3} label={t("worker:sync.loading")} />
      ) : detail.data === null ? (
        <InfoCallout icon="info" testID="op-detail-missing">
          {t("worker:sync.detail.notFound")}
        </InfoCallout>
      ) : (
        <OpDetailBody data={detail.data} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
});
