/**
 * Task detail drawer (CLN-09), opened from `?id=` (deep-linkable): patient, linked review /
 * referral, type, assignee, due date (+ DERIVED overdue badge), clinician confirmation, the
 * attempts / assignment timeline (`FollowUpTimeline` — every assignee in the history), notes
 * (append-only) and the actions allowed by `allowedTaskActions`:
 * assign / reassign · change due date · record status · complete with evidence · confirm or
 * return a worker-reported completion · add note. Care-team actions need `task.assign`; notes
 * are open to every viewer. Offline: actions disabled, drawer readable. Out-of-scope id →
 * `PermissionDenied` (`getFollowUp` audits `access.denied`). Opening records `followup.viewed`.
 *
 * WF-02 demo hint (task 5): on the seeded conflict follow-up the drawer explains how to trigger
 * the conflict (Settings › "Simulate worker updating follow-up" in another tab, then save here).
 */
import { isFollowUpOverdue, type FollowUp } from "@laif/domain";
import { domainKey, formatDateTime, useLanguage } from "@laif/i18n";
import { SEED_ANCHORS } from "@laif/mock-data";
import {
  Button,
  Drawer,
  EmptyState,
  InfoCallout,
  KeyValueList,
  LoadingSkeleton,
  PermissionDenied,
  useTx,
  type KeyValueItem,
} from "@laif/ui-web";
import { useState } from "react";
import { Link } from "react-router";

import { useDemoTools } from "../../app/demo-tools.tsx";
import { routes } from "../../app/routes.ts";
import { QueryErrorState } from "../../components/QueryErrorState.tsx";
import { toClinicalError } from "../../data/errors.ts";
import { useAuditedRead } from "../../data/useAuditedRead.ts";
import { useSession } from "../../session/useSession.ts";
import type { PatientNames } from "../referrals/hooks.ts";
import { FollowUpTimeline } from "../timeline/FollowUpTimeline.tsx";
import { toFollowUpEvents } from "../timeline/model.ts";
import { personaName } from "../timeline/people.ts";
import { AddNoteDialog } from "./AddNoteDialog.tsx";
import { AssignTaskDialog } from "./AssignTaskDialog.tsx";
import { CompleteTaskDialog } from "./CompleteTaskDialog.tsx";
import { ConfirmCompletionDialog } from "./ConfirmCompletionDialog.tsx";
import { useFollowUp } from "./hooks.ts";
import { TaskRebaseContext } from "./useFollowUpAction.ts";
import { allowedTaskActions, taskType, type TaskAction } from "./model.ts";
import { SetDueDateDialog } from "./SetDueDateDialog.tsx";
import { TaskOverduePill, TaskStatusPill } from "./TaskTable.tsx";
import { UpdateTaskStatusDialog } from "./UpdateTaskStatusDialog.tsx";
import { DRAWER_FULL_SCREEN_CLASS } from "../../components/responsive.ts";

export type TaskDrawerProps = {
  id: string | null;
  onClose: () => void;
  nowIso: string;
  patients: PatientNames | undefined;
  onSaved?: (followUp: FollowUp) => void;
};

const linkClass = "text-primary-dark target-min inline-flex items-center font-semibold underline";
const WF02_ID = SEED_ANCHORS.WF02_FOLLOWUP_CONFLICT.followUpId as string;

