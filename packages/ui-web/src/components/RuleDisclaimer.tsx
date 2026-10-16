import { DEMO_RULE_DISCLAIMER } from "@laif/domain";

import { cx } from "../cx.ts";
import { useTx } from "../i18n.ts";
import { Icon } from "../icons/Icon.tsx";

export type RuleDisclaimerProps = { className?: string; compact?: boolean };

/** `DEMO_RULE_NOT_CLINICALLY_VALIDATED` code + translated explanation. */
export function RuleDisclaimer({ className, compact = false }: RuleDisclaimerProps) {
  const t = useTx();
  return (
    <div
      role="note"
      className={cx(
        "border-risk-warning/25 bg-risk-warning-soft text-risk-warning flex gap-2 rounded-md border",
        compact ? "px-3 py-2 text-xs" : "px-4 py-3 text-[13px]",
        className,
      )}
    >
      <Icon name="alert" size={16} className="mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="micro-label font-semibold break-all">{DEMO_RULE_DISCLAIMER}</p>
        <p>{t("demo:ruleDisclaimerExplanation")}</p>
      </div>
    </div>
  );
}
