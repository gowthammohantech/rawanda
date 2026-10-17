/**
 * Possible matches (HWM-04 task 6): local patients scoring ≥ `DEMO_MATCH_THRESHOLD` (demo value,
 * labelled not validated) with the reason ("same date of birth, similar name"). Choices:
 * **Use this patient** (navigate, no write) or **Register anyway and flag for review**
 * (`matchDecision: 'register_anyway_flagged'` → `identityStatus: 'needs_match_review'`).
 * Nothing is ever merged.
 */
import { DEMO_MATCH_THRESHOLD } from "@laif/domain";
import { formatNumber, useLanguage } from "@laif/i18n";
import { AppText, Button, colors, radii, Sheet, spacing, useTx } from "@laif/ui-native";
import { StyleSheet, View } from "react-native";

import type { MatchCandidate } from "../../data/patients.ts";
import { ageLabel, matchReasonsLabel, sexLabel } from "./labels.ts";

export type PossibleMatchesSheetProps = {
  candidates: readonly MatchCandidate[] | null;
  now: Date | null;
  busy: boolean;
  onUse: (patientId: string) => void;
  onRegisterAnyway: () => void;
  onClose: () => void;
};

export function PossibleMatchesSheet({
  candidates,
  now,
  busy,
  onUse,
  onRegisterAnyway,
  onClose,
}: PossibleMatchesSheetProps) {
  const t = useTx();
  const { language } = useLanguage();
  return (
    <Sheet
      visible={candidates !== null && candidates.length > 0}
      onClose={onClose}
      dismissible={!busy}
      title={t("worker:patients.possibleMatch")}
      description={t("worker:patients.possibleMatchHint")}
      testID="possible-matches-sheet"
      footer={
        <>
          <Button
            variant="secondary"
            icon="alert"
            fullWidth
            loading={busy}
            disabled={busy}
            testID="register-anyway"
            onPress={onRegisterAnyway}
          >
            {t("worker:patients.registerAnyway")}
          </Button>
          <AppText variant="caption" color="muted" align="center" testID="match-demo-note">
            {t("worker:patients.matchDemoNote", {
              threshold: formatNumber(DEMO_MATCH_THRESHOLD, language),
            })}
          </AppText>
        </>
      }
    >
      {(candidates ?? []).map((candidate) => {
        const { patient } = candidate;
        const reasons = matchReasonsLabel(candidate.reasons, t);
        return (
          <View key={patient.id} style={styles.card} testID={`match-${patient.id}`}>
            <AppText weight="semibold">{patient.displayName}</AppText>
            <AppText variant="caption" mono color="muted">
              {patient.syntheticIdentifier}
            </AppText>
            <AppText variant="caption" color="muted">
              {`${ageLabel(patient, now, t)} · ${sexLabel(patient, t)}`}
            </AppText>
            {reasons === "" ? null : (
              <AppText variant="caption" testID="match-reasons">
                {t("worker:patients.matchReasons", { reasons })}
              </AppText>
            )}
            <Button
              size="sm"
              icon="user"
              disabled={busy}
              testID={`use-existing-${patient.id}`}
              accessibilityLabel={`${t("worker:patients.useExisting")}: ${patient.displayName}`}
              onPress={() => onUse(patient.id)}
            >
              {t("worker:patients.useExisting")}
            </Button>
          </View>
        );
      })}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.xs,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
  },
});
