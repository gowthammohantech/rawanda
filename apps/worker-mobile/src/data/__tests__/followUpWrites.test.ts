// @vitest-environment node
/**
 * HWM-08 data layer: `recordAttempt()` / `recordOutcome()` over the FND-07 repository + sync
 * queue + simulated remote — transitions, atomicity, `baseVersion`, idempotent submit (T-04),
 * evidence / attempt requirements (T-03), offline → Completed tab "Saved on this device",
 * `conflictOnce` → conflict without overwrite (T-05), dropped ack + retry → one server outcome
 * (T-09), reassigned-while-offline → not accepted (local record kept), client guard.
 */
import type { AuditEvent, FollowUp, SyncOperation } from "@laif/domain";
import { FACILITY_IDS, PERSONA_IDS } from "@laif/mock-data";
import { createMemoryStoreAdapter, type StoreAdapter } from "@laif/repositories";
import { createTestRepository, type TestRepository } from "@laif/test-utils";
import { describe, expect, it } from "vitest";

import {
  initialAttemptValues,
  type AttemptFormValues,
} from "../../features/followup/attemptSchema.ts";
import {
  initialOutcomeValues,
  type OutcomeFormValues,
} from "../../features/followup/outcomeSchema.ts";
import * as writes from "../followUpWrites.ts";
import * as followUps from "../followUps.ts";

const WORKER = PERSONA_IDS.chwAlpha1A;
const SCOPE = { workerId: WORKER, facilityId: FACILITY_IDS.alpha1 };
/** Overdue, `assigned`, no attempts (seed). */
const OVERDUE = "0976e711-6a18-54f8-8984-ed116a248c86";
/** `assigned`, due 12 Oct, no attempts (seed). */
const SECOND = "0052bb44-1f41-562a-8044-d5441f35a4fc";
/** Another worker's task in the same facility. */
const OTHERS = "b35ec1cc-90ce-58ca-b351-dbcc90c40a9c";

const worker = (opts: { offline?: boolean; store?: StoreAdapter } = {}) =>
  createTestRepository({
    appId: "worker",
    persona: WORKER,
    ...(opts.store === undefined ? {} : { store: opts.store }),
    ...(opts.offline === true ? { faults: { offline: true } } : {}),
  });

const local = async (t: TestRepository, id = OVERDUE) =>
  (await t.store.get<FollowUp>("followUps", id))!;
const remote = async (t: TestRepository, id = OVERDUE) =>
  (await t.store.get<FollowUp>("remote_followUps", id))!;
const ops = (t: TestRepository, id = OVERDUE) => t.repo.sync.list({ entityId: id });
const audits = async (
  t: TestRepository,
  action: string,
  c: "auditEvents" | "remote_auditEvents" = "auditEvents",
  id = OVERDUE,
) => (await t.store.getAll<AuditEvent>(c)).filter((e) => e.action === action && e.entityId === id);
const target = (fu: FollowUp) => ({ id: fu.id, version: fu.version });
const now = (t: TestRepository) => t.clock.now();

const attempt = (t: TestRepository, patch: Partial<AttemptFormValues> = {}) => ({
  ...initialAttemptValues(now(t)),
  method: "home_visit" as const,
  result: "not_reached" as const,
  ...patch,
});
const attended = (
  t: TestRepository,
  patch: Partial<OutcomeFormValues> = {},
): OutcomeFormValues => ({
  ...initialOutcomeValues(now(t)),
  outcome: "attended",
  evidenceType: "facility_register_checked",
  ...patch,
});

