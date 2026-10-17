/**
 * CTZ-07 invariant (FRD §4, tech spec §8 "task created; source clinical record unchanged",
 * T-06): any correction request — result, next step or personal details, sent, replayed,
 * blocked as a duplicate or rejected by a conflict — leaves the released observations
 * (`ctz_released_observations` = screenings + reviews), the instructions
 * (`ctz_care_instructions`) and the account identity byte-for-byte unchanged. Exactly one task
 * per request.
 */
import { hashCanonical } from "@laif/domain";
import { CITIZEN_OVERLAY_IDS, PERSONA_IDS, SEED_ANCHORS } from "@laif/mock-data";
import { makeCitizenRepo, type CitizenTestRepo } from "@laif/test-utils";
import { describe, expect, it } from "vitest";

const P1 = SEED_ANCHORS.CTZ_P1_APPOINTMENT_INSTRUCTION.patientId;

async function recordHash(h: CitizenTestRepo): Promise<string> {
  return hashCanonical({
    screenings: await h.store.getAll("screenings"),
    reviews: await h.store.getAll("reviews"),
    careInstructions: await h.store.getAll("careInstructions"),
    patients: await h.store.getAll("patients"),
    citizenAccounts: await h.store.getAll("citizenAccounts"),
    identityVerifications: await h.store.getAll("identityVerifications"),
  });
}

const openTasks = async (h: CitizenTestRepo) =>
  (await h.store.getAll<{ kind: string; payload: { requestStatus?: string } }>("careTasks")).filter(
    (t) => t.kind === "correction_request" && t.payload.requestStatus === "submitted",
  );

describe("a correction request never changes the record", () => {
  it("result, next step and personal details requests: hashes identical, one task each", async () => {
    const h = await makeCitizenRepo({ persona: PERSONA_IDS.citizen1 });
    const before = await recordHash(h);
    const targets = await h.repo.listCorrectionTargets(P1);
    const picks = [
      targets.find((t) => t.targetId === CITIZEN_OVERLAY_IDS.amendedScreening)!,
      targets.find((t) => t.targetType === "care_instruction")!,
      targets.find((t) => t.targetType === "patient")!,
    ];
    for (const target of picks) {
      const key = h.key();
      const input = {
        patientId: P1,
        targetType: target.targetType,
        targetId: target.targetId,
        description: "Something on this item looks wrong to me.",
        suggestedValue: "It should say something else",
        expectedTargetVersion: target.version,
      };
      await h.repo.createCorrectionRequest(input, key);
      // Retry with the same key (T-09) and a second request for the same item (blocked).
      expect((await h.repo.createCorrectionRequest(input, key)).replayed).toBe(true);
      await expect(h.repo.createCorrectionRequest(input, h.key())).rejects.toMatchObject({
        reason: "DUPLICATE_OPEN_REQUEST",
      });
    }
    expect(await openTasks(h)).toHaveLength(3);
    expect(await recordHash(h)).toBe(before);
  });

  it("a conflict writes nothing at all", async () => {
    const h = await makeCitizenRepo({ persona: PERSONA_IDS.citizen1 });
    const before = await recordHash(h);
    await h.repo.demo.setFaults({ conflictOnce: [{ entityType: "patient", entityId: P1 }] });
    await expect(
      h.repo.createCorrectionRequest(
        {
          patientId: P1,
          targetType: "screening",
          targetId: CITIZEN_OVERLAY_IDS.amendedScreening,
          description: "The time of this check looks wrong.",
        },
        h.key(),
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await openTasks(h)).toHaveLength(0);
    expect(await recordHash(h)).toBe(before);
  });
});
