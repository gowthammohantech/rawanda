import type { AuditEvent, FollowUp, Referral, Review } from "@laif/domain";
import { PERSONA_IDS, SEED_ANCHORS } from "@laif/mock-data";
import { describe, expect, it } from "vitest";

import { RepositoryError } from "./errors.ts";
import { createHarness } from "./testing/harness.ts";

const REVIEW = SEED_ANCHORS.WF01_FLAGGED_REVIEW.reviewId;
const FOLLOW_UP = SEED_ANCHORS.WF02_FOLLOWUP_CONFLICT.followUpId;
const referInput = (expectedVersion: number) => ({
  kind: "refer" as const,
  reviewId: REVIEW,
  expectedVersion,
  destinationFacilityId: "fac-beta-1",
  referralReason: "Blood pressure above the demo threshold twice.",
  dueAt: "2026-10-21T06:00:00.000Z",
  priority: "routine" as const,
});

async function catchError(p: Promise<unknown>): Promise<RepositoryError> {
  const error = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(RepositoryError);
  return error as RepositoryError;
}

describe("optimistic versions / 409 CONFLICT (T-05)", () => {
  it("decideReview one version behind → CONFLICT with the current entity; nothing written", async () => {
    const h = await createHarness({ personaId: PERSONA_IDS.clinAlpha1 });
    const original = (await h.store.get<Review>("reviews", REVIEW))!;
    await h.repo.startReview({ reviewId: REVIEW, expectedVersion: original.version }, h.key());
    const review = (await h.store.get<Review>("reviews", REVIEW))!;
    expect(review.version).toBe(original.version + 1);
    const referrals = await h.store.getAll<Referral>("referrals");
    const idempotency = await h.store.getAll("idempotency");
    const error = await catchError(h.repo.decideReview(referInput(review.version - 1), h.key()));

    expect(error.code).toBe("CONFLICT");
    expect(error.status).toBe(409);
    expect(error.conflict).toMatchObject({
      entityType: "review",
      entityId: REVIEW,
      expectedVersion: review.version - 1,
      currentVersion: review.version,
      latest: review,
    });
    expect(await h.store.get<Review>("reviews", REVIEW)).toEqual(review);
    expect(await h.store.getAll("referrals")).toEqual(referrals);
    expect(await h.store.getAll("idempotency")).toEqual(idempotency);
    const audits = await h.store.getAll<AuditEvent>("auditEvents");
    const detected = audits.filter((e) => e.action === "conflict.detected");
    expect(detected).toHaveLength(1);
    expect(detected[0]).toMatchObject({ entityId: REVIEW, actorId: PERSONA_IDS.clinAlpha1 });

    const ok = await h.repo.decideReview(referInput(review.version), h.key());
    expect(ok.data.status).toBe("action_recorded");
    expect(ok.entityVersion).toBe(review.version + 1);
  });

  it("a decided review → CONFLICT reason ALREADY_DECIDED (even with the right version)", async () => {
    const h = await createHarness({ personaId: PERSONA_IDS.clinAlpha1 });
    const review = (await h.store.get<Review>("reviews", REVIEW))!;
    const decided = await h.repo.decideReview(referInput(review.version), h.key());
    const error = await catchError(h.repo.decideReview(referInput(decided.entityVersion), h.key()));
    expect(error).toMatchObject({ code: "CONFLICT", reason: "ALREADY_DECIDED" });
    expect(error.conflict?.changedBy).toBe(PERSONA_IDS.clinAlpha1);
  });

  it("another actor (simulateExternalUpdate) → CONFLICT naming who changed it", async () => {
    const h = await createHarness({ personaId: PERSONA_IDS.clinAlpha1 });
    const fu = (await h.store.get<FollowUp>("followUps", FOLLOW_UP))!;
    const bumped = await h.repo.demo.simulateExternalUpdate(
      "followUp",
      FOLLOW_UP,
      { dueAt: "2026-10-20T06:00:00.000Z" },
      PERSONA_IDS.chwAlpha1A,
    );
    expect(bumped.version).toBe(fu.version + 1);
    const error = await catchError(
      h.repo.updateFollowUp(
        {
          followUpId: FOLLOW_UP,
          expectedVersion: fu.version,
          action: "add_note",
          note: "Called again.",
        },
        h.key(),
      ),
    );
    expect(error.code).toBe("CONFLICT");
    expect(error.conflict).toMatchObject({
      currentVersion: fu.version + 1,
      changedBy: PERSONA_IDS.chwAlpha1A,
      latest: { dueAt: "2026-10-20T06:00:00.000Z" },
    });
  });

  it("conflictOnce fault: the next write to the entity conflicts once, then succeeds", async () => {
    const h = await createHarness({ personaId: PERSONA_IDS.clinAlpha1 });
    await h.repo.demo.setFaults({
      latencyMs: [0, 0],
      conflictOnce: [{ entityType: "reviews", entityId: REVIEW }],
    });
    const review = (await h.store.get<Review>("reviews", REVIEW))!;
    const error = await catchError(h.repo.decideReview(referInput(review.version), h.key()));
    expect(error).toMatchObject({ code: "CONFLICT", details: { simulated: true } });
    expect((await h.repo.demo.getFaults()).conflictOnce).toEqual([]);
    // Consumption is persisted (survives restart).
    const persisted = JSON.parse((await h.store.getMeta("demo.faults"))!) as {
      conflictOnce: unknown[];
    };
    expect(persisted.conflictOnce).toEqual([]);
    const ok = await h.repo.decideReview(referInput(review.version), h.key());
    expect(ok.replayed).toBe(false);
  });

  it("one open referral per review → CONFLICT REFERRAL_ALREADY_OPEN", async () => {
    const h = await createHarness({ personaId: PERSONA_IDS.clinAlpha1 });
    const review = (await h.store.get<Review>("reviews", REVIEW))!;
    const decided = await h.repo.decideReview(referInput(review.version), h.key());
    const error = await catchError(
      h.repo.createReferral(
        {
          reviewId: REVIEW,
          patientId: decided.data.patientId,
          destinationFacilityId: "fac-alpha-2",
          dueAt: "2026-10-25T06:00:00.000Z",
          priority: "routine",
          referralReason: "Second referral for the same review.",
        },
        h.key(),
      ),
    );
    expect(error).toMatchObject({ code: "CONFLICT", reason: "REFERRAL_ALREADY_OPEN" });
  });
});
