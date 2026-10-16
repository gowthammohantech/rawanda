import { PERSONA_IDS } from "@laif/mock-data";
import { describe, expect, it } from "vitest";

import type { AuditEvent, Review, Screening } from "@laif/domain";
import { RepositoryError } from "./errors.ts";
import { payloadHashOf } from "./idempotency.ts";
import { createHarness, testSeed } from "./testing/harness.ts";

const seed = testSeed();
const alpha1Patient = seed.patients.find((p) => p.facilityId === "fac-alpha-1")!;
const flaggedInput = {
  patientId: alpha1Patient.id,
  measuredAt: "2026-10-14T05:30:00.000Z",
  systolic: 162,
  diastolic: 99,
};

async function count<T>(
  h: Awaited<ReturnType<typeof createHarness>>,
  c: "screenings" | "reviews" | "auditEvents" | "idempotency",
) {
  return (await h.store.getAll<T>(c)).length;
}

describe("idempotency (T-04, BR-09)", () => {
  it("same createScreening input + key twice → one screening, one review, replayed", async () => {
    const h = await createHarness({ appId: "worker", personaId: PERSONA_IDS.chwAlpha1A });
    const screenings = await count(h, "screenings");
    const reviews = await count(h, "reviews");
    const key = h.key();
    const first = await h.repo.createScreening(flaggedInput, key);
    const audits = await h.store.getAll<AuditEvent>("auditEvents");
    const second = await h.repo.createScreening(flaggedInput, key);

    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    expect(second.data).toEqual(first.data);
    expect(second.eventId).toBe(first.eventId);
    expect(second.auditEventId).toBe(first.auditEventId);
    expect(await count(h, "screenings")).toBe(screenings + 1);
    expect(await count(h, "reviews")).toBe(reviews + 1);
    expect(first.data.status).toBe("review_required");

    const after = await h.store.getAll<AuditEvent>("auditEvents");
    const added = after.filter((e) => !audits.some((a) => a.id === e.id));
    expect(added.map((e) => e.action)).toEqual(["sync.duplicate_suppressed"]);
    expect(added[0]?.category).toBe("security");
    expect(added[0]?.entityId).toBe(first.data.id);
    // Only one sync op: the replay enqueues nothing.
    expect(await h.repo.sync.list()).toHaveLength(1);
  });

  it("same key with a different payload → VALIDATION_ERROR IDEMPOTENCY_KEY_REUSED", async () => {
    const h = await createHarness({ personaId: PERSONA_IDS.chwAlpha1A });
    const key = h.key();
    await h.repo.createScreening(flaggedInput, key);
    await expect(
      h.repo.createScreening({ ...flaggedInput, systolic: 150 }, key),
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      reason: "IDEMPOTENCY_KEY_REUSED",
    });
    await expect(
      h.repo.registerPatient(
        {
          givenName: "Demo",
          familyName: "Person",
          sex: "female",
          facilityId: "fac-alpha-1",
          estimatedAgeYears: 40,
        },
        key,
      ),
    ).rejects.toMatchObject({ reason: "IDEMPOTENCY_KEY_REUSED" });
  });

  it("validates the key and its agreement with input.idempotencyKey", async () => {
    const h = await createHarness({ personaId: PERSONA_IDS.chwAlpha1A });
    await expect(h.repo.createScreening(flaggedInput, "not-a-uuid")).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      fieldErrors: { idempotencyKey: { key: "invalidIdentifier" } },
    });
    const ok = await h.repo
      .createScreening({ ...flaggedInput, idempotencyKey: h.key() }, h.key())
      .catch((e: unknown) => e);
    expect(ok).toBeInstanceOf(RepositoryError);
    expect((ok as RepositoryError).fieldErrors?.["idempotencyKey"]?.key).toBe("invalid");
    const key = h.key();
    const same = await h.repo.createScreening({ ...flaggedInput, idempotencyKey: key }, key);
    expect(same.replayed).toBe(false);
  });

  it("a failed write stores no record, so the same key can be retried after a fix", async () => {
    const h = await createHarness({ personaId: PERSONA_IDS.chwAlpha1A });
    const key = h.key();
    const before = await count(h, "idempotency");
    await expect(
      h.repo.createScreening({ ...flaggedInput, diastolic: 200 }, key),
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
    expect(await count(h, "idempotency")).toBe(before);
    const result = await h.repo.createScreening(flaggedInput, key);
    expect(result.replayed).toBe(false);
    const stored = await h.store.get<Screening>("screenings", result.data.id);
    expect(stored?.clientMutationId).toBe(key);
    const reviews = await h.store.getAll<Review>("reviews");
    expect(reviews.filter((r) => r.screeningId === result.data.id)).toHaveLength(1);
  });

  it("payload hash ignores the idempotency key and key order", () => {
    expect(payloadHashOf({ a: 1, b: 2, idempotencyKey: "x" })).toBe(payloadHashOf({ b: 2, a: 1 }));
    expect(payloadHashOf(null)).toBe(payloadHashOf(undefined));
    expect(payloadHashOf([1])).not.toBe(payloadHashOf([2]));
  });
});
