/**
 * Flag header card (CLN-06 task 3, ref-image 2): `FLAG FOR REVIEW` mono label, the reason codes as
 * plain-language sentences naming the ruleset (`clinical:review.flag.summary.<REASON_CODE>`), the
 * ruleset chip `Demo ruleset <version> · not clinically validated` (opens a dialog listing the
 * ruleset's rules and its `DEMO_RULE_NOT_CLINICALLY_VALIDATED` status), the data-completeness
 * meter, and the FND-09 `ExplainableFlag` (status, readings compared with the demo rule, rule
 * disclaimer). Never a diagnosis; a threshold only appears labelled "Demo placeholder value".
 */
import {
  DEMO_RULE_DISCLAIMER,
  DEMO_RULE_IDS,
  type DataCompleteness,
  type DemoRuleId,
  type EvidenceSnapshot,
  type Review,
} from "@laif/domain";
import { formatDate, formatDateTime, formatMeasurement, useLanguage } from "@laif/i18n";
import {
  Button,
  Drawer,
  ExplainableFlag,
  Icon,
  KeyValueList,
  MicroLabel,
  RuleDisclaimer,
  useTx,
} from "@laif/ui-web";
import { useState } from "react";

import { DataCompletenessMeter } from "./DataCompletenessMeter.tsx";
import type { KnownRuleset } from "./hooks.ts";

export type ReviewFlagHeaderProps = {
  review: Review;
  snapshot: EvidenceSnapshot;
  completeness: DataCompleteness;
  /** The demo ruleset config of the snapshot's version (null = unknown to this demo). */
  ruleset: KnownRuleset | null;
};

