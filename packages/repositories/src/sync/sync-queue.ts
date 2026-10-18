/**
 * The sync queue — THE only sync design (FND-07 task 8; HWM-02 wires it, HWM-09/10 build UI).
 *
 * - Local writes are committed immediately ("Saved on this device") and, in the same
 *   transaction, enqueue a `SyncOperation` (`localSeq` from the meta counter `sync.localSeq`,
 *   never device time; `idempotencyKey` = the write's key, stable across retries / restarts;
 *   `baseVersion` = the input's `expectedVersion`). Drafts are never enqueued.
 * - `process()` sends ops in `localSeq` order through the fault-injected transport to the
 *   simulated remote. It is single-flight (concurrent callers await the same run) and records
 *   one `syncRuns` row per run. Offline → nothing is sent, ops stay `queued`.
 * - Ordering: an op with `dependsOnOpId` waits for that op's ack (screening after its pending
 *   `patient` create); ops on the same entity wait while an earlier op on it is unresolved.
 * - Chain rule: after an ack, the next queued op on the same entity that was created against
 *   the just-acknowledged LOCAL version gets its `baseVersion` (and payload `expectedVersion`)
 *   rewritten to the acked `entityVersion`; a remote change in between still yields CONFLICT.
 * - Outcomes: ack → `acknowledged` (+ local row replaced by the remote snapshot when no later op
 *   on it is pending); `CONFLICT` → `conflict → needs_resolution` with `serverSnapshot`;
 *   `VALIDATION_ERROR` / `FORBIDDEN` / `NOT_FOUND` → `rejected` (kept); `FORBIDDEN`
 *   `DEVICE_REVOKED` → this and every waiting op `blocked_revoked` until `restoreDevice()`;
 *   `TIMEOUT` / `INTERNAL` / `DEPENDENCY_UNAVAILABLE` / `OFFLINE` → `retryable_failure` with
 *   backoff `min(60 s, 2 s·2^(attempt−1)) ± 20 %` (seeded jitter, demo clock) and a
 *   `sync.retry_scheduled` audit; auto-retry stops after 8 attempts (`retryNow` still works).
 *   HWM-09: a per-op server error (`INTERNAL`) does not stop the run — the other ops are still
 *   tried; an unreachable server (`TIMEOUT` / `DEPENDENCY_UNAVAILABLE` / `OFFLINE`) ends it.
 * - Runs that have something to send (or are manual) are audited `sync.run_started` /
 *   `sync.run_finished` (HWM-09; idle automatic runs only leave their `syncRuns` row).
 * - Conflict resolution (HWM-09, WF-02 steps 4–5): `reapply_on_latest` enqueues a NEW op
 *   (`resolvesOpId`, new idempotency key, `baseVersion` = latest); `keep_latest` refreshes the
 *   local row from the server snapshot and enqueues a `sync_operation:command` resolution notice
 *   (entity id = the original op id) so the simulated server mirrors the decision. The remote
 *   audits `sync.conflict_resolved` with the ORIGINAL op id for both choices (on the notice, or
 *   on applying the re-applied op).
 * - On startup `sending` ops are reset to `queued` (crash recovery). No op is ever deleted.
 */
import { IdempotencyKey, optionalNote, type WriteResult } from "@laif/contracts";
import { restoreDeviceSession, revokeDeviceSession } from "@laif/auth-demo";
import {
  asId,
  CONFLICT_RESOLUTIONS,
  type AuditEvent,
  fnv1a64Hex,
  syncOperationMachine,
  SYNC_OP_STATUSES,
  type DeviceSession,
  type JsonValue,
  type SyncOpStatus,
  type SyncOperation,
  type SyncOperationId,
} from "@laif/domain";
import { z } from "zod";

import type {
  SyncApi,
  SyncOpListFilter,
  SyncRun,
  SyncStatus,
  SyncTrigger,
} from "../care-repository.ts";
import type { Engine, MutationOutcome, TxContext, Versioned } from "../core/engine.ts";
import { toJson } from "../core/engine.ts";
import { RepositoryError, toRepositoryError } from "../errors.ts";
import { createPrng, type FaultInjector } from "../transport/faults.ts";
import { simulateTransport, type Sleep } from "../transport/simulated.ts";
import type { SimulatedRemote } from "./simulated-remote.ts";

