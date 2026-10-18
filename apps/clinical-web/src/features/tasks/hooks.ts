/**
 * Care-team task data (CLN-09 deliverable `hooks.ts`). The repository actor is narrowed to the
 * active facility (CLN-02), so every list below only holds in-scope rows; keys are facility-scoped.
 *
 * - `useFollowUps()` — every follow-up of the facility (all pages). Tabs, KPI strip, workload and
 *   tab badges are all derived from THIS one list (`model.ts`), so a badge always equals its rows.
 * - `useFollowUpCounts()` — `countFollowUps` (sidebar badge: overdue + awaiting confirmation).
 * - `useFollowUp(id)` — `getFollowUp` for the drawer (`?id=`; out of scope → FORBIDDEN, audited).
 * - `useWorkers()` — `listWorkers(activeFacility)`: authorised CHWs of the facility only.
 * - `useUpdateFollowUp` / `useCreateFollowUp` — `useIdempotentMutation` (one key per dialog
 *   session, re-entry blocked, same-key retry after TIMEOUT / OFFLINE / 503, `expectedVersion`
 *   → CONFLICT with `latest`).
 * - `useRecordConflictResolution()` — the client `conflict.resolved` audit (WF-02 step 5).
 * - `useCorrectionRequests()` / `useUpdateTask()` — CTZ-07 correction requests routed to the
 *   facility's clinicians (`listTasks({ kinds: ['correction_request'] })`) and their resolution.
 */
import type { WriteResult } from "@laif/contracts";
import type { CareTask, ConflictResolution, FollowUp, FollowUpPurpose, Review } from "@laif/domain";
import type { CareTaskUpdateCall, FollowUpCall, FollowUpUpdateCall } from "@laif/repositories";
import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";

import type { ClinicalError } from "../../data/errors.ts";
import { clinicalInvalidations, clinicalKeys } from "../../data/queryKeys.ts";
import { useIdempotentMutation } from "../../data/useIdempotentMutation.ts";
import { useRepository } from "../../data/useRepository.ts";
import { useSession } from "../../session/useSession.ts";
import { fetchAllPages } from "../patients/model.ts";
import { isTaskOpen } from "./model.ts";

function useFac(): string {
  return useSession().activeFacilityId ?? "none";
}

export function useFollowUps(enabled = true) {
  const repo = useRepository();
  return useQuery({
    queryKey: clinicalKeys.followUps(useFac(), { all: true }),
    queryFn: () => fetchAllPages((page, pageSize) => repo.listFollowUps({ page, pageSize })),
    enabled,
  });
}

export function followUpCountsQueryKey(fac: string) {
  return clinicalKeys.followUpCounts(fac, { all: true });
}

/** Unfiltered facility counts (`overdue`, `pendingConfirmation`, `open`, by status). */
export function useFollowUpCounts(enabled = true) {
  const repo = useRepository();
  return useQuery({
    queryKey: followUpCountsQueryKey(useFac()),
    queryFn: () => repo.countFollowUps(),
    enabled,
  });
}

export function useFollowUp(id: string | null) {
  const repo = useRepository();
  return useQuery({
    queryKey: clinicalKeys.followUp(useFac(), id ?? ""),
    queryFn: () => repo.getFollowUp(id ?? ""),
    enabled: id !== null,
    retry: false,
  });
}

/** Authorised CHWs of the ACTIVE facility (CL-07; the repository rejects anyone else). */
export function useWorkers(enabled = true) {
  const repo = useRepository();
  const { activeFacilityId } = useSession();
  return useQuery({
    queryKey: clinicalKeys.workers(activeFacilityId ?? "none"),
    queryFn: () => repo.listWorkers(activeFacilityId ?? ""),
    enabled: enabled && activeFacilityId !== null,
    staleTime: 60_000,
  });
}

type MutationCallbacks<V, T> = {
  onSuccess?: (result: WriteResult<T>, variables: V) => void;
  onError?: (error: ClinicalError, variables: V) => void;
};

export function useUpdateFollowUp(callbacks: MutationCallbacks<FollowUpUpdateCall, FollowUp> = {}) {
  const repo = useRepository();
  return useIdempotentMutation<FollowUpUpdateCall, FollowUp>({
    mutationFn: (variables, key) => repo.updateFollowUp(variables, key),
    invalidate: clinicalInvalidations(useFac(), "updateFollowUp"),
    ...callbacks,
  });
}

