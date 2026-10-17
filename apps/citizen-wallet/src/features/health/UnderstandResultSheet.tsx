/**
 * "Understand my result" (CTZ-03 task 6): a GENERIC explanation of what a blood pressure / blood
 * glucose check measures and that only the care team decides what a result means. It never
 * explains the citizen's own values — no thresholds, ranges or "high / low / normal" words.
 * Copy keys are flagged `needs clinical/linguistic review`.
 */
import { AppText, Button, Section, Sheet, spacing, useTx } from "@laif/ui-native";
import { StyleSheet, View } from "react-native";

export type UnderstandResultSheetProps = {
  visible: boolean;
  onClose: () => void;
  /** Which explanations to show (those the result has values for). */
  bloodPressure: boolean;
  glucose: boolean;
};

export function UnderstandResultSheet({
  visible,
  onClose,
  bloodPressure,
  glucose,
}: UnderstandResultSheetProps) {
  const t = useTx();
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={t("citizen:health.understand.title")}
      description={t("citizen:health.understand.intro")}
      testID="understand-sheet"
      footer={
        <Button variant="secondary" fullWidth onPress={onClose} testID="understand-close">
          {t("citizen:health.understand.close")}
        </Button>
      }
    >
      <View style={styles.body}>
        {bloodPressure ? (
          <Section title={t("citizen:health.understand.bpTitle")}>
            <AppText>{t("citizen:health.understand.bpBody")}</AppText>
          </Section>
        ) : null}
        {glucose ? (
          <Section title={t("citizen:health.understand.glucoseTitle")}>
            <AppText>{t("citizen:health.understand.glucoseBody")}</AppText>
          </Section>
        ) : null}
        <AppText weight="semibold">{t("citizen:health.understand.clinician")}</AppText>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({ body: { gap: spacing.lg } });