describe("recordAttempt (HWM-08 task 1)", () => {
  it("reached → assigned → contacted; one op with baseVersion; audit attempt_recorded", async () => {
    const t = await worker({ offline: true });
    const before = await local(t);
    const result = await writes.recordAttempt(
      t.repo,
      SCOPE,
      target(before),
      attempt(t, { result: "reached", note: "Met at home" }),
      t.key(),
      now(t),
    );
    expect(result.status).toBe("saved");
    const after = await local(t);
    expect(after.status).toBe("contacted");
    expect(after.attempts).toHaveLength(1);
    expect(after.attempts[0]).toMatchObject({
      method: "home_visit",
      result: "reached",
      note: "Met at home",
      recordedBy: WORKER,
    });
    const [op] = await ops(t);
    expect(op).toMatchObject({ status: "queued", baseVersion: before.version, opType: "update" });
    expect(await ops(t)).toHaveLength(1);
    const [event] = await audits(t, "followup.attempt_recorded");
    expect(event).toMatchObject({
      entityId: OVERDUE,
      changeSummary: { method: "home_visit", result: "reached", baseVersion: before.version },
    });
    // Per-item sync state: the new attempt is "Saved on this device".
    const detail = await followUps.getDetail(t.repo, SCOPE, OVERDUE, { audit: false });
    expect(detail.status === "ok" && detail.detail.attempts[0]?.syncState).toBe("saved_locally");
  });

  it("not reached keeps the status; invalid values never write", async () => {
    const t = await worker({ offline: true });
    const before = await local(t);
    const bad = await writes.recordAttempt(
      t.repo,
      SCOPE,
      target(before),
      { ...attempt(t), method: null },
      t.key(),
      now(t),
    );
    expect(bad).toMatchObject({ status: "invalid", issues: [{ field: "method" }] });
    expect(await ops(t)).toHaveLength(0);
    await writes.recordAttempt(t.repo, SCOPE, target(before), attempt(t), t.key(), now(t));
    expect((await local(t)).status).toBe("assigned");
  });

  it("another worker's task → denied, nothing written", async () => {
    const t = await worker({ offline: true });
    const other = await local(t, OTHERS);
    const result = await writes.recordAttempt(
      t.repo,
      SCOPE,
      target(other),
      attempt(t),
      t.key(),
      now(t),
    );
    expect(result.status).toBe("denied");
    expect(await t.repo.sync.list()).toHaveLength(0);
  });
});