export function useCreateFollowUp(callbacks: MutationCallbacks<FollowUpCall, FollowUp> = {}) {
  const repo = useRepository();
  return useIdempotentMutation<FollowUpCall, FollowUp>({
    mutationFn: (variables, key) => repo.createFollowUp(variables, key),
    invalidate: clinicalInvalidations(useFac(), "createFollowUp"),
    ...callbacks,
  });
}

export type ConflictResolutionAudit = {
  resolution: ConflictResolution;
  followUp: Pick<FollowUp, "id" | "patientId" | "facilityId">;
  /** Idempotency key of the write that was rejected with CONFLICT. */
  originalKey: string;
  /** Key of the re-applied write (`reapply_on_latest`). */
  newKey?: string;
  expectedVersion: number;
  latestVersion: number;
};

/** `conflict.resolved` (client, WF-02 step 5). Never blocks the UI. */
export function useRecordConflictResolution() {
  const repo = useRepository();
  return useCallback(
    async (audit: ConflictResolutionAudit) => {
      try {
        await repo.recordAuditEvent({
          action: "conflict.resolved",
          entityType: "follow_up",
          entityId: audit.followUp.id,
          patientId: audit.followUp.patientId,
          facilityId: audit.followUp.facilityId,
          changeSummary: {
            resolution: audit.resolution,
            originalIdempotencyKey: audit.originalKey,
            ...(audit.newKey === undefined ? {} : { newIdempotencyKey: audit.newKey }),
            expectedVersion: audit.expectedVersion,
            latestVersion: audit.latestVersion,
          },
        });
      } catch (error) {
        if (import.meta.env.DEV) console.warn("[clinical] conflict.resolved not recorded", error);
      }
    },
    [repo],
  );
}

/** Purposes a clinician may create a task for (CLN-07 decision kinds REPEAT_TEST / PLANNED_REVIEW). */
export const CREATABLE_PURPOSES = [
  "repeat_screening",
  "planned_review",
] as const satisfies readonly FollowUpPurpose[];
export type CreatablePurpose = (typeof CREATABLE_PURPOSES)[number];

export type EligibleReview = { review: Review; purposes: CreatablePurpose[] };

/**
 * Decided reviews (not dismissed) of the facility that may get a task: one OPEN task per
 * (review, type) — the purposes already open on a review are left out (task 8).
 */
export function useEligibleTaskReviews(enabled = true) {
  const repo = useRepository();
  return useQuery({
    queryKey: clinicalKeys.followUpEligible(useFac()),
    queryFn: async (): Promise<EligibleReview[]> => {
      const [reviews, followUps] = await Promise.all([
        fetchAllPages((page, pageSize) =>
          repo.listReviews({ statuses: ["action_recorded"], page, pageSize }),
        ),
        fetchAllPages((page, pageSize) => repo.listFollowUps({ page, pageSize })),
      ]);
      const open = new Set(
        followUps
          .filter((fu) => isTaskOpen(fu) && fu.reviewId !== null)
          .map((fu) => `${fu.reviewId}|${fu.purpose}`),
      );
      return reviews
        .filter((r) => r.decision !== null && r.decision.kind !== "dismiss")
        .map((review) => ({
          review,
          purposes: CREATABLE_PURPOSES.filter((p) => !open.has(`${review.id}|${p}`)),
        }))
        .filter((entry) => entry.purposes.length > 0);
    },
    enabled,
  });
}

// ── Correction requests (CTZ-07 → clinicians) ────────────────────────────────

export type CorrectionTask = CareTask & { kind: "correction_request" };

export function useCorrectionRequests(enabled = true) {
  const repo = useRepository();
  return useQuery({
    queryKey: clinicalKeys.tasks(useFac(), { kinds: ["correction_request"] }),
    queryFn: async (): Promise<CorrectionTask[]> => {
      const tasks = await fetchAllPages((page, pageSize) =>
        repo.listTasks({ kinds: ["correction_request"], page, pageSize }),
      );
      return tasks.filter(
        (t): t is CorrectionTask =>
          t.kind === "correction_request" &&
          (t.payload.assignedRole === undefined || t.payload.assignedRole === "clinician"),
      );
    },
    enabled,
  });
}

export function useUpdateTask(callbacks: MutationCallbacks<CareTaskUpdateCall, CareTask> = {}) {
  const repo = useRepository();
  return useIdempotentMutation<CareTaskUpdateCall, CareTask>({
    mutationFn: (variables, key) => repo.updateTask(variables, key),
    invalidate: clinicalInvalidations(useFac(), "updateTask"),
    ...callbacks,
  });
}
