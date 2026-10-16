import type { FlagResult, ScreeningEvaluationInput } from "@laif/domain";
import { domainKey, formatMeasurement, useLanguage } from "@laif/i18n";
import { StyleSheet, View } from "react-native";

import { useTx } from "../i18n.ts";
import { spacing } from "../tokens.ts";
import { AppText } from "./AppText.tsx";
import { Card } from "./Card.tsx";
import { KeyValueList, type KeyValueItem } from "./KeyValueList.tsx";
import { MicroLabel } from "./MicroLabel.tsx";
import { ReadingDisplay } from "./ReadingDisplay.tsx";
import { RuleDisclaimer } from "./RuleDisclaimer.tsx";
import { StatusChip } from "./StatusChip.tsx";

export type ExplainableFlagProps = {
  flag: FlagResult;
  /** The inputs the rule saw (frozen evidence snapshot). */
  inputs?: ScreeningEvaluationInput;
  /** Compact summary: omits the inputs list. */
  compact?: boolean;
};

/**
 * Native twin of the ui-web `ExplainableFlag`: status, translated reason codes, readings
 * compared with the demo ruleset, ruleset version, inputs and the rule disclaimer.
 */
export function ExplainableFlag({ flag, inputs, compact = false }: ExplainableFlagProps) {
  const t = useTx();
  const { language } = useLanguage();
  const status = !flag.evaluable
    ? { tone: "warning" as const, text: t("common:flag.notEvaluable") }
    : flag.requiresReview
      ? { tone: "danger" as const, text: t("common:flag.requiresReview") }
      : { tone: "positive" as const, text: t("common:flag.noReviewNeeded") };

  const inputItems: KeyValueItem[] = [];
  if (inputs !== undefined) {
    if (inputs.systolic !== null && inputs.diastolic !== null) {
      inputItems.push({
        id: "bp",
        label: t("common:flag.input.bloodPressure"),
        value: (
          <ReadingDisplay
            kind="bloodPressure"
            systolic={inputs.systolic}
            diastolic={inputs.diastolic}
          />
        ),
      });
    }
    if (inputs.glucoseValue !== null) {
      inputItems.push({
        id: "glucose",
        label: t("common:flag.input.glucose"),
        value: (
          <ReadingDisplay
            kind="glucose"
            value={inputs.glucoseValue}
            unit={inputs.glucoseUnit}
            context={inputs.glucoseContext}
          />
        ),
      });
    }
    if (inputs.glucoseValue !== null && inputs.glucoseContext === null) {
      inputItems.push({
        id: "context",
        label: t("common:flag.input.glucoseContext"),
        value: t("common:ui.notRecorded"),
      });
    }
  }

  return (
    <Card
      testID="explainable-flag"
      title={t("common:flag.title")}
      meta={t("common:flag.ruleset", { version: flag.rulesetVersion })}
    >
      <StatusChip tone={status.tone}>{status.text}</StatusChip>

      <View style={styles.block}>
        <MicroLabel heading>{t("common:flag.reasons")}</MicroLabel>
        {flag.reasonCodes.length === 0 ? (
          <AppText variant="caption" color="muted">
            {t("common:flag.noReasons")}
          </AppText>
        ) : (
          <View accessibilityRole="list">
            {flag.reasonCodes.map((code) => (
              <AppText key={code} testID={`flag-reason-${code}`}>
                {`• ${t(domainKey("reason", code))}`}
              </AppText>
            ))}
          </View>
        )}
      </View>

      {flag.triggeringObservations.length === 0 ? null : (
        <View style={styles.block}>
          <MicroLabel heading>{t("common:flag.observations")}</MicroLabel>
          <KeyValueList
            items={flag.triggeringObservations.map((obs) => ({
              id: obs.code,
              label: t(domainKey("observation", obs.code)),
              value: t("common:flag.observationValue", {
                value: formatMeasurement(obs.value, obs.unit, language),
                threshold: formatMeasurement(obs.comparedTo, obs.unit, language),
              }),
            }))}
          />
        </View>
      )}

      {compact || inputItems.length === 0 ? null : (
        <View style={styles.block}>
          <MicroLabel heading>{t("common:flag.inputs")}</MicroLabel>
          <KeyValueList items={inputItems} />
        </View>
      )}

      <RuleDisclaimer compact={compact} />
    </Card>
  );
}

const styles = StyleSheet.create({
  block: { gap: spacing.xs },
});
