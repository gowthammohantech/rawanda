/**
 * Rulesets tab (ADM-08 task 2, T-10): the demo ruleset history — version, status, effective
 * dates, change summary, who recorded it, and the in-scope screenings evaluated under each
 * version (aggregate, suppressed below k) with the flagged share. Every row is badged
 * `DEMO_RULE_NOT_CLINICALLY_VALIDATED`; the expanded row lists the reason codes and the label
 * "Illustrative demo placeholder — requires clinical approval". Thresholds are NEVER shown:
 * they are placeholders, not approved values. Read-only (rule changes are clinical-governance
 * decisions, out of scope).
 */
import { formatDate, useLanguage } from "@laif/i18n";
import {
  Card,
  EmptyState,
  ErrorState,
  errorCodeOf,
  ExpandableRow,
  LoadingSkeleton,
  MicroLabel,
  RuleDisclaimer,
  StatusChip,
  useTx,
  type TranslationKey,
} from "@laif/ui-web";

import { SuppressedValue } from "../../components/SuppressedValue.tsx";
import { useSuppressionThreshold } from "../metrics/queries.ts";
import { usePercentFormat } from "../workload/format.ts";
import { useRulesetHistory, type RulesetRow } from "./queries.ts";

export function RulesetHistory() {
  const t = useTx();
  const { language } = useLanguage();
  const threshold = useSuppressionThreshold();
  const query = useRulesetHistory();
  const date = (iso: string) => formatDate(iso, language);
  const percent = usePercentFormat();

  return (
    <div data-testid="ruleset-history" className="flex flex-col gap-4">
      <RuleDisclaimer />
      <Card title={t("admin:governance.rulesets.title")}>
        <p className="text-muted mt-0 mb-3 text-[13px]">
          {t("admin:governance.rulesets.subtitle")}
        </p>
        {query.isPending ? (
          <LoadingSkeleton variant="table" lines={2} />
        ) : query.isError ? (
          <ErrorState
            code={errorCodeOf(query.error) ?? "INTERNAL"}
            message={t("admin:governance.rulesets.error")}
            onRetry={() => query.refetch()}
          />
        ) : query.data.length === 0 ? (
          <EmptyState icon="file" title={t("admin:governance.rulesets.empty")} />
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {query.data.map((row: RulesetRow) => (
              <li key={row.version} data-testid={`ruleset-${row.version}`}>
                <ExpandableRow
                  title={<span className="font-mono text-[13px]">{row.version}</span>}
                  subtitle={t("admin:governance.rulesets.effective", {
                    from: date(row.effectiveFrom),
                    to:
                      row.effectiveTo === null
                        ? t("admin:governance.rulesets.ongoing")
                        : date(row.effectiveTo),
                  })}
                  trailing={
                    <span className="flex flex-wrap items-center gap-2">
                      <StatusChip tone={row.status === "active" ? "positive" : "neutral"}>
                        {t(`admin:governance.rulesets.status.${row.status}` as TranslationKey)}
                      </StatusChip>
                      <MicroLabel tone="warning">{row.label}</MicroLabel>
                    </span>
                  }
                >
                  <dl className="m-0 grid gap-x-6 gap-y-2 text-[13px] sm:grid-cols-2">
                    <div>
                      <dt className="text-muted">{t("admin:governance.rulesets.evaluated")}</dt>
                      <dd className="text-ink m-0 font-semibold tabular-nums">
                        <SuppressedValue cell={row.screeningsEvaluated} threshold={threshold} />
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted">{t("admin:governance.rulesets.flaggedShare")}</dt>
                      <dd className="text-ink m-0 font-semibold tabular-nums">
                        <SuppressedValue
                          cell={row.flaggedShare}
                          threshold={threshold}
                          format={percent}
                          derived
                        />
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted">{t("admin:governance.rulesets.change")}</dt>
                      <dd className="text-ink m-0">
                        {t(
                          `admin:governance.rulesets.changeSummary.${row.changeSummaryKey}` as TranslationKey,
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted">{t("admin:governance.rulesets.changedBy")}</dt>
                      <dd className="text-ink m-0">
                        {t(
                          `admin:governance.rulesets.changedByValue.${row.changedBy}` as TranslationKey,
                        )}
                      </dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="text-muted">{t("admin:governance.rulesets.reasonCodes")}</dt>
                      <dd className="m-0">
                        <ul className="m-0 mt-1 flex list-none flex-wrap gap-1.5 p-0">
                          {row.reasonCodes.map((code) => (
                            <li
                              key={code}
                              className="border-border-soft bg-background text-ink rounded-sm border px-1.5 py-0.5 text-xs"
                            >
                              <span className="font-mono">{code}</span>
                              <span className="text-muted"> · </span>
                              {t(`domain:reason.${code}` as TranslationKey)}
                            </li>
                          ))}
                        </ul>
                      </dd>
                    </div>
                  </dl>
                  <p
                    className="border-risk-warning/25 bg-risk-warning-soft text-ink m-0 mt-3 rounded-sm border px-3 py-2 text-xs font-medium"
                    data-testid="ruleset-demo-label"
                  >
                    {t("admin:governance.demoRule")}
                  </p>
                  <p className="text-muted m-0 mt-2 text-xs">
                    {t("admin:governance.rulesets.thresholdsHidden")}
                  </p>
                </ExpandableRow>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
