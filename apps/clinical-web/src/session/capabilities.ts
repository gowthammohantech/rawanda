/**
 * Clinical capabilities (CLN-01 task 3/4). Capabilities ARE the FND-06 `PERMISSIONS` — no
 * clinical-only names — and the role grants are FND-06 `ROLE_PERMISSIONS` (demo matrix, requires
 * approval). This file only maps routes, nav items and actions onto those permissions.
 * DEMO ROLE SWITCH — NOT AUTHENTICATION, NOT SECURITY (the repository enforces again).
 */
import { roleHasPermission, type Permission } from "@laif/auth-demo";
import type { Role } from "@laif/domain";

import type { ClinicalRouteId } from "../app/routes.ts";

/** The FND-06 permissions this app consults. */
export const CLINICAL_CAPABILITIES = [
  "patient.read",
  "screening.amend",
  "review.read",
  "review.decide",
  "referral.manage",
  "referral.complete",
  "task.assign",
  "task.read",
  "audit.read",
  "audit.export",
  "demo.reset",
] as const satisfies readonly Permission[];
export type ClinicalCapability = (typeof CLINICAL_CAPABILITIES)[number];

/** Roles of the clinical personas (FND-05: clinician, authorised nurse reviewer, coordinator). */
export const CLINICAL_ROLES = [
  "clinician",
  "nurse_reviewer",
  "facility_coordinator",
] as const satisfies readonly Role[];
export type ClinicalRole = (typeof CLINICAL_ROLES)[number];

/** Capability a route needs (`null` = any signed-in clinical persona). */
export const ROUTE_CAPABILITY: Readonly<Record<ClinicalRouteId, ClinicalCapability | null>> = {
  queue: "review.read",
  patients: "patient.read",
  patient: "patient.read",
  review: "review.read",
  decision: "review.decide",
  referrals: "referral.manage",
  tasks: "task.assign",
  audit: "audit.read",
  settings: null,
};

/** Capability behind an in-page action (wired by later phases). */
export const ACTION_CAPABILITY = {
  amendScreening: "screening.amend",
  decideReview: "review.decide",
  manageReferral: "referral.manage",
  completeReferral: "referral.complete",
  assignTask: "task.assign",
  exportAudit: "audit.export",
  resetDemo: "demo.reset",
  simulateFaults: "demo.reset",
} as const satisfies Readonly<Record<string, ClinicalCapability>>;

export function roleCan(role: Role, capability: ClinicalCapability): boolean {
  return roleHasPermission(role, capability);
}

/** The clinical capabilities a role holds, in `CLINICAL_CAPABILITIES` order. */
export function capabilitiesForRole(role: Role): ClinicalCapability[] {
  return CLINICAL_CAPABILITIES.filter((capability) => roleCan(role, capability));
}
