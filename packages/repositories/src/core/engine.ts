/**
 * The write pipeline and read context shared by every service (FND-07 task 3). Every mutating
 * method runs in ONE store transaction:
 *   (a) role check → on deny an `access.denied` audit (outcome `denied`) + `FORBIDDEN`;
 *   (b) Zod parse (with the demo clock) → `VALIDATION_ERROR` + `fieldErrors`;
 *   (c) idempotency lookup → replay (`replayed: true`, one `sync.duplicate_suppressed`) or
 *       `IDEMPOTENCY_KEY_REUSED`;
 *   (d) load entity, scope check (`FORBIDDEN` + audit), `expectedVersion` → `CONFLICT` with
 *       `latest` (and `conflictOnce` faults);
 *   (e) domain transition + invariants (`DomainInvariantError` → `VALIDATION_ERROR` +
 *       `invariantCode`);
 *   (f) bump `version`, `updatedAt` from the demo clock;
 *   (g) append audit events with `beforeHash` / `afterHash` and the propagated `correlationId`;
 *   (h) store the idempotency record (and, in the worker app, the sync op);
 *   (i) return the `WriteResult`.
 * Denial / conflict audit events are written AFTER the rollback in their own transaction, so a
 * failed write leaves no change but its audit trail.
 */
import {
  checkAccess,
  isResourceInScope,
  type ActorContext,
  type Permission,
  type ScopedResource,
} from "@laif/auth-demo";
import {
  contractsErrorMap,
  IdempotencyKey,
  issuesToFieldErrors,
  type ConflictDetails,
  type ErrorReason,
  type WriteResult,
} from "@laif/contracts";
import {
  asId,
  type AppId,
  type AuditEvent,
  type AuditOutcome,
  type Clock,
  type CorrelationId,
  type DemoRuleset,
  type DeviceSessionStatus,
  type DistrictId,
  type EntityType,
  type Facility,
  type FacilityId,
  type IdGenerator,
  type JsonValue,
  type PatientId,
  type PersonaId,
  type Role,
} from "@laif/domain";
import type { z } from "zod";

import { emitAudit, type AuditEventInput } from "../audit/emit.ts";
import type { AuditAction } from "../audit/actions.ts";
import type { RepositoryDeps } from "../care-repository.ts";
import { RepositoryError, toRepositoryError } from "../errors.ts";
import { payloadHashOf, withIdempotency } from "../idempotency.ts";
import { ENTITY_COLLECTIONS, type LocalCollectionName } from "../store/collections.ts";
import type { StoreAdapter } from "../store/store-adapter.ts";
import { FAULTS_META_KEY, type FaultInjector } from "../transport/faults.ts";

/** `direct`: web apps (faults wrap every call). `local-sync`: worker device store (writes are
 * immediate and enqueue sync ops). `remote`: the simulated remote (authoritative copy). */
export type EngineMode = "direct" | "local-sync" | "remote";

export type AuditDraft = {
  action: AuditAction;
  entityType: EntityType;
  entityId: string;
  before?: unknown;
  after?: unknown;
  correlationId?: CorrelationId;
  outcome?: AuditOutcome;
  facilityId?: FacilityId | null;
  districtId?: DistrictId | null;
  patientId?: PatientId | null;
  changeSummary?: { [key: string]: JsonValue };
  justification?: string | null;
  /** Overrides the actor columns (simulated actors, system events). */
  actor?: { actorId: PersonaId | null; actorRole: Role | null };
};

export type DeferredAudit = AuditDraft & {
  actorId: PersonaId | null;
  actorRole: Role | null;
  occurredAt: string;
};

const deferredAudits = new WeakMap<RepositoryError, DeferredAudit[]>();

/** Attaches an audit written after the rollback (denials). Services use it for custom denials. */
export function defer(error: RepositoryError, audit: DeferredAudit): RepositoryError {
  const list = deferredAudits.get(error) ?? [];
  list.push(audit);
  deferredAudits.set(error, list);
  return error;
}

export type Versioned = { id: string; version: number; updatedAt: string };

