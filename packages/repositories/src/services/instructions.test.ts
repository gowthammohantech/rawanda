import { PERSONA_IDS } from "@laif/mock-data";
import { describe, expect, it } from "vitest";

import { createHarness } from "../testing/harness.ts";

describe("care instructions", () => {
  it("instructions: clinician releases; citizen sees released only", async () => {
    const h = await createHarness({ personaId: PERSONA_IDS.clinAlpha1 });
    const citizen = h.persona(PERSONA_IDS.citizen1);
    const patientId = citizen.linkedPatientIds[0]!;
    const patient = h.seed.patients.find((p) => p.id === patientId)!;
    const referral = h.seed.referrals.find((r) => r.patientId === patientId)!;
    const released = await h.repo.releaseCareInstruction(
      {
        patientId,
        kind: "referral",
        sourceType: "referral",
        sourceId: referral.id,
        messageKey: "citizen:nextSteps.referral",
        params: { facility: "Alpha-2" },
        appointmentAt: "2026-10-20T07:00:00.000Z",
        facilityId: patient.facilityId,
      },
      h.key(),
    );
    expect(released.data).toMatchObject({ status: "released", releasedBy: PERSONA_IDS.clinAlpha1 });
    await expect(
      h.repo.releaseCareInstruction(
        {
          patientId,
          kind: "follow_up",
          sourceType: "follow_up",
          sourceId: "missing",
          messageKey: "citizen:x",
          facilityId: patient.facilityId,
        },
        h.key(),
      ),
    ).rejects.toMatchObject({ fieldErrors: { sourceId: { key: "invalid" } } });
    await expect(
      h.repo.releaseCareInstruction(
        {
          patientId,
          kind: "follow_up",
          sourceType: "review",
          sourceId: referral.reviewId,
          messageKey: "free text",
          facilityId: patient.facilityId,
        },
        h.key(),
      ),
    ).rejects.toMatchObject({ fieldErrors: { messageKey: { key: "invalidFormat" } } });
    const all = await h.repo.listCareInstructions(patientId);
    expect(all.map((c) => c.id)).toContain(released.data.id);
    await h.store.put("careInstructions", {
      ...released.data,
      id: "ci-withdrawn",
      status: "withdrawn",
    });

    const c = await createHarness({
      appId: "citizen",
      personaId: PERSONA_IDS.citizen1,
      store: h.store,
      seeded: false,
    });
    const visible = await c.repo.listCareInstructions(patientId);
    expect(visible.every((i) => i.status === "released")).toBe(true);
    expect(visible.map((i) => i.id)).toContain(released.data.id);
    expect((await h.repo.listCareInstructions(patientId)).map((i) => i.id)).toContain(
      "ci-withdrawn",
    );
  });
});
