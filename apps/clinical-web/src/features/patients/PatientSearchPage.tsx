/**
 * `/clinical/patients` (CLN-03): URL-driven (`?q=&facility=&page=`), scoped, paginated patient
 * search. Initial state = the recent-in-facility list (page 1, no query).
 *
 * Facility scope: the repository actor is narrowed to the ACTIVE facility (CLN-02), so the
 * facility filter lists only permitted facilities and choosing one SWITCHES the active facility
 * (same as the persona menu: cache cleared, toast). A `?facility=` naming a permitted facility
 * is applied the same way; any other value is ignored.
 *
 * Audit: one `patient.searched` per settled query (debounced, not per keystroke, not per page)
 * with the query LENGTH, result count and filter keys only — never the query text.
 */
import type { SelectOption } from "@laif/ui-web";
import { EmptyState, useTx } from "@laif/ui-web";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { NavigationType, useLocation, useNavigationType, useSearchParams } from "react-router";

import { facilityLabel } from "../../app/persona-labels.ts";
import { PageHeader } from "../../components/PageHeader.tsx";
import { AsyncBoundary } from "../../components/AsyncBoundary.tsx";
import { useRepository } from "../../data/useRepository.ts";
import { useSession } from "../../session/useSession.ts";
import { useSwitchFacility } from "../../session/useSwitchFacility.ts";
import { usePatientSearch } from "./hooks.ts";
import { PATIENT_SEARCH_PAGE_SIZE, parsePatientSearchParams } from "./model.ts";
import { PatientResultsTable } from "./PatientResultsTable.tsx";
import { PatientSearchForm } from "./PatientSearchForm.tsx";

export function PatientSearchPage() {
  const t = useTx();
  const repo = useRepository();
  const { activeFacilityId, permittedFacilityIds } = useSession();
  const switchFacility = useSwitchFacility();
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const navigationType = useNavigationType();
  const fromForm =
    navigationType !== NavigationType.Pop &&
    (location.state as { fromSearchForm?: boolean } | null)?.fromSearchForm === true;
  const search = useMemo(
    () => parsePatientSearchParams(params, permittedFacilityIds),
    [params, permittedFacilityIds],
  );
  const fac = activeFacilityId ?? "";

  // `?facility=<permitted>` → that facility becomes the active one.
  useEffect(() => {
    if (search.facilityId !== undefined && search.facilityId !== activeFacilityId) {
      switchFacility(search.facilityId);
    }
  }, [search.facilityId, activeFacilityId, switchFacility]);

  const scoped = search.facilityId === undefined || search.facilityId === activeFacilityId;
  const query = usePatientSearch({ q: search.q, page: search.page });

  const update = useCallback(
    (next: { q?: string | undefined; page?: number; facility?: string }, replace: boolean) => {
      setParams(
        (current) => {
          const out = new URLSearchParams(current);
          if ("q" in next) {
            if (next.q === undefined) out.delete("q");
            else out.set("q", next.q);
            out.delete("page");
          }
          if (next.facility !== undefined) {
            out.set("facility", next.facility);
            out.delete("page");
          }
          if (next.page !== undefined) {
            if (next.page > 1) out.set("page", String(next.page));
            else out.delete("page");
          }
          return out;
        },
        { replace, state: { fromSearchForm: true } },
      );
    },
    [setParams],
  );

  const onQueryChange = useCallback(
    (q: string | undefined, mode: "replace" | "push") => update({ q }, mode === "replace"),
    [update],
  );
  const onFacilityChange = useCallback(
    (facilityId: string) => {
      if (switchFacility(facilityId)) update({ facility: facilityId }, false);
    },
    [switchFacility, update],
  );
  const clearFilters = () => setParams(new URLSearchParams(), { replace: false });

  // One `patient.searched` per settled (facility, query) — never the query text.
  const audited = useRef<string | null>(null);
  const settled = query.isSuccess && !query.isPlaceholderData && scoped;
  const total = query.data?.total;
  useEffect(() => {
    if (!settled || search.q === undefined || total === undefined || fac === "") return;
    const key = `${fac}|${search.q}`;
    if (audited.current === key) return;
    audited.current = key;
    void repo
      .recordAuditEvent({
        action: "patient.searched",
        entityType: "patient",
        entityId: "search",
        facilityId: fac,
        changeSummary: {
          queryLength: search.q.length,
          resultCount: total,
          filterKeys: ["q", "facility"],
        },
      })
      .catch((error: unknown) => {
        if (import.meta.env.DEV) console.warn("[clinical] search audit not recorded", error);
      });
  }, [settled, search.q, total, fac, repo]);

  const facilityOptions: SelectOption[] = permittedFacilityIds.map((id) => ({
    value: id,
    label: facilityLabel(id, t),
  }));
  const facilityName = fac === "" ? "" : facilityLabel(fac, t);

  const emptyState = (
    <EmptyState
      icon="search"
      title={
        search.q === undefined
          ? t("clinical:patients.search.emptyNoQuery")
          : t("clinical:patients.search.empty", { q: search.q })
      }
      description={t("clinical:patients.search.emptyDescription")}
      {...(search.q === undefined && search.page === 1 ? {} : { onClearFilters: clearFilters })}
    />
  );

  const body = (
    <AsyncBoundary
      query={query}
      testId="patients"
      loadingLabel={t("clinical:patients.search.loading")}
      skeleton="table"
      skeletonLines={6}
      staleMessage={(time) => t("clinical:patients.search.lastUpdated", { time })}
      isEmpty={(data) => data.items.length === 0}
      emptyFallback={<div data-testid="patient-results">{emptyState}</div>}
    >
      {(data) => (
        <div aria-busy={query.isFetching} data-testid="patient-results">
          <PatientResultsTable
            rows={data.items}
            page={search.page}
            pageSize={PATIENT_SEARCH_PAGE_SIZE}
            total={data.total}
            onPageChange={(page) => update({ page }, false)}
            emptyState={emptyState}
          />
        </div>
      )}
    </AsyncBoundary>
  );

  return (
    <>
      <PageHeader
        title={t("clinical:patients.search.title")}
        subtitle={t("clinical:patients.search.subtitle")}
      />
      <div className="space-y-4">
        <PatientSearchForm
          urlQ={search.q}
          navigationKey={location.key}
          fromForm={fromForm}
          facilityOptions={facilityOptions}
          facilityId={fac}
          onQueryChange={onQueryChange}
          onFacilityChange={onFacilityChange}
        />
        <section
          aria-labelledby="patient-results-heading"
          className="border-border-soft bg-surface shadow-card rounded-lg border p-4"
        >
          <h2 id="patient-results-heading" className="text-ink mb-2 text-base font-semibold">
            {search.q === undefined
              ? t("clinical:patients.search.recentTitle", { facility: facilityName })
              : t("clinical:patients.search.resultsTitle", { facility: facilityName })}
          </h2>
          {body}
        </section>
      </div>
    </>
  );
}