function RulesetDialogBody({ ruleset }: { ruleset: KnownRuleset | null }) {
  const t = useTx();
  const { language } = useLanguage();
  if (ruleset === null) {
    return (
      <p className="text-muted m-0 text-sm">{t("clinical:review.flag.rulesetModal.unknown")}</p>
    );
  }
  const th = ruleset.thresholds;
  const mmol = (value: number) => formatMeasurement(value, "mmol/L", language);
  const placeholder: Partial<Record<DemoRuleId, string>> = {
    "BP-1": formatMeasurement(th.DEMO_SYSTOLIC_REVIEW_AT_OR_ABOVE, "mmHg", language),
    "BP-2": formatMeasurement(th.DEMO_DIASTOLIC_REVIEW_AT_OR_ABOVE, "mmHg", language),
    "GLU-1": (["fasting", "non_fasting", "not_recorded"] as const)
      .map(
        (ctx) =>
          `${t(`domain:glucoseContext.${ctx}`)} ${mmol(th.DEMO_GLUCOSE_REVIEW_AT_OR_ABOVE_MMOL[ctx])}`,
      )
      .join(" · "),
  };
  const requiredInputs = ruleset.requiredInputs
    .map((key) =>
      key === "systolic" || key === "diastolic" || key === "glucoseValue"
        ? t(`clinical:review.evidence.inputs.${key}`)
        : key,
    )
    .join(", ");
  return (
    <div className="space-y-4" data-testid="ruleset-dialog">
      <RuleDisclaimer compact />
      <KeyValueList
        items={[
          {
            id: "status",
            label: t("clinical:review.flag.rulesetModal.status"),
            value:
              ruleset.status === "active"
                ? t("clinical:review.flag.rulesetModal.statusActive")
                : t("clinical:review.flag.rulesetModal.statusRetired"),
          },
          {
            id: "validation",
            label: t("clinical:review.flag.rulesetModal.validation"),
            value: <span className="font-mono text-xs break-all">{DEMO_RULE_DISCLAIMER}</span>,
          },
          {
            id: "approvedBy",
            label: t("clinical:review.flag.rulesetModal.approvedBy"),
            value: t("clinical:review.flag.rulesetModal.notApproved"),
          },
          {
            id: "effectiveFrom",
            label: t("clinical:review.flag.rulesetModal.effectiveFrom"),
            value: formatDate(ruleset.effectiveFrom, language),
          },
          {
            id: "requiredInputs",
            label: t("clinical:review.flag.rulesetModal.requiredInputs"),
            value: requiredInputs,
          },
        ]}
      />
      <div>
        <h3 className="micro-label text-muted m-0 mb-2">
          {t("clinical:review.flag.rulesetModal.rules")}
        </h3>
        <ul className="m-0 list-none space-y-3 p-0">
          {Object.values(DEMO_RULE_IDS).map((id) => (
            <li key={id} className="text-[13px]" data-rule={id}>
              <span className="text-muted block font-mono text-[11px]">{`${ruleset.version}/${id}`}</span>
              <span className="text-ink block">{t(`clinical:review.rules.${id}`)}</span>
              {placeholder[id] === undefined ? null : (
                <span className="text-risk-warning block text-xs font-medium">
                  {t("clinical:review.flag.rulesetModal.placeholder", { value: placeholder[id] })}
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function ReviewFlagHeader({
  review,
  snapshot,
  completeness,
  ruleset,
}: ReviewFlagHeaderProps) {
  const t = useTx();
  const { language } = useLanguage();
  const [rulesOpen, setRulesOpen] = useState(false);
  const { flag } = snapshot;
  const version = flag.rulesetVersion;
  const sentences =
    flag.reasonCodes.length > 0
      ? flag.reasonCodes.map((code) => ({
          id: code,
          text: t(`clinical:review.flag.summary.${code}`, { version }),
        }))
      : [
          review.origin === "manual_escalation"
            ? { id: "manual", text: t("clinical:review.flag.summary.manual") }
            : {
                id: "notEvaluable",
                text: t("clinical:review.flag.summary.notEvaluable", { version }),
              },
        ];

  return (
    <div className="space-y-4">
      <section
        aria-labelledby="flag-header-label"
        data-testid="review-flag-header"
        className="border-border-soft bg-surface shadow-card space-y-4 rounded-lg border p-5"
      >
        <div className="space-y-2">
          <MicroLabel as="h2" id="flag-header-label" tone="danger">
            {t("clinical:review.flag.label")}
          </MicroLabel>
          <ul
            className="text-ink m-0 list-none space-y-1 p-0 text-base font-medium"
            data-testid="flag-summary"
          >
            {sentences.map((s) => (
              <li key={s.id} data-reason={s.id}>
                {s.text}
              </li>
            ))}
          </ul>
          <p className="text-muted m-0 text-[13px]">{t("clinical:review.flag.disclaimer")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Drawer
            open={rulesOpen}
            onOpenChange={setRulesOpen}
            title={t("clinical:review.flag.rulesetModal.title", { version })}
            description={t("clinical:review.flag.rulesetModal.description")}
            trigger={
              <button
                type="button"
                data-testid="ruleset-chip"
                aria-haspopup="dialog"
                title={t("clinical:review.flag.rulesetChipHint")}
                className="rounded-pill bg-risk-warning-soft text-risk-warning border-risk-warning/25 target-min inline-flex items-center gap-1.5 border px-3 py-1 text-xs font-semibold"
              >
                <Icon name="shield" size={14} />
                {t("clinical:review.flag.rulesetChip", { version })}
              </button>
            }
            footer={
              <Button variant="secondary" onClick={() => setRulesOpen(false)}>
                {t("clinical:review.flag.rulesetModal.close")}
              </Button>
            }
          >
            <RulesetDialogBody ruleset={ruleset} />
          </Drawer>
          <span className="text-muted text-xs">
            {t("clinical:review.flag.snapshotAt", {
              time: formatDateTime(snapshot.capturedAt, language),
            })}
          </span>
        </div>
        <DataCompletenessMeter completeness={completeness} />
      </section>
      <ExplainableFlag flag={flag} compact />
    </div>
  );
}
