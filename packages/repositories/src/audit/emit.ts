/**
 * Append-only audit emission (FND-07 §6). `emitAudit` is the only writer of `auditEvents`; no
 * repository method updates or deletes an audit event (only `resetDemo` clears the store).
 * `beforeHash` / `afterHash` are `hashCanonical(entity)` — NOT tamper-proof (spec §11).
 */
import {
  hashCanonical,
  type AuditEvent,
  type AuditEventId,
  type AuditOutcome,
  type CorrelationId,
  type DistrictId,
  type EntityType,
  type FacilityId,
  type JsonValue,
  type PatientId,
  type PersonaId,
  type Role,
} from "@laif/domain";

import type { StoreAdapter } from "../store/store-adapter.ts";
import { AUDIT_ACTIONS, isAuditAction, type AuditAction } from "./actions.ts";

export type AuditEventInput = {
  id: string;
  action: AuditAction;
  actorId: PersonaId | null;
  actorRole: Role | null;
  entityType: EntityType;
  entityId: string;
  occurredAt: string;
  correlationId: CorrelationId;
  outcome?: AuditOutcome;
  facilityId?: FacilityId | null;
  districtId?: DistrictId | null;
  patientId?: PatientId | null;
  /** Entity before / after the change; only their hashes are stored. */
  before?: unknown;
  after?: unknown;
  changeSummary?: { [key: string]: JsonValue };
  justification?: string | null;
};

/** Builds a schema-valid `AuditEvent` (category from the registry). */
export function buildAuditEvent(input: AuditEventInput): AuditEvent {
  if (!isAuditAction(input.action)) {
    throw new RangeError(`unregistered audit action: ${String(input.action)}`);
  }
  const event: AuditEvent = {
    id: input.id as AuditEventId,
    actorId: input.actorId,
    actorRole: input.actorRole,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    occurredAt: input.occurredAt,
    correlationId: input.correlationId,
    category: AUDIT_ACTIONS[input.action].category,
    outcome: input.outcome ?? "success",
    facilityId: input.facilityId ?? null,
    districtId: input.districtId ?? null,
    patientId: input.patientId ?? null,
    changeSummary: input.changeSummary ?? {},
    justification: input.justification ?? null,
    version: 1,
    createdAt: input.occurredAt,
    updatedAt: input.occurredAt,
    synthetic: true,
  };
  if (input.before !== undefined && input.before !== null) {
    event.beforeHash = hashCanonical(input.before);
  }
  if (input.after !== undefined && input.after !== null)
    event.afterHash = hashCanonical(input.after);
  return event;
}

/** Appends one event inside `tx`. Refuses unregistered actions and id re-use (append-only). */
export async function emitAudit(tx: StoreAdapter, input: AuditEventInput): Promise<AuditEvent> {
  const event = buildAuditEvent(input);
  if ((await tx.get("auditEvents", event.id)) !== undefined) {
    throw new Error(`audit is append-only: event ${event.id} already exists`);
  }
  await tx.put("auditEvents", event);
  return event;
}
