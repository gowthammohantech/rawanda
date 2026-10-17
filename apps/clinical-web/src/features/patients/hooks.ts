/**
 * Patient data hooks (CLN-03). Every read goes through the clinical repository, whose actor is
 * scoped to the ACTIVE facility — the repository itself never returns cross-facility rows and
 * answers an out-of-scope `getPatient` with `FORBIDDEN` + `access.denied`.
 *
 * - `usePatientSearch` → `listPatients({ q, facilityIds: [active], page, pageSize: 20 })` plus
 *   facility-wide screening / open-item lists for the table columns; `keepPreviousData`.
 * - `usePatient` → `getPatient(id)`; the repository audits `patient.viewed` itself (de-duplicated
 *   per actor + patient per demo minute), so the page records nothing extra. No focus refetch,
 *   so one open = one sensitive read.
 * - `usePatientStats` → KPI strip + latest screening; `useDuplicateCandidates` → in-scope
 *   candidates via `listPatients` (never `getPatient`: no extra view / denial audit events).
 */
import type { Page, PatientSummary } from "@laif/contracts";
import { DEMO_CLOCK_DEFAULT_ISO, type Patient, type Screening } from "@laif/domain";
import type { CareRepository } from "@laif/repositories";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { clinicalKeys } from "../../data/queryKeys.ts";
import { useRepository } from "../../data/useRepository.ts";
import { useSession } from "../../session/useSession.ts";
import {
  fetchAllPages,
  OPEN_FOLLOW_UP_STATUSES,
  OPEN_REFERRAL_STATUSES,
  OPEN_REVIEW_STATUSES,
  PATIENT_SEARCH_PAGE_SIZE,
  toPatientSummaries,
} from "./model.ts";

export const SEARCH_DEBOUNCE_MS = 300;

/** The demo clock (age at "now"); falls back to the pinned default when unavailable. */
export function demoNowIso(repo: CareRepository): Promise<string> {
  return repo.demo.getDemoState().then(
    (state) => state.clockIso,
    () => DEMO_CLOCK_DEFAULT_ISO,
  );
}

export function useDebouncedValue<T>(value: T, delayMs = SEARCH_DEBOUNCE_MS): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(handle);
  }, [value, delayMs]);
  return debounced;
}

export type PatientSearchResult = Page<PatientSummary>;

export function usePatientSearch(search: { q: string | undefined; page: number }) {
  const repo = useRepository();
  const { activeFacilityId } = useSession();
  const fac = activeFacilityId ?? "none";
  const filter = { q: search.q ?? "", page: search.page };
  return useQuery({
    queryKey: clinicalKeys.patients(fac, filter),
    enabled: activeFacilityId !== null,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<PatientSearchResult> => {
      const facilityIds = [fac];
      const [page, nowIso, screenings, openReviews, openReferrals, openFollowUps] =
        await Promise.all([
          repo.listPatients({
            ...(search.q === undefined ? {} : { q: search.q }),
            facilityIds,
            page: search.page,
            pageSize: PATIENT_SEARCH_PAGE_SIZE,
          }),
          demoNowIso(repo),
          fetchAllPages((page, pageSize) => repo.listScreenings({ facilityIds, page, pageSize })),
          fetchAllPages((page, pageSize) =>
            repo.listReviews({ facilityIds, statuses: [...OPEN_REVIEW_STATUSES], page, pageSize }),
          ),
          fetchAllPages((page, pageSize) =>
            repo.listReferrals({
              facilityIds,
              statuses: [...OPEN_REFERRAL_STATUSES],
              page,
              pageSize,
            }),
          ),
          fetchAllPages((page, pageSize) =>
            repo.listFollowUps({
              facilityIds,
              statuses: [...OPEN_FOLLOW_UP_STATUSES],
              page,
              pageSize,
            }),
          ),
        ]);
      return {
        ...page,
        items: toPatientSummaries(
          page.items,
          { screenings, openReviews, openReferrals, openFollowUps },
          nowIso,
        ),
      };
    },
  });
}

export function usePatient(id: string) {
  const repo = useRepository();
  const { activeFacilityId } = useSession();
  return useQuery({
    queryKey: clinicalKeys.patient(activeFacilityId ?? "none", id),
    queryFn: () => repo.getPatient(id),
    enabled: activeFacilityId !== null,
    refetchOnWindowFocus: false,
    staleTime: 60_000,
  });
}

export type PatientStats = {
  nowIso: string;
  screenings: number;
  latestScreening: Screening | null;
  openReviews: number;
  openReferrals: number;
  openTasks: number;
};

export function usePatientStats(patient: Patient | null | undefined) {
  const repo = useRepository();
  const { activeFacilityId } = useSession();
  const patientId = patient?.id ?? "";
  return useQuery({
    queryKey: clinicalKeys.patientStats(activeFacilityId ?? "none", patientId),
    enabled: patient !== null && patient !== undefined,
    queryFn: async (): Promise<PatientStats> => {
      const one = { patientId, page: 1, pageSize: 1 };
      const [nowIso, screenings, reviews, referrals, followUps] = await Promise.all([
        demoNowIso(repo),
        repo.listScreenings(one),
        repo.listReviews({ ...one, statuses: [...OPEN_REVIEW_STATUSES] }),
        repo.listReferrals({ ...one, statuses: [...OPEN_REFERRAL_STATUSES] }),
        repo.listFollowUps({ ...one, statuses: [...OPEN_FOLLOW_UP_STATUSES] }),
      ]);
      return {
        nowIso,
        screenings: screenings.total,
        latestScreening: screenings.items[0] ?? null,
        openReviews: reviews.total,
        openReferrals: referrals.total,
        openTasks: followUps.total,
      };
    },
  });
}

export type DuplicateCandidates = {
  /** Candidates the active facility may see (never merged, only listed). */
  inScope: Patient[];
  /** Candidates outside the user's facilities: counted, never shown. */
  outOfScopeCount: number;
};

export function useDuplicateCandidates(patient: Patient | null | undefined) {
  const repo = useRepository();
  const { activeFacilityId } = useSession();
  const fac = activeFacilityId ?? "none";
  const candidateIds = (patient?.duplicateCandidateIds ?? []).filter((id) => id !== patient?.id);
  return useQuery({
    queryKey: clinicalKeys.patients(fac, { duplicatesOf: patient?.id ?? "", candidateIds }),
    enabled: candidateIds.length > 0,
    queryFn: async (): Promise<DuplicateCandidates> => {
      const visible = await fetchAllPages((page, pageSize) =>
        repo.listPatients({ facilityIds: [fac], page, pageSize }),
      );
      const byId = new Map(visible.map((p) => [p.id as string, p]));
      const inScope = candidateIds.flatMap((id) => {
        const found = byId.get(id);
        return found === undefined ? [] : [found];
      });
      return { inScope, outOfScopeCount: candidateIds.length - inScope.length };
    },
  });
}
