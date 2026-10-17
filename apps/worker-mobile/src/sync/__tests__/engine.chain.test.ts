// @vitest-environment node
/**
 * HWM-08 task 6 — chain rule on the FND-07 sync queue (the phase's "engine"): two offline changes
 * on one follow-up carry their local base versions; after the first ack the next queued op,
 * created against the version this device just had acknowledged, is rebased onto the acked
 * `entityVersion` → no false conflict. A remote change between the two sends still yields
 * `CONFLICT` (nothing overwritten).
 */
import type { FollowUp } from "@laif/domain";
import { FACILITY_IDS, PERSONA_IDS } from "@laif/mock-data";
import { createMemoryStoreAdapter, type StoreAdapter } from "@laif/repositories";
import { createTestRepository, type TestRepository } from "@laif/test-utils";
import { describe, expect, it } from "vitest";

import * as writes from "../../data/followUpWrites.ts";
import { initialAttemptValues } from "../../features/followup/attemptSchema.ts";
import { initialOutcomeValues } from "../../features/followup/outcomeSchema.ts";

const WORKER = PERSONA_IDS.chwAlpha1A;
const SCOPE = { workerId: WORKER, facilityId: FACILITY_IDS.alpha1 };
const TASK = "0976e711-6a18-54f8-8984-ed116a248c86";

const local = async (t: TestRepository) => (await t.store.get<FollowUp>("followUps", TASK))!;
const remote = async (t: TestRepository) =>
  (await t.store.get<FollowUp>("remote_followUps", TASK))!;

/** Offline: a reached attempt, then (on the new local version) an attended outcome. */
async function twoOfflineChanges(t: TestRepository) {
  const now = t.clock.now();
  const v1 = await local(t);
  const a = await writes.recordAttempt(
    t.repo,
    SCOPE,
    { id: TASK, version: v1.version },
    { ...initialAttemptValues(now), method: "home_visit", result: "reached" },
    t.key(),
    now,
  );
  const v2 = await local(t);
  const b = await writes.recordOutcome(
    t.repo,
    SCOPE,
    { id: TASK, version: v2.version },
    {
      ...initialOutcomeValues(now),
      outcome: "attended",
      evidenceType: "appointment_card_seen",
    },
    t.key(),
    now,
  );
  expect([a.status, b.status]).toEqual(["saved", "saved"]);
  return { v1, v2 };
}

describe("sync chain rule (HWM-08 task 6)", () => {
  it("two sequential offline changes on one task sync without a false conflict", async () => {
    const t = await createTestRepository({
      appId: "worker",
      persona: WORKER,
      faults: { offline: true },
    });
    const { v1, v2 } = await twoOfflineChanges(t);
    const queued = await t.repo.sync.list({ entityId: TASK });
    expect(queued.map((o) => [o.status, o.baseVersion])).toEqual([
      ["queued", v1.version],
      ["queued", v2.version],
    ]);
    const serverStart = (await remote(t)).version;

    await t.repo.demo.setFaults({ offline: false });
    const run = await t.repo.sync.process({ trigger: "manual" });
    expect(run).toMatchObject({ acknowledged: 2, conflicts: 0 });
    const [first, second] = await t.repo.sync.list({ entityId: TASK });
    expect(first?.status).toBe("acknowledged");
    // Rebased onto the version the server acknowledged for the first op.
    expect(second).toMatchObject({ status: "acknowledged", baseVersion: serverStart + 1 });
    const server = await remote(t);
    expect(server).toMatchObject({
      version: serverStart + 2,
      status: "completed",
      attempts: [{ result: "reached" }],
      outcome: { kind: "attended", evidenceType: "appointment_card_seen" },
    });
    expect(await local(t)).toEqual(server);
  });

  it("a remote change between the two sends still yields CONFLICT; nothing overwritten", async () => {
    const base = createMemoryStoreAdapter();
    let armed = false;
    // The moment the server applies the first op, someone else also edits the task remotely.
    const store: StoreAdapter = {
      ...base,
      transaction: (fn) =>
        base.transaction((tx) =>
          fn({
            ...tx,
            put: async (collection, value) => {
              const row = value as unknown as FollowUp;
              if (armed && collection === "remote_followUps" && row.id === TASK) {
                armed = false;
                return tx.put(collection, {
                  ...row,
                  version: row.version + 1,
                  dueAt: "2026-10-30T06:00:00.000Z",
                } as never);
              }
              return tx.put(collection, value);
            },
          }),
        ),
    };
    const t = await createTestRepository({
      appId: "worker",
      persona: WORKER,
      store,
      faults: { offline: true },
    });
    await twoOfflineChanges(t);
    armed = true;
    await t.repo.demo.setFaults({ offline: false });
    const run = await t.repo.sync.process({ trigger: "manual" });
    expect(run).toMatchObject({ acknowledged: 1, conflicts: 1 });
    const [first, second] = await t.repo.sync.list({ entityId: TASK });
    expect(first?.status).toBe("acknowledged");
    expect(second).toMatchObject({ status: "needs_resolution", lastError: { code: "CONFLICT" } });
    // The remote edit is kept; the worker's outcome is kept locally for the Sync decision.
    const server = await remote(t);
    expect(server).toMatchObject({ dueAt: "2026-10-30T06:00:00.000Z", outcome: null });
    expect(await local(t)).toMatchObject({ status: "completed", outcome: { kind: "attended" } });
  });
});
