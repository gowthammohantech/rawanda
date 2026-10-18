/**
 * `/admin/reports` (ADM-07, PA-07, FRD Scenario 2): choose a report template and granularity,
 * preview the aggregate table (same suppression as the dashboard), state a reason and download a
 * watermarked, aggregate-only CSV. Period and scope come from the global filter bar. The export
 * history lists every attempt (generated and denied) visible to the persona.
 *
 * Roles without `export.aggregate` (facility manager, auditor) use the builder in preview-only
 * mode. Patient-level export does not exist; the record-level option is shown disabled.
 * `?template=<id>` preselects a template (the Overview "Export aggregate" action).
 */
import { checkAccess } from "@laif/auth-demo";
import { formatDate, useLanguage } from "@laif/i18n";
import { InfoCallout, MicroLabel, PageHeader, useTx } from "@laif/ui-web";
import { useSearchParams } from "react-router";

import { reportingScopeLabel } from "../../app/persona-labels.ts";
import { useAdminSession, useSessionStore } from "../../app/providers.tsx";
import { ScopeStrip } from "../../app/ScopeStrip.tsx";
import { useOnline } from "../../app/useOnline.ts";
import { resolveScopeFromSearch } from "../../auth/scope.ts";
import { FilterBar, FilterNotice } from "../../features/filters/FilterBar.tsx";
import { useAdminFilters } from "../../features/filters/useAdminFilters.ts";
import { ExportHistoryTable } from "../../features/reports/ExportHistoryTable.tsx";
import { ReportBuilder } from "../../features/reports/ReportBuilder.tsx";
import { isReportTemplateId } from "../../features/reports/templates.ts";
import { useDocumentTitle } from "../useDocumentTitle.ts";

export function ReportsPage() {
  const t = useTx();
  const { language } = useLanguage();
  const persona = useAdminSession((s) => s.persona);
  const grant = useAdminSession((s) => s.grant);
  const session = useAdminSession((s) => s.session);
  const store = useSessionStore();
  const api = useAdminFilters();
  const online = useOnline();
  const [params] = useSearchParams();
  useDocumentTitle(t("admin:reports.title"));

  const actor = store.actor();
  const canExport = actor !== null && checkAccess(actor, "export.aggregate").allowed;
  const requested = params.get("template");
  const initialTemplate = isReportTemplateId(requested) ? requested : "programme_summary";
  const scope =
    persona === null
      ? ""
      : reportingScopeLabel(persona, grant, session, resolveScopeFromSearch(api.searchString), t);

  return (
    <div className="flex flex-col gap-4" data-testid="reports-page">
      <div>
        <MicroLabel as="p" className="text-primary-dark">
          {t("admin:reports.eyebrow")}
        </MicroLabel>
        <PageHeader
          title={t("admin:reports.title")}
          subtitle={t("admin:reports.subtitle", {
            from: formatDate(`${api.period.from}T12:00:00.000Z`, language),
            to: formatDate(`${api.period.to}T12:00:00.000Z`, language),
            scope,
          })}
        />
      </div>
      <ScopeStrip />
      <FilterNotice api={api} />
      <FilterBar api={api} />
      {online ? null : (
        <InfoCallout title={t("admin:reports.offline.title")} icon="wifi-off">
          {t("admin:reports.offline.body")}
        </InfoCallout>
      )}
      {canExport ? null : (
        <InfoCallout title={t("admin:reports.previewOnly.title")} icon="lock">
          {t("admin:reports.previewOnly.body")}
        </InfoCallout>
      )}
      <ReportBuilder
        // A new filter view starts a new report (and a new idempotency key).
        key={`${api.searchString}|${persona?.id ?? ""}`}
        api={api}
        canExport={canExport}
        initialTemplate={initialTemplate}
      />
      <ExportHistoryTable />
    </div>
  );
}
