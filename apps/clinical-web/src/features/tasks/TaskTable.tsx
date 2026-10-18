/**
 * Care-team task table (CLN-09): FND-09 `AccessibleDataTable` with PATIENT, TYPE (`Repeat test`,
 * `Planned review`, `Referral follow-up`), ASSIGNED TO, DUE, STATUS, ATTEMPTS, ACTIONS. The overdue
 * pill is DERIVED (`isFollowUpOverdue`) and labelled as such; status pills always carry text.
 */
import { isFollowUpOverdue, type FollowUp } from "@laif/domain";
import { domainKey, formatDate, useLanguage } from "@laif/i18n";
import {
  AccessibleDataTable,
  StatusChip,
  useTx,
  type DataTableColumn,
  type Tone,
} from "@laif/ui-web";
import type { ReactNode } from "react";

import type { PatientNames } from "../referrals/hooks.ts";
import { personaName } from "../timeline/people.ts";
import { isAwaitingConfirmation, taskType } from "./model.ts";
import { STACK_BELOW_LG_CLASS } from "../../components/responsive.ts";

export const FOLLOW_UP_STATUS_TONE: Record<FollowUp["status"], Tone> = {
  assigned: "info",
  reassigned: "info",
  contacted: "warning",
  unable_to_reach: "danger",
  completed: "positive",
};

export function TaskStatusPill({ followUp }: { followUp: FollowUp }) {
  const t = useTx();
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <span data-testid="task-status" data-status={followUp.status}>
        <StatusChip tone={FOLLOW_UP_STATUS_TONE[followUp.status]}>
          {t(domainKey("status.followUp", followUp.status))}
        </StatusChip>
      </span>
      {isAwaitingConfirmation(followUp) ? (
        <span data-testid="task-awaiting">
          <StatusChip tone="warning" icon="clock">
            {t(domainKey("clinicianConfirmation", "pending"))}
          </StatusChip>
        </span>
      ) : null}
    </span>
  );
}

export function TaskOverduePill({ dueAt }: { dueAt: string }) {
  const t = useTx();
  const { language } = useLanguage();
  return (
    <span data-testid="task-overdue" title={t("clinical:tasks.overdueHint")}>
      <StatusChip tone="danger" icon="clock">
        {t("clinical:tasks.overdueDerived", { date: formatDate(dueAt, language) })}
      </StatusChip>
    </span>
  );
}

export type TaskTableProps = {
  rows: readonly FollowUp[];
  patients: PatientNames | undefined;
  nowIso: string;
  onOpen: (followUp: FollowUp) => void;
  emptyState: ReactNode;
  caption: string;
};

export function TaskTable({ rows, patients, nowIso, onOpen, emptyState, caption }: TaskTableProps) {
  const t = useTx();
  const { language } = useLanguage();
  const now = new Date(nowIso);
  const patientName = (fu: FollowUp) => patients?.get(fu.patientId)?.displayName ?? fu.patientId;

  const columns: DataTableColumn<FollowUp>[] = [
    {
      id: "patient",
      header: t("clinical:tasks.table.patient"),
      isRowHeader: true,
      sortValue: patientName,
      cell: (fu) => (
        <span className="flex flex-col">
          <span className="text-ink font-medium">{patientName(fu)}</span>
          <span className="text-muted text-xs">
            {patients?.get(fu.patientId)?.syntheticIdentifier ?? ""}
          </span>
        </span>
      ),
    },
    {
      id: "type",
      header: t("clinical:tasks.table.type"),
      sortValue: (fu) => taskType(fu),
      cell: (fu) => t(`clinical:tasks.type.${taskType(fu)}`),
    },
    {
      id: "assignee",
      header: t("clinical:tasks.table.assignedTo"),
      sortValue: (fu) => personaName(fu.assignedWorkerId) ?? "",
      cell: (fu) =>
        fu.assignedWorkerId === null ? (
          <StatusChip tone="neutral">{t("clinical:tasks.table.unassigned")}</StatusChip>
        ) : (
          (personaName(fu.assignedWorkerId) ?? fu.assignedWorkerId)
        ),
    },
    {
      id: "due",
      header: t("clinical:tasks.table.due"),
      sortValue: (fu) => fu.dueAt,
      cell: (fu) => (
        <span className="flex flex-wrap items-center gap-1.5">
          <span>{formatDate(fu.dueAt, language)}</span>
          {isFollowUpOverdue(fu, now) ? <TaskOverduePill dueAt={fu.dueAt} /> : null}
        </span>
      ),
    },
    {
      id: "status",
      header: t("clinical:tasks.table.status"),
      sortValue: (fu) => fu.status,
      cell: (fu) => <TaskStatusPill followUp={fu} />,
    },
    {
      id: "attempts",
      header: t("clinical:tasks.table.attempts"),
      sortValue: (fu) => fu.attempts.length,
      cell: (fu) => <span className="tabular-nums">{fu.attempts.length}</span>,
    },
  ];

  return (
    <div data-testid="task-table">
      <AccessibleDataTable
        className={STACK_BELOW_LG_CLASS}
        caption={caption}
        captionHidden
        columns={columns}
        rows={rows}
        getRowId={(fu) => fu.id}
        rowAction={{
          label: t("clinical:tasks.table.open"),
          accessibleLabel: (fu) => t("clinical:tasks.table.openFor", { name: patientName(fu) }),
          onAction: onOpen,
        }}
        emptyState={emptyState}
      />
    </div>
  );
}
