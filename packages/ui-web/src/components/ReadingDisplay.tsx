import type { GlucoseContext, GlucoseUnit } from "@laif/domain";
import { domainKey, formatMeasurement, formatNumber, useLanguage } from "@laif/i18n";

import { cx } from "../cx.ts";
import { useTx } from "../i18n.ts";
import { StatusChip } from "./StatusChip.tsx";

export type ReadingDisplayProps =
  | { kind: "bloodPressure"; systolic: number; diastolic: number; className?: string }
  | {
      kind: "glucose";
      value: number;
      /** `null` = unit missing → value shown with an `UNIT MISSING` chip (never a bare number). */
      unit: GlucoseUnit | null;
      context?: GlucoseContext | null;
      className?: string;
    }
  | { kind: "measurement"; value: number; unit: string | null; className?: string };

/** Clinical value + unit, always: `152/96 mmHg`, `7.8 mmol/L · non-fasting`. */
export function ReadingDisplay(props: ReadingDisplayProps) {
  const t = useTx();
  const { language } = useLanguage();
  if (props.kind === "bloodPressure") {
    return (
      <span className={cx("text-ink font-medium tabular-nums", props.className)}>
        {formatMeasurement(
          { systolic: props.systolic, diastolic: props.diastolic },
          "mmHg",
          language,
        )}
      </span>
    );
  }
  const unit = props.unit;
  const context =
    props.kind === "glucose" && props.context !== undefined && props.context !== null
      ? t(domainKey("glucoseContext", props.context))
      : null;
  return (
    <span className={cx("inline-flex flex-wrap items-center gap-x-1.5 gap-y-1", props.className)}>
      <span className="text-ink font-medium tabular-nums">
        {unit === null || unit.trim() === ""
          ? formatNumber(props.value, language)
          : formatMeasurement(props.value, unit, language)}
      </span>
      {unit === null || unit.trim() === "" ? (
        <StatusChip tone="warning">{t("common:ui.unitMissing")}</StatusChip>
      ) : null}
      {context === null ? null : <span className="text-muted text-[13px]">{`· ${context}`}</span>}
    </span>
  );
}
