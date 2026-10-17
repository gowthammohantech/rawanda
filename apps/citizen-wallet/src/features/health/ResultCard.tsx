/**
 * One released result in the list (CTZ-03 task 2): activity icon, kind, date (Kigali), the
 * plain-language status chip (icon + text, never colour only), compact values with units and
 * the review provenance line. Opens the detail.
 */
import type { ReleasedObservation } from "@laif/domain";
import { formatDate, formatDateTime, useLanguage } from "@laif/i18n";
import {
  AppText,
  Icon,
  StatusChip,
  colors,
  radii,
  shadows,
  spacing,
  touchTarget,
  useTx,
} from "@laif/ui-native";
import { Pressable, StyleSheet, View } from "react-native";

import { RESULT_CHIPS, resultKindKey, reviewerOf } from "./copy.ts";
import { ReadingValue, readingA11yLabel, readingsOf } from "./ReadingValue.tsx";
import { ReviewProvenance } from "./ReviewProvenance.tsx";

export type ResultCardProps = { result: ReleasedObservation; onPress?: () => void };

export function ResultChip({ result }: { result: Pick<ReleasedObservation, "label"> }) {
  const t = useTx();
  const chip = RESULT_CHIPS[result.label];
  return (
    <StatusChip tone={chip.tone} icon={chip.icon} testID={`result-chip-${result.label}`}>
      {t(chip.key)}
    </StatusChip>
  );
}

export function ResultCard({ result, onPress }: ResultCardProps) {
  const t = useTx();
  const { language } = useLanguage();
  const kind = t(resultKindKey(result.readings));
  const date = formatDate(result.measuredAt, language);
  const readings = readingsOf(result.readings);
  const reviewer = reviewerOf(result.reviewedBy);
  const time = formatDateTime(result.reviewedAt ?? result.measuredAt, language);
  // One spoken summary for the whole card (nested labels collapse inside a button).
  const a11y = [
    t("citizen:health.card.a11y", { kind, date, status: t(RESULT_CHIPS[result.label].key) }),
    ...readings.map((reading) => readingA11yLabel(t, reading, language)),
    reviewer === null
      ? t("citizen:health.sharedNoReview", { time })
      : t("citizen:health.reviewedBy", { name: reviewer.name, time }),
  ].join(". ");
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityHint={t("citizen:health.openHint")}
      style={({ pressed }) => [styles.card, touchTarget, pressed ? styles.pressed : null]}
      testID={`result-card-${result.id}`}
    >
      <View style={styles.header}>
        <View style={styles.icon}>
          <Icon name="activity" size={18} color={colors.primaryDark} />
        </View>
        <View style={styles.headerText}>
          <AppText weight="semibold">{kind}</AppText>
          <AppText variant="caption" color="muted">
            {date}
          </AppText>
        </View>
        <Icon name="chevron" size={18} color={colors.muted} />
      </View>
      <ResultChip result={result} />
      <View style={styles.values}>
        {readings.map((reading) => (
          <ReadingValue key={reading.kind} reading={reading} size="compact" />
        ))}
      </View>
      <ReviewProvenance result={result} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.md,
    backgroundColor: colors.surface,
    ...shadows.card,
  },
  pressed: { backgroundColor: colors.background },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  headerText: { flex: 1, gap: spacing.xxs },
  icon: {
    width: 36,
    height: 36,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primarySoft,
  },
  values: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xl },
});
