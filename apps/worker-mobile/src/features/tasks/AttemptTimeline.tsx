/**
 * Contact-attempt history (HWM-07 task 6): attempts newest first (time, channel, reached or
 * not, note, recorder) and the outcome entry when one exists (evidence type, occurred-at,
 * recorded-by) — each item with its own sync state (Saved on this device / Synced / …).
 */
import { DEMO_PERSONAS } from "@laif/mock-data";
import { domainKey, formatDate, formatDateTime, formatTime, useLanguage } from "@laif/i18n";
import {
  Card,
  EmptyState,
  SyncStatusPill,
  Timeline,
  useTx,
  type TimelineItem,
} from "@laif/ui-native";
import { View } from "react-native";

import type { TaskDetail } from "../../data/followUps.ts";

export function AttemptTimeline({ detail }: { detail: TaskDetail }) {
  const t = useTx();
  const { language } = useLanguage();
  const personName = (id: string) =>
    DEMO_PERSONAS.find((p) => p.id === id)?.displayName ??
    t("worker:tasks.detail.timeline.unknownWorker");
  const outcome = detail.followUp.outcome;

  const items: TimelineItem[] = [];
  if (outcome !== null) {
    items.push({
      id: "outcome",
      dateLabel: formatDate(outcome.occurredAt, language),
      title: t("worker:tasks.detail.timeline.outcome", {
        outcome: t(domainKey("followUpOutcome", outcome.kind)),
      }),
      description: [
        outcome.evidenceType === null
          ? null
          : t("worker:tasks.detail.timeline.evidence", {
              evidence: t(domainKey("evidence", outcome.evidenceType)),
            }),
        outcome.reasonCode === null
          ? null
          : t(domainKey("unableToReachReason", outcome.reasonCode)),
        outcome.note.trim() === ""
          ? null
          : t("worker:tasks.detail.timeline.note", { note: outcome.note }),
      ]
        .filter((part) => part !== null)
        .join("\n"),
      meta: `${t("worker:tasks.detail.timeline.occurredAt", {
        dateTime: formatDateTime(outcome.occurredAt, language),
      })} · ${personName(outcome.recordedBy)}`,
      chip: <SyncStatusPill state={detail.outcomeSyncState ?? "synced"} testID="outcome-sync" />,
    });
  }
  for (const attempt of detail.attempts) {
    items.push({
      id: attempt.id,
      dateLabel: formatDate(attempt.at, language),
      title: t("worker:tasks.detail.timeline.attempt", {
        method: t(domainKey("contactMethod", attempt.method)),
        result: t(domainKey("contactResult", attempt.result)),
      }),
      ...(attempt.note.trim() === ""
        ? {}
        : { description: t("worker:tasks.detail.timeline.note", { note: attempt.note }) }),
      meta: t("worker:tasks.detail.timeline.recordedBy", {
        time: formatTime(attempt.at, language),
        name: personName(attempt.recordedBy),
      }),
      chip: <SyncStatusPill state={attempt.syncState} testID={`attempt-sync-${attempt.id}`} />,
    });
  }

  return (
    <Card title={t("worker:tasks.detail.timeline.title")} testID="attempt-timeline-card">
      {items.length === 0 ? (
        <View testID="attempt-timeline-empty">
          <EmptyState icon="clock" title={t("worker:tasks.detail.timeline.empty")} />
        </View>
      ) : (
        <Timeline
          items={items}
          label={t("worker:tasks.detail.timeline.label")}
          testID="attempt-timeline"
        />
      )}
    </Card>
  );
}
