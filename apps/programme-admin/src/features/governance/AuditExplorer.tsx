/**
 * Audit log tab (ADM-08 task 3; FRD §5 fields; PA-08): a read-only, filterable, paginated
 * explorer over the audit events the persona may read — the repository decides visibility
 * (`audit.read`: everything in the grant; `audit.read_scoped`: events located in the grant plus
 * the persona's own, never other personas' programme-level governance events).
 *
 * - Columns: time (Kigali), action, actor (persona + id + role), resource (entity type + opaque
 *   id), facility / district, change summary (before → after for grant / status changes only),
 *   justification, correlation id (a button that filters to the chain).
 * - Governance view = metadata only: no patient names or free text. Patient-linked events show
 *   opaque ids and their justification is withheld (clinical free text stays with the record).
 * - Filters live in the URL (`aaction`, `arole`, `aentity`, `afrom`, `ato`, `acorr`, `apage`),
 *   validated with Zod (translated messages); newest first; 25 per page.
 * - Opening the log emits `admin.audit.viewed` once per session + filter key.
 */
import { roleLabelKey } from "@laif/auth-demo";
import { formatDateTime, useLanguage } from "@laif/i18n";
import { DEMO_PERSONAS } from "@laif/mock-data";
import type { AuditEvent } from "@laif/domain";
import {
  AccessibleDataTable,
  Button,
  Card,
  EmptyState,
  ErrorState,
  errorCodeOf,
  Icon,
  LoadingSkeleton,
  Pagination,
  Select,
  StatusChip,
  TextInput,
  useTx,
  type DataTableColumn,
  type TranslationKey,
} from "@laif/ui-web";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router";

import { districtLabel, facilityLabel } from "../../app/persona-labels.ts";
import { useRepository, useServices } from "../../app/providers.tsx";
import { emitAdminAudit } from "../../lib/audit.ts";
import { makeIdempotencyKey } from "../../lib/idempotency.ts";
import { adminKeys, type AuditFilterKey } from "../../lib/queryKeys.ts";
import { useAccess } from "../metrics/queries.ts";
import {
  AUDIT_ACTION_FILTERS,
  AUDIT_ENTITY_FILTERS,
  AUDIT_ROLE_FILTERS,
  auditFilterKeyString,
  parseAuditFilters,
  type AuditFilterIssue,
  writeAuditFilters,
} from "./auditFilterSchema.ts";
import { grantChangeLines } from "./grantFormat.ts";
import { AUDIT_PAGE_SIZE, NO_AUDIT_FILTERS, useAuditPage } from "./queries.ts";

const personaName = (id: string | null): string | null =>
  id === null ? null : (DEMO_PERSONAS.find((p) => p.id === id)?.displayName ?? null);

/** `admin:governance.audit.actionFilter.<value>` uses `_` for dots. */
export const actionFilterLabelKey = (value: string): TranslationKey =>
  value.endsWith(".")
    ? (`admin:governance.audit.actionGroup.${value.slice(0, -1).replaceAll(".", "_")}` as TranslationKey)
    : (`domain:audit.${value}` as TranslationKey);

type Json = Record<string, unknown>;
const asObject = (v: unknown): Json | null =>
  typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Json) : null;

function ChangeSummary({ event }: { event: AuditEvent }) {
  const t = useTx();
  const { language } = useLanguage();
  const summary = asObject(event.changeSummary) ?? {};
  if (event.action.startsWith("admin.access_grant.")) {
    const lines = grantChangeLines(
      asObject(summary["before"]),
      asObject(summary["after"]),
      t,
      (iso) => formatDateTime(iso, language),
    );
    return (
      <span className="block text-xs" data-testid="grant-change-summary">
        <span className="text-muted block font-mono">
          {t("admin:governance.grant.versionChange", {
            from: typeof summary["fromVersion"] === "number" ? summary["fromVersion"] : "?",
            to: typeof summary["toVersion"] === "number" ? summary["toVersion"] : "?",
          })}
        </span>
        {lines.map((line) => (
          <span key={line.field} className="block">
            {t(`admin:governance.grant.field.${line.field}` as TranslationKey)}: {line.from} →{" "}
            {line.to}
          </span>
        ))}
      </span>
    );
  }
  const from = summary["fromStatus"];
  const to = summary["toStatus"];
  if (typeof to === "string") {
    return (
      <span className="font-mono text-xs">
        {typeof from === "string" ? from : "—"} → {to}
      </span>
    );
  }
  const reason = summary["reason"];
  if (event.outcome === "denied" && typeof reason === "string") {
    return <span className="font-mono text-xs">{reason}</span>;
  }
  return <span className="text-muted">—</span>;
}

/**
 * The filter form: a draft of the URL filters, applied on submit. Re-mounted (key = filter key)
 * when the URL filters change, so correlation buttons and back / forward refresh it.
 */
