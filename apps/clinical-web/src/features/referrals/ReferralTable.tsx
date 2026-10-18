/**
 * Referral table (CLN-08): FND-09 `AccessibleDataTable` with PATIENT, DESTINATION, PRIORITY,
 * DUE, STATUS, LAST UPDATE, ACTIONS. The overdue pill is DERIVED (`isReferralOverdue`) and
 * labelled as such; status pills always carry text (never colour only). "Open" opens the drawer.
 */
import { isReferralOverdue, type Referral } from "@laif/domain";
import { domainKey, formatDate, formatDateTime, useLanguage } from "@laif/i18n";
import {
  AccessibleDataTable,
  StatusChip,
  useTx,
  type DataTableColumn,
  type Tone,
} from "@laif/ui-web";
import type { ReactNode } from "react";

import { facilityLabel } from "../../app/persona-labels.ts";
import type { PatientNames } from "./hooks.ts";
import { STACK_BELOW_LG_CLASS } from "../../components/responsive.ts";

export const REFERRAL_STATUS_TONE: Record<Referral["status"], Tone> = {
  created: "info",
  accepted: "info",
  scheduled: "warning",
  completed: "positive",
  cancelled_with_reason: "neutral",
};

export function ReferralStatusPill({ status }: { status: Referral["status"] }) {
  const t = useTx();
  return (
    <span data-testid="referral-status" data-status={status}>
      <StatusChip tone={REFERRAL_STATUS_TONE[status]}>
        {t(domainKey("status.referral", status))}
      </StatusChip>
    </span>
  );
}

export function OverduePill({ dueAt }: { dueAt: string }) {
  const t = useTx();
  const { language } = useLanguage();
  return (
    <span data-testid="referral-overdue" title={t("clinical:referrals.overdueHint")}>
      {/* CLN-11: the dated label wraps (long in RW) instead of widening the table. */}
      <StatusChip
        tone="danger"
        icon="clock"
        className="w-auto! rounded-md! [&_.truncate]:whitespace-normal"
      >
        {t("clinical:referrals.overdueDerived", { date: formatDate(dueAt, language) })}
      </StatusChip>
    </span>
  );
}

export type ReferralTableProps = {
  rows: readonly Referral[];
  patients: PatientNames | undefined;
  nowIso: string;
  onOpen: (referral: Referral) => void;
  emptyState: ReactNode;
  caption: string;
};

export function ReferralTable({
  rows,
  patients,
  nowIso,
  onOpen,
  emptyState,
  caption,
}: ReferralTableProps) {
  const t = useTx();
  const { language } = useLanguage();
  const now = new Date(nowIso);
  const patientName = (r: Referral) => patients?.get(r.patientId)?.displayName ?? r.patientId;

  const columns: DataTableColumn<Referral>[] = [
    {
      id: "patient",
      header: t("clinical:referrals.table.patient"),
      isRowHeader: true,
      sortValue: patientName,
      cell: (r) => (
        <span className="flex flex-col">
          <span className="text-ink font-medium">{patientName(r)}</span>
          <span className="text-muted text-xs">
            {patients?.get(r.patientId)?.syntheticIdentifier ?? ""}
          </span>
        </span>
      ),
    },
    {
      id: "destination",
      header: t("clinical:referrals.table.destination"),
      sortValue: (r) => facilityLabel(r.destinationFacilityId, t),
      cell: (r) => facilityLabel(r.destinationFacilityId, t),
    },
    {
      id: "priority",
      header: t("clinical:referrals.table.priority"),
      sortValue: (r) => r.priority,
      cell: (r) => (
        <StatusChip tone={r.priority === "urgent_demo" ? "warning" : "neutral"}>
          {t(domainKey("priority", r.priority))}
        </StatusChip>
      ),
    },
    {
      id: "due",
      header: t("clinical:referrals.table.due"),
      sortValue: (r) => r.dueAt,
      cell: (r) => formatDate(r.dueAt, language),
    },
    {
      id: "status",
      header: t("clinical:referrals.table.status"),
      sortValue: (r) => r.status,
      cell: (r) => (
        <span className="flex flex-wrap items-center gap-1.5">
          <ReferralStatusPill status={r.status} />
          {isReferralOverdue(r, now) ? <OverduePill dueAt={r.dueAt} /> : null}
        </span>
      ),
    },
    {
      id: "updated",
      header: t("clinical:referrals.table.lastUpdate"),
      sortValue: (r) => r.updatedAt,
      cell: (r) => formatDateTime(r.updatedAt, language),
    },
  ];

  return (
    <div data-testid="referral-table">
      <AccessibleDataTable
        className={STACK_BELOW_LG_CLASS}
        caption={caption}
        captionHidden
        columns={columns}
        rows={rows}
        getRowId={(r) => r.id}
        rowAction={{
          label: t("clinical:referrals.table.open"),
          accessibleLabel: (r) => t("clinical:referrals.table.openFor", { name: patientName(r) }),
          onAction: onOpen,
        }}
        emptyState={emptyState}
      />
    </div>
  );
}
