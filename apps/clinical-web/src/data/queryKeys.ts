/**
 * `clinicalKeys` (CLN-02): the TanStack Query key factory of the clinical app. Every key is
 * scoped by the ACTIVE facility (`['clinical', fac, …]`), so a facility switch never shows another
 * facility's cached data. Invalidation reuses FND-07 `MUTATION_INVALIDATIONS` (which entity roots
 * a mutation touches) and maps each root onto the clinical keys below.
 */
import { MUTATION_INVALIDATIONS, type MutationName, type QueryEntity } from "@laif/repositories";
import type { QueryKey } from "@tanstack/react-query";

type Fac = string;
type Filter = unknown;

export const clinicalKeys = {
  all: (fac: Fac) => ["clinical", fac] as const,
  patients: (fac: Fac, f: Filter = {}) => ["clinical", fac, "patients", f] as const,
  patient: (fac: Fac, id: string) => ["clinical", fac, "patient", id] as const,
  /** CLN-03 KPI strip + latest screening of one patient. */
  patientStats: (fac: Fac, id: string) => ["clinical", fac, "patientStats", id] as const,
  screenings: (fac: Fac, patientId: string) => ["clinical", fac, "screenings", patientId] as const,
  /** CLN-04 merged follow-up timeline (reviews + referrals + follow-ups) of one patient. */
  patientTimeline: (fac: Fac, patientId: string) =>
    ["clinical", fac, "patientTimeline", patientId] as const,
  reviews: (fac: Fac, f: Filter = {}) => ["clinical", fac, "reviews", f] as const,
  reviewCounts: (fac: Fac, f: Filter = {}) => ["clinical", fac, "reviewCounts", f] as const,
  review: (fac: Fac, id: string) => ["clinical", fac, "review", id] as const,
  referrals: (fac: Fac, f: Filter = {}) => ["clinical", fac, "referrals", f] as const,
  /** CLN-08 tab counts / KPI strip / sidebar badge (`countReferrals`). */
  referralCounts: (fac: Fac, f: Filter = {}) => ["clinical", fac, "referralCounts", f] as const,
  /** CLN-08 drawer: one referral (`getReferral`). */
  referral: (fac: Fac, id: string) => ["clinical", fac, "referral", id] as const,
  /** CLN-08 create dialog: decided reviews without an open referral. */
  referralEligible: (fac: Fac, f: Filter = {}) => ["clinical", fac, "referralEligible", f] as const,
  followUps: (fac: Fac, f: Filter = {}) => ["clinical", fac, "followUps", f] as const,
  /** CLN-09 sidebar badge (`countFollowUps`: overdue + awaiting confirmation). */
  followUpCounts: (fac: Fac, f: Filter = {}) => ["clinical", fac, "followUpCounts", f] as const,
  /** CLN-09 task drawer: one follow-up (`getFollowUp`). */
  followUp: (fac: Fac, id: string) => ["clinical", fac, "followUp", id] as const,
  /** CLN-09 create-task dialog: decided reviews without an open task of that type. */
  followUpEligible: (fac: Fac, f: Filter = {}) => ["clinical", fac, "followUpEligible", f] as const,
  /** CLN-09 care tasks (correction requests routed to clinicians, CTZ-07). */
  tasks: (fac: Fac, f: Filter = {}) => ["clinical", fac, "tasks", f] as const,
  workers: (fac: Fac) => ["clinical", fac, "workers"] as const,
  audit: (fac: Fac, f: Filter = {}) => ["clinical", fac, "audit", f] as const,
} as const;

/** Clinical key prefixes (3rd segment) per FND-07 entity root. */
const ROOT_SEGMENTS: Partial<Record<QueryEntity, readonly string[]>> = {
  // `patients` rows (CLN-03) also show last screening + open items, hence the extra segments.
  patients: ["patients", "patient"],
  // `patientTimeline` (CLN-04) merges reviews, referrals and follow-ups; an amendment also
  // refreshes it (phase task 6).
  screenings: ["screenings", "patientStats", "patients", "patientTimeline"],
  reviews: [
    "reviews",
    "reviewCounts",
    "review",
    "patientStats",
    "patients",
    "patientTimeline",
    "referralEligible",
  ],
  referrals: [
    "referrals",
    "referralCounts",
    "referral",
    "referralEligible",
    "review",
    "reviewCounts",
    "patientStats",
    "patients",
    "patientTimeline",
  ],
  followUps: [
    "followUps",
    "followUpCounts",
    "followUp",
    "followUpEligible",
    "review",
    "patientStats",
    "patients",
    "patientTimeline",
  ],
  tasks: ["tasks"],
  workers: ["workers"],
  audit: ["audit"],
};

/** Query-key prefixes to invalidate after `mutation` in facility `fac` (always includes audit). */
export function clinicalInvalidations(fac: Fac, mutation: MutationName): QueryKey[] {
  const roots = [...MUTATION_INVALIDATIONS[mutation], "audit"] as QueryEntity[];
  const segments = new Set(roots.flatMap((root) => ROOT_SEGMENTS[root] ?? []));
  return [...segments].map((segment) => ["clinical", fac, segment]);
}
