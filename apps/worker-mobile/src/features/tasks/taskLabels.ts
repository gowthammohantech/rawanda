/** Shared HWM-07 display helpers: due pill (text + icon + tone) and status pill tone. */
import type { DueBucket, FollowUp, FollowUpStatus } from "@laif/domain";
import { formatDate, formatTime, type Language } from "@laif/i18n";
import type { IconName, Tone, TranslationKey, TranslationValues } from "@laif/ui-native";

type Tx = (key: TranslationKey, values?: TranslationValues) => string;

export type DuePill = { tone: Tone; icon: IconName; text: string };

/** `OVERDUE · 2 DAYS` (danger), `DUE TODAY · 14:00` (warning), `DUE 18 OCT 2026` (neutral). */
export function duePill(
  followUp: Pick<FollowUp, "dueAt" | "completedAt">,
  bucket: DueBucket,
  daysOverdue: number,
  t: Tx,
  language: Language,
): DuePill {
  switch (bucket) {
    case "overdue":
      return {
        tone: "danger",
        icon: "octagon-alert",
        text: t("worker:tasks.pill.overdue", { count: Math.max(1, daysOverdue) }),
      };
    case "due_today":
      return {
        tone: "warning",
        icon: "clock",
        text: t("worker:tasks.pill.dueToday", { time: formatTime(followUp.dueAt, language) }),
      };
    case "upcoming":
      return {
        tone: "neutral",
        icon: "calendar",
        text: t("worker:tasks.pill.due", { date: formatDate(followUp.dueAt, language) }),
      };
    case "completed":
      return {
        tone: "positive",
        icon: "check",
        text: t("worker:tasks.pill.completed", {
          date: formatDate(followUp.completedAt ?? followUp.dueAt, language),
        }),
      };
  }
}

export const STATUS_TONE: Record<FollowUpStatus, Tone> = {
  assigned: "neutral",
  contacted: "info",
  unable_to_reach: "warning",
  completed: "positive",
  reassigned: "neutral",
};
