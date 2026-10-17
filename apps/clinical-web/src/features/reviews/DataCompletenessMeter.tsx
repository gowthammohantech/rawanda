/**
 * Data completeness (CLN-06 task 5): thin progress bar "4 of 5 required inputs present" + the list
 * of missing inputs. Required = the demo ruleset's `requiredInputs` plus, when glucose was
 * recorded, its value / unit / fasting status (`explainFlag`). The meter text is always rendered
 * (screen readers get the same sentence as the bar's accessible name).
 */
import type { DataCompleteness } from "@laif/domain";
import { ProgressBar, useTx } from "@laif/ui-web";

export type DataCompletenessMeterProps = { completeness: DataCompleteness };

export function DataCompletenessMeter({ completeness }: DataCompletenessMeterProps) {
  const t = useTx();
  const total = completeness.required.length;
  const present = completeness.present.length;
  const label = t("clinical:review.completeness.label", { present, total });
  const missing = completeness.missing.map((key) => t(`clinical:review.evidence.inputs.${key}`));
  return (
    <div data-testid="completeness-meter" className="space-y-1.5">
      <p className="micro-label text-muted m-0">{t("clinical:review.completeness.title")}</p>
      <ProgressBar
        value={present}
        max={Math.max(total, 1)}
        label={label}
        valueText={`${present}/${total}`}
        tone={missing.length === 0 ? "positive" : "warning"}
      />
      <p className="text-muted m-0 text-[13px]" data-testid="completeness-missing">
        {missing.length === 0
          ? t("clinical:review.completeness.complete")
          : t("clinical:review.completeness.missing", { inputs: missing.join(", ") })}
      </p>
    </div>
  );
}
