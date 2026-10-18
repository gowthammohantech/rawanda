/**
 * Result detail body (CTZ-03 task 4): values with units, measurement context, facility,
 * reviewer + release time, one plain-language sentence keyed by the result label, and the fixed
 * "not a diagnosis" line with a link to support. The Next steps CTA shows ONLY when an approved
 * instruction is linked to this result's review (task 5). "Something wrong?" (CTZ-07) opens a
 * correction request with this result preselected.
 */
import type { ReleasedObservation } from "@laif/domain";
import { formatDateTime, useLanguage } from "@laif/i18n";
import { facilityLabelKey } from "@laif/mock-data";
import {
  AppText,
  Button,
  Card,
  InfoCallout,
  KeyValueList,
  Section,
  spacing,
  useTx,
  type TranslationKey,
} from "@laif/ui-native";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { GLUCOSE_CONTEXT_KEYS, RESULT_MEANING, resultKindKey } from "./copy.ts";
import { ReadingValue, readingsOf } from "./ReadingValue.tsx";
import { ResultChip } from "./ResultCard.tsx";
import { ReviewProvenance } from "./ReviewProvenance.tsx";
import { UnderstandResultSheet } from "./UnderstandResultSheet.tsx";
import { SupportLink } from "../support/SupportLink.tsx";

export type ResultDetailProps = {
  result: ReleasedObservation;
  /** An approved next step is linked to this result (same review). */
  hasNextStep: boolean;
  onOpenNextSteps: () => void;
  /** CTZ-07 "Something wrong?" → correction request with this result preselected. */
  onReportProblem: () => void;
};

export function ResultDetail({
  result,
  hasNextStep,
  onOpenNextSteps,
  onReportProblem,
}: ResultDetailProps) {
  const t = useTx();
  const { language } = useLanguage();
  const [understandOpen, setUnderstandOpen] = useState(false);
  const readings = readingsOf(result.readings);
  const hasBp = readings.some((r) => r.kind === "bloodPressure");
  const hasGlucose = readings.some((r) => r.kind === "glucose");
  const context = result.readings.glucoseContext;

  const facts = [
    {
      id: "measured",
      label: t("citizen:health.detail.measured"),
      value: formatDateTime(result.measuredAt, language),
    },
    {
      id: "facility",
      label: t("citizen:health.detail.facility"),
      value: t(facilityLabelKey(result.facilityId) as TranslationKey),
    },
    ...(hasGlucose
      ? [
          {
            id: "context",
            label: t("citizen:health.detail.context"),
            value: t(GLUCOSE_CONTEXT_KEYS[context ?? "not_recorded"]),
          },
        ]
      : []),
  ];

  return (
    <View style={styles.root} testID="result-detail">
      <Card
        eyebrow={t("citizen:health.detail.readings")}
        title={t(resultKindKey(result.readings))}
        testID="result-readings"
      >
        <ResultChip result={result} />
        <View style={styles.values}>
          {readings.map((reading) => (
            <ReadingValue key={reading.kind} reading={reading} />
          ))}
        </View>
        <KeyValueList items={facts} testID="result-facts" />
      </Card>

      <Section title={t("citizen:health.meaning.title")} testID="result-meaning">
        <AppText variant="bodyLarge">
          {hasNextStep && result.label === "followUpAgreed"
            ? `${t(RESULT_MEANING[result.label])} ${t("citizen:health.meaning.seeNextSteps")}`
            : t(RESULT_MEANING[result.label])}
        </AppText>
        {hasNextStep ? (
          <Button
            icon="calendar"
            onPress={onOpenNextSteps}
            accessibilityHint={t("citizen:health.nextStepsHint")}
            testID="result-next-steps"
          >
            {t("citizen:health.nextStepsLink")}
          </Button>
        ) : null}
      </Section>

      <InfoCallout icon="info" testID="not-diagnosis">
        {`${t("citizen:health.notDiagnosis")} ${t("citizen:health.askCareTeam")}`}
      </InfoCallout>
      <SupportLink testID="result-support" />

      <Section title={t("citizen:health.detail.reviewer")}>
        <ReviewProvenance result={result} variant="detail" />
      </Section>

      <Button
        variant="ghost"
        icon="alert"
        onPress={onReportProblem}
        accessibilityHint={t("citizen:correction.somethingWrongHint")}
        testID="result-something-wrong"
      >
        {t("citizen:correction.somethingWrong")}
      </Button>

      <Button
        variant="secondary"
        icon="info"
        onPress={() => setUnderstandOpen(true)}
        testID="understand-open"
      >
        {t("citizen:health.understand.open")}
      </Button>
      <UnderstandResultSheet
        visible={understandOpen}
        onClose={() => setUnderstandOpen(false)}
        bloodPressure={hasBp}
        glucose={hasGlucose}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.lg },
  values: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xl },
});
