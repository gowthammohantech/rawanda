/**
 * `useAdminFilters` (ADM-02 task 3): the URL is the single source of truth for the global
 * filters. Invalid params are replaced by defaults with `navigate(…, { replace: true })`; the
 * issues travel in the history state, so the dismissible notice survives exactly that redirect.
 * A district-scoped persona sees its one district locked; a facility-scoped one its facility.
 */
import { kigaliDate } from "@laif/analytics";
import { useCallback, useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router";

import { useAdminSession, useServices } from "../../app/providers.tsx";
import { grantDistrictIds, grantFacilityIds, SEED_REFERENCE } from "../../auth/scope.ts";
import {
  DEFAULT_FILTERS,
  FILTER_PARAMS,
  parseAdminFilters,
  resolvePeriod,
  serializeAdminFilters,
  type AdminFilters,
  type FilterIssue,
  type Period,
} from "./filterSchema.ts";

type NoticeState = { filterNotice?: FilterIssue[] } | null;

export type AdminFiltersApi = {
  filters: AdminFilters;
  period: Period;
  /** Demo-clock day (Kigali). */
  today: string;
  setFilter: (patch: Partial<AdminFilters>) => void;
  reset: () => void;
  /** Canonical `?…` of the current filters (sidebar links append it). */
  searchString: string;
  notice: FilterIssue[];
  dismissNotice: () => void;
  districtOptions: string[];
  facilityOptions: string[];
  lockedDistrict: string | null;
  lockedFacility: string | null;
};

export function useAdminFilters(): AdminFiltersApi {
  const { clock } = useServices();
  const location = useLocation();
  const navigate = useNavigate();
  const persona = useAdminSession((s) => s.persona);
  const grant = useAdminSession((s) => s.grant);
  const today = kigaliDate(clock.now());

  const parsed = useMemo(() => parseAdminFilters(location.search, today), [location.search, today]);
  const searchString = serializeAdminFilters(parsed.filters);

  // Replace invalid params by the defaults, carrying the issues for the notice.
  useEffect(() => {
    if (parsed.issues.length === 0) return;
    const params = new URLSearchParams(location.search);
    for (const name of FILTER_PARAMS) params.delete(name);
    for (const [k, v] of new URLSearchParams(searchString)) params.set(k, v);
    const next = params.toString();
    void navigate(
      { pathname: location.pathname, search: next === "" ? "" : `?${next}` },
      { replace: true, state: { filterNotice: parsed.issues } satisfies NoticeState },
    );
  }, [parsed.issues, location.pathname, location.search, searchString, navigate]);

  const districts = useMemo(
    () => (persona === null ? [] : grantDistrictIds(persona, grant)),
    [persona, grant],
  );
  const grantFacilities = useMemo(
    () => (persona === null ? [] : grantFacilityIds(persona, grant)),
    [persona, grant],
  );
  // A facility-only grant (facility manager): its facilities' districts, both locked.
  const facilityOnly = districts.length === 0 && grantFacilities.length > 0;
  const districtOptions = facilityOnly
    ? [
        ...new Set(
          grantFacilities.map(
            (id) => SEED_REFERENCE.facilities.find((f) => f.id === id)?.districtId ?? "",
          ),
        ),
      ].filter((id) => id !== "")
    : districts;
  const lockedDistrict = districtOptions.length === 1 ? (districtOptions[0] ?? null) : null;
  const lockedFacility =
    facilityOnly && grantFacilities.length === 1 ? (grantFacilities[0] ?? null) : null;
  const selectedDistrict = parsed.filters.district ?? lockedDistrict;
  const facilityOptions = grantFacilities.filter(
    (id) =>
      selectedDistrict === null ||
      SEED_REFERENCE.facilities.find((f) => f.id === id)?.districtId === selectedDistrict,
  );

  const go = useCallback(
    (filters: AdminFilters) => {
      const params = new URLSearchParams(location.search);
      for (const name of FILTER_PARAMS) params.delete(name);
      for (const [k, v] of new URLSearchParams(serializeAdminFilters(filters))) params.set(k, v);
      const next = params.toString();
      void navigate({ pathname: location.pathname, search: next === "" ? "" : `?${next}` });
    },
    [location.pathname, location.search, navigate],
  );

  const setFilter = useCallback(
    (patch: Partial<AdminFilters>) => {
      const next: AdminFilters = { ...parsed.filters, ...patch };
      if (next.preset !== "custom") {
        next.from = null;
        next.to = null;
      }
      // A district change drops a facility of another district.
      if (patch.district !== undefined && next.facility !== null && next.district !== null) {
        const f = SEED_REFERENCE.facilities.find((x) => x.id === next.facility);
        if (f?.districtId !== next.district) next.facility = null;
      }
      go(next);
    },
    [parsed.filters, go],
  );

  const reset = useCallback(() => go(DEFAULT_FILTERS), [go]);

  const state = location.state as NoticeState;
  const notice = state?.filterNotice ?? [];
  const dismissNotice = useCallback(() => {
    void navigate(
      { pathname: location.pathname, search: location.search },
      { replace: true, state: null },
    );
  }, [location.pathname, location.search, navigate]);

  return {
    filters: parsed.filters,
    period: resolvePeriod(parsed.filters, today),
    today,
    setFilter,
    reset,
    searchString,
    notice,
    dismissNotice,
    districtOptions,
    facilityOptions,
    lockedDistrict,
    lockedFacility,
  };
}
