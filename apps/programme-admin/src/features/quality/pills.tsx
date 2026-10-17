/** Mono caps issue-type pill (`MISSING FIELD`, `DUPLICATE ID`, …), status chip and `PROXY` pill. */
import type { DataQualityIssueStatus, DataQualityIssueType } from "@laif/contracts";
import { cx, StatusChip, useTx, type Tone, type TranslationKey } from "@laif/ui-web";

const TYPE_TONE: Record<DataQualityIssueType, string> = {
  missing_field: "border-warning/40 bg-warning-soft",
  duplicate_identifier: "border-info/40 bg-info-soft",
  orphan_screening: "border-info/40 bg-info-soft",
  overturned_flag: "border-border bg-background",
  manual_escalation: "border-border bg-background",
};

export function IssueTypePill({ type }: { type: DataQualityIssueType }) {
  const t = useTx();
  return (
    <span
      data-testid="issue-type-pill"
      className={cx(
        "text-ink shrink-0 rounded-sm border px-1.5 py-px font-mono text-[10px] font-semibold tracking-wide whitespace-nowrap uppercase",
        TYPE_TONE[type],
      )}
    >
      {t(`admin:quality.type.${type}` as TranslationKey)}
    </span>
  );
}

const STATUS_TONE: Record<DataQualityIssueStatus, Tone> = {
  open: "warning",
  acknowledged: "info",
  sent_to_facility: "info",
  resolved_with_note: "positive",
};

export function IssueStatusPill({ status }: { status: DataQualityIssueStatus }) {
  const t = useTx();
  return (
    <StatusChip tone={STATUS_TONE[status]}>
      {t(`admin:quality.status.${status}` as TranslationKey)}
    </StatusChip>
  );
}

/** `PROXY` pill of the review-outcome figures (not clinical accuracy). */
export function QualityProxyPill({ title }: { title?: string }) {
  const t = useTx();
  return (
    <span
      data-testid="quality-proxy-pill"
      title={title ?? t("admin:quality.proxyTitle")}
      className="border-border bg-background text-muted rounded-sm border px-1 py-px font-mono text-[10px] font-medium tracking-wide"
    >
      {t("admin:quality.proxy")}
    </span>
  );
}
