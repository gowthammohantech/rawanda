/**
 * "Invariant checks" card (ADM-06): completed referrals without evidence — must be 0 by the
 * FND-02 invariant, shown with a check icon (an alert icon if it ever is not) — and duplicate
 * submissions prevented by the repository's idempotency check.
 */
import type { AggregateCell } from "@laif/analytics";
import { Card, Icon, useTx } from "@laif/ui-web";

import { SuppressedValue } from "../../components/SuppressedValue.tsx";

export function InvariantChecks({
  completedWithoutEvidence,
  duplicateSubmissions,
  threshold,
}: {
  completedWithoutEvidence: AggregateCell;
  duplicateSubmissions: AggregateCell;
  threshold: number;
}) {
  const t = useTx();
  const holds = !completedWithoutEvidence.suppressed && completedWithoutEvidence.value === 0;
  return (
    <Card title={t("admin:quality.invariants.title")}>
      <ul
        className="m-0 flex list-none flex-col gap-3 p-0 text-[13px]"
        data-testid="invariant-checks"
      >
        <li className="flex items-start gap-2" data-testid="invariant-evidence" data-holds={holds}>
          <Icon
            name={holds ? "check" : "alert"}
            size={18}
            className={holds ? "text-positive mt-0.5 shrink-0" : "text-danger mt-0.5 shrink-0"}
          />
          <span className="min-w-0 flex-1">
            <span className="text-ink block font-medium">
              {t("admin:quality.invariants.evidence")}
            </span>
            <span className="text-muted block text-xs">
              {holds ? t("admin:quality.invariants.holds") : t("admin:quality.invariants.broken")}
            </span>
          </span>
          <span className="text-ink font-semibold">
            <SuppressedValue cell={completedWithoutEvidence} threshold={threshold} compact />
          </span>
        </li>
        <li className="flex items-start gap-2" data-testid="invariant-duplicates">
          <Icon name="shield" size={18} className="text-primary mt-0.5 shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="text-ink block font-medium">
              {t("admin:quality.invariants.duplicates")}
            </span>
            <span className="text-muted block text-xs">
              {t("admin:quality.invariants.duplicatesSub")}
            </span>
          </span>
          <span className="text-ink font-semibold">
            <SuppressedValue cell={duplicateSubmissions} threshold={threshold} compact />
          </span>
        </li>
      </ul>
    </Card>
  );
}
