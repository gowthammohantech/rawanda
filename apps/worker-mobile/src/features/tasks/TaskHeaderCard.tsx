/**
 * Task header (HWM-07 task 6): patient + task type, status pill (`ASSIGNED`, `CONTACTED`,
 * `UNABLE TO REACH`, `COMPLETED`), sync pill when not synced, micro-labels `DUE`, `ASSIGNED BY`,
 * `CREATED`, and the derived `OVERDUE` pill with its caption (demo due dates, not approved
 * clinical timing — FRD §5). Nothing here is stored: overdue comes from the demo clock.
 */
import { zonedDay } from "@laif/domain";
import { domainKey, formatDate, formatDateTime, useLanguage } from "@laif/i18n";
import { AppText, Card, StatusChip, SyncStatusPill, useTx } from "@laif/ui-native";
import { View } from "react-native";

import type { TaskDetail } from "../../data/followUps.ts";
import { DetailItem, detailStyles } from "./DetailItem.tsx";
import { formatRelativeDays } from "./relativeDays.ts";
import { duePill, STATUS_TONE } from "./taskLabels.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Kigali calendar-day distance of `iso` from `nowIso` (negative = past). */
export function calendarDayDistance(iso: string, nowIso: string): number {
  const start = (value: string) => zonedDay(new Date(Date.parse(value))).start.getTime();
  return Math.round((start(iso) - start(nowIso)) / DAY_MS);
}

export function TaskHeaderCard({ detail, name }: { detail: TaskDetail; name: string }) {
  const t = useTx();
  const { language } = useLanguage();
  const { followUp } = detail;
  const overdue = detail.bucket === "overdue";
  const pill = duePill(followUp, detail.bucket, detail.daysOverdue, t, language);
  const relative = formatRelativeDays(
    calendarDayDistance(followUp.dueAt, detail.nowIso),
    language,
    t,
  );
  return (
    <Card testID="task-header-card">
      <View style={detailStyles.body}>
        <View>
          <AppText variant="title" heading testID="task-patient-name">
            {name}
          </AppText>
          <AppText color="muted" testID="task-type">
            {t(domainKey("followUpPurpose", followUp.purpose))}
          </AppText>
        </View>
        <View style={detailStyles.pills}>
          <StatusChip tone={STATUS_TONE[followUp.status]} testID="task-status-pill">
            {t(domainKey("status.followUp", followUp.status))}
          </StatusChip>
          {overdue ? (
            <StatusChip tone="danger" icon="octagon-alert" testID="task-overdue-pill">
              {pill.text}
            </StatusChip>
          ) : null}
          {detail.syncState === "synced" ? null : (
            <SyncStatusPill state={detail.syncState} testID="task-sync-pill" />
          )}
        </View>
        {overdue ? (
          <AppText variant="caption" color="muted" testID="task-overdue-caption">
            {t("worker:tasks.detail.overdueCaption")}
          </AppText>
        ) : null}
        <View style={detailStyles.grid}>
          <DetailItem
            label={t("worker:tasks.detail.due")}
            value={t("worker:tasks.detail.dueValue", {
              dateTime: formatDateTime(followUp.dueAt, language),
              relative,
            })}
            testID="task-due"
          />
          <DetailItem
            label={t("worker:tasks.detail.assignedBy")}
            value={detail.assignedByName ?? t("worker:tasks.detail.unknownClinician")}
            testID="task-assigned-by"
          />
          <DetailItem
            label={t("worker:tasks.detail.created")}
            value={formatDate(followUp.createdAt, language)}
            testID="task-created"
          />
        </View>
      </View>
    </Card>
  );
}
