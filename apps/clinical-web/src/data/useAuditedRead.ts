/**
 * `useAuditedRead` (CLN-02): records a sensitive-read audit event ONCE per entity per mount
 * (StrictMode-safe: the ref survives the double effect run). For views the repository does not
 * audit itself — `getPatient` / `getReview` / `listAuditEvents` already emit `patient.viewed`,
 * `review.viewed`, `audit.viewed` — e.g. `referral.viewed`, `followup.viewed`,
 * `screening.history_viewed`, `queue.viewed`. Audit failures never block the screen.
 */
import type { EntityType, FacilityId, PatientId } from "@laif/domain";
import { useEffect, useRef } from "react";

import { useRepository } from "./useRepository.ts";

export const AUDITED_READ_ACTIONS = [
  "referral.viewed",
  "followup.viewed",
  "screening.history_viewed",
  "queue.viewed",
  "patient.searched",
] as const;
export type AuditedReadAction = (typeof AUDITED_READ_ACTIONS)[number];

export type UseAuditedReadOptions = {
  action: AuditedReadAction;
  entityType: EntityType;
  /** Nothing is recorded while undefined / null (e.g. before the data has loaded). */
  entityId: string | null | undefined;
  patientId?: PatientId | null;
  facilityId?: FacilityId | null;
  /** Default true; pass false until the read succeeded. */
  enabled?: boolean;
};

export function useAuditedRead({
  action,
  entityType,
  entityId,
  patientId,
  facilityId,
  enabled = true,
}: UseAuditedReadOptions): void {
  const repo = useRepository();
  const recorded = useRef(new Set<string>());

  useEffect(() => {
    if (!enabled || entityId === null || entityId === undefined) return;
    const key = `${action}|${entityType}|${entityId}`;
    if (recorded.current.has(key)) return;
    recorded.current.add(key);
    void repo
      .recordAuditEvent({
        action,
        entityType,
        entityId,
        ...(patientId ? { patientId } : {}),
        ...(facilityId ? { facilityId } : {}),
      })
      .catch((error: unknown) => {
        if (import.meta.env.DEV) console.warn("[clinical] read audit not recorded", error);
      });
  }, [repo, action, entityType, entityId, patientId, facilityId, enabled]);
}
