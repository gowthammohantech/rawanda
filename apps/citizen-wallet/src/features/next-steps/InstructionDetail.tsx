/**
 * Next step detail body (CTZ-04 task 3): full instruction text from its catalogue key, when and
 * where, what to bring (when the kind has an approved key), who agreed it, the date-passed /
 * completion / cancelled lines, "I have read this", the facility contact card, "To change this,
 * contact your care team" and the fixed no-advice line. No booking or rescheduling.
 */
import type { ApprovedInstruction } from "@laif/domain";
import { useLanguage } from "@laif/i18n";
import {
  AppText,
  Button,
  Card,
  InfoCallout,
  KeyValueList,
  Section,
  StatusChip,
  spacing,
  useTx,
} from "@laif/ui-native";
import { StyleSheet, View } from "react-native";

import { AcknowledgeButton } from "./AcknowledgeButton.tsx";
import { ApprovedByLine } from "./ApprovedByLine.tsx";
import { completionLines } from "./CompletedStepRow.tsx";
import { KIND_SPECS, stepTexts } from "./copy.ts";
import { DatePassedNotice } from "./DatePassedNotice.tsx";
import { FacilityContactCard } from "./FacilityContactCard.tsx";
import { ApprovedChip, whenText } from "./NextStepCard.tsx";

export type InstructionDetailProps = {
  step: ApprovedInstruction;
  onReload: () => unknown;
  onOpenSupport: () => void;
};

export function InstructionDetail({ step, onReload, onOpenSupport }: InstructionDetailProps) {
  const t = useTx();
  const { language } = useLanguage();
  const texts = stepTexts(t, step);
  const status = completionLines(t, step, language);

  return (
    <View style={styles.root} testID="instruction-detail">
      <Card eyebrow={texts.type} title={texts.heading} testID="instruction-summary">
        <View style={styles.chips}>
          <StatusChip tone="neutral" icon={KIND_SPECS[step.kind].icon}>
            {texts.type}
          </StatusChip>
          <ApprovedChip />
        </View>
        <ApprovedByLine step={step} />
        <KeyValueList
          testID="instruction-facts"
          items={[
            {
              id: "when",
              label: t("citizen:nextSteps.detail.when"),
              value: whenText(t, { ...step }, language, texts.facility),
            },
            { id: "where", label: t("citizen:nextSteps.detail.where"), value: texts.facility },
          ]}
        />
        {step.datePassed ? <DatePassedNotice /> : null}
        {status.length > 0 ? (
          <View testID="instruction-status">
            {status.map((line) => (
              <AppText key={line} weight="semibold">
                {line}
              </AppText>
            ))}
          </View>
        ) : null}
      </Card>

      <Section title={t("citizen:nextSteps.detail.instructions")} testID="instruction-text">
        <AppText variant="bodyLarge">{texts.message}</AppText>
      </Section>

      {texts.bring === null ? null : (
        <Section title={t("citizen:nextSteps.detail.bring")} testID="instruction-bring">
          <AppText>{texts.bring}</AppText>
        </Section>
      )}

      {step.progress === "cancelled" ? null : <AcknowledgeButton step={step} onReload={onReload} />}

      <FacilityContactCard facilityId={step.facilityId} facilityName={texts.facility} />

      <InfoCallout testID="to-change">
        {`${t("citizen:nextSteps.toChangeContact")} ${t("citizen:nextSteps.noAdvice")}`}
      </InfoCallout>
      <Button
        variant="ghost"
        onPress={onOpenSupport}
        accessibilityHint={t("citizen:nextSteps.supportHint")}
        testID="next-step-support"
      >
        {t("citizen:nextSteps.supportLink")}
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.lg },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
});