describe("recordOutcome (HWM-08 tasks 2–7)", () => {
  it("attended without evidence type or occurred-at cannot be saved (T-03)", async () => {
    const t = await worker({ offline: true });
    const fu = await local(t);
    const result = await writes.recordOutcome(
      t.repo,
      SCOPE,
      target(fu),
      attended(t, { evidenceType: null, occurredAt: null }),
      t.key(),
      now(t),
    );
    expect(result).toMatchObject({
      status: "invalid",
      issues: [{ field: "occurredAt" }, { field: "evidenceType" }],
    });
    expect(await ops(t)).toHaveLength(0);
    expect((await local(t)).status).toBe("assigned");
  });

  it("offline attended → one local outcome + one op with baseVersion; Completed tab, pending confirmation", async () => {
    const t = await worker({ offline: true });
    const fu = await local(t);
    const result = await writes.recordOutcome(
      t.repo,
      SCOPE,
      target(fu),
      attended(t),
      t.key(),
      now(t),
    );
    expect(result.status).toBe("saved");
    const after = await local(t);
    expect(after).toMatchObject({
      status: "completed",
      completedAt: now(t).toISOString(),
      clinicianConfirmation: { status: "pending" },
      outcome: {
        kind: "attended",
        evidenceType: "facility_register_checked",
        occurredAt: now(t).toISOString(),
        recordedBy: WORKER,
      },
    });
    const all = await ops(t);
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ status: "queued", baseVersion: fu.version });
    const [event] = await audits(t, "followup.outcome_recorded");
    expect(event?.changeSummary).toMatchObject({
      outcome: "attended",
      evidenceType: "facility_register_checked",
      occurredAt: now(t).toISOString(),
      baseVersion: fu.version,
    });
    // Moves to Completed immediately (derived overdue cleared), labelled Saved on this device.
    const completed = await followUps.listByFilter(t.repo, SCOPE, { filter: "completed" });
    const row = completed.items.find((r) => r.followUp.id === OVERDUE);
    expect(row?.syncState).toBe("saved_locally");
    const overdue = await followUps.listByFilter(t.repo, SCOPE, { filter: "overdue" });
    expect(overdue.items.map((r) => r.followUp.id)).not.toContain(OVERDUE);
    // Remote untouched until sync.
    expect((await remote(t)).status).toBe("assigned");
  });

  it("referred onward → contacted (never completes)", async () => {
    const t = await worker({ offline: true });
    const fu = await local(t);
    await writes.recordOutcome(
      t.repo,
      SCOPE,
      target(fu),
      attended(t, { outcome: "referred_onward", evidenceType: "worker_accompanied_visit" }),
      t.key(),
      now(t),
    );
    expect(await local(t)).toMatchObject({ status: "contacted", completedAt: null });
  });

  it("unable to reach without an unsuccessful attempt is blocked; the inline attempt unblocks it", async () => {
    const t = await worker({ offline: true });
    const fu = await local(t);
    const values: OutcomeFormValues = {
      ...initialOutcomeValues(now(t)),
      outcome: "unable_to_reach",
      reasonCode: "not_at_home_repeatedly",
    };
    const blocked = await writes.recordOutcome(t.repo, SCOPE, target(fu), values, t.key(), now(t));
    expect(blocked).toMatchObject({ status: "invalid", issues: [{ field: "inlineAttempt" }] });
    expect(await ops(t)).toHaveLength(0);

    const saved = await writes.recordOutcome(
      t.repo,
      SCOPE,
      target(fu),
      { ...values, inlineAttempt: true, inlineMethod: "phone" },
      t.key(),
      now(t),
    );
    expect(saved.status).toBe("saved");
    const after = await local(t);
    expect(after.status).toBe("unable_to_reach");
    expect(after.attempts.map((a) => [a.method, a.result])).toEqual([["phone", "not_reached"]]);
    expect(after.outcome).toMatchObject({
      kind: "unable_to_reach",
      reasonCode: "not_at_home_repeatedly",
    });
    const queued = await ops(t);
    expect(queued.map((o) => o.baseVersion)).toEqual([fu.version, fu.version + 1]);

    // Online: both ops sync in order (chain rule), no false conflict.
    await t.repo.demo.setFaults({ offline: false });
    const run = await t.repo.sync.process({ trigger: "manual" });
    expect(run).toMatchObject({ acknowledged: 2, conflicts: 0 });
    expect(await remote(t)).toMatchObject({
      status: "unable_to_reach",
      attempts: [{ result: "not_reached" }],
    });
  });

  it("killed between the inline attempt and the outcome → retry replays the attempt (one attempt, two ops)", async () => {
    const t = await worker({ offline: true });
    const fu = await local(t);
    const key = t.key();
    const values: OutcomeFormValues = {
      ...initialOutcomeValues(now(t)),
      outcome: "unable_to_reach",
      reasonCode: "phone_unreachable",
      inlineAttempt: true,
      inlineMethod: "phone",
    };
    let killOutcome = true;
    const crashing = {
      ...t.repo,
      updateFollowUp: (...args: Parameters<typeof t.repo.updateFollowUp>) => {
        if (killOutcome && args[0].action === "record_outcome") {
          killOutcome = false;
          return Promise.reject(new Error("app killed (simulated)"));
        }
        return t.repo.updateFollowUp(...args);
      },
    };
    await expect(
      writes.recordOutcome(crashing, SCOPE, target(fu), values, key, now(t)),
    ).rejects.toThrow("app killed");
    expect((await local(t)).attempts).toHaveLength(1);

    const retry = await writes.recordOutcome(crashing, SCOPE, target(fu), values, key, now(t));
    expect(retry.status).toBe("saved");
    const after = await local(t);
    expect(after.attempts).toHaveLength(1);
    expect(after.status).toBe("unable_to_reach");
    expect(await ops(t)).toHaveLength(2);
    expect(await audits(t, "followup.attempt_recorded")).toHaveLength(1);
  });

  it("double-tap Confirm → one op; a later call with the same key is a replay (T-04)", async () => {
    const t = await worker({ offline: true });
    const fu = await local(t);
    const key = t.key();
    const values = attended(t);
    const [a, b] = await Promise.all([
      writes.recordOutcome(t.repo, SCOPE, target(fu), values, key, now(t)),
      writes.recordOutcome(t.repo, SCOPE, target(fu), values, key, now(t)),
    ]);
    expect(a).toEqual(b);
    const again = await writes.recordOutcome(t.repo, SCOPE, target(fu), values, key, now(t));
    expect(again).toMatchObject({ status: "saved", replayed: true });
    expect(await ops(t)).toHaveLength(1);
    expect(await audits(t, "followup.outcome_recorded")).toHaveLength(1);
  });

  it("client guard: no outcome on a completed task; attended on unable_to_reach needs a reached attempt", async () => {
    const t = await worker({ offline: true });
    const fu = await local(t);
    await writes.recordOutcome(t.repo, SCOPE, target(fu), attended(t), t.key(), now(t));
    const done = await local(t);
    expect(
      await writes.recordOutcome(t.repo, SCOPE, target(done), attended(t), t.key(), now(t)),
    ).toEqual({ status: "blocked", block: "completed" });
    expect(
      await writes.recordAttempt(t.repo, SCOPE, target(done), attempt(t), t.key(), now(t)),
    ).toEqual({ status: "blocked", block: "completed" });

    const second = await local(t, SECOND);
    await writes.recordAttempt(t.repo, SCOPE, target(second), attempt(t), t.key(), now(t));
    let current = await local(t, SECOND);
    await writes.recordOutcome(
      t.repo,
      SCOPE,
      target(current),
      { ...initialOutcomeValues(now(t)), outcome: "unable_to_reach", reasonCode: "moved_away" },
      t.key(),
      now(t),
    );
    current = await local(t, SECOND);
    expect(current.status).toBe("unable_to_reach");
    const opsBefore = (await ops(t, SECOND)).length;
    expect(
      await writes.recordOutcome(t.repo, SCOPE, target(current), attended(t), t.key(), now(t)),
    ).toEqual({ status: "blocked", block: "needs_reached_attempt" });
    expect(await ops(t, SECOND)).toHaveLength(opsBefore);

    // A reached attempt after the unable-to-reach outcome allows attended.
    t.clock.advanceBy(60_000);
    await writes.recordAttempt(
      t.repo,
      SCOPE,
      target(current),
      attempt(t, { result: "reached" }),
      t.key(),
      now(t),
    );
    current = await local(t, SECOND);
    const ok = await writes.recordOutcome(
      t.repo,
      SCOPE,
      target(current),
      attended(t),
      t.key(),
      now(t),
    );
    expect(ok.status).toBe("saved");
    expect((await local(t, SECOND)).status).toBe("completed");
  });

  it("atomic: a failing op insert leaves neither the outcome nor the audit", async () => {
    const base = createMemoryStoreAdapter();
    let failOps = false;
    const failing: StoreAdapter = {
      ...base,
      transaction: (fn) =>
        base.transaction((tx) =>
          fn({
            ...tx,
            put: (c, v) =>
              failOps && c === "syncOperations"
                ? Promise.reject(new Error("disk full (simulated)"))
                : tx.put(c, v),
          }),
        ),
    };
    const t = await worker({ offline: true, store: failing });
    const fu = await local(t);
    const auditCount = (await t.store.getAll("auditEvents")).length;
    failOps = true;
    await expect(
      writes.recordOutcome(t.repo, SCOPE, target(fu), attended(t), t.key(), now(t)),
    ).rejects.toBeDefined();
    failOps = false;
    expect(await local(t)).toEqual(fu);
    expect(await t.store.getAll<SyncOperation>("syncOperations")).toHaveLength(0);
    expect(await t.store.getAll("auditEvents")).toHaveLength(auditCount);
  });
});

