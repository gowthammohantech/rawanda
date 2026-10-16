/**
 * FND-07 workflows parametrised over all three adapters (FND-08 task 6): WF-01, sync / WF-02 and
 * reset behave identically on memory, Dexie (fake-indexeddb) and SQLite (better-sqlite3).
 */
import type { AuditEvent, FollowUp, Referral, Review, Screening } from "@laif/domain";
import { createSeed, PERSONA_IDS, SEED_VERSION, sliceForApp } from "@laif/mock-data";
import { describe, expect, it } from "vitest";

import { STORE_FACTORIES, type AdapterKind } from "../../test/adapters.ts";
import { computeDatasetHash, datasetToRecords } from "../seed-records.ts";
import { createHarness } from "../testing/harness.ts";

const KINDS = Object.keys(STORE_FACTORIES) as AdapterKind[];

describe.each(KINDS)("workflows on the %s adapter", (kind) => {
  const store = () => STORE_FACTORIES[kind]();

  it("WF-01: screening → flag → review → referral → follow-up, with audit", async () => {
    const h = await createHarness({ personaId: PERSONA_IDS.chwAlpha1A, store: store() });
    const patient = h.seed.patients.find((p) => p.facilityId === "fac-alpha-1")!;
    const screening = await h.repo.createScreening(
      {
        patientId: patient.id,
        measuredAt: "2026-10-14T05:45:00.000Z",
        systolic: 150,
        diastolic: 92,
      },
      h.key(),
    );
    expect(screening.data).toMatchObject({
      status: "review_required",
      flag: { requiresReview: true },
    });
    const review = (await h.store.getAll<Review>("reviews")).find(
      (r) => r.screeningId === screening.data.id,
    )!;
    h.as(PERSONA_IDS.clinAlpha1);
    const started = await h.repo.startReview({ reviewId: review.id, expectedVersion: 1 }, h.key());
    await h.repo.decideReview(
      {
        kind: "refer",
        reviewId: review.id,
        expectedVersion: started.entityVersion,
        destinationFacilityId: "fac-alpha-2",
        referralReason: "Systolic reading above the demo threshold.",
        dueAt: "2026-10-21T06:00:00.000Z",
        priority: "routine",
      },
      h.key(),
    );
    const referral = (await h.store.getAll<Referral>("referrals")).find(
      (r) => r.reviewId === review.id,
    )!;
    expect(referral.status).toBe("created");
    const fu = await h.repo.createFollowUp(
      {
        patientId: patient.id,
        purpose: "referral_attendance",
        dueAt: "2026-10-18T06:00:00.000Z",
        assignedWorkerId: PERSONA_IDS.chwAlpha1A,
        referralId: referral.id,
        note: "Support attendance at Alpha-2.",
      },
      h.key(),
    );
    expect((await h.store.get<FollowUp>("followUps", fu.data.id))?.status).toBe("assigned");
    // Stale write → CONFLICT carrying the latest entity.
    await expect(
      h.repo.startReview({ reviewId: review.id, expectedVersion: 1 }, h.key()),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      conflict: { currentVersion: started.entityVersion + 1 },
    });
    const actions = (await h.store.getAll<AuditEvent>("auditEvents"))
      .filter((e) => e.patientId === patient.id && e.occurredAt === h.clock.nowIso())
      .map((e) => e.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        "screening.submitted",
        "review.created",
        "review.started",
        "review.decided",
        "referral.created",
        "followup.created",
      ]),
    );
  });

  it("WF-02: offline queue → online process acks once; SCN-09 ends in needs_resolution", async () => {
    const h = await createHarness({
      appId: "worker",
      personaId: PERSONA_IDS.chwAlpha1A,
      store: store(),
    });
    const patient = h.seed.patients.find((p) => p.facilityId === "fac-alpha-1")!;
    await h.repo.demo.setFaults({ offline: true, latencyMs: [0, 0] });
    const created = await h.repo.createScreening(
      {
        patientId: patient.id,
        measuredAt: "2026-10-14T05:10:00.000Z",
        systolic: 126,
        diastolic: 80,
      },
      h.key(),
    );
    expect(await h.repo.sync.process()).toMatchObject({ offline: true, attempted: 0 });
    await h.repo.demo.setFaults({ offline: false });
    const [r1, r2] = await Promise.all([h.repo.sync.process(), h.repo.sync.process()]);
    expect(r1).toBe(r2);
    expect(r1).toMatchObject({ attempted: 1, acknowledged: 1 });
    expect(
      (await h.store.getAll<Screening>("remote_screenings")).filter(
        (s) => s.id === created.data.id,
      ),
    ).toHaveLength(1);

    await h.repo.demo.loadScenario("SCN-09-version-conflict");
    expect((await h.repo.sync.process()).conflicts).toBe(1);
    const [op] = await h.repo.sync.list();
    expect(op).toMatchObject({ status: "needs_resolution", lastError: { code: "CONFLICT" } });
  });

  it("reset: datasetHash equals the fresh slice and two resets are identical", async () => {
    const h = await createHarness({ personaId: PERSONA_IDS.clinAlpha1, store: store() });
    const slice = sliceForApp(createSeed(), "clinical");
    const first = (await h.store.getAll<Review>("reviews"))[0]!;
    await h.repo
      .startReview({ reviewId: first.id, expectedVersion: first.version }, h.key())
      .catch(() => undefined);
    const a = await h.repo.demo.resetDemo();
    const b = await h.repo.demo.resetDemo();
    expect(a).toMatchObject({
      seedVersion: SEED_VERSION,
      datasetHash: computeDatasetHash(datasetToRecords(slice)),
      pendingSyncCount: 0,
    });
    expect(b.datasetHash).toBe(a.datasetHash);
    expect(await h.store.getAll("idempotency")).toEqual([]);
  });
});
