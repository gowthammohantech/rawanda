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
  screenings: (fac: Fac, patientId: string) => ["clinical", fac, "screenings", patientId] as const,
  reviews: (fac: Fac, f: Filter = {}) => ["clinical", fac, "reviews", f] as const,
  reviewCounts: (fac: Fac, f: Filter = {}) => ["clinical", fac, "reviewCounts", f] as const,
  review: (fac: Fac, id: string) => ["clinical", fac, "review", id] as const,
  referrals: (fac: Fac, f: Filter = {}) => ["clinical", fac, "referrals", f] as const,
  followUps: (fac: Fac, f: Filter = {}) => ["clinical", fac, "followUps", f] as const,
  workers: (fac: Fac) => ["clinical", fac, "workers"] as const,
  audit: (fac: Fac, f: Filter = {}) => ["clinical", fac, "audit", f] as const,
} as const;

/** Clinical key prefixes (3rd segment) per FND-07 entity root. */
const ROOT_SEGMENTS: Partial<Record<QueryEntity, readonly string[]>> = {
  patients: ["patients", "patient"],
  screenings: ["screenings"],
  reviews: ["reviews", "reviewCounts", "review"],
  referrals: ["referrals", "review", "reviewCounts"],
  followUps: ["followUps", "review"],
  workers: ["workers"],
  audit: ["audit"],
};

/** Query-key prefixes to invalidate after `mutation` in facility `fac` (always includes audit). */
export function clinicalInvalidations(fac: Fac, mutation: MutationName): QueryKey[] {
  const roots = [...MUTATION_INVALIDATIONS[mutation], "audit"] as QueryEntity[];
  const segments = new Set(roots.flatMap((root) => ROOT_SEGMENTS[root] ?? []));
  return [...segments].map((segment) => ["clinical", fac, segment]);
}
