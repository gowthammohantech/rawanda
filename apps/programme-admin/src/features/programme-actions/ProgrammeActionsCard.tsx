/**
 * Side card of programme follow-up actions in the current view (ADM-03 task 8): status pills
 * and status changes — Start (`in_progress`), Mark done (`done`), Cancel (reason required,
 * ConfirmDialog). Non-clinical tasks for facility managers; never a patient-level item.
 *
 * - CONFLICT → `ConflictNotice` ("yours" vs "latest" status, last updated by, time) with
 *   "Use latest" / "Re-apply my change". Nothing changes until the user chooses; both choices
 *   are audited (`conflict.resolved`), and re-applying re-submits on the latest version.
 * - TIMEOUT / OFFLINE / 5xx → "Not saved — retry"; the retry reuses the same idempotency key.
 * - Demo tooling (labelled DEMO): make the next update of an action conflict (`conflictOnce`).
 * - A newly assigned action is highlighted for 2 s.
 */
import {
  isTerminalProgrammeActionStatus,
  type ProgrammeAction,
  type ProgrammeActionStatus,
} from "@laif/contracts";
import { formatDate, formatDateTime, useLanguage } from "@laif/i18n";
import { DEMO_PERSONAS } from "@laif/mock-data";
import { isRepositoryError } from "@laif/repositories";
import {
  Button,
  Card,
  ConfirmDialog,
  ConflictNotice,
  cx,
  EmptyState,
  ErrorState,
  errorCodeOf,
  LoadingSkeleton,
  StatusChip,
  useToast,
  useTx,
  type Tone,
  type TranslationKey,
} from "@laif/ui-web";
import type { ConflictResolution } from "@laif/domain";
import { useState } from "react";

import { facilityLabel } from "../../app/persona-labels.ts";
import { useRepository, useServices } from "../../app/providers.tsx";
import { emitAdminAudit } from "../../lib/audit.ts";
import type { FunnelScopeSelection } from "../funnel/selectFunnel.ts";
import {
  isRetryableWriteError,
  useAssignAvailability,
  useProgrammeActions,
  useRefreshProgrammeActions,
  useUpdateProgrammeAction,
} from "./mutations.ts";

const STATUS_TONE: Record<ProgrammeActionStatus, Tone> = {
  open: "info",
  in_progress: "warning",
  done: "positive",
  cancelled_with_reason: "neutral",
};

type Change = { status: ProgrammeActionStatus; statusReason?: string };

type RowState =
  | { kind: "idle" }
  | { kind: "retry"; change: Change; key: string; expectedVersion: number }
  | {
      kind: "conflict";
      change: Change;
      latest: ProgrammeAction;
      changedBy?: string;
      changedAt?: string;
    }
  | { kind: "failed" };

const personaName = (id: string | undefined): string | undefined =>
  id === undefined ? undefined : (DEMO_PERSONAS.find((p) => p.id === id)?.displayName ?? id);

export type ProgrammeActionsCardProps = {
  scope: FunnelScopeSelection;
  /** Id of a just-assigned action (highlighted for 2 s by the page). */
  highlightId?: string | null;
};

