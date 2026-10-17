/**
 * A Done or Cancelled step in the list (CTZ-04 task 6). Done shows the completion date and
 * "Confirmed by your care team" ONLY when the care team recorded a completion evidence type; a
 * delivered reminder or an acknowledgement never makes a step look completed. Cancelled shows
 * "Your care team cancelled this step" (the reason is never shown).
 */
import type { ApprovedInstruction } from "@laif/domain";
import { formatDate, useLanguage } from "@laif/i18n";
import { AppText, Icon, colors, radii, spacing, touchTarget, useTx } from "@laif/ui-native";
import { Pressable, StyleSheet, View } from "react-native";

import { KIND_SPECS, stepTexts } from "./copy.ts";

export function completionLines(
  t: ReturnType<typeof useTx>,
  step: ApprovedInstruction,
  language: Parameters<typeof formatDate>[1],
): string[] {
  if (step.progress === "cancelled") return [t("citizen:nextSteps.cancelledByTeam")];
  if (step.progress !== "completed" || step.completion === null) return [];
  const lines = [
    t("citizen:nextSteps.completedOn", { date: formatDate(step.completion.completedAt, language) }),
  ];
  if (step.completion.evidenceType !== null) lines.push(t("citizen:nextSteps.confirmedByTeam"));
  return lines;
}

export function CompletedStepRow({
  step,
  onOpen,
}: {
  step: ApprovedInstruction;
  onOpen: () => void;
}) {
  const t = useTx();
  const { language } = useLanguage();
  const texts = stepTexts(t, step);
  const lines = completionLines(t, step, language);
  const cancelled = step.progress === "cancelled";
  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={[texts.type, texts.heading, ...lines].join(". ")}
      accessibilityHint={t("citizen:nextSteps.openHint")}
      style={({ pressed }) => [styles.row, touchTarget, pressed ? styles.pressed : null]}
      testID={`${cancelled ? "cancelled" : "completed"}-step-${step.id}`}
    >
      <View style={[styles.icon, cancelled ? styles.iconCancelled : null]}>
        <Icon
          name={cancelled ? KIND_SPECS[step.kind].icon : "check"}
          size={16}
          color={cancelled ? colors.muted : colors.positive}
        />
      </View>
      <View style={styles.text}>
        <AppText weight="semibold">{texts.heading}</AppText>
        {lines.map((line) => (
          <AppText key={line} variant="caption" color="muted">
            {line}
          </AppText>
        ))}
      </View>
      <Icon name="chevron" size={18} color={colors.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
  },
  pressed: { backgroundColor: colors.background },
  icon: {
    width: 32,
    height: 32,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.positiveSoft,
  },
  iconCancelled: { backgroundColor: colors.background },
  text: { flex: 1, gap: spacing.xxs },
});
