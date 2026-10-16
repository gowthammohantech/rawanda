/**
 * Framework-agnostic guards (FND-06). Apps wrap these in `<RequireCapability>` / route loaders;
 * the FND-07 repository calls `requirePermission` (or `checkAccess`) and audits denials.
 * Demo-only — not security.
 */
import {
  checkAccess,
  type AccessDenialReason,
  type ActorContext,
  type CheckAccessOptions,
} from "./check-access.ts";
import type { Permission } from "./permissions.ts";
import type { ScopedResource } from "./scope.ts";

/** Thrown by `requirePermission`. Maps onto the FND-03 `FORBIDDEN` code (HTTP-like 403). */
export class ForbiddenError extends Error {
  readonly code = "FORBIDDEN" as const;
  readonly status = 403 as const;
  readonly reason: AccessDenialReason;
  readonly permission: Permission;
  readonly resource: ScopedResource | undefined;

  constructor(permission: Permission, reason: AccessDenialReason, resource?: ScopedResource) {
    super(`Demo access denied: ${permission} (${reason}) — demo role switch, not authentication`);
    this.name = "ForbiddenError";
    this.permission = permission;
    this.reason = reason;
    this.resource = resource;
  }
}

export function isForbiddenError(value: unknown): value is ForbiddenError {
  return value instanceof ForbiddenError;
}

/** Throws `ForbiddenError` unless `checkAccess` allows. */
export function requirePermission(
  actor: ActorContext,
  permission: Permission,
  resource?: ScopedResource,
  options?: CheckAccessOptions,
): void {
  const decision = checkAccess(actor, permission, resource, options);
  if (!decision.allowed) throw new ForbiddenError(permission, decision.reason, resource);
}

export type RouteGuardResult =
  | { status: "allowed" }
  | { status: "unauthenticated" }
  | { status: "forbidden"; reason: AccessDenialReason; permission: Permission };

/**
 * Route-guard decision: no session → `unauthenticated` (redirect to the demo sign-in);
 * otherwise the `checkAccess` result. Rendering (ForbiddenPage / PermissionDenied) and auditing
 * stay in the app.
 */
export function guardRoute(
  actor: ActorContext | null | undefined,
  permission: Permission,
  resource?: ScopedResource,
  options?: CheckAccessOptions,
): RouteGuardResult {
  if (!actor) return { status: "unauthenticated" };
  const decision = checkAccess(actor, permission, resource, options);
  return decision.allowed
    ? { status: "allowed" }
    : { status: "forbidden", reason: decision.reason, permission };
}
