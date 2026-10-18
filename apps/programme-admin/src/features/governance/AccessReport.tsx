/**
 * Access & exports tab, report part (ADM-08 task 4; PA-08 "report access and export audits"):
 * counts by action over the last 90 days (sessions started, access denied, drill-downs viewed,
 * exports generated, exports denied, grant changes), "Denied access by requested district",
 * then the ADM-07 export history (generated AND denied attempts). Counts are governance
 * metadata (no patient records), read through the same scoped audit API as the log.
 */
import { formatDate, useLanguage } from "@laif/i18n";
import {
  BarList,
  Card,
  EmptyState,
  ErrorState,
  errorCodeOf,
  KpiStrip,
  LoadingSkeleton,
  useTx,
  type TranslationKey,
} from "@laif/ui-web";

import { districtLabel } from "../../app/persona-labels.ts";
import { ExportHistoryTable } from "../reports/ExportHistoryTable.tsx";
import { ACCESS_REPORT_ACTIONS, ACCESS_REPORT_DAYS, useAccessReport } from "./queries.ts";

const COUNT_KEYS: Record<(typeof ACCESS_REPORT_ACTIONS)[number], TranslationKey> = {
  "session.started": "admin:governance.access.count.sessions",
  "access.denied": "admin:governance.access.count.denied",
  "admin.drilldown.viewed": "admin:governance.access.count.drilldowns",
  "export.generated": "admin:governance.access.count.exports",
  "export.denied": "admin:governance.access.count.exportsDenied",
  "admin.access_grant.": "admin:governance.access.count.grantChanges",
};

export function AccessReport() {
  const t = useTx();
  const { language } = useLanguage();
  const query = useAccessReport();
  const day = (d: string) => formatDate(`${d}T12:00:00.000Z`, language);

  return (
    <div data-testid="access-report" className="flex flex-col gap-4">
      <Card title={t("admin:governance.access.title")}>
        {query.isPending ? (
          <LoadingSkeleton variant="card" lines={3} />
        ) : query.isError ? (
          <ErrorState
            code={errorCodeOf(query.error) ?? "INTERNAL"}
            message={t("admin:governance.access.error")}
            onRetry={() => query.refetch()}
          />
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-muted m-0 text-[13px]">
              {t("admin:governance.access.window", {
                days: ACCESS_REPORT_DAYS,
                from: day(query.data.window.from),
                to: day(query.data.window.to),
              })}
            </p>
            <KpiStrip
              label={t("admin:governance.access.countsLabel")}
              items={ACCESS_REPORT_ACTIONS.map((action) => ({
                id: action,
                label: t(COUNT_KEYS[action]),
                value: query.data.counts[action],
              }))}
            />
            <section aria-labelledby="denied-by-district">
              <h3 id="denied-by-district" className="text-ink mt-0 mb-2 text-sm font-semibold">
                {t("admin:governance.access.deniedByDistrict")}
              </h3>
              {query.data.deniedByDistrict.length === 0 ? (
                <EmptyState icon="shield" title={t("admin:governance.access.noDenials")} />
              ) : (
                <BarList
                  label={t("admin:governance.access.deniedByDistrict")}
                  tone="danger"
                  items={query.data.deniedByDistrict.map((row) => ({
                    id: row.key,
                    label:
                      row.key === "unknown"
                        ? t("admin:governance.access.unknownDistrict")
                        : districtLabel(row.key, t),
                    value: row.value,
                  }))}
                />
              )}
            </section>
          </div>
        )}
      </Card>
      <ExportHistoryTable />
    </div>
  );
}
