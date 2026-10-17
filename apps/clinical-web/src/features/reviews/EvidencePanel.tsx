/**
 * Evidence panel (CLN-06 task 4, ref-image 2): one row per `explainFlag` evidence item — input
 * name, recorded value + unit (from the FROZEN snapshot), the demo rule ("Demo threshold:
 * configured in <ruleset>") and a status pill `TRIGGERED` / `WITHIN DEMO RANGE` / `MISSING` /
 * `NOT EVALUATED` (text + icon, never colour only; MISSING / NOT EVALUATED in amber).
 *
 * A numeric threshold is only ever shown next to the "Demo placeholder value" label. When the
 * screening was amended after the snapshot, a callout links to the CLN-04 correction history.
 */
import type { EvidenceItem, EvidenceStatus, FlagResult, ObservationCode } from "@laif/domain";
import { domainKey, formatMeasurement, formatNumber, useLanguage } from "@laif/i18n";
import {
  Card,
  EmptyState,
  Icon,
  InfoCallout,
  StatusChip,
  useTx,
  type IconName,
  type Tone,
} from "@laif/ui-web";
import { Link } from "react-router";

export type EvidencePanelProps = {
  items: readonly EvidenceItem[];
  flag: FlagResult | null;
  rulesetVersion: string;
  /** The screening was amended after the evidence snapshot was taken. */
  amendedAfterFlag?: boolean;
  /** Link to the screening's correction history (CLN-04). */
  historyHref?: string;
};

const STATUS_STYLE: Record<EvidenceStatus, { tone: Tone; icon: IconName }> = {
  TRIGGERED: { tone: "danger", icon: "alert" },
  WITHIN_DEMO_RANGE: { tone: "positive", icon: "check" },
  MISSING: { tone: "warning", icon: "alert" },
  NOT_EVALUATED: { tone: "warning", icon: "minus" },
};

const OBSERVATION_OF: Partial<Record<EvidenceItem["inputKey"], ObservationCode>> = {
  systolic: "SYSTOLIC",
  diastolic: "DIASTOLIC",
  glucoseValue: "GLUCOSE",
};

const THRESHOLD_RULES = new Set(["BP-1", "BP-2", "GLU-1"]);

export function EvidenceStatusPill({ status }: { status: EvidenceStatus }) {
  const t = useTx();
  const style = STATUS_STYLE[status];
  return (
    <span data-testid="evidence-status" data-status={status}>
      <StatusChip tone={style.tone} icon={style.icon} className="uppercase">
        {t(`clinical:review.evidence.status.${status}`)}
      </StatusChip>
    </span>
  );
}

export function EvidenceValue({ item }: { item: EvidenceItem }) {
  const t = useTx();
  const { language } = useLanguage();
  if (item.value === null) {
    return <span className="text-muted">{t("clinical:review.evidence.notRecorded")}</span>;
  }
  if (item.inputKey === "glucoseContext" && typeof item.value === "string") {
    return <span>{t(domainKey("glucoseContext", item.value as "fasting"))}</span>;
  }
  if (typeof item.value === "number") {
    return (
      <span className="font-mono font-semibold">
        {item.unit === null
          ? formatNumber(item.value, language)
          : formatMeasurement(item.value, item.unit, language)}
      </span>
    );
  }
  return (
    <span className="font-mono font-semibold">
      {item.unit === null ? item.value : `${item.value} ${item.unit}`}
    </span>
  );
}

export function EvidencePanel({
  items,
  flag,
  rulesetVersion,
  amendedAfterFlag = false,
  historyHref,
}: EvidencePanelProps) {
  const t = useTx();
  const { language } = useLanguage();
  const compared = (item: EvidenceItem) => {
    const code = OBSERVATION_OF[item.inputKey];
    if (code === undefined || item.status !== "TRIGGERED") return null;
    return flag?.triggeringObservations.find((obs) => obs.code === code) ?? null;
  };

  return (
    <Card
      title={t("clinical:review.evidence.title")}
      meta={t("clinical:review.evidence.subtitle", { version: rulesetVersion })}
    >
      <div data-testid="evidence-panel" className="space-y-4">
        {amendedAfterFlag ? (
          <div data-testid="evidence-amended">
            <InfoCallout title={t("clinical:review.evidence.amendedAfterFlag")} icon="alert">
              <p className="m-0">{t("clinical:review.evidence.amendedAfterFlagBody")}</p>
              {historyHref === undefined ? null : (
                <Link
                  to={historyHref}
                  className="text-primary-dark target-min inline-flex items-center font-semibold underline"
                >
                  {t("clinical:review.evidence.openHistory")}
                </Link>
              )}
            </InfoCallout>
          </div>
        ) : null}

        {items.length === 0 ? (
          <div data-testid="evidence-empty">
            <EmptyState icon="alert" title={t("clinical:review.evidence.empty")} description="" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <caption className="sr-only">{t("clinical:review.evidence.caption")}</caption>
              <thead>
                <tr>
                  {(["input", "value", "rule", "status"] as const).map((col) => (
                    <th
                      key={col}
                      scope="col"
                      className="micro-label text-muted py-2 pe-3 text-start font-medium"
                    >
                      {t(`clinical:review.evidence.columns.${col}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const obs = compared(item);
                  const amber = item.status === "MISSING" || item.status === "NOT_EVALUATED";
                  return (
                    <tr
                      key={item.inputKey}
                      data-testid="evidence-row"
                      data-input={item.inputKey}
                      data-status={item.status}
                      className={
                        amber
                          ? "border-border-soft bg-risk-warning-soft/40 border-t align-top"
                          : "border-border-soft border-t align-top"
                      }
                    >
                      <th scope="row" className="text-ink py-2.5 pe-3 text-start font-medium">
                        {t(`clinical:review.evidence.inputs.${item.inputKey}`)}
                      </th>
                      <td className="text-ink py-2.5 pe-3">
                        <EvidenceValue item={item} />
                      </td>
                      <td className="text-muted space-y-0.5 py-2.5 pe-3">
                        {item.ruleDescriptionKey === null ? (
                          <span>{t("clinical:review.evidence.noRule")}</span>
                        ) : (
                          <>
                            <span className="block font-mono text-[11px]">{item.ruleRef}</span>
                            <span className="text-ink block">
                              {t(`clinical:review.rules.${item.ruleDescriptionKey}`)}
                            </span>
                            {THRESHOLD_RULES.has(item.ruleDescriptionKey) ? (
                              <span className="block">
                                {t("clinical:review.evidence.ruleText", {
                                  version: rulesetVersion,
                                })}
                              </span>
                            ) : null}
                            {obs === null ? null : (
                              <span className="block" data-testid="evidence-threshold">
                                {t("clinical:review.evidence.comparedTo", {
                                  value: formatMeasurement(obs.comparedTo, obs.unit, language),
                                })}{" "}
                                <span className="micro-label text-risk-warning inline-flex items-center gap-1">
                                  <Icon name="info" size={12} />
                                  {t("clinical:review.evidence.demoPlaceholderValue")}
                                </span>
                              </span>
                            )}
                          </>
                        )}
                      </td>
                      <td className="py-2.5">
                        <EvidenceStatusPill status={item.status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Card>
  );
}
