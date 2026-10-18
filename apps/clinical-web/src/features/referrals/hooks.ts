/**
 * Referral data (CLN-08 deliverable `hooks.ts`). The repository actor is narrowed to the active
 * facility (CLN-02), so no query returns out-of-scope rows; every key is facility-scoped.
 *
 * - `useReferrals(scope, tab)` / `useReferralCounts(scope)` — the list and `countReferrals` use
 *   the SAME filter (`scopeFilter` + `tabFilter`), so every tab badge equals its rows. The
 *   unfiltered counts feed the KPI strip AND the sidebar badge (one cache entry).
 * - `useReferral(id)` — `getReferral` (out of scope → FORBIDDEN, audited by the repository);
 *   `useReferralHistory(id)` — `listAuditEvents({ entityId })` (full history, oldest first).
 * - `useTransitionReferral` / `useEditReferral` / `useCreateReferral` — `useIdempotentMutation`
 *   (one key per dialog session, re-entry blocked: a double click = one write, same-key retry
 *   after TIMEOUT / OFFLINE / DEPENDENCY_UNAVAILABLE, `expectedVersion` → CONFLICT with
 *   `latest`). Success invalidates referrals, counts, the drawer, patient timeline and review.
 */
import type { WriteResult } from "@laif/contracts";
import type { AuditEvent, Patient, Referral, Review } from "@laif/domain";
import type { CareRepository } from "@laif/repositories";
import { queryOptions, useQuery } from "@tanstack/react-query";

import type { ClinicalError } from "../../data/errors.ts";
import { clinicalInvalidations, clinicalKeys } from "../../data/queryKeys.ts";
import { useIdempotentMutation } from "../../data/useIdempotentMutation.ts";
import { useRepository } from "../../data/useRepository.ts";
import { useSession } from "../../session/useSession.ts";
import { fetchAllPages } from "../patients/model.ts";
import type { CreateVariables, EditVariables, TransitionVariables } from "./forms.ts";
import {
  isReferralOpen,
  scopeFilter,
  tabFilter,
  type ReferralScope,
  type ReferralTab,
} from "./model.ts";

export const UNFILTERED_REFERRAL_SCOPE: ReferralScope = { facility: null, q: "" };

function useFac(): string {
  return useSession().activeFacilityId ?? "none";
}

/** Counts query (tabs, KPI strip, sidebar badge). */
export function referralCountsQuery(
  repo: CareRepository,
  fac: string,
  scope: ReferralScope,
  enabled = true,
) {
  return queryOptions({
    queryKey: clinicalKeys.referralCounts(fac, scope),
    queryFn: () => repo.countReferrals(scopeFilter(scope)),
    enabled,
  });
}

export function useReferralCounts(scope: ReferralScope) {
  const repo = useRepository();
  return useQuery(referralCountsQuery(repo, useFac(), scope));
}

export function useReferrals(scope: ReferralScope, tab: ReferralTab) {
  const repo = useRepository();
  return useQuery({
    queryKey: clinicalKeys.referrals(useFac(), { ...scope, tab }),
    queryFn: () =>
      fetchAllPages((page, pageSize) =>
        repo.listReferrals({ ...scopeFilter(scope), ...tabFilter(tab), page, pageSize }),
      ),
  });
}

/** Completed referrals of the facility (KPI: completed this month, median days). */
export function useCompletedReferrals() {
  const repo = useRepository();
  return useQuery({
    queryKey: clinicalKeys.referrals(useFac(), { kpi: "completed" }),
    queryFn: () =>
      fetchAllPages((page, pageSize) =>
        repo.listReferrals({ statuses: ["completed"], page, pageSize }),
      ),
  });
}

export type PatientNames = ReadonlyMap<
  string,
  Pick<Patient, "id" | "displayName" | "syntheticIdentifier">
>;

/** Patients readable in the active facility (PATIENT column). */
export function useReferralPatients() {
  const repo = useRepository();
  return useQuery({
    queryKey: clinicalKeys.patients(useFac(), { all: true, for: "referrals" }),
    queryFn: async (): Promise<PatientNames> => {
      const patients = await fetchAllPages((page, pageSize) =>
        repo.listPatients({ page, pageSize }),
      );
      return new Map(patients.map((p) => [p.id as string, p]));
    },
    staleTime: 60_000,
  });
}

