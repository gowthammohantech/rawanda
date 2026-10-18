/**
 * HWM-04 patient hooks (TanStack Query over `src/data/patients.ts`). The facility always comes
 * from the signed-in device session (`useRequiredScope`), never from route params.
 */
import type { Patient } from "@laif/domain";
import type { RegisterPatientCall } from "@laif/repositories";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";

import * as patients from "../../data/patients.ts";
import { invalidateAfterWrite, workerKeys } from "../../data/queryKeys.ts";
import { recentPatients } from "../../data/recentPatients.ts";
import { useRepository } from "../../providers.tsx";
import { useRequiredScope } from "../../session/useScope.ts";
import { useSyncTriggers } from "../../sync/SyncTriggersProvider.tsx";

/** `value`, settled for `delayMs` (search debounce). */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return settled;
}

/** The repository's demo clock instant (incl. time travel); null while loading. */
export function useDemoNow(): Date | null {
  const repo = useRepository();
  const clock = useQuery({
    queryKey: workerKeys.homeClock,
    queryFn: async () => (await repo.demo.getDemoState()).clockIso,
  });
  return clock.data === undefined ? null : new Date(clock.data);
}

export type PatientSearchView = {
  /** The debounced query actually searched ("" = show Recent). */
  query: string;
  /** True while typing (not yet debounced) or loading. */
  pending: boolean;
  tooShort: boolean;
  status: "idle" | "loading" | "error" | "ready";
  items: Patient[];
  total: number;
  refetch: () => Promise<unknown>;
};

export function usePatientSearch(raw: string): PatientSearchView {
  const repo = useRepository();
  const { facilityId } = useRequiredScope();
  const typed = patients.normaliseSearchText(raw);
  const query = useDebouncedValue(typed, patients.PATIENT_SEARCH_DEBOUNCE_MS);
  const active = query.length >= patients.PATIENT_SEARCH_MIN_CHARS;
  const result = useQuery({
    queryKey: workerKeys.patientSearch(facilityId, query),
    queryFn: () => patients.search(repo, { facilityId, query }),
    enabled: active,
    placeholderData: keepPreviousData,
  });
  const settling = typed !== query;
  return {
    query,
    pending: settling || (active && result.isFetching),
    tooShort: typed.length > 0 && typed.length < patients.PATIENT_SEARCH_MIN_CHARS,
    status: !active
      ? "idle"
      : result.isError
        ? "error"
        : result.data === undefined || result.isPlaceholderData
          ? "loading"
          : "ready",
    items: result.data?.items ?? [],
    total: result.data?.total ?? 0,
    refetch: () => result.refetch(),
  };
}

export function useRecentPatients() {
  const repo = useRepository();
  const { facilityId } = useRequiredScope();
  return useQuery({
    queryKey: workerKeys.patientRecent(facilityId),
    queryFn: () => patients.listByIds(repo, facilityId, recentPatients().list(facilityId)),
  });
}

/** Records a "touch" (opened / registered on this device) for Recent. */
export function touchRecentPatient(facilityId: string, patientId: string): void {
  recentPatients().touch(facilityId, patientId);
}

/**
 * Scope-checked patient read for the context screen. Not re-run by writes or focus (each run
 * audits `patient.viewed` — a sensitive read — or `access.denied`).
 */
export function usePatientAccess(patientId: string) {
  const repo = useRepository();
  const queryClient = useQueryClient();
  const { facilityId } = useRequiredScope();
  return useQuery({
    queryKey: workerKeys.patientAccess(facilityId, patientId),
    queryFn: async () => {
      const access = await patients.get(repo, facilityId, patientId);
      if (access.status === "ok") {
        touchRecentPatient(facilityId, access.patient.id);
        void queryClient.invalidateQueries({ queryKey: workerKeys.patientRecent(facilityId) });
      }
      return access;
    },
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  });
}

export function usePatientHistory(patientId: string, enabled: boolean) {
  const repo = useRepository();
  const { facilityId } = useRequiredScope();
  return useQuery({
    queryKey: workerKeys.patientHistory(facilityId, patientId),
    queryFn: () => patients.history(repo, facilityId, patientId),
    enabled,
  });
}

export function useRegisterPatient() {
  const repo = useRepository();
  const queryClient = useQueryClient();
  const triggers = useSyncTriggers();
  const { facilityId } = useRequiredScope();
  const findCandidates = useCallback(
    async (input: RegisterPatientCall) => {
      const now = new Date((await repo.demo.getDemoState()).clockIso);
      return patients.findCandidates(repo, input, now);
    },
    [repo],
  );
  const register = useCallback(
    async (input: RegisterPatientCall, key: string) => {
      const patient = await patients.register(repo, input, key);
      touchRecentPatient(facilityId, patient.id);
      await invalidateAfterWrite(queryClient);
      // HWM-09: a committed local write triggers a (debounced) sync when online.
      triggers.afterWrite();
      return patient;
    },
    [repo, queryClient, facilityId, triggers],
  );
  return { findCandidates, register };
}