export const LOCAL_SEQ_META_KEY = "sync.localSeq" as const;
const localVersionKey = (opId: string): string => `sync.localVersion.${opId}`;

export const SYNC_MAX_AUTO_ATTEMPTS = 8;
export const SYNC_BACKOFF_BASE_MS = 2_000;
export const SYNC_BACKOFF_MAX_MS = 60_000;
export const SYNC_BACKOFF_JITTER = 0.2;

/** Settled = never sent again. */
const SETTLED: ReadonlySet<SyncOpStatus> = new Set(["acknowledged", "superseded", "rejected"]);
/** Unresolved = blocks later ops on the same entity. */
const BLOCKING: ReadonlySet<SyncOpStatus> = new Set([
  "queued",
  "sending",
  "retryable_failure",
  "conflict",
  "needs_resolution",
  "blocked_revoked",
]);

/** `min(60 s, 2 s · 2^(attempt−1)) ± 20 %`, jitter seeded by op id + attempt (deterministic). */
export function backoffMs(attempt: number, opId: string): number {
  const base = Math.min(SYNC_BACKOFF_MAX_MS, SYNC_BACKOFF_BASE_MS * 2 ** Math.max(0, attempt - 1));
  const random = createPrng(Number.parseInt(fnv1a64Hex(`${opId}#${attempt}`).slice(0, 8), 16))();
  return Math.round(base * (1 + (random * 2 - 1) * SYNC_BACKOFF_JITTER));
}

const byLocalSeq = (a: SyncOperation, b: SyncOperation): number => a.localSeq - b.localSeq;

export type SyncQueue = {
  api: SyncApi;
  /** Pipeline hook (Engine.enqueue). */
  enqueue: NonNullable<Engine["enqueue"]>;
  /** Startup crash recovery inside an init transaction. */
  recover(tx: TxContext["tx"]): Promise<void>;
};

type SendOutcome =
  | "acknowledged"
  | "duplicate"
  | "retryable"
  /** Retryable server error on this op only (`INTERNAL`): the run goes on with other ops. */
  | "server_error"
  | "conflict"
  | "rejected"
  | "revoked";

/** Op ids an audit event's `changeSummary` refers to (sync history of an op). */
const OP_REF_FIELDS = ["opId", "originalOpId", "newOpId", "noticeOpId"] as const;
/** Audit actions that make up an op's sync history. */
const HISTORY_ACTION_PREFIXES = ["sync.", "conflict."] as const;

