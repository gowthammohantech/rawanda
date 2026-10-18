/**
 * Submitted → With care team → Resolved (CTZ-07 task 11; ref-images stepper pattern). Status is
 * never colour-only: each step has a label and a check / dot icon, and the whole stepper is one
 * accessible element ("Request progress: With care team").
 */
import type { CorrectionRequestStatus } from "@laif/domain";
import { AppText, Icon, spacing, useTx, usePalette, type Palette } from "@laif/ui-native";
import { StyleSheet, View } from "react-native";

import { stepperIndexOf } from "./copy.ts";
import { useThemedStyles } from "../../theme/useThemedStyles.ts";

const STEPS = [
  { id: "submitted", key: "citizen:correction.stepper.submitted" },
  { id: "with-care-team", key: "citizen:correction.stepper.withCareTeam" },
  { id: "resolved", key: "citizen:correction.stepper.resolved" },
] as const;

export function CorrectionStatusStepper({ status }: { status: CorrectionRequestStatus }) {
  const palette = usePalette();
  const styles = useThemedStyles(makeStyles);
  const t = useTx();
  const current = stepperIndexOf(status);
  const resolved = current === STEPS.length - 1;
  const currentLabel = t(STEPS[current]!.key);
  return (
    <View
      style={styles.root}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`${t("citizen:correction.stepper.label")}: ${currentLabel}`}
      accessibilityValue={{ min: 1, max: STEPS.length, now: current + 1 }}
      testID="correction-stepper"
    >
      {STEPS.map((step, index) => {
        const done = index < current || (resolved && index === current);
        const active = index === current && !resolved;
        return (
          <View key={step.id} style={styles.step} testID={`correction-step-${step.id}`}>
            <View style={styles.markerRow}>
              <View
                style={[
                  styles.marker,
                  done ? styles.markerDone : null,
                  active ? styles.markerActive : null,
                ]}
              >
                {done ? (
                  <Icon name="check" size={14} strokeWidth={2.6} color={palette.onPrimary} />
                ) : (
                  <Icon name="dot" size={14} color={active ? palette.primary : palette.subtle} />
                )}
              </View>
              {index < STEPS.length - 1 ? (
                <View style={[styles.line, index < current ? styles.lineDone : null]} />
              ) : null}
            </View>
            <AppText
              variant="caption"
              weight={active || done ? "semibold" : "regular"}
              color={active || done ? "ink" : "subtle"}
              testID={`correction-step-${step.id}-label`}
            >
              {t(step.key)}
            </AppText>
          </View>
        );
      })}
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    root: { flexDirection: "row", gap: spacing.xs },
    step: { flex: 1, gap: spacing.xs },
    markerRow: { flexDirection: "row", alignItems: "center" },
    marker: {
      width: 24,
      height: 24,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: c.border,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.surface,
    },
    markerDone: { backgroundColor: c.primary, borderColor: c.primary },
    markerActive: { borderColor: c.primary },
    line: { flex: 1, height: 2, backgroundColor: c.border, marginHorizontal: spacing.xs },
    lineDone: { backgroundColor: c.primary },
  });
