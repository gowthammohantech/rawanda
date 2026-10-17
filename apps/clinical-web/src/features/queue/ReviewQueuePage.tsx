/**
 * `/clinical/queue` (CLN-05): page header + KPI strip + `QueueTabs` + `QueueToolbar` + rows. The
 * clinician's landing page. URL-persisted filters (`?tab=&facility=&assignee=&q=&sort=&page=`);
 * reload and back / forward restore them. Tab badges and rows come from the SAME repository
 * filter (`countReviews` / `listReviews` + shared `@laif/domain` predicates), scoped to the
 * active facility (the repository actor is narrowed to it — CLN-02).
 *
 * Facility: `?facility=<permitted>` switches the active facility (as on the patient search); a
 * facility outside the persona's scope is dropped with the toast "Facility not in your scope".
 * Audit: one `queue.viewed` per mount with a filter summary only (no patient data).
 * Permission denied (no `review.read`) is the route guard's `PermissionDenied`.
 */
import type { FacilityId } from "@laif/domain";
import { formatTime, useLanguage } from "@laif/i18n";
import {
  Button,
  EmptyState,
  LoadingSkeleton,
  useToast,
  useTx,
  type SelectOption,
} from "@laif/ui-web";
import { useCallback, useEffect, useRef } from "react";
import { NavigationType, useLocation, useNavigationType } from "react-router";

import { facilityLabel } from "../../app/persona-labels.ts";
import { PageHeader } from "../../components/PageHeader.tsx";
import { QueryErrorState } from "../../components/QueryErrorState.tsx";
import { useRepository } from "../../data/useRepository.ts";
import { useSession } from "../../session/useSession.ts";
import { useSwitchFacility } from "../../session/useSwitchFacility.ts";
import { QueueKpiStrip } from "./QueueKpiStrip.tsx";
import { QueueList } from "./QueueList.tsx";
import { QueueTabs } from "./QueueTabs.tsx";
import { QueueToolbar } from "./QueueToolbar.tsx";
import { useQueueKpis, useQueueUrlState, useReviewQueue } from "./useReviewQueue.ts";

