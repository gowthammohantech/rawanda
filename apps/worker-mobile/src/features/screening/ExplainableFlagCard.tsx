/**
 * Illustrative, explainable demo flag (HWM-06 task 2) — a soft-blue callout, never a diagnosis:
 *
 * - `requiresReview` → "May need clinician review (demo rule)" with every triggering reason code
 *   translated via `domain:reason.<code>` and the readings compared with the demo threshold;
 *   when the ruleset could not evaluate (missing required inputs → empty `reasonCodes`) a
 *   generic "needs a person to review" explanation is shown instead of an empty list;
 * - `requiresReview = false` → neutral "No demo rule triggered. A clinician may still review."
 *   — an explicit `not_recorded` glucose context still yields `GLUCOSE_CONTEXT_NOT_RECORDED`
 *   here, shown as a "for information" item (FND-02; PO decision pending, INDEX Q2);
 * - always: the inputs used, the ruleset version, preview / server-confirmed note and the
 *   footer disclaimer + `DEMO_RULE_NOT_CLINICALLY_VALIDATED` (the card never renders without it).
 */
import type { FlagResult, ReasonCode, ScreeningEvaluationInput } from "@laif/domain";
import { domainKey, formatMeasurement, useLanguage } from "@laif/i18n";
import {
  AppText,
  colors,
  Icon,
  KeyValueList,
  MicroLabel,
  radii,
  ReadingDisplay,
  RuleDisclaimer,
  spacing,
  TONE_COLORS,
  useTx,
  type KeyValueItem,
} from "@laif/ui-native";
import { StyleSheet, View } from "react-native";

export type ExplainableFlagCardProps = {
  flag: FlagResult;
  /** The inputs the rule used (flag-time values). */
  inputs: ScreeningEvaluationInput;
  /**
   * `true`: computed on this device, not yet confirmed by the server; `false`: server flag.
   * Omitted on the review screen (always a preview there).
   */
  preview?: boolean;
  testID?: string;
};

/** Reason codes that inform the reviewer but did not trigger review on their own. */
export function splitReasonCodes(flag: FlagResult): {
  triggers: ReasonCode[];
  information: ReasonCode[];
} {
  const informational = (code: ReasonCode) =>
    flag.evaluable && code === "GLUCOSE_CONTEXT_NOT_RECORDED";
  return {
    triggers: flag.reasonCodes.filter((code) => !informational(code)),
    information: flag.reasonCodes.filter(informational),
  };
}

export function ExplainableFlagCard({
  flag,
  inputs,
  preview = true,
  testID = "flag-card",
}: ExplainableFlagCardProps) {
  const t = useTx();
  const { language } = useLanguage();
  const palette = TONE_COLORS.info;
  const { triggers, information } = splitReasonCodes(flag);
  const headline = flag.requiresReview
    ? t("worker:review.mayNeedReview")
    : t("worker:review.flag.notTriggered");

  const inputItems: KeyValueItem[] = [];
  if (inputs.systolic !== null && inputs.diastolic !== null) {
    inputItems.push({
      id: "bp",
      label: t("worker:review.label.bloodPressure"),
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
      label: t("worker:review.label.glucose"),
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

  return (
    <View
      testID={testID}
      style={[styles.card, { backgroundColor: palette.bg, borderColor: palette.border }]}
    >
      <View style={styles.head}>
        <Icon name="info" size={18} color={palette.fg} />
        <AppText weight="semibold" colorValue={palette.fg} style={styles.flex}>
          {t("worker:review.flag.title")}
        </AppText>
        <AppText variant="caption" mono colorValue={palette.fg} testID="flag-ruleset">
          {t("worker:review.flag.ruleset", { version: flag.rulesetVersion })}
        </AppText>
      </View>

      <AppText
        weight="semibold"
        testID={flag.requiresReview ? "flag-may-need-review" : "flag-not-triggered"}
      >
        {headline}
      </AppText>

      {flag.requiresReview ? (
        <View style={styles.block}>
          <MicroLabel heading>{t("worker:review.flag.why")}</MicroLabel>
          {triggers.length === 0 ? (
            <AppText testID="flag-needs-person">{t("worker:review.flag.needsPerson")}</AppText>
          ) : (
            <View accessibilityRole="list">
              {triggers.map((code) => (
                <AppText key={code} testID={`flag-reason-${code}`}>
                  {`• ${t(domainKey("reason", code))}`}
                </AppText>
              ))}
            </View>
          )}
        </View>
      ) : null}

      {information.length === 0 ? null : (
        <View style={styles.block}>
          <MicroLabel heading>{t("worker:review.flag.forInformation")}</MicroLabel>
          {information.map((code) => (
            <AppText key={code} testID={`flag-info-${code}`}>
              {`• ${t(domainKey("reason", code))}`}
            </AppText>
          ))}
        </View>
      )}

      {flag.triggeringObservations.length === 0 ? null : (
        <View style={styles.block}>
          <MicroLabel heading>{t("worker:review.flag.compared")}</MicroLabel>
          <KeyValueList
            testID="flag-observations"
            items={flag.triggeringObservations.map((obs) => ({
              id: obs.code,
              label: t(domainKey("observation", obs.code)),
              value: t("worker:review.flag.comparedValue", {
                value: formatMeasurement(obs.value, obs.unit, language),
                threshold: formatMeasurement(obs.comparedTo, obs.unit, language),
              }),
            }))}
          />
        </View>
      )}

      {inputItems.length === 0 ? null : (
        <View style={styles.block}>
          <MicroLabel heading>{t("worker:review.flag.inputs")}</MicroLabel>
          <KeyValueList items={inputItems} testID="flag-inputs" />
        </View>
      )}

      <AppText variant="caption" color="muted" testID={preview ? "flag-preview" : "flag-confirmed"}>
        {preview ? t("worker:review.flag.preview") : t("worker:review.flag.confirmed")}
      </AppText>

      <View style={styles.footer}>
        <AppText weight="medium" testID="flag-disclaimer">
          {t("worker:review.disclaimer")}
        </AppText>
        <RuleDisclaimer compact />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md, padding: spacing.lg, borderWidth: 1, borderRadius: radii.md },
  head: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  flex: { flex: 1 },
  block: { gap: spacing.xs },
  footer: {
    gap: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
  },
});
