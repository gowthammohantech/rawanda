import { StyleSheet, View } from "react-native";

import { useTx } from "../i18n.ts";
import { Icon } from "../icons/Icon.tsx";
import { colors, radii, spacing } from "../tokens.ts";
import { AppText } from "./AppText.tsx";

export type StepStatus = "done" | "current" | "upcoming" | "cancelled";

export type StepperStep = {
  id: string;
  /** Translated step label. */
  label: string;
  /** Explicit status; otherwise derived from `currentIndex`. */
  status?: StepStatus;
};

export type StepperProps = {
  steps: readonly StepperStep[];
  /** 0-based index of the current step. */
  currentIndex?: number;
  /** Accessible name; defaults to `common:ui.stepper`. */
  label?: string;
  testID?: string;
};

function statusOf(step: StepperStep, index: number, currentIndex: number): StepStatus {
  if (step.status !== undefined) return step.status;
  if (index < currentIndex) return "done";
  if (index === currentIndex) return "current";
  return "upcoming";
}

/** Compact numbered progress for multi-step forms: "Step 2 of 4 · Readings" + segments. */
export function Stepper({ steps, currentIndex = 0, label, testID }: StepperProps) {
  const t = useTx();
  const current = steps[Math.min(Math.max(currentIndex, 0), Math.max(steps.length - 1, 0))];
  const position = t("common:ui.stepPosition", { index: currentIndex + 1, total: steps.length });
  return (
    <View
      testID={testID ?? "stepper"}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`${label ?? t("common:ui.stepper")}: ${position}${current === undefined ? "" : `, ${current.label}`}`}
      accessibilityValue={{ min: 1, max: steps.length, now: currentIndex + 1 }}
      style={styles.root}
    >
      <View style={styles.head}>
        <AppText variant="micro" color="muted">
          {position}
        </AppText>
        {current === undefined ? null : (
          <AppText weight="semibold" style={styles.flex} numberOfLines={2}>
            {current.label}
          </AppText>
        )}
      </View>
      <View style={styles.segments}>
        {steps.map((step, index) => {
          const status = statusOf(step, index, currentIndex);
          return (
            <View
              key={step.id}
              testID={`step-${step.id}`}
              style={[
                styles.segment,
                status === "done" ? styles.done : null,
                status === "current" ? styles.current : null,
                status === "cancelled" ? styles.cancelled : null,
              ]}
            >
              {status === "done" ? (
                <Icon name="check" size={12} strokeWidth={2.6} color={colors.onPrimary} />
              ) : status === "cancelled" ? (
                <Icon name="close" size={12} strokeWidth={2.6} color={colors.danger} />
              ) : (
                <AppText
                  variant="micro"
                  dense
                  colorValue={status === "current" ? colors.onPrimary : colors.muted}
                >
                  {String(index + 1)}
                </AppText>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.sm },
  head: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  flex: { flex: 1 },
  segments: { flexDirection: "row", gap: spacing.xs },
  segment: {
    flex: 1,
    height: 24,
    borderRadius: radii.sm / 2,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  done: { backgroundColor: colors.ink, borderColor: colors.ink },
  current: { backgroundColor: colors.primary, borderColor: colors.primary },
  cancelled: { backgroundColor: colors.dangerSoft, borderColor: colors.danger },
});
