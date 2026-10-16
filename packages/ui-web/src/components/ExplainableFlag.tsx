import type { FlagResult, ScreeningEvaluationInput } from "@laif/domain";
import { domainKey, formatMeasurement, useLanguage } from "@laif/i18n";

import { cx } from "../cx.ts";
import { useTx } from "../i18n.ts";
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
  /** Compact = sidebar summary (CLN-07); omits the inputs list. */
  compact?: boolean;
  className?: string;
};

/**
 * Explains a demo-rule flag: status, translated reason codes (`domain:reason.*`), the readings
 * compared with the ruleset, the ruleset version, the inputs, and the rule disclaimer.
 * Presentational only; CLN-06/07 compose it.
 */
export function ExplainableFlag({
  flag,
  inputs,
  compact = false,
  className,
}: ExplainableFlagProps) {
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
      title={t("common:flag.title")}
      meta={
        <span className="text-muted font-mono text-[11px]">
          {t("common:flag.ruleset", { version: flag.rulesetVersion })}
        </span>
      }
      className={cx("space-y-4", className)}
    >
      <StatusChip tone={status.tone}>{status.text}</StatusChip>

      <div>
        <MicroLabel as="h3" className="mb-2">
          {t("common:flag.reasons")}
        </MicroLabel>
        {flag.reasonCodes.length === 0 ? (
          <p className="text-muted text-[13px]">{t("common:flag.noReasons")}</p>
        ) : (
          <ul className="text-ink m-0 list-disc space-y-1 ps-5 text-[13px]">
            {flag.reasonCodes.map((code) => (
              <li key={code} data-reason={code}>
                {t(domainKey("reason", code))}
              </li>
            ))}
          </ul>
        )}
      </div>

      {flag.triggeringObservations.length === 0 ? null : (
        <div>
          <MicroLabel as="h3" className="mb-2">
            {t("common:flag.observations")}
          </MicroLabel>
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
        </div>
      )}

      {compact || inputItems.length === 0 ? null : (
        <div>
          <MicroLabel as="h3" className="mb-2">
            {t("common:flag.inputs")}
          </MicroLabel>
          <KeyValueList items={inputItems} />
        </div>
      )}

      <RuleDisclaimer compact={compact} />
    </Card>
  );
}
