/**
 * Read-only evidence sidebar of the decision page (CLN-07): the compact FND-09 `ExplainableFlag`
 * (status, reason codes, ruleset version, rule disclaimer) of the FROZEN flag-time snapshot, plus
 * the triggering inputs with value + unit (CLN-06 `explainFlag`), and a link back to the full
 * review detail. Never a diagnosis or recommendation.
 */
import { explainFlag, type EvidenceSnapshot } from "@laif/domain";
import { DEMO_RULESET_V1 } from "@laif/mock-data";
import type { ReviewDetail } from "@laif/repositories";
import { Card, ExplainableFlag, KeyValueList, RuleDisclaimer, useTx } from "@laif/ui-web";
import { useMemo } from "react";
import { Link } from "react-router";

import { routes } from "../../app/routes.ts";
import { EvidenceStatusPill, EvidenceValue } from "../reviews/EvidencePanel.tsx";
import { rulesetFor } from "../reviews/hooks.ts";

function asSnapshot(value: unknown): EvidenceSnapshot | null {
  const snap = value as Partial<EvidenceSnapshot> | null | undefined;
  return typeof snap === "object" &&
    snap !== null &&
    typeof snap.flag === "object" &&
    snap.flag !== null &&
    typeof snap.inputs === "object" &&
    snap.inputs !== null
    ? (snap as EvidenceSnapshot)
    : null;
}

export function DecisionEvidenceSummary({ detail }: { detail: ReviewDetail }) {
  const t = useTx();
  const { review, screening } = detail;
  const snapshot = asSnapshot(review.evidenceSnapshot);
  const version = snapshot?.flag.rulesetVersion ?? screening?.rulesetVersion ?? "—";
  const items = useMemo(() => {
    if (snapshot === null) return [];
    const ruleset = rulesetFor(version);
    return explainFlag(snapshot, screening, {
      version,
      requiredInputs: ruleset?.requiredInputs ?? DEMO_RULESET_V1.requiredInputs,
    }).items.filter((item) => item.status === "TRIGGERED");
  }, [snapshot, screening, version]);

  return (
    <Card
      title={t("clinical:decision.evidence.title")}
      meta={t("clinical:decision.evidence.subtitle")}
    >
      <div data-testid="decision-evidence" className="space-y-3">
        {snapshot === null ? (
          <>
            <p className="text-muted m-0 text-sm">{t("clinical:decision.evidence.unavailable")}</p>
            <RuleDisclaimer compact />
          </>
        ) : (
          <>
            <ExplainableFlag flag={snapshot.flag} compact />
            {items.length === 0 ? null : (
              <KeyValueList
                items={items.map((item) => ({
                  id: item.inputKey,
                  label: t(`clinical:review.evidence.inputs.${item.inputKey}`),
                  value: (
                    <span className="inline-flex flex-wrap items-center gap-2">
                      <EvidenceValue item={item} />
                      <EvidenceStatusPill status={item.status} />
                    </span>
                  ),
                }))}
              />
            )}
          </>
        )}
        <Link
          to={routes.review(review.id)}
          className="text-primary-dark target-min inline-flex items-center text-sm font-semibold underline"
        >
          {t("clinical:decision.evidence.openDetail")}
        </Link>
      </div>
    </Card>
  );
}
