/**
 * Route / nav item → FND-06 permission map (ADM-01 task 3). This is a VIEW of `ROLE_PERMISSIONS`
 * (no second matrix): `roles.configure` replaces the former `governance.manage`. A route is open
 * when the persona holds ANY of its permissions. Nav items without the capability are disabled
 * (lock icon) AND the route itself checks it (`RequireCapability`) — hidden menus are not the
 * control (PRD §5).
 */
import { checkAccess, type ActorContext, type Permission } from "@laif/auth-demo";

export const ADMIN_ROUTE_IDS = [
  "overview",
  "funnel",
  "funnelStage",
  "timeliness",
  "workload",
  "quality",
  "reports",
  "governance",
  "settings",
] as const;
export type AdminRouteId = (typeof ADMIN_ROUTE_IDS)[number];

export const ROUTE_CAPABILITIES: Readonly<Record<AdminRouteId, readonly Permission[]>> = {
  overview: ["metrics.read"],
  funnel: ["metrics.read"],
  // Aggregate drill-down: the auditor has no drill-down (FND-06 matrix).
  funnelStage: ["metrics.drilldown"],
  timeliness: ["metrics.read"],
  workload: ["metrics.read"],
  // Viewing; triage actions additionally need `quality.triage` (ADM-06).
  quality: ["metrics.read"],
  // Preview for every role; exporting needs `export.aggregate` (ADM-07).
  reports: ["metrics.read"],
  // Programme-wide or own-scope audit (ADM-08 tabs).
  governance: ["audit.read", "audit.read_scoped"],
  // Viewing; editing the threshold needs `settings.privacy` (ADM-09).
  settings: ["metrics.read"],
};

/** The capability chips shown on the sign-in persona cards (ADM-01 table rows). */
export const ADMIN_CAPABILITIES = [
  "metrics.read",
  "metrics.drilldown",
  "programme_action.write",
  "quality.triage",
  "export.aggregate",
  "audit.read",
  "audit.read_scoped",
  "roles.configure",
  "settings.privacy",
] as const satisfies readonly Permission[];

export type CapabilityDecision = { allowed: true } | { allowed: false; permission: Permission };

/** Role check only (scope is ScopeGuard's job): allowed when any listed permission is held. */
export function canOpenRoute(actor: ActorContext | null, route: AdminRouteId): CapabilityDecision {
  const permissions = ROUTE_CAPABILITIES[route];
  const first = permissions[0] ?? "metrics.read";
  if (actor === null) return { allowed: false, permission: first };
  return permissions.some((permission) => checkAccess(actor, permission).allowed)
    ? { allowed: true }
    : { allowed: false, permission: first };
}

/** Capabilities of the admin table that the actor's role holds. */
export function heldCapabilities(actor: ActorContext): Permission[] {
  return ADMIN_CAPABILITIES.filter((permission) => checkAccess(actor, permission).allowed);
}
