/**
 * Sync timeline of one screening (HWM-06 task 7): Saved on device {time} → Sent {attempts} →
 * Synced {time} | Needs your decision | Not sent — will retry | Not accepted, then one row per
 * correction (`screening.amend` op) with its own state. Times in Africa/Kigali.
 */
import {
  AMENDABLE_SCREENING_FIELDS,
  type AmendableScreeningField,
  type SyncOperation,
} from "@laif/domain";
import { domainKey, formatDate, formatTime, useLanguage } from "@laif/i18n";
import {
  StatusChip,
  Timeline,
  useTx,
  type TimelineItem,
  type Tone,
  type TranslationKey,
} from "@laif/ui-native";

import type { ScreeningSyncView } from "../../data/screenings.ts";

type Outcome = { key: TranslationKey; tone: Tone } | null;

/** Final state of an op (null while waiting / sending). */
export function opOutcome(op: SyncOperation): Outcome {
  switch (op.status) {
    case "acknowledged":
      return { key: "worker:review.timeline.synced", tone: "positive" };
    case "conflict":
    case "needs_resolution":
      return { key: "worker:review.timeline.needsDecision", tone: "danger" };
    case "retryable_failure":
      return { key: "worker:review.timeline.willRetry", tone: "warning" };
    case "rejected":
      return { key: "worker:review.timeline.notAccepted", tone: "danger" };
    case "blocked_revoked":
      return { key: "worker:review.timeline.blocked", tone: "warning" };
    default:
      return null;
  }
}

const fieldOf = (op: SyncOperation): AmendableScreeningField | null => {
  const payload = op.payload;
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return null;
  const field = (payload as Record<string, unknown>)["field"];
  return (AMENDABLE_SCREENING_FIELDS as readonly unknown[]).includes(field)
    ? (field as AmendableScreeningField)
    : null;
};

export function SyncTimeline({ sync }: { sync: ScreeningSyncView }) {
  const t = useTx();
  const { language } = useLanguage();
  const rail = (iso: string) => formatDate(iso, language);
  const at = (iso: string) => formatTime(iso, language);
  const items: TimelineItem[] = [];
  const op = sync.createOp;

  if (op === null) {
    items.push({
      id: "from-server",
      dateLabel: rail(sync.savedAt),
      title: t("worker:review.timeline.fromServer"),
      meta: at(sync.savedAt),
    });
  } else {
    items.push({
      id: "saved",
      dateLabel: rail(op.createdAt),
      title: t("worker:review.timeline.savedOnDevice"),
      meta: at(op.createdAt),
    });
    items.push({
      id: "sent",
      dateLabel: rail(op.updatedAt),
      title:
        op.attempts > 0
          ? t("worker:review.timeline.sent", { count: op.attempts })
          : t("worker:review.timeline.waiting"),
    });
    const outcome = opOutcome(op);
    if (outcome !== null) {
      items.push({
        id: "outcome",
        dateLabel: rail(op.updatedAt),
        title: t(outcome.key),
        meta: at(op.updatedAt),
        chip: (
          <StatusChip tone={outcome.tone} testID="timeline-outcome">
            {t(outcome.key)}
          </StatusChip>
        ),
      });
    }
  }

  for (const amend of sync.amendOps) {
    const field = fieldOf(amend);
    const outcome = opOutcome(amend);
    items.push({
      id: amend.id,
      dateLabel: rail(amend.createdAt),
      title: t("worker:review.timeline.amendment", {
        field: field === null ? "" : t(domainKey("amendableField", field)),
      }),
      meta: at(amend.createdAt),
      chip: (
        <StatusChip tone={outcome?.tone ?? "info"}>
          {outcome === null ? t("worker:review.timeline.savedOnDevice") : t(outcome.key)}
        </StatusChip>
      ),
    });
  }

  return (
    <Timeline items={items} label={t("worker:review.timeline.label")} testID="sync-timeline" />
  );
}
