/**
 * One data-quality issue (ADM-06 task 4, ref image 4 "CONFLICT" card): an expandable row —
 * type pill, facility, detected (Kigali date), age in days, status pill. Expanded: "What was
 * detected", the rule and ruleset version (T-10), source app, the opaque record ref, the triage
 * history (actor, role, time) and "Correct at source" guidance — there is NO edit control for the
 * clinical record.
 *
 * Actions (`quality.triage` in the facility's scope): Acknowledge (no input), Resolve with note
 * (`TriageDialog`), Send to facility (`programme_action.write`: `ProgrammeActionDialog` prefilled
 * with `data_completeness_check` + "Review {type} issue {ref}", then the link). Without the
 * permission the row is read-only with a lock note (the repository also rejects, FORBIDDEN).
 * Every write uses an idempotency key + `expectedVersion`; a CONFLICT shows `ConflictNotice` with
 * the latest status, owner and time; TIMEOUT / OFFLINE → "Not saved — retry" with the same key.
 */
import { roleLabelKey } from "@laif/auth-demo";
import {
  triageActionsFor,
  type DataQualityIssue,
  type ProgrammeAction,
  type TriageAction,
} from "@laif/contracts";
import type { ConflictResolution } from "@laif/domain";
import { formatDate, formatDateTime, formatNumber, useLanguage } from "@laif/i18n";
import { DEMO_PERSONAS } from "@laif/mock-data";
import { isRepositoryError, type RepositoryError } from "@laif/repositories";
import {
  Button,
  ConflictNotice,
  ExpandableRow,
  Icon,
  KeyValueList,
  useToast,
  useTx,
  type TranslationKey,
} from "@laif/ui-web";
import { useState } from "react";
import { useLocation } from "react-router";

import { facilityLabel } from "../../app/persona-labels.ts";
import { useRepository, useServices } from "../../app/providers.tsx";
import { emitAdminAudit } from "../../lib/audit.ts";
import { findDraft } from "../../lib/drafts.ts";
import {
  ProgrammeActionDialog,
  type ProgrammeActionFormValues,
} from "../programme-actions/ProgrammeActionDialog.tsx";
import {
  isRetryableWriteError,
  useRefreshQuality,
  useTriageCapabilities,
  useTriageIssue,
} from "./mutations.ts";
import { IssueStatusPill, IssueTypePill } from "./pills.tsx";
import { TriageDialog, type TriageFormValues } from "./TriageDialog.tsx";

const DAY_MS = 86_400_000;

const personaName = (id: string | null | undefined): string | undefined =>
  id === null || id === undefined
    ? undefined
    : (DEMO_PERSONAS.find((p) => p.id === id)?.displayName ?? id);

/** A pending write: what to (re)send, with its key. */
type Change =
  | { action: "acknowledge" }
  | { action: "resolve"; note: string }
  | { action: "send_to_facility"; programmeActionId: string };

type RowState =
  | { kind: "idle" }
  | { kind: "retry"; change: Change; key: string; expectedVersion: number }
  | { kind: "failed" }
  | {
      kind: "conflict";
      change: Change;
      latest: DataQualityIssue;
      changedBy?: string;
      changedAt?: string;
    };

export type IssueRowProps = {
  issue: DataQualityIssue;
  /** Global filter params (programme action `sourceContext.filters`). */
  filters: Record<string, string>;
  /** Test seam (default `crypto.randomUUID`). */
  createKey?: () => string;
};

