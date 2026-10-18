/**
 * Data-quality review queue (ADM-06 task 4, ref image 4 tabs-with-counts pattern): tabs
 * `Open {n} · Acknowledged {n} · Resolved {n} · Sent to facility {n}`, filter chips by issue type,
 * pages of 20, expandable `IssueRow`s. Rows are operational records with an opaque record ref —
 * never a patient name or identifier. Roles without `quality.triage` (the auditor) see the rows
 * read-only with a lock note; the repository also rejects their triage (FORBIDDEN).
 */
import {
  DATA_QUALITY_ISSUE_TYPES,
  type DataQualityIssueStatus,
  type DataQualityIssueType,
} from "@laif/contracts";
import {
  Card,
  cx,
  EmptyState,
  ErrorState,
  errorCodeOf,
  Icon,
  LoadingSkeleton,
  Pagination,
  Tabs,
  useTx,
  type TranslationKey,
} from "@laif/ui-web";
import { useId, useState } from "react";

import type { AdminFiltersApi } from "../filters/useAdminFilters.ts";
import { IssueRow } from "./IssueRow.tsx";
import { useCanTriage } from "./mutations.ts";
import { useQualityIssues } from "./queries.ts";
import { QUEUE_PAGE_SIZE, QUEUE_TABS } from "./selectQuality.ts";

export type IssueQueueProps = {
  api: Pick<AdminFiltersApi, "filters" | "period">;
  /** Test seam for the idempotency keys. */
  createKey?: () => string;
};

export function IssueQueue({ api, createKey }: IssueQueueProps) {
  const t = useTx();
  const baseId = useId();
  const [tab, setTab] = useState<DataQualityIssueStatus>("open");
  const [type, setType] = useState<DataQualityIssueType | null>(null);
  const [page, setPage] = useState(1);
  const query = useQualityIssues(api, { tab, type, page });
  const canTriage = useCanTriage();
  const filters = Object.fromEntries(
    Object.entries({
      preset: api.filters.preset,
      from: api.period.from,
      to: api.period.to,
      district: api.filters.district,
      facility: api.filters.facility,
      type: api.filters.type,
    }).filter((e): e is [string, string] => typeof e[1] === "string"),
  );

  const body = (() => {
    if (query.isPending) return <LoadingSkeleton variant="table" lines={6} />;
    if (query.isError) {
      return (
        <ErrorState
          code={errorCodeOf(query.error) ?? "INTERNAL"}
          message={t("admin:quality.queue.error")}
          onRetry={() => query.refetch()}
        />
      );
    }
    const data = query.data;
    if (data.rows.length === 0) {
      return (
        <div data-testid="queue-empty">
          <EmptyState
            icon="check"
            title={t(`admin:quality.queue.empty.${tab}` as TranslationKey)}
            description={t("admin:quality.queue.emptyBody")}
          />
        </div>
      );
    }
    return (
      <>
        <ul className="m-0 flex flex-col gap-2 p-0" aria-label={t("admin:quality.queue.list")}>
          {data.rows.map((issue) => (
            <IssueRow
              key={`${issue.id}@${String(issue.version)}`}
              issue={issue}
              filters={filters}
              {...(createKey === undefined ? {} : { createKey })}
            />
          ))}
        </ul>
        {data.total > QUEUE_PAGE_SIZE ? (
          <Pagination
            className="mt-3"
            page={data.page}
            pageSize={QUEUE_PAGE_SIZE}
            total={data.total}
            onPageChange={setPage}
          />
        ) : null}
      </>
    );
  })();

  const counts = query.data?.counts;
  const panelId = `${baseId}-queue-panel`;
  return (
    <Card
      title={t("admin:quality.queue.title")}
      meta={<span className="text-muted text-xs">{t("admin:quality.queue.meta")}</span>}
    >
      <div className="flex flex-col gap-3" data-testid="issue-queue">
        <Tabs
          label={t("admin:quality.queue.tabs")}
          panelId={panelId}
          value={tab}
          onValueChange={(v) => {
            setTab(v as DataQualityIssueStatus);
            setPage(1);
          }}
          tabs={QUEUE_TABS.map((s) => ({
            value: s,
            label: t(`admin:quality.tab.${s}` as TranslationKey),
            ...(counts === undefined ? {} : { count: counts[s] }),
          }))}
        />
        <div
          role="group"
          aria-label={t("admin:quality.queue.typeFilter")}
          className="flex flex-wrap gap-1.5"
          data-testid="type-chips"
        >
          {[null, ...DATA_QUALITY_ISSUE_TYPES].map((value) => {
            const pressed = type === value;
            return (
              <button
                key={value ?? "all"}
                type="button"
                aria-pressed={pressed}
                onClick={() => {
                  setType(value);
                  setPage(1);
                }}
                className={cx(
                  "min-h-8 rounded-full border px-3 text-xs font-medium",
                  pressed
                    ? "border-primary bg-primary-soft text-primary-dark"
                    : "border-border bg-surface text-muted hover:text-ink",
                )}
              >
                {value === null
                  ? t("admin:quality.queue.allTypes")
                  : t(`admin:quality.typeChip.${value}` as TranslationKey)}
              </button>
            );
          })}
        </div>
        {canTriage ? null : (
          <p
            className="border-border-soft bg-background text-muted m-0 flex items-center gap-1.5 rounded-sm border px-3 py-2 text-xs"
            data-testid="queue-readonly"
          >
            <Icon name="lock" size={14} />
            {t("admin:quality.readOnlyQueue")}
          </p>
        )}
        <div
          id={panelId}
          role="tabpanel"
          aria-label={t(`admin:quality.tab.${tab}` as TranslationKey)}
        >
          {body}
        </div>
      </div>
    </Card>
  );
}
