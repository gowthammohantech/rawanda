/**
 * `/clinical/tasks` (CLN-09, PRD/FRD CL-07): header (`Create task`), KPI strip (Open · Overdue ·
 * Unassigned · Awaiting confirmation), worker workload strip, tabs `Due soon · Overdue ·
 * Unassigned · Unable to reach · Awaiting confirmation · Completed` with `TaskTable`, the task
 * drawer (`?id=`, deep-linkable) and the CTZ-07 correction requests routed to clinicians.
 *
 * Every count (KPI, tab badge) is derived from the SAME list of facility follow-ups the tabs show
 * (`model.ts`), so badge == rows. Overdue is derived only. After a save a polite `aria-live`
 * announcement names the tab the task is now in. Offline: writes disabled, page readable.
 */
import type { FollowUp } from "@laif/domain";
import {
  Button,
  EmptyState,
  KpiStrip,
  LoadingSkeleton,
  Tabs,
  useTx,
  type KpiItem,
  type TabItem,
} from "@laif/ui-web";
import { useState } from "react";
import { useSearchParams } from "react-router";

import { useDemoTools } from "../../app/demo-tools.tsx";
import { facilityLabel } from "../../app/persona-labels.ts";
import { PageHeader } from "../../components/PageHeader.tsx";
import { AsyncBoundary, whenReady } from "../../components/AsyncBoundary.tsx";
import { useSession } from "../../session/useSession.ts";
import { useDemoNow } from "../decision/hooks.ts";
import { useReferralPatients } from "../referrals/hooks.ts";
import { CorrectionRequestsPanel } from "./CorrectionRequestsPanel.tsx";
import { CreateTaskDialog } from "./CreateTaskDialog.tsx";
import { useFollowUps } from "./hooks.ts";
import {
  matchesTab,
  parseTaskParams,
  patchTaskParams,
  rowsForTab,
  tabCounts,
  TASK_TABS,
  taskKpis,
  type TaskParams,
  type TaskTab,
} from "./model.ts";
import { TaskDrawer } from "./TaskDrawer.tsx";
import { TaskTable } from "./TaskTable.tsx";
import { WorkloadStrip } from "./WorkloadStrip.tsx";
import { KPI_STRIP_CLASS } from "../../components/responsive.ts";

const isTab = (value: string): value is TaskTab => (TASK_TABS as readonly string[]).includes(value);