export function IssueRow({ issue, filters, createKey }: IssueRowProps) {
  const t = useTx();
  const { language } = useLanguage();
  const { toast } = useToast();
  const services = useServices();
  const repo = useRepository();
  const triage = useTriageIssue();
  const refresh = useRefreshQuality();
  const capabilities = useTriageCapabilities()(issue.facilityId);
  const newKey = createKey ?? (() => crypto.randomUUID());
  const [state, setState] = useState<RowState>({ kind: "idle" });
  // ADM-09 (T-09): a draft left by an expired session on this URL reopens its dialog.
  const location = useLocation();
  const draftContext = `${location.pathname}${location.search}`;
  const [restore, setRestore] = useState(() => ({
    triage: findDraft<TriageFormValues>("triage", draftContext),
    send: findDraft<ProgrammeActionFormValues>("programmeAction", `${draftContext}#${issue.id}`),
  }));
  const [dialog, setDialog] = useState<"resolve" | "send" | null>(() =>
    restore.triage?.subject === issue.id
      ? "resolve"
      : restore.send?.subject === issue.facilityId
        ? "send"
        : null,
  );
  const closeDialog = () => {
    setDialog(null);
    setRestore({ triage: null, send: null });
  };
  const [resolving, setResolving] = useState<ConflictResolution | null>(null);

  const typeLabel = t(`admin:quality.type.${issue.type}` as TranslationKey);
  const statusLabel = (s: DataQualityIssue["status"]) =>
    t(`admin:quality.status.${s}` as TranslationKey);
  const facility = facilityLabel(issue.facilityId, t);
  const ageDays = Math.max(
    0,
    Math.floor((services.clock.now().getTime() - Date.parse(issue.detectedAt)) / DAY_MS),
  );
  const available: TriageAction[] = capabilities.triage ? triageActionsFor(issue.status) : [];

  const onConflict = (error: RepositoryError, change: Change) => {
    const conflict = error.conflict;
    if (conflict === undefined) {
      setState({ kind: "failed" });
      return;
    }
    setState({
      kind: "conflict",
      change,
      latest: conflict.latest as DataQualityIssue,
      ...(conflict.changedBy === undefined ? {} : { changedBy: conflict.changedBy }),
      ...(conflict.changedAt === undefined ? {} : { changedAt: conflict.changedAt }),
    });
  };

  /** Sends a change; true on success. */
  const send = async (change: Change, key: string, expectedVersion: number): Promise<boolean> => {
    try {
      await triage.mutateAsync({ key, input: { ...change, id: issue.id, expectedVersion } });
      setState({ kind: "idle" });
      toast({
        title:
          change.action === "acknowledge"
            ? t("admin:quality.toast.acknowledged")
            : change.action === "resolve"
              ? t("admin:quality.toast.resolved")
              : t("admin:quality.toast.sent"),
        tone: "positive",
      });
      return true;
    } catch (error) {
      if (isRepositoryError(error) && error.code === "CONFLICT") onConflict(error, change);
      else if (isRetryableWriteError(error)) {
        setState({ kind: "retry", change, key, expectedVersion });
      } else setState({ kind: "failed" });
      return false;
    }
  };

  const resolveConflict = async (resolution: ConflictResolution) => {
    if (state.kind !== "conflict") return;
    const session = services.session.getState().session;
    setResolving(resolution);
    try {
      if (resolution === "reapply_on_latest") {
        const ok = await send(state.change, newKey(), state.latest.version);
        if (!ok) return;
      } else {
        setState({ kind: "idle" });
        await refresh();
      }
      if (session !== null) {
        await emitAdminAudit(repo, session, {
          action: "conflict.resolved",
          entityType: "data_quality_issue",
          entityId: issue.id,
          facilityId: issue.facilityId,
          districtId: issue.districtId,
          changeSummary: {
            resolution,
            yourAction: state.change.action,
            latestStatus: state.latest.status,
            latestVersion: state.latest.version,
          },
        }).catch(() => undefined);
      }
    } finally {
      setResolving(null);
    }
  };

  const onAssigned = (action: ProgrammeAction) => {
    void send(
      { action: "send_to_facility", programmeActionId: action.id },
      newKey(),
      issue.version,
    );
  };

  const detected = (() => {
    switch (issue.type) {
      case "missing_field":
        return t("admin:quality.detected.missing_field", {
          fields: issue.details.fields
            .map((f) => t(`admin:quality.field.${f}` as TranslationKey))
            .join(", "),
        });
      case "duplicate_identifier":
        return t("admin:quality.detected.duplicate_identifier", {
          n: formatNumber(issue.details.records, language),
        });
      default:
        return t(`admin:quality.detected.${issue.type}` as TranslationKey);
    }
  })();

  const latestReapplicable =
    state.kind === "conflict" &&
    triageActionsFor(state.latest.status).includes(state.change.action);

  return (
    <li className="list-none" data-testid={`issue-row-${issue.id}`} data-status={issue.status}>
      <ExpandableRow
        headingLevel={4}
        leading={<IssueTypePill type={issue.type} />}
        title={
          <span className="flex flex-wrap items-center gap-x-2">
            <span>{facility}</span>
            <span className="text-muted font-mono text-xs font-normal">{issue.subjectRef}</span>
          </span>
        }
        subtitle={t("admin:quality.row.subtitle", {
          date: formatDate(issue.detectedAt, language),
          days: formatNumber(ageDays, language),
          count: ageDays,
        })}
        trailing={<IssueStatusPill status={issue.status} />}
      >
        <div className="flex flex-col gap-3 text-[13px]">
          <div className="sm:hidden">
            <IssueStatusPill status={issue.status} />
          </div>
          <section aria-label={t("admin:quality.row.whatDetected")}>
            <h5 className="micro-label text-muted m-0 mb-1 font-medium">
              {t("admin:quality.row.whatDetected")}
            </h5>
            <p className="text-ink m-0" data-testid="issue-detected">
              {detected}
            </p>
          </section>
          <KeyValueList
            items={[
              {
                id: "rule",
                label: t("admin:quality.row.rule"),
                value: (
                  <span data-testid="issue-rule">
                    <span className="font-mono text-xs">{issue.details.rule}</span> ·{" "}
                    {t(`admin:quality.rule.${issue.type}` as TranslationKey)}
                  </span>
                ),
              },
              {
                id: "ruleset",
                label: t("admin:quality.row.ruleset"),
                value: (
                  <span className="font-mono text-xs" data-testid="issue-ruleset">
                    {issue.details.rulesetVersion ?? t("admin:quality.row.rulesetNone")}
                  </span>
                ),
              },
              {
                id: "source",
                label: t("admin:quality.row.source"),
                value: t(`admin:quality.source.${issue.sourceApp}` as TranslationKey),
              },
              {
                id: "detectedAt",
                label: t("admin:quality.row.detectedAt"),
                value: formatDateTime(issue.detectedAt, language),
              },
              {
                id: "ref",
                label: t("admin:quality.row.ref"),
                value: <span className="font-mono text-xs">{issue.subjectRef}</span>,
              },
              ...(issue.programmeActionId === null
                ? []
                : [
                    {
                      id: "action",
                      label: t("admin:quality.row.programmeAction"),
                      value: t("admin:quality.row.programmeActionLinked"),
                    },
                  ]),
              ...(issue.note === null
                ? []
                : [{ id: "note", label: t("admin:quality.row.note"), value: issue.note }]),
            ]}
          />
          <section aria-label={t("admin:quality.row.history")}>
            <h5 className="micro-label text-muted m-0 mb-1 font-medium">
              {t("admin:quality.row.history")}
            </h5>
            <ol className="m-0 flex list-none flex-col gap-1 p-0" data-testid="issue-history">
              <li className="text-muted">
                {t("admin:quality.row.historyDetected", {
                  time: formatDateTime(issue.detectedAt, language),
                })}
              </li>
              {issue.history.map((h, index) => (
                <li key={`${h.at}-${String(index)}`} className="text-ink">
                  {t("admin:quality.row.historyEntry", {
                    status: statusLabel(h.toStatus),
                    actor: personaName(h.by) ?? h.by,
                    role: t(roleLabelKey(h.role) as TranslationKey),
                    time: formatDateTime(h.at, language),
                  })}
                </li>
              ))}
            </ol>
          </section>
          <p
            className="border-info/30 bg-info-soft text-ink m-0 flex items-start gap-2 rounded-sm border px-3 py-2"
            data-testid="correct-at-source"
          >
            <Icon name="info" size={16} className="mt-0.5 shrink-0" />
            <span>{t("admin:quality.correctAtSource")}</span>
          </p>

          {state.kind === "conflict" ? (
            <ConflictNotice
              title={t("admin:quality.conflict.title")}
              description={t("admin:quality.conflict.description")}
              {...(state.changedBy === undefined
                ? {}
                : { changedBy: personaName(state.changedBy) ?? state.changedBy })}
              {...(state.changedAt === undefined ? {} : { changedAt: state.changedAt })}
              rows={[
                {
                  id: "status",
                  label: t("admin:quality.conflict.status"),
                  yours: statusLabel(
                    state.change.action === "acknowledge"
                      ? "acknowledged"
                      : state.change.action === "resolve"
                        ? "resolved_with_note"
                        : "sent_to_facility",
                  ),
                  latest: statusLabel(state.latest.status),
                },
                {
                  id: "updatedBy",
                  label: t("admin:quality.conflict.updatedBy"),
                  yours: personaName(services.session.getState().session?.personaId) ?? "",
                  latest: personaName(state.latest.updatedBy) ?? "—",
                },
                {
                  id: "updatedAt",
                  label: t("admin:quality.conflict.updatedAt"),
                  yours: formatDateTime(issue.updatedAt, language),
                  latest: formatDateTime(state.latest.updatedAt, language),
                },
              ]}
              resolutions={
                latestReapplicable ? ["reapply_on_latest", "keep_latest"] : ["keep_latest"]
              }
              resolving={resolving}
              onResolve={(r) => resolveConflict(r)}
            />
          ) : null}

          {state.kind === "retry" ? (
            <div
              role="alert"
              className="border-danger/30 bg-danger-soft flex flex-wrap items-center justify-between gap-2 rounded-sm border px-3 py-2"
            >
              <span className="text-ink font-semibold">{t("admin:quality.dialog.notSaved")}</span>
              <Button
                size="sm"
                variant="secondary"
                icon="refresh"
                loading={triage.isPending}
                onClick={() => void send(state.change, state.key, state.expectedVersion)}
              >
                {t("admin:quality.dialog.retry")}
              </Button>
            </div>
          ) : null}
          {state.kind === "failed" ? (
            <p role="alert" className="text-danger m-0 text-xs font-medium">
              {t("admin:quality.dialog.failed")}
            </p>
          ) : null}

          {!capabilities.triage ? (
            <p
              className="text-muted m-0 flex items-center gap-1.5 text-xs"
              data-testid="issue-readonly"
            >
              <Icon name="lock" size={14} />
              {t("admin:quality.readOnly")}
            </p>
          ) : available.length === 0 || state.kind === "conflict" ? null : (
            <div className="flex flex-wrap gap-2" data-testid="issue-actions">
              {available.includes("acknowledge") ? (
                <Button
                  size="sm"
                  variant="secondary"
                  loading={triage.isPending}
                  onClick={() => void send({ action: "acknowledge" }, newKey(), issue.version)}
                >
                  {t("admin:quality.action.acknowledge")}
                </Button>
              ) : null}
              {available.includes("resolve") ? (
                <Button size="sm" variant="secondary" onClick={() => setDialog("resolve")}>
                  {t("admin:quality.action.resolve")}
                </Button>
              ) : null}
              {available.includes("send_to_facility") && capabilities.send ? (
                <Button size="sm" variant="secondary" onClick={() => setDialog("send")}>
                  {t("admin:quality.action.send")}
                </Button>
              ) : null}
            </div>
          )}
        </div>
      </ExpandableRow>
      {dialog === "resolve" ? (
        <TriageDialog
          issue={issue}
          onClose={closeDialog}
          draftContext={draftContext}
          restore={restore.triage?.subject === issue.id ? restore.triage : null}
          onConflict={(error, note) => onConflict(error, { action: "resolve", note })}
          {...(createKey === undefined ? {} : { createKey })}
        />
      ) : null}
      {dialog === "send" ? (
        <ProgrammeActionDialog
          facilityId={issue.facilityId}
          sourceContext={{ page: "quality", filters }}
          defaults={{
            category: "data_completeness_check",
            title: t("admin:quality.sendTitle", { type: typeLabel, ref: issue.subjectRef }),
          }}
          onClose={closeDialog}
          onAssigned={onAssigned}
          draftContext={`${draftContext}#${issue.id}`}
          restore={restore.send?.subject === issue.facilityId ? restore.send : null}
          {...(createKey === undefined ? {} : { createKey })}
        />
      ) : null}
    </li>
  );
}
