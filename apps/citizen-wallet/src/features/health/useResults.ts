/**
 * My health query hooks (CTZ-03) over `repo.listReleasedObservations` / `repo.getObservation`.
 * Only released results and value-less pending placeholders ever reach these hooks (the
 * repository applies the `@laif/domain` visibility selectors).
 *
 * Access logging:
 * - `useResultsListViewLog` writes `citizen.result.list_viewed` once per screen focus.
 * - `useResult` fetches once per mount (`gcTime: 0`, never refetched while mounted), so one
 *   detail open = one `getObservation` = one `citizen.result.viewed` (the repository also
 *   de-duplicates per persona + result per demo minute).
 */
import type { PatientLinkRelationship } from "@laif/contracts";
import type { ApprovedInstruction, ReleasedObservation } from "@laif/domain";
import { RepositoryError } from "@laif/repositories";
import { useQuery } from "@tanstack/react-query";
import { useFocusEffect } from "expo-router";
import { useCallback } from "react";

import {
  ctzKeys,
  shouldRetry,
  useApprovedInstructions,
  useCitizenSession,
  useReleasedObservations,
} from "../../data/queries.ts";
import { useCitizenRepo } from "../../data/repo.tsx";
import { usePersona } from "../../providers.tsx";

export type ActivePatient = {
  patientId: string;
  displayName: string;
  relationship: PatientLinkRelationship;
};

/** The patient the wallet currently shows (first active link; the guard ensures consent). */
export function useActivePatient(): ActivePatient | null {
  const session = useCitizenSession();
  const id = session.data?.activePatientId ?? null;
  if (id === null) return null;
  const patient = session.data?.patients.find((p) => p.patientId === id);
  return {
    patientId: id,
    displayName: patient?.displayName ?? "",
    relationship: patient?.relationship ?? "self",
  };
}

export function useResults(patientId: string | null) {
  return useReleasedObservations(patientId);
}

/** One released result; fetched once per mount (= one `citizen.result.viewed`). */
export function useResult(patientId: string | null, observationId: string) {
  const repo = useCitizenRepo();
  const personaId = usePersona()?.id ?? null;
  return useQuery({
    queryKey: ctzKeys.observation(personaId, patientId, observationId),
    queryFn: () => repo.getObservation(observationId, patientId as string),
    enabled: personaId !== null && patientId !== null && observationId !== "",
    retry: shouldRetry,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

/** The approved next step linked to a result (same review), or null — no CTA without one. */
export function linkedInstruction(
  result: Pick<ReleasedObservation, "reviewId">,
  instructions: readonly ApprovedInstruction[] | undefined,
): ApprovedInstruction | null {
  if (result.reviewId === null || instructions === undefined) return null;
  return (
    instructions.find((i) => i.approvalState === "approved" && i.reviewId === result.reviewId) ??
    null
  );
}

/**
 * The approved next step of a loaded result. `settled` turns true once the instructions read
 * finished (success or error — an error simply means no CTA), so the detail renders once.
 */
export function useLinkedInstruction(
  patientId: string | null,
  result: ReleasedObservation | null,
): { instruction: ApprovedInstruction | null; settled: boolean } {
  const instructions = useApprovedInstructions(result === null ? null : patientId);
  if (result === null) return { instruction: null, settled: false };
  return {
    instruction: linkedInstruction(result, instructions.data),
    settled: instructions.isSuccess || instructions.isError,
  };
}

/** `citizen.result.list_viewed` once per focus of the list screen. */
export function useResultsListViewLog(patientId: string | null): void {
  const repo = useCitizenRepo();
  useFocusEffect(
    useCallback(() => {
      if (patientId === null) return;
      void repo.recordResultsListViewed(patientId).catch(() => undefined);
    }, [repo, patientId]),
  );
}

export type ResultErrorKind = "denied" | "notFound" | "consent" | "other";

/** How a result screen presents a failed read (denied = no partial render, T-02). */
export function resultErrorKind(error: unknown): ResultErrorKind {
  if (!(error instanceof RepositoryError)) return "other";
  if (error.code === "FORBIDDEN") return error.reason === "CONSENT_REQUIRED" ? "consent" : "denied";
  if (error.code === "NOT_FOUND") return "notFound";
  return "other";
}
