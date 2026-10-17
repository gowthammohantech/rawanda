/**
 * One draft on the Screen tab (HWM-05 task 8): patient, last edited time (Kigali), completeness
 * ("3 of 5 fields" + thin progress bar, text not colour only) and Resume.
 */
import { formatDateTime, useLanguage } from "@laif/i18n";
import { AppText, Button, colors, radii, spacing, useTx } from "@laif/ui-native";
import { StyleSheet, View } from "react-native";

import type { DraftRow as DraftRowData } from "../../data/drafts.ts";
import { draftCompleteness } from "./screeningSchema.ts";

export function DraftRow({ row, onResume }: { row: DraftRowData; onResume: (id: string) => void }) {
  const t = useTx();
  const { language } = useLanguage();
  const { draft, patientName, patientIdentifier } = row;
  const { count, total } = draftCompleteness(draft);
  const name = patientName === "" ? t("worker:screening.row.unknownPatient") : patientName;
  const completeness = t("worker:screening.row.completeness", { count, total });
  return (
    <View style={styles.card} testID={`screen-draft-${draft.id}`}>
      <View style={styles.text}>
        <AppText weight="semibold">{name}</AppText>
        {patientIdentifier === "" ? null : (
          <AppText variant="caption" mono color="muted">
            {patientIdentifier}
          </AppText>
        )}
        <AppText variant="caption" color="muted" testID="draft-edited">
          {t("worker:screening.row.edited", { time: formatDateTime(draft.updatedAt, language) })}
        </AppText>
        <View
          style={styles.track}
          accessibilityRole="progressbar"
          accessibilityLabel={completeness}
          accessibilityValue={{ min: 0, max: total, now: count }}
        >
          <View style={[styles.fill, { width: `${(count / total) * 100}%` }]} />
        </View>
        <AppText variant="caption" testID="draft-completeness">
          {completeness}
        </AppText>
      </View>
      <Button
        size="sm"
        variant="secondary"
        testID={`resume-${draft.id}`}
        accessibilityLabel={t("worker:screening.row.resumeLabel", { name })}
        onPress={() => onResume(draft.id)}
      >
        {t("worker:screening.row.resume")}
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  text: { flex: 1, gap: spacing.xxs },
  track: {
    height: 4,
    marginTop: spacing.xs,
    borderRadius: radii.pill,
    backgroundColor: colors.borderSoft,
    overflow: "hidden",
  },
  fill: { height: 4, backgroundColor: colors.primary },
});
