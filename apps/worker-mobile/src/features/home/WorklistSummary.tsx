/**
 * Three-cell summary (HWM-03): Overdue · Due today · Completed today (FND-10 `SummaryStrip`; each
 * cell is label + number + tone dot — the label text carries the meaning), a thin progress bar
 * (completed / today's work) and the FRD §5 caveat on derived "overdue".
 */
import { AppText, colors, radii, spacing, SummaryStrip, useTx } from "@laif/ui-native";
import { StyleSheet, View } from "react-native";

export type WorklistSummaryProps = {
  overdue: number;
  dueToday: number;
  completedToday: number;
  todaysWork: number;
};

export function WorklistSummary({
  overdue,
  dueToday,
  completedToday,
  todaysWork,
}: WorklistSummaryProps) {
  const t = useTx();
  const ratio = todaysWork === 0 ? 0 : completedToday / todaysWork;
  const progress = t("worker:home.progress", { done: completedToday, total: todaysWork });
  return (
    <View style={styles.root} testID="worklist-summary">
      <SummaryStrip
        label={t("worker:home.summaryLabel", {
          overdue,
          dueToday,
          completed: completedToday,
        })}
        items={[
          { id: "overdue", label: t("worker:home.overdue"), value: overdue, tone: "danger" },
          { id: "dueToday", label: t("worker:home.dueToday"), value: dueToday, tone: "warning" },
          {
            id: "completed",
            label: t("worker:home.completed"),
            value: completedToday,
            tone: "positive",
          },
        ]}
      />
      <View
        testID="worklist-progress"
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={progress}
        accessibilityValue={{ min: 0, max: todaysWork, now: completedToday }}
        style={styles.progressBlock}
      >
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${Math.round(ratio * 100)}%` }]} />
        </View>
        <AppText variant="caption" color="muted">
          {progress}
        </AppText>
      </View>
      <AppText variant="caption" color="muted" testID="overdue-caveat">
        {t("worker:home.overdueCaveat")}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.sm },
  progressBlock: { gap: spacing.xs },
  track: {
    height: 4,
    borderRadius: radii.pill,
    backgroundColor: colors.canvas,
    overflow: "hidden",
  },
  fill: { height: 4, borderRadius: radii.pill, backgroundColor: colors.positive },
});