function AuditFilterForm({
  filters,
  issues,
  onApply,
  onClear,
}: {
  filters: AuditFilterKey;
  issues: readonly AuditFilterIssue[];
  onApply: (next: AuditFilterKey) => void;
  onClear: () => void;
}) {
  const t = useTx();
  const [draft, setDraft] = useState<AuditFilterKey>(filters);
  const hasFilters = Object.values(filters).some((v) => v !== null);
  const invalid = (field: string) =>
    issues.some((i) => i.field === field) ? { "aria-invalid": true as const } : {};
  const option = (value: string, label: string) => ({ value, label });
  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    onApply({
      ...draft,
      correlationId: draft.correlationId?.trim() ? draft.correlationId.trim() : null,
    });
  };
  return (
    <form
      role="search"
      aria-label={t("admin:governance.audit.filter.label")}
      onSubmit={onSubmit}
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
      noValidate
    >
      <Select
        label={t("admin:governance.audit.filter.action")}
        {...invalid("action")}
        placeholder={t("admin:governance.audit.filter.any")}
        value={draft.action ?? ""}
        onChange={(e) => setDraft({ ...draft, action: e.target.value || null })}
        options={AUDIT_ACTION_FILTERS.map((a) => option(a, t(actionFilterLabelKey(a))))}
      />
      <Select
        label={t("admin:governance.audit.filter.role")}
        {...invalid("role")}
        placeholder={t("admin:governance.audit.filter.any")}
        value={draft.role ?? ""}
        onChange={(e) => setDraft({ ...draft, role: e.target.value || null })}
        options={AUDIT_ROLE_FILTERS.map((r) => option(r, t(roleLabelKey(r))))}
      />
      <Select
        label={t("admin:governance.audit.filter.entity")}
        {...invalid("entity")}
        placeholder={t("admin:governance.audit.filter.any")}
        value={draft.entity ?? ""}
        onChange={(e) => setDraft({ ...draft, entity: e.target.value || null })}
        options={AUDIT_ENTITY_FILTERS.map((x) =>
          option(x, t(`domain:entityType.${x}` as TranslationKey)),
        )}
      />
      <TextInput
        type="date"
        label={t("admin:governance.audit.filter.from")}
        {...invalid("from")}
        value={draft.from ?? ""}
        onChange={(e) => setDraft({ ...draft, from: e.target.value || null })}
      />
      <TextInput
        type="date"
        label={t("admin:governance.audit.filter.to")}
        {...invalid("to")}
        value={draft.to ?? ""}
        onChange={(e) => setDraft({ ...draft, to: e.target.value || null })}
      />
      <TextInput
        label={t("admin:governance.audit.filter.correlation")}
        {...invalid("correlationId")}
        value={draft.correlationId ?? ""}
        onChange={(e) => setDraft({ ...draft, correlationId: e.target.value || null })}
      />
      <div className="flex flex-wrap items-end gap-2 sm:col-span-2 lg:col-span-3">
        <Button type="submit" icon="filter">
          {t("admin:governance.audit.filter.apply")}
        </Button>
        {hasFilters ? (
          <Button type="button" variant="secondary" onClick={onClear}>
            {t("admin:governance.audit.filter.clear")}
          </Button>
        ) : null}
      </div>
    </form>
  );
}