export function ReviewQueuePage() {
  const t = useTx();
  const { language } = useLanguage();
  const repo = useRepository();
  const { toast } = useToast();
  const location = useLocation();
  const navigationType = useNavigationType();
  const { activeFacilityId, permittedFacilityIds, persona } = useSession();
  const switchFacility = useSwitchFacility();
  const { filter, outOfScopeFacility, update, dropFacility } = useQueueUrlState();
  const fac = activeFacilityId ?? "";
  const personaId = persona?.id ?? null;

  // Out-of-scope `?facility=` → dropped + toast (once per value).
  const warned = useRef<string | null>(null);
  useEffect(() => {
    if (outOfScopeFacility === null) return;
    if (warned.current !== outOfScopeFacility) {
      warned.current = outOfScopeFacility;
      toast({ title: t("clinical:queue.filters.facilityOutOfScope"), tone: "warning" });
    }
    dropFacility();
  }, [outOfScopeFacility, dropFacility, toast, t]);

  // `?facility=<permitted>` → that facility becomes the active one.
  useEffect(() => {
    if (filter.facilityId !== undefined && filter.facilityId !== activeFacilityId) {
      switchFacility(filter.facilityId);
    }
  }, [filter.facilityId, activeFacilityId, switchFacility]);

  const { list, counts } = useReviewQueue(filter);
  const kpis = useQueueKpis();

  // One `queue.viewed` per mount, after the first successful load; filter summary only.
  const audited = useRef(false);
  const loaded = list.isSuccess && !list.isPlaceholderData;
  const total = list.data?.total;
  useEffect(() => {
    if (audited.current || !loaded || total === undefined || fac === "") return;
    audited.current = true;
    void repo
      .recordAuditEvent({
        action: "queue.viewed",
        entityType: "review",
        entityId: "queue",
        facilityId: fac,
        changeSummary: {
          tab: filter.tab,
          assignee: filter.assignee,
          sort: filter.sort,
          page: filter.page,
          hasQuery: filter.q !== undefined,
          resultCount: total,
        },
      })
      .catch((error: unknown) => {
        if (import.meta.env.DEV) console.warn("[clinical] queue audit not recorded", error);
      });
  }, [loaded, total, fac, repo, filter]);

  const onQueryChange = useCallback(
    (q: string) => update({ q }, { replace: true, fromSearchBox: true }),
    [update],
  );
  const onFacilityChange = useCallback(
    (facilityId: string) => {
      if (switchFacility(facilityId)) update({ facilityId: facilityId as FacilityId });
    },
    [switchFacility, update],
  );

  const facilityName = fac === "" ? "" : facilityLabel(fac, t);
  const facilityOptions: SelectOption[] = permittedFacilityIds.map((id) => ({
    value: id,
    label: facilityLabel(id, t),
  }));
  const filtered = filter.assignee !== "any" || filter.q !== undefined;

  const emptyState = (
    <EmptyState
      icon="check"
      title={
        filtered
          ? t("clinical:queue.empty.filtered", { facility: facilityName })
          : t(`clinical:queue.empty.${filter.tab}`, { facility: facilityName })
      }
      description={t("clinical:queue.empty.description")}
      {...(filtered ? { onClearFilters: () => update({ assignee: "any", q: undefined }) } : {})}
      {...(filter.tab === "all"
        ? {}
        : {
            action: (
              <Button variant="ghost" onClick={() => update({ tab: "all" })}>
                {t("clinical:queue.empty.showAll")}
              </Button>
            ),
          })}
    />
  );

  let body;
  if (list.data === undefined) {
    body = list.isError ? (
      <QueryErrorState error={list.error} onRetry={() => void list.refetch()} />
    ) : (
      <div aria-busy="true" aria-label={t("clinical:queue.loading")} data-testid="queue-loading">
        <LoadingSkeleton variant="lines" lines={5} />
      </div>
    );
  } else {
    body = (
      <>
        {list.isError ? (
          <p
            role="status"
            data-testid="queue-last-updated"
            className="border-risk-warning/25 bg-risk-warning-soft text-risk-warning mb-3 rounded-md border px-3 py-2 text-[13px]"
          >
            {t("clinical:queue.lastUpdated", {
              time: formatTime(new Date(list.dataUpdatedAt).toISOString(), language),
            })}
          </p>
        ) : null}
        <div aria-busy={list.isFetching} data-testid="queue-results">
          {list.data.items.length === 0 ? (
            emptyState
          ) : (
            <QueueList
              key={`${filter.tab}|${filter.page}`}
              data={list.data}
              page={filter.page}
              personaId={personaId}
              onPageChange={(page) => update({ page })}
            />
          )}
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={t("clinical:queue.title")}
        subtitle={t("clinical:queue.subtitle", { facility: facilityName })}
      />
      <div className="space-y-4">
        <QueueKpiStrip
          counts={kpis.counts.data}
          reviewedThisWeek={kpis.reviewedThisWeek.data}
          staleSince={
            kpis.counts.isError && kpis.counts.data !== undefined ? kpis.counts.dataUpdatedAt : null
          }
        />
        <QueueToolbar
          q={filter.q ?? ""}
          navigationKey={location.key}
          fromSearchBox={
            navigationType !== NavigationType.Pop &&
            (location.state as { fromQueueSearch?: boolean } | null)?.fromQueueSearch === true
          }
          facilityId={fac}
          facilityOptions={facilityOptions}
          assignee={filter.assignee}
          sort={filter.sort}
          onQueryChange={onQueryChange}
          onFacilityChange={onFacilityChange}
          onAssigneeChange={(assignee) => update({ assignee })}
          onSortChange={(sort) => update({ sort })}
        />
        <section aria-label={t("clinical:queue.listLabel")}>
          <QueueTabs value={filter.tab} counts={counts.data} onChange={(tab) => update({ tab })}>
            {body}
          </QueueTabs>
        </section>
      </div>
    </>
  );
}