export type MutationOutcome<T extends Versioned> = {
  data: T;
  entityType: EntityType;
  auditEventId: string;
  /** Sync op to enqueue in the worker app (`local-sync` mode); null = device-local. */
  sync?: {
    entityType: EntityType;
    entityId: string;
    opType: "create" | "update" | "command";
  } | null;
};

export type MutationSpec<I, T extends Versioned> = {
  /** Operation name (idempotency scope), e.g. `decideReview`. */
  op: string;
  key: string;
  input: unknown;
  /** Entity type for role-denial audits before the input is parsed. */
  entityType: EntityType;
  /** Role-level permission checked before parsing (null = actor required only). */
  permission: Permission | null;
  schema: z.ZodType<I> | ((ctx: TxContext) => Promise<z.ZodType<I>>);
  run: (ctx: TxContext, input: I) => Promise<MutationOutcome<T>>;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** JSON copy (drops `undefined`, normalises to what a persisted store returns). */
export function toJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export class Engine {
  readonly store: StoreAdapter;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly appId: AppId;
  readonly mode: EngineMode;
  readonly faults: FaultInjector;
  readonly deps: RepositoryDeps;
  readonly rulesetOverride: DemoRuleset | undefined;
  /** Set by the sync module in `local-sync` mode. */
  enqueue:
    | ((
        ctx: TxContext,
        op: NonNullable<MutationOutcome<Versioned>["sync"]>,
        key: string,
        payload: JsonValue,
        localVersion: number,
      ) => Promise<void>)
    | null = null;
  private readonly init: () => Promise<void>;
  private initialised: Promise<void> | null = null;

  constructor(options: {
    deps: RepositoryDeps;
    store: StoreAdapter;
    mode: EngineMode;
    faults: FaultInjector;
    init?: () => Promise<void>;
  }) {
    this.deps = options.deps;
    this.store = options.store;
    this.clock = options.deps.clock;
    this.ids = options.deps.ids;
    this.appId = options.deps.appId;
    this.mode = options.mode;
    this.faults = options.faults;
    this.rulesetOverride = options.deps.ruleset;
    this.init = options.init ?? (() => Promise.resolve());
  }

  ready(): Promise<void> {
    this.initialised ??= this.init().catch((error: unknown) => {
      this.initialised = null;
      throw error;
    });
    return this.initialised;
  }

  /** Builds the per-transaction context (actor re-read with its device-session status). */
  async context(tx: StoreAdapter): Promise<TxContext> {
    const now = this.clock.now();
    const raw = this.deps.getActor();
    let actor: ActorContext | null = raw ? { ...raw } : null;
    if (actor?.deviceSessionId) {
      const session = await tx.get<{ status: DeviceSessionStatus }>(
        "deviceSessions",
        actor.deviceSessionId,
      );
      if (session) actor = { ...actor, deviceSessionStatus: session.status };
    }
    const facilities = await tx.getAll<Facility>("facilities");
    return new TxContext(this, tx, actor, now, facilities);
  }

  /** Runs a read in a transaction (sensitive-read audits are atomic with the read). */
  async read<T>(fn: (ctx: TxContext) => Promise<T>): Promise<T> {
    await this.ready();
    try {
      return await this.store.transaction(async (tx) => fn(await this.context(tx)));
    } catch (error) {
      throw await this.fail(error);
    }
  }

  /** Runs an arbitrary write in a transaction with the same failure handling (demo / sync). */
  async write<T>(fn: (ctx: TxContext) => Promise<T>): Promise<T> {
    await this.ready();
    try {
      return await this.store.transaction(async (tx) => {
        const ctx = await this.context(tx);
        const result = await fn(ctx);
        await this.persistFaults(tx);
        return result;
      });
    } catch (error) {
      throw await this.fail(error);
    }
  }

  async mutate<I, T extends Versioned>(spec: MutationSpec<I, T>): Promise<WriteResult<T>> {
    await this.ready();
    try {
      return await this.store.transaction(async (tx) => {
        const ctx = await this.context(tx);
        if (this.mode === "remote") ctx.assertDeviceActive(spec.entityType);
        const rawId = isObject(spec.input) ? firstId(spec.input) : null;
        ctx.authorize(spec.permission, undefined, {
          entityType: spec.entityType,
          entityId: rawId ?? "unknown",
        });

        const keyResult = IdempotencyKey.safeParse(spec.key, { error: contractsErrorMap });
        if (!keyResult.success) {
          throw new RepositoryError("VALIDATION_ERROR", {
            fieldErrors: { idempotencyKey: { key: "invalidIdentifier", params: {} } },
          });
        }
        const key = keyResult.data;
        const raw = isObject(spec.input) ? { ...spec.input } : spec.input;
        if (isObject(raw)) {
          if (raw["idempotencyKey"] === undefined) raw["idempotencyKey"] = key;
          else if (raw["idempotencyKey"] !== key) {
            throw new RepositoryError("VALIDATION_ERROR", {
              fieldErrors: { idempotencyKey: { key: "invalid", params: {} } },
            });
          }
        }
        const schema = typeof spec.schema === "function" ? await spec.schema(ctx) : spec.schema;
        const parsed = schema.safeParse(raw, { error: contractsErrorMap });
        if (!parsed.success) {
          throw new RepositoryError("VALIDATION_ERROR", {
            fieldErrors: issuesToFieldErrors(parsed.error.issues),
          });
        }
        const input = parsed.data;

        const result = await withIdempotency<T>(
          tx,
          key,
          spec.op,
          payloadHashOf(input),
          async () => {
            const outcome = await spec.run(ctx, input);
            const writeResult: WriteResult<T> = {
              data: outcome.data,
              eventId: this.ids(),
              entityVersion: outcome.data.version,
              updatedAt: outcome.data.updatedAt,
              auditEventId: outcome.auditEventId,
              replayed: false,
            };
            if (this.mode === "local-sync" && outcome.sync && this.enqueue) {
              await this.enqueue(
                ctx,
                outcome.sync,
                key,
                toJson(input) as JsonValue,
                outcome.data.version,
              );
            }
            return {
              result: writeResult,
              entityType: outcome.entityType,
              entityId: outcome.data.id,
            };
          },
          {
            now: ctx.nowIso,
            onReplay: async (record) => {
              await ctx.audit({
                action: "sync.duplicate_suppressed",
                entityType: record.entityType,
                entityId: record.entityId,
                changeSummary: { op: spec.op, originalEventId: record.result.eventId },
              });
            },
          },
        );
        await this.persistFaults(tx);
        return result;
      });
    } catch (error) {
      throw await this.fail(error);
    }
  }

  /** Persists the fault config when a `conflictOnce` was consumed (not in remote mode: the
   * device store owns `demo.faults`; the sync queue persists it after each send). */
  async persistFaults(tx: StoreAdapter): Promise<void> {
    if (this.mode === "remote" || !this.faults.dirty) return;
    await tx.setMeta(FAULTS_META_KEY, this.faults.serialize());
    this.faults.markClean();
  }

  /** Normalises the error and writes its deferred audits (after the rollback). */
  async fail(error: unknown): Promise<RepositoryError> {
    const err = toRepositoryError(error);
    const audits = deferredAudits.get(err);
    if ((audits && audits.length > 0) || (this.mode !== "remote" && this.faults.dirty)) {
      try {
        await this.store.transaction(async (tx) => {
          for (const audit of audits ?? []) {
            await emitAudit(tx, {
              ...auditInputOf(audit),
              id: this.ids(),
            });
          }
          await this.persistFaults(tx);
        });
      } catch {
        // Best effort: the original error is what the caller needs.
      }
    }
    return err;
  }
}

function firstId(input: Record<string, unknown>): string | null {
  for (const key of [
    "reviewId",
    "referralId",
    "followUpId",
    "screeningId",
    "taskId",
    "patientId",
    "facilityId",
  ]) {
    const value = input[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
}

function auditInputOf(audit: DeferredAudit): Omit<AuditEventInput, "id"> {
  const input: Omit<AuditEventInput, "id"> = {
    action: audit.action,
    actorId: audit.actor ? audit.actor.actorId : audit.actorId,
    actorRole: audit.actor ? audit.actor.actorRole : audit.actorRole,
    entityType: audit.entityType,
    entityId: audit.entityId,
    occurredAt: audit.occurredAt,
    correlationId: audit.correlationId ?? asId<CorrelationId>(`corr-${audit.entityId}`),
    outcome: audit.outcome ?? "success",
    facilityId: audit.facilityId ?? null,
    districtId: audit.districtId ?? null,
    patientId: audit.patientId ?? null,
    changeSummary: audit.changeSummary ?? {},
    justification: audit.justification ?? null,
  };
  if (audit.before !== undefined) input.before = audit.before;
  if (audit.after !== undefined) input.after = audit.after;
  return input;
}

type ScopeColumns = {
  facilityId: FacilityId | null;
  districtId: DistrictId | null;
  patientId: PatientId | null;
};

export type AuthorizeTarget = {
  entityType: EntityType;
  entityId: string;
  /** Audit action written on denial (default `access.denied`). */
  denyAction?: AuditAction;
  /** Maps a `SCOPE` denial to a more specific reason (e.g. `TASK_REASSIGNED`). */
  scopeReason?: ErrorReason;
};

/** Per-transaction context handed to services. */
export class TxContext {
  readonly engine: Engine;
  readonly tx: StoreAdapter;
  readonly actor: ActorContext | null;
  readonly now: Date;
  readonly nowIso: string;
  readonly facilities: readonly Facility[];
  readonly facilityToDistrict: Readonly<Record<string, DistrictId>>;
  private correlation: CorrelationId | null = null;

  constructor(
    engine: Engine,
    tx: StoreAdapter,
    actor: ActorContext | null,
    now: Date,
    facilities: readonly Facility[],
  ) {
    this.engine = engine;
    this.tx = tx;
    this.actor = actor;
    this.now = now;
    this.nowIso = now.toISOString();
    this.facilities = facilities;
    this.facilityToDistrict = Object.fromEntries(facilities.map((f) => [f.id, f.districtId]));
  }

  get ids(): IdGenerator {
    return this.engine.ids;
  }

  get actorId(): PersonaId | null {
    return this.actor?.personaId ?? null;
  }

  /** The signed-in actor (writes need one). */
  requireActor(): ActorContext {
    if (!this.actor) {
      throw new RepositoryError("FORBIDDEN", {
        reason: "ROLE",
        details: { unauthenticated: true },
      });
    }
    return this.actor;
  }

  /** Scope columns of a resource (district derived from the facility via the stored map). */
  scopeOf(resource: ScopedResource): ScopeColumns {
    const facilityId = resource.facilityId ?? null;
    const districtId =
      resource.districtId ?? (facilityId ? (this.facilityToDistrict[facilityId] ?? null) : null);
    return { facilityId, districtId, patientId: resource.patientId ?? null };
  }

  /** `checkAccess` with the stored facility map; denial → deferred audit + `FORBIDDEN`. */
  authorize(
    permission: Permission | null,
    resource: ScopedResource | undefined,
    target: AuthorizeTarget,
  ): void {
    const scope = this.scopeOf(resource ?? {});
    const deny = (reason: ErrorReason, extra: { [key: string]: JsonValue } = {}): never => {
      const error = new RepositoryError("FORBIDDEN", {
        reason,
        details: { permission: permission ?? null, ...extra },
      });
      throw defer(error, {
        action: target.denyAction ?? "access.denied",
        entityType: target.entityType,
        entityId: target.entityId,
        outcome: "denied",
        ...scope,
        changeSummary: { permission: permission ?? null, reason },
        actorId: this.actor?.personaId ?? null,
        actorRole: this.actor?.role ?? null,
        occurredAt: this.nowIso,
      });
    };
    if (!this.actor) return deny("ROLE", { unauthenticated: true });
    if (permission === null) {
      if (this.actor.deviceSessionStatus === "revoked") deny("SESSION_REVOKED");
      return;
    }
    const decision = checkAccess(this.actor, permission, resource, {
      facilityToDistrict: this.facilityToDistrict,
    });
    if (!decision.allowed) {
      // A more specific reason only when the record itself is in scope (assignment mismatch).
      const specific =
        decision.reason === "SCOPE" &&
        target.scopeReason !== undefined &&
        isResourceInScope(this.actor.scope, scope, this.facilityToDistrict);
      deny(specific && target.scopeReason ? target.scopeReason : decision.reason);
    }
  }

  /** Boolean scope check for list filtering (no audit). */
  can(permission: Permission, resource: ScopedResource): boolean {
    if (!this.actor) return false;
    return checkAccess(this.actor, permission, resource, {
      facilityToDistrict: this.facilityToDistrict,
    }).allowed;
  }

  /** Simulated remote: a revoked device gets `FORBIDDEN` reason `DEVICE_REVOKED`. */
  assertDeviceActive(entityType: EntityType): void {
    const revoked =
      this.engine.faults.get().deviceRevoked || this.actor?.deviceSessionStatus === "revoked";
    if (!revoked) return;
    const error = new RepositoryError("FORBIDDEN", { reason: "DEVICE_REVOKED" });
    throw defer(error, {
      action: "access.denied",
      entityType,
      entityId: this.actor?.deviceSessionId ?? "device",
      outcome: "denied",
      changeSummary: { reason: "DEVICE_REVOKED" },
      actorId: this.actor?.personaId ?? null,
      actorRole: this.actor?.role ?? null,
      occurredAt: this.nowIso,
    });
  }

  collectionOf(entityType: EntityType): LocalCollectionName {
    return ENTITY_COLLECTIONS[entityType];
  }

  async find<T>(entityType: EntityType, id: string): Promise<T | undefined> {
    return this.tx.get<T>(this.collectionOf(entityType), id);
  }

  async load<T>(entityType: EntityType, id: string): Promise<T> {
    const found = await this.find<T>(entityType, id);
    if (found === undefined) {
      throw new RepositoryError("NOT_FOUND", { details: { entityType, entityId: id } });
    }
    return found;
  }

  async all<T>(entityType: EntityType): Promise<T[]> {
    return this.tx.getAll<T>(this.collectionOf(entityType));
  }

  async save<T extends { id: string }>(entityType: EntityType, entity: T): Promise<T> {
    const json = toJson(entity);
    await this.tx.put(this.collectionOf(entityType), json);
    return json;
  }

  /** `{ ...entity, ...patch, version + 1, updatedAt: now }` (pipeline step f). */
  touch<T extends Versioned>(entity: T, patch: Partial<T> = {}): T {
    return { ...entity, ...patch, version: entity.version + 1, updatedAt: this.nowIso };
  }

  /** Base fields of a new persisted record (version 1, demo-clock timestamps, synthetic). */
  created(): { version: 1; createdAt: string; updatedAt: string; synthetic: true } {
    return { version: 1, createdAt: this.nowIso, updatedAt: this.nowIso, synthetic: true };
  }

  /** Correlation of an entity: from its earliest audit event (propagated along WF-01). */
  async correlationOf(entityId: string): Promise<CorrelationId | null> {
    const events = await this.tx.getAll<AuditEvent>("auditEvents");
    let best: AuditEvent | null = null;
    for (const event of events) {
      if (event.entityId !== entityId || event.category !== "change") continue;
      if (best === null || event.occurredAt < best.occurredAt) best = event;
    }
    return best?.correlationId ?? null;
  }

  /** The correlation used for this write's audit events (set explicitly or generated once). */
  useCorrelation(correlationId: CorrelationId | null): CorrelationId {
    if (correlationId !== null) this.correlation = correlationId;
    this.correlation ??= asId<CorrelationId>(this.ids());
    return this.correlation;
  }

  /** Latest change actor/time of an entity (conflict `changedBy` / `changedAt`). */
  async lastChange(entityId: string): Promise<{ by: string | null; at: string } | null> {
    const events = await this.tx.getAll<AuditEvent>("auditEvents");
    let latest: AuditEvent | null = null;
    for (const event of events) {
      if (event.entityId !== entityId) continue;
      if (event.category !== "change" && event.category !== "demo") continue;
      if (latest === null || event.occurredAt >= latest.occurredAt) latest = event;
    }
    return latest ? { by: latest.actorId, at: latest.occurredAt } : null;
  }

  /**
   * Optimistic concurrency: `CONFLICT` (409) with `latest` when `expectedVersion` is stale, or
   * when a `conflictOnce` fault targets this entity (not on the worker device store: there the
   * fault applies to the simulated remote). Writes a deferred `conflict.detected` audit.
   */
  async assertVersion<T extends Versioned>(
    entityType: EntityType,
    entity: T,
    expectedVersion: number,
    resource: ScopedResource = {},
  ): Promise<void> {
    const forced =
      this.engine.mode !== "local-sync" &&
      this.engine.faults.consumeConflictOnce(entityType, entity.id);
    if (!forced && entity.version === expectedVersion) return;
    const change = await this.lastChange(entity.id);
    const conflict: ConflictDetails<T> = {
      entityType,
      entityId: entity.id,
      expectedVersion,
      currentVersion: entity.version,
      latest: entity,
    };
    if (change?.by) conflict.changedBy = change.by;
    if (change) conflict.changedAt = change.at;
    const error = new RepositoryError("CONFLICT", {
      conflict: conflict,
      details: { simulated: forced },
    });
    throw defer(error, {
      action: "conflict.detected",
      entityType,
      entityId: entity.id,
      ...this.scopeOf(resource),
      changeSummary: { expectedVersion, currentVersion: entity.version, simulated: forced },
      actorId: this.actor?.personaId ?? null,
      actorRole: this.actor?.role ?? null,
      occurredAt: this.nowIso,
    });
  }

  /** Appends an audit event inside this transaction (pipeline step g). */
  async audit(draft: AuditDraft): Promise<AuditEvent> {
    const source = (draft.after ?? draft.before) as
      | {
          facilityId?: FacilityId | null;
          districtId?: DistrictId | null;
          patientId?: PatientId | null;
          id?: string;
        }
      | undefined;
    const fromEntity: ScopedResource = {
      facilityId: draft.facilityId ?? source?.facilityId ?? null,
      districtId: draft.districtId ?? source?.districtId ?? null,
      patientId:
        draft.patientId ??
        source?.patientId ??
        (draft.entityType === "patient" ? asId<PatientId>(draft.entityId) : null),
    };
    const scope = this.scopeOf(fromEntity);
    const input: AuditEventInput = {
      id: this.ids(),
      action: draft.action,
      actorId: draft.actor ? draft.actor.actorId : (this.actor?.personaId ?? null),
      actorRole: draft.actor ? draft.actor.actorRole : (this.actor?.role ?? null),
      entityType: draft.entityType,
      entityId: draft.entityId,
      occurredAt: this.nowIso,
      correlationId: draft.correlationId ?? this.useCorrelation(null),
      outcome: draft.outcome ?? "success",
      ...scope,
      changeSummary: draft.changeSummary ?? {},
      justification: draft.justification ?? null,
    };
    if (draft.before !== undefined) input.before = draft.before;
    if (draft.after !== undefined) input.after = draft.after;
    return emitAudit(this.tx, input);
  }

  /**
   * Sensitive-read access audit (CL-08), de-duplicated per actor + entity per minute of demo
   * clock (meta key `audit.access.<actor>.<entity>`), to keep the log readable.
   */
  async auditAccess(draft: Omit<AuditDraft, "outcome">): Promise<void> {
    const minute = String(Math.floor(this.now.getTime() / 60_000));
    const metaKey = `audit.access.${this.actorId ?? "anonymous"}.${draft.action}.${draft.entityId}`;
    if ((await this.tx.getMeta(metaKey)) === minute) return;
    await this.tx.setMeta(metaKey, minute);
    await this.audit({
      ...draft,
      correlationId: draft.correlationId ?? asId<CorrelationId>(this.ids()),
    });
  }
}
