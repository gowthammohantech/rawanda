/**
 * `/clinical/audit` (CLN-10, PRD/FRD CL-08): read-only, facility-scoped audit explorer.
 *
 * Header (`Export CSV` for `audit.export` — coordinator only; others read "Export requires
 * coordinator role"), the persistent "does not prove tamper resistance" notice (spec §11),
 * URL-synced filters + quick chips, the table (50 per page, newest first), the event drawer
 * (`?event=`) with its correlation trail. No edit / delete affordance anywhere: the log is
 * append-only and the repository has no method to change it.
 *
 * Scope is enforced by the repository (`listAuditEvents`, `recordExport`); listing appends
 * `audit.viewed` (de-duplicated per demo minute). Export: confirm (scope, rows, filters) →
 * `export.requested` → `recordExport` (`export.generated`) → download; any failure → toast, no
 * file. Offline: the cached page stays readable, export is disabled.
 */
import type { AuditExplorerFilter } from "@laif/contracts";
import type { AuditEvent } from "@laif/domain";
import {
  Button,
  ConfirmDialog,
  EmptyState,
  InfoCallout,
  KeyValueList,
  LoadingSkeleton,
  Pagination,
  useToast,
  useTx,
} from "@laif/ui-web";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";

import { useDemoTools } from "../../app/demo-tools.tsx";
import { facilityLabel } from "../../app/persona-labels.ts";
import { PageHeader } from "../../components/PageHeader.tsx";
import { QueryErrorState } from "../../components/QueryErrorState.tsx";
import { toClinicalError } from "../../data/errors.ts";
import { useSession } from "../../session/useSession.ts";
import { useDemoNow } from "../decision/hooks.ts";
import { AuditEventDrawer } from "./AuditEventDrawer.tsx";
import { AuditFilters } from "./AuditFilters.tsx";
import { AuditTable } from "./AuditTable.tsx";
import { useAuditEvents, useAuditPatients, useExportAudit } from "./hooks.ts";
import {
  AUDIT_EXPLORER_PAGE_SIZE,
  DEFAULT_AUDIT_FILTER,
  filterRecord,
  filterSummary,
  filterToParams,
  parseAuditParams,
  toRepositoryFilter,
} from "./model.ts";

const newId = (): string => crypto.randomUUID();