export function TasksPage() {
  const t = useTx();
  const { can, activeFacilityId } = useSession();
  const { faultConfig } = useDemoTools();
  const [searchParams, setSearchParams] = useSearchParams();
  const params = parseTaskParams(searchParams);
  const now = useDemoNow();
  const followUps = useFollowUps();
  const patients = useReferralPatients();
  const [creating, setCreating] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  const update = (patch: Partial<TaskParams>) =>
    setSearchParams(patchTaskParams(searchParams, patch));

  const nowIso = now.data;
  const rows = followUps.data ?? [];
  const nowDate = nowIso === undefined ? null : new Date(nowIso);
  const counts = nowDate === null ? null : tabCounts(rows, nowDate);
  const kpi = nowDate === null ? null : taskKpis(rows, nowDate);
  const facilityName = activeFacilityId === null ? "" : facilityLabel(activeFacilityId, t);
  const offline = faultConfig.offline;
  const canAssign = can("task.assign");

  const announce = (saved: FollowUp) => {
    if (nowDate === null) return;
    const tabs = TASK_TABS.filter((tab) => matchesTab(saved, tab, nowDate)).map((tab) =>
      t(`clinical:tasks.tabs.${tab}`),
    );
    setAnnouncement(
      tabs.length === 0
        ? t("clinical:tasks.announce.saved")
        : t("clinical:tasks.announce.movedTo", { tabs: tabs.join(", ") }),
    );
  };

  const loading = followUps.isPending || nowIso === undefined;

  const kpis: KpiItem[] = [
    { id: "open", label: t("clinical:tasks.kpi.open"), value: kpi?.open ?? "—" },
    {
      id: "overdue",
      label: t("clinical:tasks.kpi.overdue"),
      value: kpi?.overdue ?? "—",
      tone: "danger",
      hint: t("clinical:tasks.kpi.overdueHint"),
    },
    {
      id: "unassigned",
      label: t("clinical:tasks.kpi.unassigned"),
      value: kpi?.unassigned ?? "—",
      tone: "warning",
    },
    {
      id: "awaiting",
      label: t("clinical:tasks.kpi.awaitingConfirmation"),
      value: kpi?.awaiting ?? "—",
      tone: "info",
    },
  ];

  const tabs: TabItem[] = TASK_TABS.map((tab) => ({
    value: tab,
    label: t(`clinical:tasks.tabs.${tab}`),
    count: counts === null ? "…" : counts[tab],
    ...(tab === params.tab
      ? {
          content: (
            <AsyncBoundary
              query={whenReady(followUps, nowIso !== undefined)}
              testId="tasks"
              loadingLabel={t("clinical:tasks.loading")}
              skeleton="lines"
              skeletonLines={6}
            >
              {(data) => (
                <TaskTable
                  caption={t("clinical:tasks.table.caption", {
                    tab: t(`clinical:tasks.tabs.${tab}`),
                  })}
                  rows={nowIso === undefined ? [] : rowsForTab(data, tab, new Date(nowIso))}
                  patients={patients.data}
                  nowIso={nowIso ?? ""}
                  onOpen={(fu) => update({ id: fu.id })}
                  emptyState={
                    <div data-testid="tasks-empty">
                      <EmptyState
                        icon="check"
                        title={t(`clinical:tasks.empty.${tab}`, { facility: facilityName })}
                      />
                    </div>
                  }
                />
              )}
            </AsyncBoundary>
          ),
        }
      : {}),
  }));

  return (
    <div className="space-y-5" data-testid="tasks-page">
      <PageHeader
        title={t("clinical:tasks.title")}
        subtitle={t("clinical:tasks.subtitle", { facility: facilityName })}
        {...(canAssign
          ? {
              actions: (
                <Button
                  icon="plus"
                  disabled={offline || nowIso === undefined}
                  data-testid="create-task"
                  onClick={() => setCreating(true)}
                >
                  {t("clinical:tasks.actions.create")}
                </Button>
              ),
            }
          : {})}
      />

      <p className="sr-only" aria-live="polite" data-testid="tasks-announcement">
        {announcement}
      </p>

      {loading ? (
        <div role="group" aria-busy="true" aria-label={t("clinical:tasks.loading")}>
          <LoadingSkeleton variant="lines" lines={2} />
        </div>
      ) : (
        <div data-testid="task-kpis">
          <KpiStrip
            className={KPI_STRIP_CLASS}
            items={kpis}
            label={t("clinical:tasks.kpi.label")}
          />
        </div>
      )}

      {canAssign && nowIso !== undefined && !followUps.isPending ? (
        <WorkloadStrip rows={rows} nowIso={nowIso} />
      ) : null}

      <div data-testid="task-tabs">
        <Tabs
          tabs={tabs}
          label={t("clinical:tasks.tabs.label")}
          value={params.tab}
          onValueChange={(next) => {
            if (isTab(next)) update({ tab: next });
          }}
        />
      </div>

      <CorrectionRequestsPanel patients={patients.data} canResolve={canAssign} offline={offline} />

      {nowIso === undefined ? null : (
        <TaskDrawer
          id={params.id}
          onClose={() => update({ id: null })}
          nowIso={nowIso}
          patients={patients.data}
          onSaved={announce}
        />
      )}
      {creating && nowIso !== undefined ? (
        <CreateTaskDialog
          open
          onOpenChange={(open) => {
            if (!open) setCreating(false);
          }}
          nowIso={nowIso}
          patients={patients.data}
          onSaved={(fu) => {
            announce(fu);
            update({ id: fu.id });
          }}
        />
      ) : null}
    </div>
  );
}
