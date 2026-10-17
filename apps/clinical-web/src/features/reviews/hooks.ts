/**
 * Review detail data (CLN-06).
 *
 * - `useReview(id)` → `repository.getReview(id)`: review (with its frozen `evidenceSnapshot`) +
 *   screening + patient + linked referrals / follow-ups. The repository itself audits
 *   `review.viewed` (de-duplicated per actor + review per demo minute), so the page records
 *   nothing extra; an out-of-scope id → `FORBIDDEN` + `access.denied`, unknown → `null`. No focus
 *   refetch, so one open = one sensitive read.
 * - `useStartReview()` → `repository.startReview({ reviewId, expectedVersion, takeOverReason? })`
 *   through `useIdempotentMutation` (one key per page session, same-key retry, double click = one
 *   call). The repository moves `pending → in_review` (version + 1, `review.started`), or takes
 *   over another clinician's review with a reason (`review.taken_over`); a stale version or the
 *   simulated conflict → `CONFLICT` (+ `conflict.detected`).
 * - `rulesetFor(version)` → the FND-05 demo ruleset config of that version (rule descriptions,
 *   `requiredInputs`, demo placeholder values) — there is no repository read for rulesets.
 */
import type { Review } from "@laif/domain";
import { DEMO_RULESET_V0, DEMO_RULESET_V1 } from "@laif/mock-data";
import { useQuery } from "@tanstack/react-query";

import type { ClinicalError } from "../../data/errors.ts";
import { clinicalInvalidations, clinicalKeys } from "../../data/queryKeys.ts";
import { useIdempotentMutation } from "../../data/useIdempotentMutation.ts";
import { useRepository } from "../../data/useRepository.ts";
import { useSession } from "../../session/useSession.ts";

const DEMO_RULESETS = [DEMO_RULESET_V1, DEMO_RULESET_V0] as const;
export type KnownRuleset = (typeof DEMO_RULESETS)[number];

/** The demo ruleset config of `version`, or null when the version is unknown to this demo. */
export function rulesetFor(version: string | null | undefined): KnownRuleset | null {
  return DEMO_RULESETS.find((ruleset) => ruleset.version === version) ?? null;
}

export function useReview(id: string) {
  const repo = useRepository();
  const { activeFacilityId } = useSession();
  return useQuery({
    queryKey: clinicalKeys.review(activeFacilityId ?? "none", id),
    queryFn: () => repo.getReview(id),
    enabled: activeFacilityId !== null && id !== "",
    refetchOnWindowFocus: false,
    staleTime: 60_000,
  });
}

export type StartReviewVariables = {
  reviewId: string;
  expectedVersion: number;
  takeOverReason?: string;
};

export type UseStartReviewOptions = {
  onSuccess?: (review: Review) => void;
  onError?: (error: ClinicalError) => void;
};

export function useStartReview(options: UseStartReviewOptions = {}) {
  const repo = useRepository();
  const { activeFacilityId } = useSession();
  const fac = activeFacilityId ?? "none";
  const { onSuccess, onError } = options;
  return useIdempotentMutation<StartReviewVariables, Review>({
    mutationFn: (variables, key) => repo.startReview(variables, key),
    invalidate: clinicalInvalidations(fac, "startReview"),
    ...(onSuccess === undefined ? {} : { onSuccess: (result) => onSuccess(result.data) }),
    ...(onError === undefined ? {} : { onError: (error) => onError(error) }),
  });
}