export function AuditExplorerPage() {
  const t = useTx();
  const { toast } = useToast();
  const { can, persona, activeFacilityId } = useSession();
  const { faultConfig } = useDemoTools();
  const [searchParams, setSearchParams] = useSearchParams();
  const { filter, invalid, eventId } = parseAuditParams(searchParams);
  const patients = useAuditPatients();
  const now = useDemoNow();
  const runExport = useExportAudit();
  const [confirming, setConfirming] = useState(false);
  const [exporting, setExporting] = useState(false);

  const bySynthetic = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of patients.data?.values() ?? []) {
      map.set(p.syntheticIdentifier.toUpperCase(), p.id);
    }
    return map;
  }, [patients.data]);
  const lookupPatient = (value: string) => bySynthetic.get(value.toUpperCase()) ?? value;
  const syntheticIdOf = (id: string) => patients.data?.get(id)?.syntheticIdentifier ?? null;

  const repoFilter = toRepositoryFilter(filter, lookupPatient);
  // A synthetic-id filter waits for the patient lookup (otherwise it would query the raw text).
  const events = useAuditEvents(repoFilter, filter.patient === undefined || !patients.isPending);
  const page = events.data;
  const rows = page?.items ?? [];
  const selected: AuditEvent | null =
    eventId === null ? null : (rows.find((e) => e.id === eventId) ?? null);

  const apply = (next: AuditExplorerFilter) =>
    setSearchParams(filterToParams(next, searchParams, null));
  const openEvent = (e: AuditEvent | null) =>
    setSearchParams(filterToParams(filter, searchParams, e === null ? null : e.id));
  const filterCorrelation = (correlationId: string) =>
    apply({ ...DEFAULT_AUDIT_FILTER, correlationId });

  const facilityName = activeFacilityId === null ? "" : facilityLabel(activeFacilityId, t);
  const offline = faultConfig.offline;
  const canExport = can("audit.export");

  const exportCsv = async () => {
    if (persona === null || activeFacilityId === null || now.data === undefined) return;
    setExporting(true);
    try {
      await runExport({
        filter: repoFilter,
        filters: filterRecord(filter) as Record<string, string | number>,
        filtersText: filterSummary(filter),
        persona: { id: persona.id, displayName: persona.displayName, role: persona.role },
        facilityId: activeFacilityId,
        nowIso: now.data,
        period: { from: filter.from, to: filter.to },
        patients: patients.data ?? new Map(),
        idempotencyKey: newId(),
        exportId: newId(),
      });
      setConfirming(false);
      toast({ title: t("clinical:audit.export.success"), tone: "positive" });
    } catch (error) {
      setConfirming(false);
      const denied = toClinicalError(error).code === "FORBIDDEN";
      toast({
        title: t(denied ? "clinical:audit.export.denied" : "clinical:audit.export.failure"),
        tone: "danger",
      });
    } finally {
      setExporting(false);
    }
  };

  const exportAction = canExport ? (
    <Button
      icon="download"
      data-testid="audit-export"
      disabled={offline || events.isPending || now.data === undefined}
      title={offline ? t("clinical:audit.export.offline") : undefined}
      onClick={() => setConfirming(true)}
    >
      {t("clinical:audit.export.button")}
    </Button>
  ) : (
    <p className="text-muted text-sm" data-testid="audit-export-unavailable">
      {t("clinical:audit.export.requiresCoordinator")}
    </p>
  );

  return (
    <div className="space-y-5" data-testid="audit-page">
      <PageHeader
        title={t("clinical:audit.title")}
        subtitle={t("clinical:audit.subtitle", { facility: facilityName })}
        actions={exportAction}
      />
      {offline && canExport ? (
        <p className="text-muted text-sm">{t("clinical:audit.export.offline")}</p>
      ) : null}

      <div data-testid="audit-notice">
        <InfoCallout title={t("clinical:audit.noticeTitle")} icon="info">
          <p>{t("clinical:audit.notice")}</p>
          <p className="mt-1">{t("clinical:audit.readOnly")}</p>
        </InfoCallout>
      </div>

      <AuditFilters
        value={filter}
        onApply={apply}
        onReset={() => setSearchParams(new URLSearchParams())}
      />

      {invalid ? (
        <p role="alert" className="text-risk-danger text-sm">
          {t("clinical:audit.invalidFilter")}
        </p>
      ) : null}

      <p className="sr-only" aria-live="polite">
        {page === undefined ? "" : t("clinical:audit.results", { count: page.total })}
      </p>

      {events.isPending ? (
        <div aria-busy="true" aria-label={t("clinical:audit.loading")} data-testid="audit-loading">
          <LoadingSkeleton variant="table" lines={8} />
        </div>
      ) : events.isError ? (
        <QueryErrorState error={events.error} onRetry={() => void events.refetch()} />
      ) : (
        <AuditTable
          rows={rows}
          total={page?.total ?? 0}
          onOpen={openEvent}
          onCorrelation={filterCorrelation}
          emptyState={
            <div data-testid="audit-empty">
              <EmptyState
                icon="search"
                title={t("clinical:audit.empty")}
                description={t("clinical:audit.emptyHint")}
                onClearFilters={() => setSearchParams(new URLSearchParams())}
              />
            </div>
          }
          footer={
            (page?.total ?? 0) > AUDIT_EXPLORER_PAGE_SIZE ? (
              <Pagination
                page={filter.page}
                pageSize={AUDIT_EXPLORER_PAGE_SIZE}
                total={page?.total ?? 0}
                onPageChange={(next) => apply({ ...filter, page: next })}
              />
            ) : undefined
          }
        />
      )}

      <AuditEventDrawer
        event={selected}
        onClose={() => openEvent(null)}
        onFilterCorrelation={filterCorrelation}
        syntheticIdOf={syntheticIdOf}
      />

      {canExport ? (
        <ConfirmDialog
          open={confirming}
          onOpenChange={(open) => {
            if (!exporting) setConfirming(open);
          }}
          title={t("clinical:audit.export.confirmTitle")}
          description={t("clinical:audit.export.confirmBody")}
          confirmLabel={t("clinical:audit.export.confirm")}
          loading={exporting}
          onConfirm={exportCsv}
        >
          <div data-testid="audit-export-summary">
            <KeyValueList
              items={[
                {
                  id: "scope",
                  label: t("clinical:audit.export.scope"),
                  value: t("clinical:audit.export.csv.demoFacility", { facility: facilityName }),
                },
                {
                  id: "rows",
                  label: t("clinical:audit.export.rows"),
                  value: page === undefined ? t("clinical:audit.export.counting") : page.total,
                },
                {
                  id: "filters",
                  label: t("clinical:audit.export.filters"),
                  value: filterSummary(filter),
                },
              ]}
            />
          </div>
        </ConfirmDialog>
      ) : null}
    </div>
  );
}