export function TaskDrawer({ id, onClose, nowIso, patients, onSaved }: TaskDrawerProps) {
  const t = useTx();
  const query = useFollowUp(id);
  const latest = query.data ?? null;
  // The copy the user works on (WF-02): pinned on first load; newer versions are announced,
  // never swapped in under an open form.
  const [pinned, setPinned] = useState<FollowUp | null>(null);
  const followUp =
    latest === null ? null : pinned !== null && pinned.id === latest.id ? pinned : latest;
  if (latest !== null && (pinned === null || pinned.id !== latest.id)) setPinned(latest);
  const newer = latest !== null && followUp !== null && latest.version > followUp.version;
  const denied = query.isError && toClinicalError(query.error).code === "FORBIDDEN";
  const patientName =
    followUp === null
      ? null
      : (patients?.get(followUp.patientId)?.displayName ?? followUp.patientId);

  return (
    <Drawer
      className={DRAWER_FULL_SCREEN_CLASS}
      open={id !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      size="lg"
      title={
        patientName === null
          ? t("clinical:tasks.drawer.title")
          : t("clinical:tasks.drawer.titleFor", { name: patientName })
      }
      description={t("clinical:tasks.drawer.description")}
    >
      <div data-testid="task-drawer" data-followup-id={id ?? ""}>
        {query.isPending ? (
          <div role="group" aria-busy="true" aria-label={t("clinical:tasks.drawer.loading")}>
            <LoadingSkeleton lines={6} />
          </div>
        ) : denied ? (
          <div data-testid="task-denied">
            <PermissionDenied message={t("clinical:tasks.drawer.denied")} />
          </div>
        ) : query.isError ? (
          <QueryErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : followUp === null ? (
          <div data-testid="task-not-found">
            <EmptyState icon="search" title={t("clinical:tasks.drawer.notFound")} />
          </div>
        ) : (
          <TaskRebaseContext.Provider value={setPinned}>
            {newer ? (
              <div className="mb-4">
                <InfoCallout icon="alert">
                  <div className="space-y-2" data-testid="task-newer-version">
                    <p className="m-0 text-[13px]">
                      {t("clinical:tasks.drawer.newerVersion", { version: latest.version })}
                    </p>
                    <Button
                      variant="secondary"
                      size="sm"
                      icon="refresh"
                      data-testid="task-show-latest"
                      onClick={() => setPinned(latest)}
                    >
                      {t("clinical:tasks.drawer.showLatest")}
                    </Button>
                  </div>
                </InfoCallout>
              </div>
            ) : null}
            <TaskDetail
              followUp={followUp}
              nowIso={nowIso}
              patientName={patientName ?? ""}
              {...(onSaved === undefined ? {} : { onSaved })}
            />
          </TaskRebaseContext.Provider>
        )}
      </div>
    </Drawer>
  );
}

function TaskDetail({
  followUp,
  nowIso,
  patientName,
  onSaved,
}: {
  followUp: FollowUp;
  nowIso: string;
  patientName: string;
  onSaved?: (followUp: FollowUp) => void;
}) {
  const t = useTx();
  const { language } = useLanguage();
  const { can } = useSession();
  const { faultConfig } = useDemoTools();
  const offline = faultConfig.offline;
  const [action, setAction] = useState<TaskAction | null>(null);

  useAuditedRead({
    action: "followup.viewed",
    entityType: "follow_up",
    entityId: followUp.id,
    patientId: followUp.patientId,
    facilityId: followUp.facilityId,
  });

  const canAssign = can("task.assign");
  const actions = allowedTaskActions(followUp, canAssign);
  const overdue = isFollowUpOverdue(followUp, new Date(nowIso));
  const events = toFollowUpEvents({ reviews: [], referrals: [], followUps: [followUp] }, nowIso);
  const confirmation = followUp.clinicianConfirmation;

  const details: KeyValueItem[] = [
    {
      id: "patient",
      label: t("clinical:tasks.table.patient"),
      value: (
        <Link to={routes.patient(followUp.patientId, "referralsTasks")} className={linkClass}>
          {patientName}
        </Link>
      ),
    },
    {
      id: "type",
      label: t("clinical:tasks.table.type"),
      value: `${t(`clinical:tasks.type.${taskType(followUp)}`)} · ${t(
        domainKey("followUpPurpose", followUp.purpose),
      )}`,
    },
    {
      id: "assignee",
      label: t("clinical:tasks.table.assignedTo"),
      value: (
        <span data-testid="task-assignee">
          {followUp.assignedWorkerId === null
            ? t("clinical:tasks.table.unassigned")
            : (personaName(followUp.assignedWorkerId) ?? followUp.assignedWorkerId)}
        </span>
      ),
    },
    {
      id: "due",
      label: t("clinical:tasks.table.due"),
      value: formatDateTime(followUp.dueAt, language),
    },
    {
      id: "confirmation",
      label: t("clinical:tasks.drawer.confirmation"),
      value: (
        <span data-testid="task-confirmation" data-status={confirmation.status}>
          {t(domainKey("clinicianConfirmation", confirmation.status))}
          {confirmation.by === undefined
            ? ""
            : ` · ${t("clinical:tasks.drawer.byAt", {
                name: personaName(confirmation.by) ?? "—",
                when:
                  confirmation.at === undefined ? "" : formatDateTime(confirmation.at, language),
              })}`}
        </span>
      ),
    },
  ];
  if (followUp.reviewId !== null) {
    details.push({
      id: "review",
      label: t("clinical:tasks.drawer.linkedReview"),
      value: (
        <Link to={routes.review(followUp.reviewId)} className={linkClass}>
          {t("clinical:tasks.drawer.openReview")}
        </Link>
      ),
    });
  }
  if (followUp.referralId !== null) {
    details.push({
      id: "referral",
      label: t("clinical:tasks.drawer.linkedReferral"),
      value: (
        <Link to={routes.referrals({ id: followUp.referralId })} className={linkClass}>
          {t("clinical:tasks.drawer.openReferral")}
        </Link>
      ),
    });
  }
  if (confirmation.status === "returned" && confirmation.reason !== undefined) {
    details.push({
      id: "returnReason",
      label: t("clinical:tasks.drawer.returnReason"),
      value: <span className="whitespace-pre-wrap">{confirmation.reason}</span>,
    });
  }

  const closeDialog = (open: boolean) => {
    if (!open) setAction(null);
  };
  const dialogProps = {
    followUp,
    open: true,
    onOpenChange: closeDialog,
    ...(onSaved ? { onSaved } : {}),
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <TaskStatusPill followUp={followUp} />
        {overdue ? <TaskOverduePill dueAt={followUp.dueAt} /> : null}
        <span className="text-muted text-xs" data-testid="task-version">
          {t("clinical:tasks.drawer.version", { version: followUp.version })}
        </span>
      </div>

      {followUp.id === WF02_ID ? (
        <InfoCallout>
          <p className="m-0 text-[13px]" data-testid="wf02-hint">
            {t("clinical:tasks.drawer.wf02Hint")}
          </p>
        </InfoCallout>
      ) : null}

      <section aria-labelledby="task-actions-title" className="space-y-2">
        <h3 id="task-actions-title" className="micro-label text-muted m-0">
          {t("clinical:tasks.drawer.actions")}
        </h3>
        <div className="flex flex-wrap gap-2" data-testid="task-actions">
          {actions.map((a) => (
            <Button
              key={a}
              variant={a === "confirm" || a === "complete" ? "primary" : "secondary"}
              size="sm"
              disabled={offline}
              data-testid={`task-action-${a}`}
              onClick={() => setAction(a)}
            >
              {t(`clinical:tasks.actions.${a}`)}
            </Button>
          ))}
        </div>
        {offline ? (
          <p className="text-muted m-0 text-[13px]" data-testid="task-offline">
            {t("clinical:tasks.drawer.offline")}
          </p>
        ) : null}
        {!canAssign ? (
          <p className="text-muted m-0 text-[13px]" data-testid="task-no-permission">
            {t("clinical:tasks.drawer.noPermission")}
          </p>
        ) : null}
      </section>

      <section aria-labelledby="task-details-title" className="space-y-2">
        <h3 id="task-details-title" className="micro-label text-muted m-0">
          {t("clinical:tasks.drawer.details")}
        </h3>
        <KeyValueList items={details} />
      </section>

      <section aria-labelledby="task-timeline-title" className="space-y-2">
        <h3 id="task-timeline-title" className="micro-label text-muted m-0">
          {t("clinical:tasks.drawer.timeline")}
        </h3>
        <div data-testid="task-timeline">
          <FollowUpTimeline events={events} />
        </div>
      </section>

      <section aria-labelledby="task-notes-title" className="space-y-2">
        <h3 id="task-notes-title" className="micro-label text-muted m-0">
          {t("clinical:tasks.drawer.notes")}
        </h3>
        {followUp.notes.length === 0 ? (
          <p className="text-muted m-0 text-[13px]">{t("clinical:tasks.drawer.notesEmpty")}</p>
        ) : (
          <ul className="m-0 list-none space-y-2 p-0" data-testid="task-notes">
            {[...followUp.notes].reverse().map((note, index) => (
              <li
                key={`${note.at}-${index}`}
                className="border-border-soft rounded-md border p-3 text-[13px]"
              >
                <p className="text-ink m-0 whitespace-pre-wrap">{note.text}</p>
                <p className="text-muted m-0 mt-1 text-xs">
                  {t("clinical:tasks.drawer.byAt", {
                    name: personaName(note.by) ?? "—",
                    when: note.at === "" ? "—" : formatDateTime(note.at, language),
                  })}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {action === "assign" || action === "reassign" ? (
        <AssignTaskDialog {...dialogProps} nowIso={nowIso} />
      ) : null}
      {action === "setDueDate" ? <SetDueDateDialog {...dialogProps} nowIso={nowIso} /> : null}
      {action === "updateStatus" ? (
        <UpdateTaskStatusDialog {...dialogProps} nowIso={nowIso} />
      ) : null}
      {action === "complete" ? <CompleteTaskDialog {...dialogProps} nowIso={nowIso} /> : null}
      {action === "confirm" ? <ConfirmCompletionDialog {...dialogProps} /> : null}
      {action === "note" ? <AddNoteDialog {...dialogProps} /> : null}
    </div>
  );
}
