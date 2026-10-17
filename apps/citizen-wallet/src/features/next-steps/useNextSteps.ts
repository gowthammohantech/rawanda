/**
 * Next steps query hooks (CTZ-04) over `repo.listApprovedInstructions` / `repo.getInstruction`.
 * Only care-team-approved (`released`) steps reach these hooks — withdrawn steps and unreleased
 * referrals are filtered by the `@laif/domain` selector inside the repository.
 *
 * Access logging:
 * - `useNextStepsListViewLog` writes `citizen.next_step.list_viewed` once per screen focus.
 * - `useNextStep` fetches once per mount (`gcTime: 0`, no focus refetch), so one detail open =
 *   one `getInstruction` = one `citizen.next_step.viewed` (also de-duplicated per demo minute).
 */
import type { ApprovedInstruction } from "@laif/domain";
import { RepositoryError } from "@laif/repositories";
import { useQuery } from "@tanstack/react-query";
import { useFocusEffect } from "expo-router";
import { useCallback } from "react";

import { ctzKeys, shouldRetry, useApprovedInstructions } from "../../data/queries.ts";
import { useCitizenRepo } from "../../data/repo.tsx";
import { usePersona } from "../../providers.tsx";

export type NextStepGroups = {
  upcoming: ApprovedInstruction[];
  done: ApprovedInstruction[];
  cancelled: ApprovedInstruction[];
};

const timeOf = (step: ApprovedInstruction) => step.appointmentAt ?? "9999";

/**
 * Upcoming (`planned`, soonest appointment first, undated last), Done (`completed`, most recent
 * first) and Cancelled. An acknowledgement or a delivered reminder never moves a step to Done —
 * only the care team's recorded completion does (derived `progress`).
 */
export function groupNextSteps(steps: readonly ApprovedInstruction[]): NextStepGroups {
  const upcoming = steps
    .filter((s) => s.progress === "planned")
    .sort((a, b) => (timeOf(a) < timeOf(b) ? -1 : timeOf(a) > timeOf(b) ? 1 : 0));
  const doneAt = (s: ApprovedInstruction) => s.completion?.completedAt ?? s.releasedAt;
  const done = steps
    .filter((s) => s.progress === "completed")
    .sort((a, b) => (doneAt(a) < doneAt(b) ? 1 : doneAt(a) > doneAt(b) ? -1 : 0));
  const cancelled = steps.filter((s) => s.progress === "cancelled");
  return { upcoming, done, cancelled };
}

/** The nearest upcoming approved step (My health home card), or null. */
export function nearestUpcoming(
  steps: readonly ApprovedInstruction[] | undefined,
): ApprovedInstruction | null {
  if (steps === undefined) return null;
  return groupNextSteps(steps).upcoming[0] ?? null;
}

export function useNextSteps(patientId: string | null) {
  return useApprovedInstructions(patientId);
}

/** One approved step; fetched once per mount (= one `citizen.next_step.viewed`). */
export function useNextStep(patientId: string | null, instructionId: string) {
  const repo = useCitizenRepo();
  const personaId = usePersona()?.id ?? null;
  return useQuery({
    queryKey: [...ctzKeys.patient(personaId, patientId, "instruction"), instructionId] as const,
    queryFn: () => repo.getInstruction(instructionId, patientId as string),
    enabled: personaId !== null && patientId !== null && instructionId !== "",
    retry: shouldRetry,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

/** `citizen.next_step.list_viewed` once per focus of the list screen. */
export function useNextStepsListViewLog(patientId: string | null): void {
  const repo = useCitizenRepo();
  useFocusEffect(
    useCallback(() => {
      if (patientId === null) return;
      void repo.recordNextStepsListViewed(patientId).catch(() => undefined);
    }, [repo, patientId]),
  );
}

export type NextStepErrorKind = "denied" | "consent" | "other";

/**
 * How a step screen presents a failed read. `NOT_FOUND` and `FORBIDDEN` look the same
 * (`denied`), so a deep link never reveals whether a hidden step exists.
 */
export function nextStepErrorKind(error: unknown): NextStepErrorKind {
  if (!(error instanceof RepositoryError)) return "other";
  if (error.code === "FORBIDDEN") return error.reason === "CONSENT_REQUIRED" ? "consent" : "denied";
  if (error.code === "NOT_FOUND") return "denied";
  return "other";
}
