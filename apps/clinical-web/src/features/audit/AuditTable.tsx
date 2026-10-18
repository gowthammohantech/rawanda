/**
 * Audit table (CLN-10): TIME (Kigali), ACTION (mono pill coloured by family token + human label),
 * ACTOR · ROLE, ENTITY, FACILITY, CORRELATION (short id; the link filters the table by it).
 * Read-only: the only row action opens the detail drawer. Denied events carry a "Denied" chip
 * (never colour only).
 */
import { roleLabelKey } from "@laif/auth-demo";
import type { AuditEvent } from "@laif/domain";
import { domainKey, formatDateTime, useLanguage } from "@laif/i18n";
import {
  AccessibleDataTable,
  StatusChip,
  cx,
  useTx,
  type DataTableColumn,
  type Tone,
  type TranslationKey,
} from "@laif/ui-web";
import type { ReactNode } from "react";

import { facilityLabel } from "../../app/persona-labels.ts";
import { personaName } from "../timeline/people.ts";
import { familyOf, shortId } from "./model.ts";

const FAMILY_TONE: Record<NonNullable<ReturnType<typeof familyOf>>, Tone> = {
  auth: "neutral",
  access: "info",
  patient: "neutral",
  screening: "info",
  review: "positive",
  referral: "positive",
  followup: "positive",
  conflict: "warning",
  audit: "info",
  demo: "neutral",
};

const PILL_CLASS: Record<Tone, string> = {
  neutral: "bg-background text-muted border-border",
  info: "bg-state-info-soft text-state-info border-state-info/25",
  positive: "bg-state-success-soft text-state-success border-state-success/25",
  warning: "bg-risk-warning-soft text-risk-warning border-risk-warning/25",
  danger: "bg-risk-danger-soft text-risk-danger border-risk-danger/25",
};

/** `domain:audit.<action>` (every registered action has EN + RW copy). */
export const actionLabelKey = (action: string): TranslationKey =>
  `domain:audit.${action}` as TranslationKey;

export function ActionPill({ event }: { event: Pick<AuditEvent, "action" | "outcome"> }) {
  const t = useTx();
  const family = familyOf(event.action);
  const tone: Tone =
    event.outcome === "denied" ? "danger" : family ? FAMILY_TONE[family] : "neutral";
  return (
    <span className="flex flex-col items-start gap-1">
      <span
        data-testid="audit-action"
        data-action={event.action}
        className={cx(
          "rounded-pill inline-flex max-w-full items-center border px-2 py-0.5 font-mono text-xs",
          PILL_CLASS[tone],
        )}
      >
        {event.action}
      </span>
      <span className="text-muted text-xs">{t(actionLabelKey(event.action))}</span>
    </span>
  );
}

export function actorLine(event: AuditEvent, t: ReturnType<typeof useTx>): string {
  const name = personaName(event.actorId) ?? t("clinical:audit.table.system");
  return event.actorRole === null ? name : `${name} · ${t(roleLabelKey(event.actorRole))}`;
}

export type AuditTableProps = {
  rows: readonly AuditEvent[];
  total: number;
  onOpen: (event: AuditEvent) => void;
  onCorrelation: (correlationId: string) => void;
  emptyState: ReactNode;
  footer?: ReactNode;
};

export function AuditTable({
  rows,
  total,
  onOpen,
  onCorrelation,
  emptyState,
  footer,
}: AuditTableProps) {
  const t = useTx();
  const { language } = useLanguage();

  const columns: DataTableColumn<AuditEvent>[] = [
    {
      id: "time",
      header: t("clinical:audit.table.time"),
      isRowHeader: true,
      cell: (e) => (
        <time dateTime={e.occurredAt} className="whitespace-nowrap">
          {formatDateTime(e.occurredAt, language)}
        </time>
      ),
    },
    {
      id: "action",
      header: t("clinical:audit.table.action"),
      cell: (e) => (
        <span className="flex flex-wrap items-center gap-1.5">
          <ActionPill event={e} />
          {e.outcome === "denied" ? (
            <StatusChip tone="danger">{t("clinical:audit.table.denied")}</StatusChip>
          ) : null}
        </span>
      ),
    },
    {
      id: "actor",
      header: t("clinical:audit.table.actor"),
      cell: (e) => actorLine(e, t),
    },
    {
      id: "entity",
      header: t("clinical:audit.table.entity"),
      cell: (e) => (
        <span className="flex flex-col">
          <span>{t(domainKey("entityType", e.entityType))}</span>
          <span className="text-muted font-mono text-xs break-all">{e.entityId}</span>
        </span>
      ),
    },
    {
      id: "facility",
      header: t("clinical:audit.table.facility"),
      cell: (e) =>
        e.facilityId === null ? t("clinical:audit.table.none") : facilityLabel(e.facilityId, t),
    },
    {
      id: "correlation",
      header: t("clinical:audit.table.correlation"),
      cell: (e) => (
        <button
          type="button"
          className="text-primary-dark target-min font-mono text-xs underline"
          aria-label={t("clinical:audit.table.filterCorrelation", { id: e.correlationId })}
          data-testid="audit-correlation-link"
          onClick={() => onCorrelation(e.correlationId)}
        >
          {shortId(e.correlationId)}
        </button>
      ),
    },
  ];

  return (
    <div data-testid="audit-table">
      <AccessibleDataTable
        caption={t("clinical:audit.table.caption")}
        captionHidden
        columns={columns}
        rows={rows}
        getRowId={(e) => e.id}
        totalCount={total}
        rowAction={{
          label: t("clinical:audit.table.open"),
          accessibleLabel: (e) =>
            t("clinical:audit.table.openFor", {
              action: e.action,
              time: formatDateTime(e.occurredAt, language),
            }),
          onAction: onOpen,
        }}
        emptyState={emptyState}
        {...(footer === undefined ? {} : { footer })}
      />
    </div>
  );
}