export function createSyncQueue(options: {
  engine: Engine;
  remote: SimulatedRemote | null;
  faults: FaultInjector;
  sleep: Sleep;
}): SyncQueue {
  const { engine, remote, faults, sleep } = options;
  let inflight: Promise<SyncRun> | null = null;

  async function nextSeq(ctx: TxContext): Promise<number> {
    const seq = Number((await ctx.tx.getMeta(LOCAL_SEQ_META_KEY)) ?? "0") + 1;
    await ctx.tx.setMeta(LOCAL_SEQ_META_KEY, String(seq));
    return seq;
  }

  async function insertOp(
    ctx: TxContext,
    spec: {
      entityType: SyncOperation["entityType"];
      entityId: string;
      opType: SyncOperation["opType"];
      key: string;
      payload: JsonValue;
      localVersion: number;
      resolvesOpId?: SyncOperationId | null;
      baseVersion?: number | null;
    },
  ): Promise<SyncOperation> {
    const ops = await ctx.tx.getAll<SyncOperation>("syncOperations");
    const pending = ops.filter((o) => !SETTLED.has(o.status)).sort(byLocalSeq);
    const payload = (spec.payload ?? {}) as Record<string, unknown>;
    const patientId = typeof payload["patientId"] === "string" ? payload["patientId"] : null;
    const dependency =
      pending.find(
        (o) =>
          o.opType === "create" &&
          o.entityId !== spec.entityId &&
          o.entityType === "patient" &&
          o.entityId === patientId,
      ) ?? null;
    const expected = payload["expectedVersion"];
    const op: SyncOperation = {
      id: asId<SyncOperationId>(ctx.ids()),
      clientMutationId: ctx.ids(),
      idempotencyKey: spec.key,
      localSeq: await nextSeq(ctx),
      entityType: spec.entityType,
      entityId: spec.entityId,
      opType: spec.opType,
      payload: spec.payload,
      baseVersion:
        spec.baseVersion !== undefined
          ? spec.baseVersion
          : typeof expected === "number"
            ? expected
            : null,
      dependsOnOpId: dependency?.id ?? null,
      resolvesOpId: spec.resolvesOpId ?? null,
      status: "queued",
      attempts: 0,
      nextAttemptAt: null,
      lastError: null,
      deviceTimestamp: ctx.nowIso,
      serverSnapshot: null,
      correlationId: ctx.useCorrelation(null),
      ...ctx.created(),
    };
    await ctx.tx.put("syncOperations", op);
    await ctx.tx.setMeta(localVersionKey(op.id), String(spec.localVersion));
    return op;
  }

  const enqueue: SyncQueue["enqueue"] = async (ctx, op, key, payload, localVersion) => {
    await insertOp(ctx, { ...op, key, payload, localVersion });
  };

  async function recover(tx: TxContext["tx"]): Promise<void> {
    for (const op of await tx.getAll<SyncOperation>("syncOperations")) {
      // Crash recovery: an op interrupted mid-send is resent (idempotency makes it safe).
      if (op.status === "sending") await tx.put("syncOperations", { ...op, status: "queued" });
    }
  }

  function setStatus(
    op: SyncOperation,
    to: SyncOpStatus,
    ctx: TxContext,
    patch: Partial<SyncOperation> = {},
  ): SyncOperation {
    syncOperationMachine.assert(op.status, to);
    return ctx.touch(op, { ...patch, status: to });
  }

  async function blockWaiting(ctx: TxContext): Promise<number> {
    let blocked = 0;
    for (const op of await ctx.tx.getAll<SyncOperation>("syncOperations")) {
      if (op.status !== "queued" && op.status !== "retryable_failure") continue;
      await ctx.tx.put("syncOperations", setStatus(op, "blocked_revoked", ctx));
      blocked += 1;
    }
    return blocked;
  }

  /** Picks the next sendable op (see header ordering rules). */
  async function nextOp(skip: ReadonlySet<string>): Promise<SyncOperation | null> {
    const ops = (await engine.store.getAll<SyncOperation>("syncOperations")).sort(byLocalSeq);
    const byId = new Map(ops.map((o) => [o.id, o]));
    const blockedEntities = new Set<string>();
    const now = engine.clock.now().getTime();
    for (const op of ops) {
      if (SETTLED.has(op.status)) continue;
      const blocked = blockedEntities.has(op.entityId);
      blockedEntities.add(op.entityId);
      if (blocked || skip.has(op.id)) continue;
      if (op.status !== "queued" && op.status !== "retryable_failure") continue;
      if (op.status === "retryable_failure") {
        if (op.attempts >= SYNC_MAX_AUTO_ATTEMPTS) continue;
        if (op.nextAttemptAt !== null && Date.parse(op.nextAttemptAt) > now) continue;
      }
      if (op.dependsOnOpId !== null && byId.get(op.dependsOnOpId)?.status !== "acknowledged") {
        continue;
      }
      return op;
    }
    return null;
  }

  async function send(opId: string): Promise<SendOutcome> {
    const sending = await engine.write(async (ctx) => {
      let op = await ctx.load<SyncOperation>("sync_operation", opId);
      if (op.status === "retryable_failure") op = setStatus(op, "queued", ctx);
      const next = { ...setStatus(op, "sending", ctx), attempts: op.attempts + 1 };
      await ctx.tx.put("syncOperations", next);
      return next;
    });

    let response: WriteResult<Versioned> | null = null;
    let failure: RepositoryError | null = null;
    try {
      if (!remote)
        throw new RepositoryError("DEPENDENCY_UNAVAILABLE", { details: { remote: false } });
      response = await simulateTransport(faults, sleep, () => remote.apply(sending));
    } catch (error) {
      failure = toRepositoryError(error);
    }

    return engine.write(async (ctx) => {
      const op = await ctx.load<SyncOperation>("sync_operation", opId);
      if (response) return acknowledge(ctx, op, response);
      const error = failure ?? new RepositoryError("INTERNAL");
      const lastError = { code: error.code, reason: error.reason ?? null };
      if (error.code === "CONFLICT") {
        const conflicted = setStatus(op, "conflict", ctx, { lastError });
        const latest = (error.conflict?.latest ?? null) as JsonValue;
        await ctx.tx.put(
          "syncOperations",
          setStatus(conflicted, "needs_resolution", ctx, { serverSnapshot: toJson(latest) }),
        );
        await ctx.audit({
          action: "conflict.detected",
          entityType: op.entityType,
          entityId: op.entityId,
          correlationId: op.correlationId,
          changeSummary: {
            opId: op.id,
            baseVersion: op.baseVersion,
            currentVersion: error.conflict?.currentVersion ?? null,
            // HWM-09 conflict screen: who / when changed it on the server.
            changedBy: error.conflict?.changedBy ?? null,
            changedAt: error.conflict?.changedAt ?? null,
          },
        });
        return "conflict";
      }
      if (error.code === "FORBIDDEN" && error.reason === "DEVICE_REVOKED") {
        await ctx.tx.put("syncOperations", setStatus(op, "retryable_failure", ctx, { lastError }));
        await blockWaiting(ctx);
        return "revoked";
      }
      if (error.retryable) {
        const delay = backoffMs(op.attempts, op.id);
        const nextAttemptAt = new Date(ctx.now.getTime() + delay).toISOString();
        await ctx.tx.put(
          "syncOperations",
          setStatus(op, "retryable_failure", ctx, { lastError, nextAttemptAt }),
        );
        const exhausted = op.attempts >= SYNC_MAX_AUTO_ATTEMPTS;
        await ctx.audit({
          action: "sync.retry_scheduled",
          entityType: op.entityType,
          entityId: op.entityId,
          correlationId: op.correlationId,
          changeSummary: {
            opId: op.id,
            attempt: op.attempts,
            code: error.code,
            // After the last automatic attempt only "Retry now" sends it again.
            nextAttemptAt: exhausted ? null : nextAttemptAt,
            autoRetryExhausted: exhausted,
          },
        });
        return error.code === "INTERNAL" ? "server_error" : "retryable";
      }
      await ctx.tx.put("syncOperations", setStatus(op, "rejected", ctx, { lastError }));
      await ctx.audit({
        action: "sync.op_rejected",
        entityType: op.entityType,
        entityId: op.entityId,
        correlationId: op.correlationId,
        changeSummary: { opId: op.id, code: error.code, reason: error.reason ?? null },
      });
      return "rejected";
    });
  }

  async function acknowledge(
    ctx: TxContext,
    op: SyncOperation,
    response: WriteResult<Versioned>,
  ): Promise<SendOutcome> {
    const snapshot = toJson(response.data) as unknown as JsonValue;
    await ctx.tx.put(
      "syncOperations",
      setStatus(op, "acknowledged", ctx, {
        lastError: null,
        nextAttemptAt: null,
        serverSnapshot: snapshot,
      }),
    );
    const ops = (await ctx.tx.getAll<SyncOperation>("syncOperations")).sort(byLocalSeq);
    const later = ops.filter(
      (o) => o.entityId === op.entityId && o.localSeq > op.localSeq && BLOCKING.has(o.status),
    );
    const ackedLocal = Number((await ctx.tx.getMeta(localVersionKey(op.id))) ?? "NaN");
    const next = later[0];
    if (next && (next.status === "queued" || next.status === "retryable_failure")) {
      if (next.baseVersion !== null && next.baseVersion === ackedLocal) {
        const payload = { ...(next.payload as Record<string, JsonValue>) };
        if (typeof payload["expectedVersion"] === "number") {
          payload["expectedVersion"] = response.entityVersion;
        }
        await ctx.tx.put("syncOperations", {
          ...next,
          baseVersion: response.entityVersion,
          payload,
        });
      }
    }
    if (later.length === 0 && response.data.id === op.entityId) {
      // Nothing local pending on it: the remote snapshot becomes the local row (only when the
      // remote kept the device's id — a differently-keyed copy would duplicate the record).
      await ctx.save(op.entityType, response.data);
    }
    await ctx.audit({
      action: "sync.op_acknowledged",
      entityType: op.entityType,
      entityId: op.entityId,
      correlationId: op.correlationId,
      changeSummary: {
        opId: op.id,
        entityVersion: response.entityVersion,
        replayed: response.replayed,
        // HWM-09 "Synced recently": the server's event id (short form in the UI).
        serverEventId: response.eventId,
      },
    });
    return response.replayed ? "duplicate" : "acknowledged";
  }

  async function run(trigger: SyncTrigger): Promise<SyncRun> {
    await engine.ready();
    const startedAt = engine.clock.nowIso();
    const runId = engine.ids();
    const counts = {
      attempted: 0,
      acknowledged: 0,
      duplicates: 0,
      retryableFailures: 0,
      conflicts: 0,
      rejected: 0,
      blocked: 0,
    };
    const offline = faults.get().offline;
    const audited =
      trigger === "manual" ||
      trigger === "manual_dev" ||
      (!offline && (await nextOp(new Set())) !== null);
    if (audited) {
      await engine.write(async (ctx) => {
        await ctx.audit({
          action: "sync.run_started",
          entityType: "sync_operation",
          entityId: runId,
          changeSummary: { runId, trigger, offline },
        });
      });
    }
    if (!offline) {
      const skip = new Set<string>();
      for (;;) {
        if (faults.get().offline) break;
        const op = await nextOp(skip);
        if (!op) break;
        skip.add(op.id);
        counts.attempted += 1;
        const outcome = await send(op.id);
        if (outcome === "acknowledged") counts.acknowledged += 1;
        if (outcome === "duplicate") {
          counts.acknowledged += 1;
          counts.duplicates += 1;
        }
        if (outcome === "conflict") counts.conflicts += 1;
        if (outcome === "rejected") counts.rejected += 1;
        if (outcome === "server_error") counts.retryableFailures += 1;
        if (outcome === "retryable") {
          counts.retryableFailures += 1;
          break;
        }
        if (outcome === "revoked") {
          counts.blocked += 1;
          break;
        }
      }
    }
    return engine.write(async (ctx) => {
      const row: SyncRun = {
        id: runId,
        trigger,
        startedAt,
        finishedAt: ctx.nowIso,
        offline,
        ...counts,
        ...ctx.created(),
      };
      await ctx.tx.put("syncRuns", row);
      if (audited) {
        await ctx.audit({
          action: "sync.run_finished",
          entityType: "sync_operation",
          entityId: runId,
          changeSummary: { runId, trigger, offline, ...counts },
        });
      }
      return row;
    });
  }

  async function requireNeedsResolution(ctx: TxContext, opId: string): Promise<SyncOperation> {
    const op = await ctx.load<SyncOperation>("sync_operation", opId);
    if (op.status !== "needs_resolution") {
      throw new RepositoryError("VALIDATION_ERROR", {
        reason: "INVALID_TRANSITION",
        details: { status: op.status },
      });
    }
    return op;
  }

  const ResolveSchema = z.object({
    idempotencyKey: IdempotencyKey,
    opId: z.string().trim().min(1),
    resolution: z.enum(CONFLICT_RESOLUTIONS),
    note: optionalNote(),
  });

  async function setDeviceStatus(ctx: TxContext, status: "active" | "revoked"): Promise<void> {
    const sessionId = ctx.actor?.deviceSessionId;
    if (!sessionId) return;
    const update = async (
      tx: TxContext["tx"],
      collection: "deviceSessions" | "remote_deviceSessions",
    ) => {
      const session = await tx.get<DeviceSession>(collection, sessionId);
      if (!session) return;
      const next =
        status === "revoked"
          ? revokeDeviceSession(session, { now: ctx.now })
          : restoreDeviceSession(session, { now: ctx.now });
      await tx.put(collection, next);
    };
    await update(ctx.tx, "deviceSessions");
    if (remote) await update(ctx.tx, "remote_deviceSessions");
  }

  const api: SyncApi = {
    async list(filter: SyncOpListFilter = {}) {
      await engine.ready();
      const ops = (await engine.store.getAll<SyncOperation>("syncOperations")).sort(byLocalSeq);
      return ops.filter(
        (o) =>
          (!filter.statuses || filter.statuses.includes(o.status)) &&
          (!filter.entityId || o.entityId === filter.entityId),
      );
    },

    async getStatus(): Promise<SyncStatus> {
      await engine.ready();
      const ops = await engine.store.getAll<SyncOperation>("syncOperations");
      const runs = await engine.store.getAll<SyncRun>("syncRuns");
      const byStatus = Object.fromEntries(SYNC_OP_STATUSES.map((s) => [s, 0])) as Record<
        SyncOpStatus,
        number
      >;
      for (const op of ops) byStatus[op.status] += 1;
      const sorted = [...runs].sort((a, b) =>
        a.finishedAt === b.finishedAt
          ? a.id < b.id
            ? -1
            : 1
          : a.finishedAt < b.finishedAt
            ? -1
            : 1,
      );
      const lastRun = sorted[sorted.length - 1] ?? null;
      const lastSynced = [...sorted].reverse().find((r) => r.acknowledged > 0) ?? null;
      const config = faults.get();
      return {
        offline: config.offline,
        deviceRevoked: config.deviceRevoked,
        processing: inflight !== null,
        total: ops.length,
        pending:
          byStatus.queued +
          byStatus.sending +
          byStatus.retryable_failure +
          byStatus.blocked_revoked,
        byStatus,
        needsDecision: byStatus.conflict + byStatus.needs_resolution,
        lastRun,
        lastSyncedAt: lastSynced?.finishedAt ?? null,
      };
    },

    process(options = {}) {
      inflight ??= run(options.trigger ?? "manual").finally(() => {
        inflight = null;
      });
      return inflight;
    },

    async retryNow(opId: string) {
      return engine.write(async (ctx) => {
        const op = await ctx.load<SyncOperation>("sync_operation", opId);
        if (op.status === "blocked_revoked" && faults.get().deviceRevoked) {
          throw new RepositoryError("FORBIDDEN", { reason: "DEVICE_REVOKED" });
        }
        if (op.status !== "retryable_failure" && op.status !== "blocked_revoked") {
          throw new RepositoryError("VALIDATION_ERROR", {
            reason: "INVALID_TRANSITION",
            details: { status: op.status },
          });
        }
        const next = setStatus(op, "queued", ctx, { nextAttemptAt: null });
        await ctx.tx.put("syncOperations", next);
        return next;
      });
    },

    resolveConflict(opId, resolution, key, note) {
      return engine.mutate({
        op: "resolveConflict",
        key,
        input: { opId, resolution, ...(note !== undefined ? { note } : {}) },
        entityType: "sync_operation",
        permission: null,
        schema: ResolveSchema,
        run: async (ctx, input): Promise<MutationOutcome<SyncOperation>> => {
          const op = await requireNeedsResolution(ctx, input.opId);
          const superseded = setStatus(op, "superseded", ctx);
          await ctx.tx.put("syncOperations", superseded);
          const latest = op.serverSnapshot as (Versioned & Record<string, JsonValue>) | null;
          let created: SyncOperation | null = null;
          let notice: SyncOperation | null = null;
          ctx.useCorrelation(op.correlationId);
          if (input.resolution === "reapply_on_latest") {
            const payload: Record<string, JsonValue> = {
              ...(op.payload as Record<string, JsonValue>),
              idempotencyKey: key,
            };
            if (latest && typeof payload["expectedVersion"] === "number") {
              payload["expectedVersion"] = latest.version;
            }
            const local = await ctx.find<Versioned>(op.entityType, op.entityId);
            created = await insertOp(ctx, {
              entityType: op.entityType,
              entityId: op.entityId,
              opType: op.opType,
              key,
              payload,
              localVersion: local?.version ?? latest?.version ?? 0,
              resolvesOpId: op.id,
              baseVersion: latest?.version ?? op.baseVersion,
            });
          } else {
            // keep_latest: the device row becomes the server copy; the withdrawn payload stays
            // on the superseded op (never deleted).
            if (latest) await ctx.save(op.entityType, latest);
            // Nothing is re-sent for the entity; a resolution notice tells the server (HWM-09).
            notice = await insertOp(ctx, {
              entityType: "sync_operation",
              entityId: op.id,
              opType: "command",
              key,
              payload: {
                idempotencyKey: key,
                opId: op.id,
                resolution: input.resolution,
                entityType: op.entityType,
                entityId: op.entityId,
                latestVersion: latest?.version ?? null,
                ...(input.note !== undefined ? { note: input.note } : {}),
              },
              localVersion: 0,
              baseVersion: null,
            });
          }
          const event = await ctx.audit({
            action: "sync.conflict_resolved",
            entityType: op.entityType,
            entityId: op.entityId,
            changeSummary: {
              originalOpId: op.id,
              resolution: input.resolution,
              newOpId: created?.id ?? null,
              noticeOpId: notice?.id ?? null,
              latestVersion: latest?.version ?? null,
            },
            justification: input.note ?? null,
          });
          return {
            data: created ?? superseded,
            entityType: "sync_operation",
            auditEventId: event.id,
            sync: null,
          };
        },
      });
    },

    async history(opIds: string | readonly string[]) {
      await engine.ready();
      const requested = typeof opIds === "string" ? [opIds] : opIds;
      // Only ops of this device's own queue; only sync bookkeeping events (no domain audit).
      const own = new Set(
        (await engine.store.getAll<SyncOperation>("syncOperations")).map((op) => op.id as string),
      );
      const wanted = new Set<unknown>(requested.filter((id) => own.has(id)));
      if (wanted.size === 0) return [];
      const events = await engine.store.getAll<AuditEvent>("auditEvents");
      return (
        events
          .filter((event) => {
            if (!HISTORY_ACTION_PREFIXES.some((prefix) => event.action.startsWith(prefix))) {
              return false;
            }
            const summary = event.changeSummary;
            if (summary === null || typeof summary !== "object" || Array.isArray(summary)) {
              return false;
            }
            return OP_REF_FIELDS.some((field) => wanted.has(summary[field]));
          })
          // Stable: same-instant events keep their write order.
          .sort((a, b) => (a.occurredAt < b.occurredAt ? -1 : a.occurredAt > b.occurredAt ? 1 : 0))
          // Free text (e.g. a resolution note) is never part of the sync history.
          .map((event) => ({ ...event, justification: null }))
      );
    },

    async simulateRemoteEdit(entityType, id, patch) {
      if (!remote) {
        throw new RepositoryError("DEPENDENCY_UNAVAILABLE", { details: { remote: false } });
      }
      await engine.ready();
      return remote.edit(entityType, id, patch);
    },

    async revokeDevice() {
      faults.set({ deviceRevoked: true });
      await engine.write(async (ctx) => {
        await setDeviceStatus(ctx, "revoked");
        const blocked = await blockWaiting(ctx);
        await ctx.audit({
          action: "device.revoked",
          entityType: "device_session",
          entityId: ctx.actor?.deviceSessionId ?? "device",
          changeSummary: { blockedOps: blocked },
        });
      });
    },

    async restoreDevice() {
      faults.set({ deviceRevoked: false });
      await engine.write(async (ctx) => {
        await setDeviceStatus(ctx, "active");
        let restored = 0;
        for (const op of await ctx.tx.getAll<SyncOperation>("syncOperations")) {
          if (op.status !== "blocked_revoked") continue;
          await ctx.tx.put("syncOperations", setStatus(op, "queued", ctx, { nextAttemptAt: null }));
          restored += 1;
        }
        await ctx.audit({
          action: "device.restored",
          entityType: "device_session",
          entityId: ctx.actor?.deviceSessionId ?? "device",
          changeSummary: { restoredOps: restored },
        });
      });
    },
  };

  return { api, enqueue, recover };
}