describe("sync of follow-up writes (HWM-08 acceptance)", () => {
  it("conflictOnce → conflict; local outcome retained; server state not overwritten (T-05)", async () => {
    const t = await worker({ offline: true });
    const fu = await local(t);
    await writes.recordOutcome(t.repo, SCOPE, target(fu), attended(t), t.key(), now(t));
    const serverBefore = await remote(t);
    await t.repo.demo.setFaults({
      offline: false,
      conflictOnce: [{ entityType: "follow_up", entityId: OVERDUE }],
    });
    const run = await t.repo.sync.process({ trigger: "manual" });
    expect(run.conflicts).toBe(1);
    const [op] = await ops(t);
    expect(op).toMatchObject({ status: "needs_resolution", lastError: { code: "CONFLICT" } });
    expect(await local(t)).toMatchObject({ status: "completed", outcome: { kind: "attended" } });
    expect(await remote(t)).toEqual(serverBefore);
    const detail = await followUps.getDetail(t.repo, SCOPE, OVERDUE, { audit: false });
    expect(detail.status === "ok" && detail.detail.syncState).toBe("conflict");
  });

  it("dropped ack mid-sync, then retry → exactly one server outcome (T-09)", async () => {
    const t = await worker({ offline: true });
    const fu = await local(t);
    await writes.recordAttempt(t.repo, SCOPE, target(fu), attempt(t), t.key(), now(t));
    const afterAttempt = await local(t);
    await writes.recordOutcome(t.repo, SCOPE, target(afterAttempt), attended(t), t.key(), now(t));
    await t.repo.demo.setFaults({ offline: false, timeoutRate: 1 });
    const first = await t.repo.sync.process({ trigger: "manual" });
    expect(first.retryableFailures).toBe(1);
    const detail = await followUps.getDetail(t.repo, SCOPE, OVERDUE, { audit: false });
    // The attempt's op is waiting to retry → "Will retry" in the timeline.
    expect(detail.status === "ok" && detail.detail.attempts[0]?.syncState).toBe("failed");
    await t.repo.demo.setFaults({ timeoutRate: 0 });
    t.clock.advanceBy(120_000);
    await t.repo.sync.process({ trigger: "manual" });
    const all = await ops(t);
    expect(all.map((o) => o.status)).toEqual(["acknowledged", "acknowledged"]);
    const server = await remote(t);
    expect(server.attempts).toHaveLength(1);
    expect(server).toMatchObject({ status: "completed", outcome: { kind: "attended" } });
    expect(await audits(t, "followup.outcome_recorded", "remote_auditEvents")).toHaveLength(1);
    expect(await local(t)).toEqual(server);
  });

  it("reassigned on the server while offline → not accepted; local record retained", async () => {
    const t = await worker({ offline: true });
    const fu = await local(t);
    await writes.recordOutcome(t.repo, SCOPE, target(fu), attended(t), t.key(), now(t));
    const server = await remote(t);
    await t.store.transaction((tx) =>
      tx.put("remote_followUps", {
        ...server,
        assignedWorkerId: PERSONA_IDS.chwAlpha1B,
        version: server.version + 1,
      }),
    );
    await t.repo.demo.setFaults({ offline: false });
    await t.repo.sync.process({ trigger: "manual" });
    const [op] = await ops(t);
    expect(op?.status).toBe("rejected");
    expect(op?.lastError).toMatchObject({ code: "FORBIDDEN" });
    expect(await local(t)).toMatchObject({ status: "completed", outcome: { kind: "attended" } });
    expect((await remote(t)).assignedWorkerId).toBe(PERSONA_IDS.chwAlpha1B);
  });
});
