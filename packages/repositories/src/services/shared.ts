/**
 * Helpers shared by the services: filter parsing, paging, scope resources and the role-based
 * choice of read permission.
 */
import type { Permission, ScopedResource } from "@laif/auth-demo";
import { contractsErrorMap, issuesToFieldErrors, type Page } from "@laif/contracts";
import type {
  CareTask,
  DemoPersona,
  FacilityId,
  FollowUp,
  Patient,
  PersonaId,
  Referral,
  Review,
  Screening,
} from "@laif/domain";
import { roleHasPermission } from "@laif/auth-demo";
import type { z } from "zod";

import type { TxContext } from "../core/engine.ts";
import { RepositoryError } from "../errors.ts";

export function parseFilter<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const parsed = schema.safeParse(value ?? {}, { error: contractsErrorMap });
  if (!parsed.success) {
    throw new RepositoryError("VALIDATION_ERROR", {
      fieldErrors: issuesToFieldErrors(parsed.error.issues),
    });
  }
  return parsed.data;
}

export function paginate<T>(items: readonly T[], page: number, pageSize: number): Page<T> {
  const start = (page - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), total: items.length, page, pageSize };
}

export const byString =
  <T>(key: (item: T) => string, direction: "asc" | "desc" = "asc") =>
  (a: T, b: T): number => {
    const x = key(a);
    const y = key(b);
    const order = x < y ? -1 : x > y ? 1 : 0;
    return direction === "asc" ? order : -order;
  };

/** Sort by `key` then `id` (stable, deterministic). */
export function sortBy<T extends { id: string }>(
  items: T[],
  key: (item: T) => string,
  direction: "asc" | "desc" = "asc",
): T[] {
  const primary = byString(key, direction);
  const tie = byString<T>((i) => i.id);
  return items.sort((a, b) => primary(a, b) || tie(a, b));
}

/** The first permission of `candidates` the actor's role holds; `FORBIDDEN` (audited) if none. */
export function readPermission(
  ctx: TxContext,
  candidates: readonly Permission[],
  target: { entityType: Parameters<TxContext["authorize"]>[2]["entityType"]; entityId: string },
): Permission {
  const actor = ctx.actor;
  const found = actor ? candidates.find((p) => roleHasPermission(actor.role, p)) : undefined;
  if (found) {
    ctx.authorize(found, undefined, target);
    return found;
  }
  ctx.authorize(candidates[0] ?? "patient.read", undefined, target);
  return candidates[0] ?? "patient.read";
}

/** Read permissions per entity, first match by role wins. */
export const READ_PERMISSIONS = {
  patient: ["patient.read", "self.read"],
  screening: ["patient.read", "self.read"],
  review: ["review.read"],
  referral: ["review.read", "followup.read_assigned", "self.read"],
  followUp: ["followup.read_assigned", "task.read", "review.read", "self.read"],
  task: ["task.read", "quality.triage"],
  reminder: ["self.read", "patient.read"],
  instruction: ["self.read", "patient.read"],
  audit: ["audit.read", "audit.read_scoped"],
} as const satisfies Record<string, readonly Permission[]>;

export const patientResource = (p: Pick<Patient, "id" | "facilityId" | "districtId">) => ({
  facilityId: p.facilityId,
  districtId: p.districtId,
  patientId: p.id,
});

export const screeningResource = (
  s: Pick<Screening, "patientId" | "facilityId" | "districtId">,
): ScopedResource => ({
  facilityId: s.facilityId,
  districtId: s.districtId,
  patientId: s.patientId,
});

export const reviewResource = (r: Pick<Review, "patientId" | "facilityId">): ScopedResource => ({
  facilityId: r.facilityId,
  patientId: r.patientId,
});

/** Always carries `assignedWorkerId` (CHW assignment limit fails closed, FND-07). */
export const referralResource = (
  r: Pick<Referral, "patientId" | "facilityId" | "assignedWorkerId">,
): ScopedResource => ({
  facilityId: r.facilityId,
  patientId: r.patientId,
  assignedWorkerId: r.assignedWorkerId,
});

/** Always carries `assignedWorkerId` (CHW assignment limit fails closed, FND-07). */
export const followUpResource = (
  f: Pick<FollowUp, "patientId" | "facilityId" | "assignedWorkerId">,
): ScopedResource => ({
  facilityId: f.facilityId,
  patientId: f.patientId,
  assignedWorkerId: f.assignedWorkerId,
});

export const taskResource = (t: Pick<CareTask, "patientId" | "facilityId">): ScopedResource => ({
  facilityId: t.facilityId,
  patientId: t.patientId,
});

/**
 * Requested facility / district ids outside the actor's scope → audited `FORBIDDEN` (T-02).
 * List filters (`aggregate: false`) may name a district that contains at least one in-scope
 * facility (rows are scope-filtered anyway); aggregates require the whole district in scope.
 * The assignment limit (CHW) is not a scope question here, so the actor is passed as assignee.
 */
export function assertRequestedScope(
  ctx: TxContext,
  permission: Permission,
  filter: {
    facilityIds?: readonly string[] | undefined;
    districtIds?: readonly string[] | undefined;
  },
  options: { aggregate?: boolean } = {},
): void {
  const self = { assignedWorkerId: ctx.actorId };
  for (const facilityId of filter.facilityIds ?? []) {
    ctx.authorize(
      permission,
      { facilityId: facilityId as FacilityId, ...self },
      { entityType: "facility", entityId: facilityId },
    );
  }
  for (const districtId of filter.districtIds ?? []) {
    const partly =
      !options.aggregate &&
      ctx.facilities.some(
        (f) => f.districtId === districtId && ctx.can(permission, { facilityId: f.id, ...self }),
      );
    if (partly) continue;
    ctx.authorize(
      permission,
      { districtId: districtId as never, ...self },
      { entityType: "district", entityId: districtId },
    );
  }
}

export const WORKER_ROLES = new Set(["community_health_worker"]);

/** Authorised CHWs of a facility (CLN-07/09 assignment lists). */
export async function workersOf(ctx: TxContext, facilityId: string): Promise<DemoPersona[]> {
  const personas = await ctx.tx.getAll<DemoPersona>("personas");
  return sortBy(
    personas.filter(
      (p) => WORKER_ROLES.has(p.role) && (p.facilityIds as readonly string[]).includes(facilityId),
    ),
    (p) => p.displayName,
  );
}

/** Assigning work to anyone but an authorised CHW of the facility → `WORKER_NOT_AUTHORISED`. */
export async function assertAuthorisedWorker(
  ctx: TxContext,
  facilityId: string,
  workerId: PersonaId | string | null | undefined,
): Promise<void> {
  if (workerId === null || workerId === undefined) return;
  const workers = await workersOf(ctx, facilityId);
  if (!workers.some((w) => w.id === workerId)) {
    throw new RepositoryError("FORBIDDEN", {
      reason: "WORKER_NOT_AUTHORISED",
      details: { workerId, facilityId },
    });
  }
}