export function ProgrammeActionsCard({ scope, highlightId = null }: ProgrammeActionsCardProps) {
  const t = useTx();
  const query = useProgrammeActions();
  const rows = (query.data ?? []).filter(
    (a) =>
      (scope.district === null || a.districtId === scope.district) &&
      (scope.facility === null || a.facilityId === scope.facility),
  );
  const open = rows.filter((a) => !isTerminalProgrammeActionStatus(a.status)).length;

  return (
    <Card
      title={t("admin:actions.card.title")}
      meta={query.isSuccess ? t("admin:actions.card.openCount", { n: open }) : undefined}
      headingLevel={2}
    >
      <div data-testid="programme-actions-card">
        <p className="text-muted m-0 mb-3 text-xs">{t("admin:actions.card.note")}</p>
        {query.isPending ? (
          <LoadingSkeleton variant="card" lines={3} />
        ) : query.isError ? (
          <ErrorState
            code={errorCodeOf(query.error) ?? "INTERNAL"}
            message={t("admin:actions.card.error")}
            onRetry={() => query.refetch()}
          />
        ) : rows.length === 0 ? (
          <EmptyState
            icon="clipboard"
            title={t("admin:actions.card.empty")}
            description={t("admin:actions.card.emptyHint")}
          />
        ) : (
          <ul className="m-0 list-none space-y-3 p-0" aria-label={t("admin:actions.card.title")}>
            {rows.map((action) => (
              <ActionRow key={action.id} action={action} highlighted={action.id === highlightId} />
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

function ActionRow({ action, highlighted }: { action: ProgrammeAction; highlighted: boolean }) {
  const t = useTx();
  const { language } = useLanguage();
  const { toast } = useToast();
  const repo = useRepository();
  const services = useServices();
  const availability = useAssignAvailability()(action.facilityId);
  const update = useUpdateProgrammeAction();
  const refresh = useRefreshProgrammeActions();
  const [state, setState] = useState<RowState>({ kind: "idle" });
  const [cancelOpen, setCancelOpen] = useState(false);
  const [resolving, setResolving] = useState<ConflictResolution | null>(null);
  const terminal = isTerminalProgrammeActionStatus(action.status);
  const statusLabel = (s: ProgrammeActionStatus) =>
    t(`admin:actions.status.${s}` as TranslationKey);

  const send = async (change: Change, key: string, expectedVersion: number, reapplied = false) => {
    try {
      await update.mutateAsync({
        key,
        input: {
          id: action.id,
          expectedVersion,
          status: change.status,
          ...(change.statusReason === undefined ? {} : { statusReason: change.statusReason }),
          ...(reapplied ? { reapplied: true } : {}),
        },
      });
      setState({ kind: "idle" });
      toast({
        title: t("admin:actions.toast.updated", { status: statusLabel(change.status) }),
        tone: "positive",
      });
      return true;
    } catch (error) {
      if (isRepositoryError(error) && error.code === "CONFLICT" && error.conflict) {
        const conflict = error.conflict as {
          latest: ProgrammeAction;
          changedBy?: string;
          changedAt?: string;
        };
        setState({
          kind: "conflict",
          change,
          latest: conflict.latest,
          ...(conflict.changedBy === undefined ? {} : { changedBy: conflict.changedBy }),
          ...(conflict.changedAt === undefined ? {} : { changedAt: conflict.changedAt }),
        });
      } else if (isRetryableWriteError(error)) {
        setState({ kind: "retry", change, key, expectedVersion });
      } else {
        setState({ kind: "failed" });
      }
      return false;
    }
  };

  const change = (next: Change) => send(next, crypto.randomUUID(), action.version);

  const resolve = async (resolution: ConflictResolution) => {
    if (state.kind !== "conflict") return;
    const session = services.session.getState().session;
    setResolving(resolution);
    try {
      if (resolution === "reapply_on_latest") {
        const ok = await send(state.change, crypto.randomUUID(), state.latest.version, true);
        if (!ok) return;
      } else {
        setState({ kind: "idle" });
        await refresh();
      }
      if (session !== null) {
        await emitAdminAudit(repo, session, {
          action: "conflict.resolved",
          entityType: "programme_action",
          entityId: action.id,
          facilityId: action.facilityId,
          districtId: action.districtId,
          changeSummary: {
            resolution,
            yourStatus: state.change.status,
            latestStatus: state.latest.status,
            latestVersion: state.latest.version,
          },
        }).catch(() => undefined);
      }
    } finally {
      setResolving(null);
    }
  };

  const simulateConflict = async () => {
    try {
      await repo.demo.setFaults({
        conflictOnce: [{ entityType: "programme_action", entityId: action.id }],
      });
      toast({ title: t("admin:actions.demo.conflictArmed") });
    } catch {
      toast({ title: t("demo:tools.actionFailed"), tone: "danger" });
    }
  };

  const facility = facilityLabel(action.facilityId, t);
  return (
    <li
      data-testid={`programme-action-${action.id}`}
      data-highlighted={highlighted || undefined}
      className={cx(
        "border-border-soft rounded-md border p-3 transition-colors",
        highlighted && "bg-primary-soft border-primary/40",
        terminal && "opacity-80",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-ink m-0 text-[13px] font-semibold break-words">{action.title}</p>
          <p className="text-muted m-0 mt-0.5 text-xs">
            {t(`admin:actions.category.${action.category}` as TranslationKey)} · {facility}
          </p>
        </div>
        <StatusChip tone={STATUS_TONE[action.status]}>{statusLabel(action.status)}</StatusChip>
      </div>
      <p className="text-muted m-0 mt-1.5 text-xs">
        {t("admin:actions.card.due", {
          date: formatDate(`${action.dueDate}T12:00:00.000Z`, language),
        })}{" "}
        · {t("admin:actions.card.owner")} ·{" "}
        {t("admin:actions.card.updated", { time: formatDateTime(action.updatedAt, language) })}
      </p>
      {action.status === "cancelled_with_reason" && action.statusReason !== undefined ? (
        <p className="text-muted m-0 mt-1 text-xs">
          {t("admin:actions.card.reason", { reason: action.statusReason })}
        </p>
      ) : null}

      {state.kind === "conflict" ? (
        <ConflictNotice
          className="mt-3"
          title={t("admin:actions.conflict.title")}
          description={t("admin:actions.conflict.description")}
          {...(state.changedBy === undefined
            ? {}
            : { changedBy: personaName(state.changedBy) ?? state.changedBy })}
          {...(state.changedAt === undefined ? {} : { changedAt: state.changedAt })}
          rows={[
            {
              id: "status",
              label: t("admin:actions.conflict.status"),
              yours: statusLabel(state.change.status),
              latest: statusLabel(state.latest.status),
            },
            {
              id: "updatedBy",
              label: t("admin:actions.conflict.updatedBy"),
              yours: personaName(services.session.getState().session?.personaId) ?? "",
              latest: personaName(state.latest.updatedBy) ?? state.latest.updatedBy,
            },
            {
              id: "updatedAt",
              label: t("admin:actions.conflict.updatedAt"),
              yours: formatDateTime(action.updatedAt, language),
              latest: formatDateTime(state.latest.updatedAt, language),
            },
          ]}
          resolving={resolving}
          onResolve={(r) => resolve(r)}
        />
      ) : null}

      {state.kind === "retry" ? (
        <div
          role="alert"
          className="border-danger/30 bg-danger-soft mt-3 flex flex-wrap items-center justify-between gap-2 rounded-sm border px-3 py-2 text-[13px]"
        >
          <span className="text-ink font-semibold">{t("admin:actions.dialog.notSaved")}</span>
          <Button
            size="sm"
            variant="secondary"
            icon="refresh"
            onClick={() => send(state.change, state.key, state.expectedVersion)}
          >
            {t("admin:actions.dialog.retry")}
          </Button>
        </div>
      ) : null}
      {state.kind === "failed" ? (
        <p role="alert" className="text-danger m-0 mt-2 text-xs font-medium">
          {t("admin:actions.dialog.failed")}
        </p>
      ) : null}

      {terminal || !availability.allowed || state.kind === "conflict" ? null : (
        <div className="mt-2 flex flex-wrap gap-2">
          {action.status === "open" ? (
            <Button
              size="sm"
              variant="secondary"
              loading={update.isPending}
              onClick={() => change({ status: "in_progress" })}
            >
              {t("admin:actions.card.start")}
            </Button>
          ) : null}
          {action.status === "in_progress" ? (
            <Button
              size="sm"
              variant="secondary"
              loading={update.isPending}
              onClick={() => change({ status: "done" })}
            >
              {t("admin:actions.card.done")}
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            disabled={update.isPending}
            onClick={() => setCancelOpen(true)}
          >
            {t("admin:actions.card.cancel")}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => simulateConflict()}>
            {t("admin:actions.demo.conflict")}
          </Button>
        </div>
      )}
      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title={t("admin:actions.cancel.title")}
        description={t("admin:actions.cancel.description", { title: action.title })}
        requireReason
        reasonLabel={t("admin:actions.cancel.reason")}
        confirmLabel={t("admin:actions.cancel.confirm")}
        variant="destructive"
        loading={update.isPending}
        onConfirm={async (reason) => {
          await change({ status: "cancelled_with_reason", statusReason: reason ?? "" });
          setCancelOpen(false);
        }}
      />
    </li>
  );
}