export function useReferral(id: string | null) {
  const repo = useRepository();
  return useQuery({
    queryKey: clinicalKeys.referral(useFac(), id ?? ""),
    queryFn: () => repo.getReferral(id ?? ""),
    enabled: id !== null,
    retry: false,
  });
}

export function useReferralHistory(id: string | null, enabled = true) {
  const repo = useRepository();
  return useQuery({
    queryKey: clinicalKeys.audit(useFac(), { entityType: "referral", entityId: id }),
    queryFn: async (): Promise<AuditEvent[]> => {
      const events = await fetchAllPages((page, pageSize) =>
        repo.listAuditEvents({ entityType: "referral", entityId: id ?? "", page, pageSize }),
      );
      return [...events].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
    },
    enabled: id !== null && enabled,
    retry: false,
  });
}

/** The review a referral was created from (no extra `review.viewed`: list read). */
export function useLinkedReview(referral: Referral | null | undefined) {
  const repo = useRepository();
  return useQuery({
    queryKey: clinicalKeys.reviews(useFac(), {
      linkedTo: referral?.id ?? null,
      patientId: referral?.patientId ?? null,
    }),
    queryFn: async (): Promise<Review | null> => {
      if (!referral) return null;
      const reviews = await fetchAllPages((page, pageSize) =>
        repo.listReviews({ patientId: referral.patientId, page, pageSize }),
      );
      return reviews.find((r) => r.id === referral.reviewId) ?? null;
    },
    enabled: referral !== null && referral !== undefined,
  });
}

/**
 * Decided reviews that may get a referral (task 7): in scope, decided (`action_recorded`), the
 * outcome is not a dismissal, no open referral. Optionally one patient's only.
 */
export function useEligibleReviews(patientId: string | null, enabled = true) {
  const repo = useRepository();
  return useQuery({
    queryKey: clinicalKeys.referralEligible(useFac(), { patientId }),
    queryFn: async (): Promise<Review[]> => {
      const [reviews, referrals] = await Promise.all([
        fetchAllPages((page, pageSize) =>
          repo.listReviews({
            statuses: ["action_recorded"],
            ...(patientId === null ? {} : { patientId }),
            page,
            pageSize,
          }),
        ),
        fetchAllPages((page, pageSize) =>
          repo.listReferrals({
            statuses: ["created", "accepted", "scheduled"],
            ...(patientId === null ? {} : { patientId }),
            page,
            pageSize,
          }),
        ),
      ]);
      const open = new Set(referrals.filter(isReferralOpen).map((r) => r.reviewId as string));
      return reviews.filter(
        (r) => r.decision !== null && r.decision.kind !== "dismiss" && !open.has(r.id),
      );
    },
    enabled,
  });
}

type MutationCallbacks<V> = {
  onSuccess?: (result: WriteResult<Referral>, variables: V) => void;
  onError?: (error: ClinicalError, variables: V) => void;
};

export function useTransitionReferral(callbacks: MutationCallbacks<TransitionVariables> = {}) {
  const repo = useRepository();
  return useIdempotentMutation<TransitionVariables, Referral>({
    mutationFn: (variables, key) => repo.transitionReferral(variables, key),
    invalidate: clinicalInvalidations(useFac(), "transitionReferral"),
    ...callbacks,
  });
}

export function useEditReferral(callbacks: MutationCallbacks<EditVariables> = {}) {
  const repo = useRepository();
  return useIdempotentMutation<EditVariables, Referral>({
    mutationFn: (variables, key) => repo.editReferral(variables, key),
    invalidate: clinicalInvalidations(useFac(), "editReferral"),
    ...callbacks,
  });
}

export function useCreateReferral(callbacks: MutationCallbacks<CreateVariables> = {}) {
  const repo = useRepository();
  return useIdempotentMutation<CreateVariables, Referral>({
    mutationFn: (variables, key) => repo.createReferral(variables, key),
    invalidate: clinicalInvalidations(useFac(), "createReferral"),
    ...callbacks,
  });
}
