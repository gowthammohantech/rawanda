/**
 * One queue row (HWM-09 task 5): op type label, patient, saved time (Kigali), attempts, the
 * last error in plain words and the waiting line ("Retrying in 8s" / "Retry now"). Decision
 * rows open the conflict screen; every other row opens the op detail.
 */
import { formatDateTime, useLanguage } from "@laif/i18n";
import { Button, ListRow, spacing, StatusChip, useTx } from "@laif/ui-native";
import { StyleSheet, View } from "react-native";

import { type SyncOpRow, type SyncSection } from "../../data/syncCenter.ts";
import { canRetryNow } from "../../sync/scheduler.ts";
import { errorWords, opTitle, waitingLine } from "./labels.ts";
import { RejectedExplanation } from "./RejectedExplanation.tsx";

export type OpRowProps = {
  row: SyncOpRow;
  section: SyncSection;
  onOpen: (opId: string) => void;
  onResolve?: (opId: string) => void;
  onRetry?: (row: SyncOpRow) => void;
  /** A Retry now for this row is running. */
  retrying?: boolean;
};

export function OpRow({ row, section, onOpen, onResolve, onRetry, retrying = false }: OpRowProps) {
  const t = useTx();
  const { language } = useLanguage();
  const { op } = row;
  const meta = [
    t("worker:sync.savedAt", { time: formatDateTime(op.deviceTimestamp, language) }),
    op.attempts > 0 ? t("worker:sync.attempts", { count: op.attempts }) : null,
    row.errorCode !== null && section !== "synced" ? errorWords(row.errorCode, t) : null,
  ]
    .filter((part): part is string => part !== null)
    .join(" · ");

  const trailing =
    section === "decision" ? (
      <StatusChip tone="danger" icon="alert">
        {t("worker:sync.state.conflict")}
      </StatusChip>
    ) : section === "notAccepted" ? (
      <StatusChip tone="warning">{t("worker:sync.state.rejected")}</StatusChip>
    ) : section === "synced" ? (
      <StatusChip tone={op.status === "superseded" ? "neutral" : "positive"}>
        {op.status !== "superseded"
          ? t("worker:sync.state.synced")
          : row.replaced
            ? t("worker:sync.replaced")
            : t("worker:sync.withdrawn")}
      </StatusChip>
    ) : undefined;

  const subtitle = row.patientName ?? t("worker:sync.noPatient");
  const decision = section === "decision" && onResolve !== undefined;
  return (
    <View style={styles.row} testID={`op-row-${op.id}`}>
      <ListRow
        title={opTitle(row, t)}
        subtitle={subtitle}
        meta={meta}
        icon={decision ? "alert" : "sync"}
        {...(trailing === undefined ? {} : { trailing })}
        accessibilityHint={decision ? t("worker:sync.resolveHint") : t("worker:sync.openHint")}
        onPress={() => (decision ? onResolve(op.id) : onOpen(op.id))}
        testID={`op-open-${op.id}`}
      />
      {section === "waiting" ? (
        <View style={styles.line}>
          <StatusChip
            tone={op.status === "retryable_failure" ? "warning" : "info"}
            icon="clock"
            testID={`op-waiting-${op.id}`}
          >
            {waitingLine(row, t)}
          </StatusChip>
          {canRetryNow(op) && onRetry !== undefined ? (
            <Button
              variant="secondary"
              size="sm"
              icon="refresh"
              loading={retrying}
              testID={`retry-now-${op.id}`}
              onPress={() => onRetry(row)}
            >
              {t("worker:sync.retryNow")}
            </Button>
          ) : null}
        </View>
      ) : null}
      {section === "synced" && row.serverEventShort !== null ? (
        <View style={styles.line}>
          <StatusChip tone="neutral" testID={`op-server-event-${op.id}`}>
            {t("worker:sync.serverEvent", { id: row.serverEventShort })}
          </StatusChip>
        </View>
      ) : null}
      {section === "notAccepted" ? <RejectedExplanation row={row} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.xs },
  line: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flexWrap: "wrap",
    paddingHorizontal: spacing.sm,
  },
});