export function AuditExplorer() {
  const t = useTx();
  const { language } = useLanguage();
  const services = useServices();
  const repo = useRepository();
  const queryClient = useQueryClient();
  const { scopeKey } = useAccess();
  const [params, setParams] = useSearchParams();
  const parsed = useMemo(() => parseAuditFilters(params), [params]);
  const { filters, page, issues } = parsed;
  const query = useAuditPage(filters, page);
  const filterKey = auditFilterKeyString(filters);

  // Access audit of the audit log: once per session + filter key.
  useEffect(() => {
    const session = services.session.getState().session;
    if (session === null) return;
    const key = makeIdempotencyKey(["admin.audit.viewed", session.correlationId, filterKey]);
    if (!services.session.once.claim(key)) return;
    void emitAdminAudit(repo, session, {
      action: "admin.audit.viewed",
      entityType: "audit_event",
      entityId: "governance-log",
      changeSummary: { filters: JSON.parse(filterKey) as string[] },
    })
      .then(() => queryClient.invalidateQueries({ queryKey: adminKeys.auditAll(scopeKey) }))
      .catch(() => undefined);
  }, [filterKey, services, repo, queryClient, scopeKey]);

  const apply = (next: AuditFilterKey, nextPage = 1) =>
    setParams(writeAuditFilters(params, next, nextPage));

  const hasFilters = Object.values(filters).some((v) => v !== null);
  const clear = () => apply(NO_AUDIT_FILTERS);

  const columns: DataTableColumn<AuditEvent>[] = [
    {
      id: "time",
      header: t("admin:governance.audit.col.time"),
      isRowHeader: true,
      cell: (e) => <span className="tabular-nums">{formatDateTime(e.occurredAt, language)}</span>,
    },
    {
      id: "action",
      header: t("admin:governance.audit.col.action"),
      cell: (e) => (
        <span className="block">
          <span className="text-ink block">{t(`domain:audit.${e.action}` as TranslationKey)}</span>
          <span className="text-muted block font-mono text-[11px]">{e.action}</span>
          {e.outcome === "denied" ? (
            <StatusChip tone="danger">{t("domain:auditOutcome.denied")}</StatusChip>
          ) : null}
        </span>
      ),
    },
    {
      id: "actor",
      header: t("admin:governance.audit.col.actor"),
      cell: (e) =>
        e.actorId === null ? (
          <span className="text-muted">{t("admin:governance.audit.system")}</span>
        ) : (
          <span className="block">
            <span className="text-ink block">{personaName(e.actorId) ?? e.actorId}</span>
            <span className="text-muted block font-mono text-[11px]">{e.actorId}</span>
            <span className="text-muted block text-xs">
              {e.actorRole === null ? "" : t(roleLabelKey(e.actorRole))}
            </span>
          </span>
        ),
    },
    {
      id: "resource",
      header: t("admin:governance.audit.col.resource"),
      cell: (e) => (
        <span className="block">
          <span className="text-ink block">
            {t(`domain:entityType.${e.entityType}` as TranslationKey)}
          </span>
          <span className="text-muted block font-mono text-[11px] break-all">{e.entityId}</span>
        </span>
      ),
    },
    {
      id: "location",
      header: t("admin:governance.audit.col.location"),
      cell: (e) =>
        e.facilityId !== null
          ? facilityLabel(e.facilityId, t)
          : e.districtId !== null
            ? districtLabel(e.districtId, t)
            : t("admin:governance.audit.programmeLevel"),
    },
    {
      id: "change",
      header: t("admin:governance.audit.col.change"),
      cell: (e) => <ChangeSummary event={e} />,
    },
    {
      id: "justification",
      header: t("admin:governance.audit.col.justification"),
      cell: (e) =>
        e.patientId !== null && e.justification ? (
          <span className="text-muted text-xs" data-testid="justification-withheld">
            {t("admin:governance.audit.justificationWithheld")}
          </span>
        ) : (
          <span className="text-xs">{e.justification ?? "—"}</span>
        ),
    },
    {
      id: "correlation",
      header: t("admin:governance.audit.col.correlation"),
      cell: (e) => (
        <Button
          variant="ghost"
          size="sm"
          className="font-mono"
          aria-label={t("admin:governance.audit.showChain", { id: e.correlationId })}
          aria-pressed={filters.correlationId === e.correlationId}
          onClick={() => apply({ ...filters, correlationId: e.correlationId })}
        >
          {e.correlationId.slice(0, 8)}
        </Button>
      ),
    },
  ];

  return (
    <div data-testid="audit-explorer" className="flex flex-col gap-4">
      <Card title={t("admin:governance.audit.title")}>
        <p className="text-muted mt-0 mb-3 text-[13px]">{t("admin:governance.audit.subtitle")}</p>
        <AuditFilterForm
          key={filterKey}
          filters={filters}
          issues={issues}
          onApply={(next) => apply(next)}
          onClear={clear}
        />
        {issues.length > 0 ? (
          <p
            role="alert"
            data-testid="audit-filter-issues"
            className="border-danger/30 bg-danger-soft text-ink mt-3 mb-0 flex items-start gap-2 rounded-sm border px-3 py-2 text-[13px]"
          >
            <Icon name="alert" size={16} className="mt-0.5 shrink-0" />
            <span>
              {issues.map((i) => t(i.messageKey)).join(" ")}{" "}
              {t("admin:governance.audit.filter.ignored")}
            </span>
          </p>
        ) : null}
        {filters.correlationId === null ? null : (
          <p className="text-ink mt-3 mb-0 text-[13px]" data-testid="audit-chain-filter">
            {t("admin:governance.audit.chainFilter", { id: filters.correlationId })}
          </p>
        )}
      </Card>

      <Card>
        {query.isPending ? (
          <LoadingSkeleton variant="table" lines={5} />
        ) : query.isError ? (
          <ErrorState
            code={errorCodeOf(query.error) ?? "INTERNAL"}
            message={t("admin:governance.audit.error")}
            onRetry={() => query.refetch()}
          />
        ) : (
          <AccessibleDataTable
            scrollable
            caption={t("admin:governance.audit.caption")}
            captionHidden
            columns={columns}
            rows={query.data.items}
            getRowId={(e) => e.id}
            totalCount={query.data.total}
            emptyState={
              <EmptyState
                icon="search"
                title={t("admin:governance.audit.empty")}
                description={t("admin:governance.audit.emptyHint")}
                {...(hasFilters ? { onClearFilters: clear } : {})}
              />
            }
            footer={
              query.data.total > AUDIT_PAGE_SIZE ? (
                <Pagination
                  page={query.data.page}
                  pageSize={AUDIT_PAGE_SIZE}
                  total={query.data.total}
                  onPageChange={(next) => apply(filters, next)}
                />
              ) : null
            }
          />
        )}
      </Card>
    </div>
  );
}
