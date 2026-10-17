/**
 * Clinical reading with explicit unit and measurement context (CLN-04 task 3, FRD §4):
 * `152/96 mmHg`, `7.8 mmol/L · Non-fasting`. A glucose value without a unit shows the raw value
 * (never converted, never a unit assumed), an `UNIT MISSING` warning pill and the text "Value
 * recorded without unit — not evaluated by demo rules". The context is always shown (a missing
 * one reads "Not recorded"). Values with a unit delegate to the FND-09 `ReadingDisplay`.
 */
import type { GlucoseContext, GlucoseUnit } from "@laif/domain";
import { domainKey, formatNumber, useLanguage } from "@laif/i18n";
import { ReadingDisplay as SharedReadingDisplay, StatusChip, useTx } from "@laif/ui-web";

export type TimelineReadingProps =
  | { kind: "bloodPressure"; systolic: number | null; diastolic: number | null }
  | {
      kind: "glucose";
      value: number | null;
      unit: GlucoseUnit | null;
      context: GlucoseContext | null;
    };

export function ReadingDisplay(props: TimelineReadingProps) {
  const t = useTx();
  const { language } = useLanguage();
  const notMeasured = (
    <span className="text-muted text-sm">{t("clinical:timeline.screening.notMeasured")}</span>
  );

  if (props.kind === "bloodPressure") {
    if (props.systolic === null || props.diastolic === null) return notMeasured;
    return (
      <SharedReadingDisplay
        kind="bloodPressure"
        systolic={props.systolic}
        diastolic={props.diastolic}
      />
    );
  }

  if (props.value === null) return notMeasured;
  const context = props.context ?? "not_recorded";
  if (props.unit === null) {
    return (
      <span className="inline-flex flex-col gap-1" data-testid="reading-unit-missing">
        <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1">
          <span className="text-ink font-medium tabular-nums">
            {formatNumber(props.value, language)}
          </span>
          <StatusChip tone="warning" icon="alert">
            {t("clinical:timeline.unitMissing.title")}
          </StatusChip>
          <span className="text-muted text-[13px]">{`· ${t(domainKey("glucoseContext", context))}`}</span>
        </span>
        <span className="text-risk-warning text-xs font-medium">
          {t("clinical:timeline.unitMissing.body")}
        </span>
      </span>
    );
  }
  return (
    <SharedReadingDisplay kind="glucose" value={props.value} unit={props.unit} context={context} />
  );
}
