/**
 * The single permission vocabulary for all four apps (FND-06 task 1) and the role → permission
 * matrix (task 2).
 *
 * DEMO MATRIX, REQUIRES APPROVAL (phases/CONSISTENCY_REVIEW.md §3 item 3). Role switching in the
 * prototype is demo-only and is NOT authentication or security: these checks exist so that the
 * apps can demonstrate permission-denied states and audit them.
 *
 * App phases map their routes / nav items onto these names 1:1 (CLN-01 "capabilities", ADM-01
 * capability table); they never add permission names of their own.
 */
import { ROLES, type Role } from "@laif/domain";

export const PERMISSIONS = [
  "patient.read",
  "patient.register",
  "screening.create",
  "screening.amend",
  "review.read",
  "review.decide",
  "referral.manage",
  "referral.complete",
  "followup.read_assigned",
  "followup.update",
  "task.assign",
  "task.read",
  "audit.read",
  "audit.read_scoped",
  "audit.export",
  "metrics.read",
  "metrics.drilldown",
  "programme_action.write",
  "quality.triage",
  "export.aggregate",
  "roles.configure",
  "settings.privacy",
  "self.read",
  "self.reminders.manage",
  "self.correction.request",
  "demo.reset",
  "demo.scenario.transfer",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

/** Demo tooling granted to every role — not a privilege (reset / scenario JSON transfer). */
export const DEMO_TOOLING_PERMISSIONS = [
  "demo.reset",
  "demo.scenario.transfer",
] as const satisfies readonly Permission[];

/** Follow-up permissions that limit a community health worker to records assigned to them. */
export const ASSIGNMENT_LIMITED_PERMISSIONS = [
  "followup.read_assigned",
  "followup.update",
] as const satisfies readonly Permission[];

/** Roles whose `followup.*` access is additionally limited to their own assignments. */
export const ASSIGNMENT_LIMITED_ROLES = [
  "community_health_worker",
] as const satisfies readonly Role[];

export const PERMISSION_MATRIX_STATUS = "DEMO_MATRIX_REQUIRES_APPROVAL" as const;
export const PERMISSION_MATRIX_VERSION = "demo-permissions-1" as const;

const CLINICIAN = [
  "patient.read",
  "screening.amend",
  "review.read",
  "review.decide",
  "referral.manage",
  "referral.complete",
  "task.assign",
  "task.read",
  "audit.read",
  "followup.update",
] as const satisfies readonly Permission[];

const COMMUNITY_HEALTH_WORKER = [
  "patient.read",
  "patient.register",
  "screening.create",
  "screening.amend",
  "followup.read_assigned",
  "followup.update",
  "task.read",
] as const satisfies readonly Permission[];

const without = (list: readonly Permission[], ...remove: Permission[]): Permission[] =>
  list.filter((p) => !remove.includes(p));

const withTooling = (list: readonly Permission[]): readonly Permission[] =>
  Object.freeze(PERMISSIONS.filter((p) => list.includes(p) || isDemoTooling(p)));

function isDemoTooling(permission: Permission): boolean {
  return (DEMO_TOOLING_PERMISSIONS as readonly Permission[]).includes(permission);
}

/**
 * Role → permissions (demo matrix, requires approval). Lists are frozen and kept in
 * `PERMISSIONS` order so generated docs (REL-05 `scripts/gen-permissions-matrix.ts`) are stable.
 */
export const ROLE_PERMISSIONS: Readonly<Record<Role, readonly Permission[]>> = Object.freeze({
  clinician: withTooling(CLINICIAN),
  // Authorised review privilege: as clinician; does not export the audit log.
  nurse_reviewer: withTooling(without(CLINICIAN, "audit.export")),
  // Coordinates the care team: cannot decide reviews or amend screenings; exports audit (CLN-10).
  facility_coordinator: withTooling([
    ...without(CLINICIAN, "review.decide", "screening.amend"),
    "audit.export",
  ]),
  community_health_worker: withTooling(COMMUNITY_HEALTH_WORKER),
  // Same permissions as a CHW; scope = assigned facilities (HWM-01), not limited to assignments.
  field_supervisor: withTooling(COMMUNITY_HEALTH_WORKER),
  programme_lead: withTooling([
    "metrics.read",
    "metrics.drilldown",
    "programme_action.write",
    "quality.triage",
    "export.aggregate",
    "audit.read",
    "roles.configure",
    "settings.privacy",
  ]),
  district_analyst: withTooling([
    "metrics.read",
    "metrics.drilldown",
    "programme_action.write",
    "quality.triage",
    "export.aggregate",
    "audit.read_scoped",
  ]),
  facility_manager: withTooling(["metrics.read", "metrics.drilldown", "quality.triage"]),
  // Governance read only: no drill-down, no writes.
  auditor: withTooling(["metrics.read", "audit.read"]),
  citizen: withTooling(["self.read", "self.reminders.manage", "self.correction.request"]),
});

export function isPermission(value: unknown): value is Permission {
  return typeof value === "string" && (PERMISSIONS as readonly string[]).includes(value);
}

export function permissionsForRole(role: Role): readonly Permission[] {
  return ROLE_PERMISSIONS[role];
}

export function roleHasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

/** Roles that hold `permission`, in `ROLES` order. */
export function rolesWithPermission(permission: Permission): Role[] {
  return ROLES.filter((role) => roleHasPermission(role, permission));
}

/** One row per role with a Y/N per permission (REL-05 matrix generator, ADM-01 view). */
export function permissionMatrixRows(): Array<{ role: Role; grants: Record<Permission, boolean> }> {
  return ROLES.map((role) => ({
    role,
    grants: Object.fromEntries(PERMISSIONS.map((p) => [p, roleHasPermission(role, p)])) as Record<
      Permission,
      boolean
    >,
  }));
}

/** i18n key of a permission label: `domain:permission.<name>` (nested by dots). */
export const permissionLabelKey = (permission: Permission): `domain:permission.${Permission}` =>
  `domain:permission.${permission}`;

/** i18n key of a role label (FND-04 already ships these). */
export const roleLabelKey = (role: Role): `domain:role.${Role}` => `domain:role.${role}`;
