/**
 * Timeline data hooks (CLN-04). Every read goes through the facility-scoped clinical repository.
 * - `useScreenings(patientId)` → `listScreenings({ patientId })` (all pages), sorted by effective
 *   `measuredAt` desc; key `clinicalKeys.screenings(fac, patientId)`.
 * - `usePatientReviews(patientId)` → `listReviews({ patientId })` (never `getReview`, which would
 *   audit a `review.viewed` per row).
 * - `usePatientTimeline(patientId)` → reviews + referrals + follow-ups + demo now, merged by
 *   `toFollowUpEvents`; key `clinicalKeys.patientTimeline(fac, patientId)`.
 * - `useAmendScreening()` → `repository.amendScreening` through `useIdempotentMutation` (one key
 *   per dialog session, same-key retry, double-submit blocked); invalidates the FND-07
 *   `amendScreening` roots (screenings, reviews → incl. the patient timeline) + audit.
 */
import { effectiveReadings, type Screening } from "@laif/domain";
import type { ScreeningAmendmentCall } from "@laif/repositories";
import { useQuery } from "@tanstack/react-query";

import { clinicalInvalidations, clinicalKeys } from "../../data/queryKeys.ts";
import { useIdempotentMutation } from "../../data/useIdempotentMutation.ts";
import { useRepository } from "../../data/useRepository.ts";
import { useSession } from "../../session/useSession.ts";
import { demoNowIso } from "../patients/hooks.ts";
import { fetchAllPages } from "../patients/model.ts";
import { toFollowUpEvents } from "./model.ts";

const byMeasuredAtDesc = (a: Screening, b: Screening): number =>
  effectiveReadings(b).measuredAt.localeCompare(effectiveReadings(a).measuredAt);

export function useScreenings(patientId: string) {
  const repo = useRepository();
  const { activeFacilityId } = useSession();
  return useQuery({
    queryKey: clinicalKeys.screenings(activeFacilityId ?? "none", patientId),
    enabled: activeFacilityId !== null && patientId !== "",
    queryFn: async () => {
      const [screenings, nowIso] = await Promise.all([
        fetchAllPages((page, pageSize) => repo.listScreenings({ patientId, page, pageSize })),
        demoNowIso(repo),
      ]);
      return { screenings: [...screenings].sort(byMeasuredAtDesc), nowIso };
    },
  });
}

export function usePatientReviews(patientId: string) {
  const repo = useRepository();
  const { activeFacilityId } = useSession();
  return useQuery({
    queryKey: clinicalKeys.reviews(activeFacilityId ?? "none", { patientId }),
    enabled: activeFacilityId !== null && patientId !== "",
    queryFn: async () => {
      const reviews = await fetchAllPages((page, pageSize) =>
        repo.listReviews({ patientId, page, pageSize }),
      );
      return [...reviews].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
  });
}

export function usePatientTimeline(patientId: string) {
  const repo = useRepository();
  const { activeFacilityId } = useSession();
  return useQuery({
    queryKey: clinicalKeys.patientTimeline(activeFacilityId ?? "none", patientId),
    enabled: activeFacilityId !== null && patientId !== "",
    queryFn: async () => {
      const [reviews, referrals, followUps, nowIso] = await Promise.all([
        fetchAllPages((page, pageSize) => repo.listReviews({ patientId, page, pageSize })),
        fetchAllPages((page, pageSize) => repo.listReferrals({ patientId, page, pageSize })),
        fetchAllPages((page, pageSize) => repo.listFollowUps({ patientId, page, pageSize })),
        demoNowIso(repo),
      ]);
      return { nowIso, events: toFollowUpEvents({ reviews, referrals, followUps }, nowIso) };
    },
  });
}

/** FND-07 `ScreeningAmendmentCall` (the mutation hook supplies the idempotency key). */
export type AmendScreeningVariables = ScreeningAmendmentCall;

export function useAmendScreening(options: { onSuccess?: (screening: Screening) => void } = {}) {
  const repo = useRepository();
  const { activeFacilityId } = useSession();
  const fac = activeFacilityId ?? "none";
  const { onSuccess } = options;
  return useIdempotentMutation<AmendScreeningVariables, Screening>({
    mutationFn: (variables, key) => repo.amendScreening(variables, key),
    invalidate: clinicalInvalidations(fac, "amendScreening"),
    ...(onSuccess === undefined ? {} : { onSuccess: (result) => onSuccess(result.data) }),
  });
}
