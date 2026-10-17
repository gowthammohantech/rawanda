/**
 * Recent screenings of one patient (HWM-04 task 3), read-only: value + units (`ReadingDisplay`,
 * amendments applied via `effectiveReadings`), measured date (Africa/Kigali) and status pill.
 * Corrections happen on the screening itself (HWM-06), never here: a row opens the screening
 * detail (`/screenings/[screeningId]`).
 */
import { effectiveReadings, type Screening } from "@laif/domain";
import { domainKey, formatDate, formatMeasurement, useLanguage } from "@laif/i18n";
import {
  AppText,
  colors,
  EmptyState,
  radii,
  ReadingDisplay,
  spacing,
  StatusChip,
  touchTarget,
  useTx,
} from "@laif/ui-native";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";

export function ScreeningHistoryList({ screenings }: { screenings: readonly Screening[] }) {
  const t = useTx();
  const { language } = useLanguage();
  const router = useRouter();
  if (screenings.length === 0) {
    return (
      <View testID="screenings-empty">
        <EmptyState icon="activity" title={t("worker:patients.context.noScreenings")} />
      </View>
    );
  }
  return (
    <View style={styles.list} testID="screening-history">
      <AppText variant="caption" color="muted">
        {t("worker:patients.context.readOnly")}
      </AppText>
      {screenings.map((screening) => {
        const r = effectiveReadings(screening);
        const status = t(domainKey("status.screening", screening.status));
        const date = formatDate(r.measuredAt, language);
        const spoken = [
          r.systolic !== null && r.diastolic !== null
            ? formatMeasurement({ systolic: r.systolic, diastolic: r.diastolic }, "mmHg", language)
            : null,
          r.glucoseValue !== null && r.glucoseUnit !== null
            ? formatMeasurement(r.glucoseValue, r.glucoseUnit, language)
            : null,
        ].filter((part) => part !== null);
        return (
          <Pressable
            key={screening.id}
            style={[touchTarget, styles.row]}
            testID={`screening-${screening.id}`}
            accessibilityRole="button"
            accessibilityHint={t("worker:patients.context.openScreeningHint")}
            onPress={() =>
              router.push({
                pathname: "/screenings/[screeningId]",
                params: { screeningId: screening.id },
              })
            }
            accessibilityLabel={t("worker:patients.context.screeningLabel", {
              date,
              readings:
                spoken.length === 0 ? t("worker:patients.context.noReadings") : spoken.join(", "),
              status,
            })}
          >
            <View style={styles.head}>
              <AppText variant="caption" color="muted">
                {date}
              </AppText>
              <StatusChip tone="neutral" testID="screening-status">
                {status}
              </StatusChip>
            </View>
            {r.systolic !== null && r.diastolic !== null ? (
              <ReadingDisplay kind="bloodPressure" systolic={r.systolic} diastolic={r.diastolic} />
            ) : null}
            {r.glucoseValue !== null ? (
              <ReadingDisplay
                kind="glucose"
                value={r.glucoseValue}
                unit={r.glucoseUnit}
                context={r.glucoseContext}
              />
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  row: {
    gap: spacing.xs,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
  },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
});
