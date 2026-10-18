/**
 * Prototype "YOUR NEXT STEP" card (CTZ-04 task 2): kicker with the type icon (calendar =
 * appointment, arrow = referral, clipboard = follow-up), localized heading, one-line instruction,
 * appointment row "Monday 19 October 2026 · 10:30 · Demo Health Centre Alpha-1", the
 * `APPROVED BY YOUR CARE TEAM` chip, who agreed it, the date-passed notice and a primary button.
 */
import type { ApprovedInstruction } from "@laif/domain";
import { formatDate, formatTime, useLanguage } from "@laif/i18n";
import {
  AppText,
  Button,
  Icon,
  MicroLabel,
  StatusChip,
  radii,
  shadows,
  spacing,
  useTx,
  usePalette,
  type Palette,
} from "@laif/ui-native";
import { StyleSheet, View } from "react-native";

import { ApprovedByLine } from "./ApprovedByLine.tsx";
import { KIND_SPECS, stepTexts } from "./copy.ts";
import { DatePassedNotice } from "./DatePassedNotice.tsx";
import { useThemedStyles } from "../../theme/useThemedStyles.ts";

export type NextStepCardProps = {
  step: ApprovedInstruction;
  onOpen: () => void;
  /** `kicker` = "YOUR NEXT STEP" (home card / first upcoming); `type` = the step type. */
  label?: "kicker" | "type";
  /** Button text override (home card: "See next step"). */
  openLabel?: string;
  openHint?: string;
  testID?: string;
};

/** "Monday 19 October 2026 · 10:30 · Place" or "Your care team will tell you the date." */
export function whenText(
  t: ReturnType<typeof useTx>,
  step: ApprovedInstruction,
  language: Parameters<typeof formatDate>[1],
  place: string,
): string {
  if (step.appointmentAt === null) return t("citizen:nextSteps.noDate");
  return t("citizen:nextSteps.appointmentRow", {
    date: formatDate(step.appointmentAt, language, { style: "long" }),
    time: formatTime(step.appointmentAt, language),
    place,
  });
}

export function ApprovedChip() {
  const t = useTx();
  return (
    <StatusChip tone="positive" icon="shield" testID="approved-chip">
      {t("citizen:nextSteps.chip.approved")}
    </StatusChip>
  );
}

export function NextStepCard({
  step,
  onOpen,
  label = "kicker",
  openLabel,
  openHint,
  testID,
}: NextStepCardProps) {
  const palette = usePalette();
  const styles = useThemedStyles(makeStyles);
  const t = useTx();
  const { language } = useLanguage();
  const spec = KIND_SPECS[step.kind];
  const texts = stepTexts(t, step);
  const when = whenText(t, step, language, texts.facility);
  return (
    <View style={styles.card} testID={testID ?? `next-step-card-${step.id}`}>
      <View style={styles.kicker}>
        <View style={styles.icon}>
          <Icon name={spec.icon} size={16} color={palette.primaryDark} />
        </View>
        <MicroLabel>{label === "kicker" ? t("citizen:nextSteps.kicker") : texts.type}</MicroLabel>
      </View>
      <AppText variant="title" accessibilityRole="header">
        {texts.heading}
      </AppText>
      <AppText color="muted" numberOfLines={2}>
        {texts.message}
      </AppText>
      <View style={styles.row}>
        <Icon name="clock" size={16} color={palette.muted} />
        <AppText weight="semibold" style={styles.flex} testID="appointment-row">
          {when}
        </AppText>
      </View>
      <ApprovedChip />
      <ApprovedByLine step={step} />
      {step.datePassed ? <DatePassedNotice /> : null}
      <Button
        icon="chevron"
        iconPosition="end"
        onPress={onOpen}
        accessibilityLabel={`${openLabel ?? t("citizen:nextSteps.open")}. ${t(
          "citizen:nextSteps.card.a11y",
          { type: texts.type, title: texts.heading, when },
        )}`}
        accessibilityHint={openHint ?? t("citizen:nextSteps.openHint")}
        testID={`next-step-open-${step.id}`}
      >
        {openLabel ?? t("citizen:nextSteps.open")}
      </Button>
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    card: {
      borderWidth: 1,
      borderColor: c.borderSoft,
      borderRadius: radii.lg,
      padding: spacing.lg,
      gap: spacing.md,
      backgroundColor: c.surface,
      ...shadows.card,
    },
    kicker: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    icon: {
      width: 28,
      height: 28,
      borderRadius: radii.pill,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.primarySoft,
    },
    row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    flex: { flex: 1 },
  });
