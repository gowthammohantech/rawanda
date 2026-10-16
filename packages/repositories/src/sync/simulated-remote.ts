/**
 * The simulated remote (FND-07 task 8): an independent, authoritative copy of the dataset in the
 * `remote_*` collections of the SAME store, served by the SAME repository engine and services
 * (`mode: 'remote'`). It therefore dedupes by idempotency key (WF-02.2, `replayed: true` + one
 * `sync.duplicate_suppressed`), rejects bad input / scope (`VALIDATION_ERROR`, `FORBIDDEN` +
 * `access.denied`), answers 409 `CONFLICT` with `latest` on a stale `baseVersion` (WF-02.3) or a
 * `conflictOnce` fault, evaluates screenings with its own stored ruleset (WF-01 step 4) and
 * answers `FORBIDDEN` reason `DEVICE_REVOKED` while the device is revoked.
 *
 * Ops are routed by `(entityType, opType)`; the payload is the original FND-03 input. Creates
 * reachable from the worker app (patient, screening, care task / correction request) keep the
 * device's entity id (`presetId`) so the acknowledged snapshot replaces the local row; the sync
 * queue never copies back a snapshot whose id differs from the op's entity (no duplicates).
 */
import type { WriteResult } from "@laif/contracts";
import type { JsonValue, SyncOperation } from "@laif/domain";

import type { RepositoryDeps } from "../care-repository.ts";
import { Engine, type Versioned } from "../core/engine.ts";
import { RepositoryError } from "../errors.ts";
import { createServices, type Services } from "../services/index.ts";
import { resolveEntityType } from "../store/collections.ts";
import { createRemoteStoreView } from "../store/prefixed-adapter.ts";
import type { StoreAdapter } from "../store/store-adapter.ts";
import type { FaultInjector } from "../transport/faults.ts";

export type SimulatedRemote = {
  /** The `remote_*` view of the store. */
  store: StoreAdapter;
  engine: Engine;
  services: Services;
  /** Applies one sync op as the remote API would (no transport faults — see sync queue). */
  apply(op: SyncOperation): Promise<WriteResult<Versioned>>;
  /** "Another actor edited this" (HWM-02/09/10): patch + version bump + demo audit. */
  edit(
    entityType: string,
    id: string,
    patch: { [key: string]: JsonValue },
  ): Promise<{ entityType: string; id: string; version: number }>;
};

type Payload = Record<string, unknown>;

export function createSimulatedRemote(
  store: StoreAdapter,
  options: { deps: RepositoryDeps; faults: FaultInjector },
): SimulatedRemote {
  const view = createRemoteStoreView(store);
  const engine = new Engine({
    deps: options.deps,
    store: view,
    mode: "remote",
    faults: options.faults,
  });
  const services = createServices(engine);

  async function apply(op: SyncOperation): Promise<WriteResult<Versioned>> {
    const payload = (op.payload ?? {}) as Payload;
    const key = op.idempotencyKey;
    const preset = { presetId: op.entityId };
    const call = services as unknown as Record<
      string,
      (
        input: Payload,
        key: string,
        options?: { presetId?: string },
      ) => Promise<WriteResult<Versioned>>
    >;
    const route = `${op.entityType}:${op.opType}`;
    switch (route) {
      case "patient:create":
        return call["registerPatient"]!(payload, key, preset);
      case "screening:create":
        return call["createScreening"]!(payload, key, preset);
      case "screening:update":
        return call["amendScreening"]!(payload, key);
      case "review:command":
        return call["decideReview"]!(payload, key);
      case "referral:create":
        return call["createReferral"]!(payload, key);
      case "referral:update":
        return call["transitionReferral"]!(payload, key);
      case "follow_up:create":
        return call["createFollowUp"]!(payload, key);
      case "follow_up:update":
        return call["updateFollowUp"]!(payload, key);
      case "care_task:create":
        return "targetType" in payload
          ? call["requestCorrection"]!(payload, key, preset)
          : call["createTask"]!(payload, key, preset);
      case "care_task:update":
        return call["updateTask"]!(payload, key);
      case "reminder_preference:create":
      case "reminder_preference:update":
        return call["setReminderPreference"]!(payload, key);
      case "care_instruction:create":
        return call["releaseCareInstruction"]!(payload, key);
      default:
        throw new RepositoryError("VALIDATION_ERROR", {
          reason: "INVALID_TRANSITION",
          details: { route },
        });
    }
  }

  async function edit(entityType: string, id: string, patch: { [key: string]: JsonValue }) {
    return simulateEdit(engine, entityType, id, patch, null);
  }

  return { store: view, engine, services, apply, edit };
}

/**
 * Shared by `sync.simulateRemoteEdit` (remote) and `demo.simulateExternalUpdate` (local): applies
 * `patch` (never `id` / `version`), bumps the version and audits
 * `demo.concurrent_update_simulated` as the simulated actor.
 */
export async function simulateEdit(
  engine: Engine,
  entityType: string,
  id: string,
  patch: { [key: string]: JsonValue },
  actorPersonaId: string | null,
): Promise<{ entityType: string; id: string; version: number }> {
  const type = resolveEntityType(entityType);
  if (type === null) {
    throw new RepositoryError("VALIDATION_ERROR", {
      fieldErrors: { entityType: { key: "invalidEnum", params: {} } },
    });
  }
  return engine.write(async (ctx) => {
    const entity = await ctx.load<Versioned & Record<string, unknown>>(type, id);
    const clean = { ...patch };
    delete clean["id"];
    delete clean["version"];
    const next = ctx.touch(entity, clean);
    await ctx.save(type, next);
    let actor: { actorId: never; actorRole: never } | undefined;
    if (actorPersonaId !== null) {
      const persona = await ctx.tx.get<{ id: string; role: string }>("personas", actorPersonaId);
      actor = { actorId: actorPersonaId as never, actorRole: (persona?.role ?? null) as never };
    }
    await ctx.audit({
      action: "demo.concurrent_update_simulated",
      entityType: type,
      entityId: id,
      before: entity,
      after: next,
      ...(actor ? { actor } : { actor: { actorId: null, actorRole: null } }),
      changeSummary: {
        fields: Object.keys(clean),
        simulated: true,
        remote: engine.mode === "remote",
      },
    });
    return { entityType: type, id, version: next.version };
  });
}
