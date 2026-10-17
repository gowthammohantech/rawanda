import {
  CITIZEN_RECORD_SCHEMAS,
  CareTaskSchema,
  ScreeningSchema,
  type CitizenAccessEvent,
  type CitizenAccount,
  type ConsentRecord,
  type IdentityVerification,
  type PatientLink,
} from "@laif/contracts";
import { describe, expect, it } from "vitest";

import { SEED_ANCHORS } from "../../anchors.ts";
import { PERSONA_IDS } from "../../reference/personas.ts";
import { createSeed } from "../../seed/generate.ts";
import { sliceForApp } from "../../slices.ts";
import {
  buildCitizenOverlay,
  CITIZEN_DEMO_VERIFICATION_CODE,
  CITIZEN_OVERLAY_IDS,
} from "../citizen.ts";

const seed = createSeed();
const overlay = buildCitizenOverlay(seed);
const rows = <T>(name: string): T[] => (overlay[name] ?? []) as unknown as T[];

const accounts = rows<CitizenAccount>("citizenAccounts");
const links = rows<PatientLink>("patientLinks");
const consents = rows<ConsentRecord>("consentRecords");
const verifications = rows<IdentityVerification>("identityVerifications");
const accessEvents = rows<CitizenAccessEvent>("accessEvents");
const accountOf = (personaId: string) => accounts.find((a) => a.personaId === personaId);

describe("buildCitizenOverlay", () => {
  it("is deterministic (same IDs and records across runs and fresh seeds)", () => {
    expect(buildCitizenOverlay(createSeed())).toEqual(overlay);
    expect(sliceForApp(seed, "citizen")).toEqual(sliceForApp(createSeed(), "citizen"));
  });

  it("does not mutate the base seed", () => {
    const before = structuredClone(seed);
    buildCitizenOverlay(seed);
    expect(seed).toEqual(before);
  });

  it("produces exactly the five citizen personas", () => {
    expect(accounts.map((a) => a.personaId)).toEqual([
      PERSONA_IDS.citizen1,
      PERSONA_IDS.citizen2,
      PERSONA_IDS.citizenWithdrawn,
      PERSONA_IDS.citizenRep,
      PERSONA_IDS.citizenPending,
    ]);
    expect(rows("citizenSettings")).toHaveLength(5);
    expect(verifications).toHaveLength(5);
  });

  it("every overlay record validates against its contract schema", () => {
    for (const [name, schema] of Object.entries(CITIZEN_RECORD_SCHEMAS)) {
      for (const row of rows<unknown>(name)) {
        const result = schema.safeParse(row);
        expect(result.success, `${name}: ${JSON.stringify(result.error?.issues)}`).toBe(true);
      }
    }
    for (const row of rows<unknown>("screenings"))
      expect(ScreeningSchema.safeParse(row).success).toBe(true);
    for (const row of rows<unknown>("careTasks"))
      expect(CareTaskSchema.safeParse(row).success).toBe(true);
  });

  it("CTZ-P1 and CTZ-P2 are verified, self-linked and consented", () => {
    for (const persona of [PERSONA_IDS.citizen1, PERSONA_IDS.citizen2]) {
      expect(accountOf(persona)?.status).toBe("active");
      const link = links.filter((l) => l.personaId === persona);
      expect(link).toHaveLength(1);
      expect(link[0]?.relationship).toBe("self");
      const history = consents.filter((c) => c.patientId === link[0]?.patientId);
      expect(history.map((c) => c.action)).toEqual(["granted"]);
    }
  });

  it("CTZ-P3 consent is granted then withdrawn (data exists but is unreachable)", () => {
    const patientId = SEED_ANCHORS.CTZ_P3_WITHDRAWN_PATIENT.patientId;
    const history = consents
      .filter((c) => c.patientId === patientId)
      .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
    expect(history.map((c) => c.action)).toEqual(["granted", "withdrawn"]);
    expect(seed.patients.find((p) => p.id === patientId)?.consentState).toBe("withdrawn");
  });

  it("CTZ-P4 is a legal representative for the represented patient only", () => {
    const repLinks = links.filter((l) => l.personaId === PERSONA_IDS.citizenRep);
    expect(repLinks.map((l) => [l.patientId, l.relationship])).toEqual([
      [SEED_ANCHORS.CTZ_P4_REPRESENTED_PATIENT.patientId, "legal_representative"],
    ]);
  });

  it("CTZ-P5 is pending verification with the demo code and only a pending link", () => {
    expect(accountOf(PERSONA_IDS.citizenPending)?.status).toBe("pending_verification");
    const verification = verifications.find((v) => v.personaId === PERSONA_IDS.citizenPending);
    expect(verification).toMatchObject({
      status: "pending",
      demoCode: CITIZEN_DEMO_VERIFICATION_CODE,
      attempts: 0,
    });
    expect(CITIZEN_DEMO_VERIFICATION_CODE).toBe("246810");
    // Its own (newly enrolled) record is linked `pending` — hidden until verification.
    const pending = links.filter((l) => l.personaId === PERSONA_IDS.citizenPending);
    expect(pending).toMatchObject([
      { patientId: CITIZEN_OVERLAY_IDS.pendingPatient, status: "pending", relationship: "self" },
    ]);
    expect(consents.some((c) => c.patientId === CITIZEN_OVERLAY_IDS.pendingPatient)).toBe(false);
    expect(accessEvents.some((e) => e.patientId === CITIZEN_OVERLAY_IDS.pendingPatient)).toBe(
      false,
    );
  });

  it("CTZ-P5's record is a citizen-slice-only patient with no health data", () => {
    const patients = rows<{ id: string; consentState: string; displayName: string }>("patients");
    expect(patients).toMatchObject([
      { id: CITIZEN_OVERLAY_IDS.pendingPatient, consentState: "not_recorded" },
    ]);
    expect(seed.patients.some((p) => p.id === CITIZEN_OVERLAY_IDS.pendingPatient)).toBe(false);
    const slice = sliceForApp(seed, "citizen");
    expect(slice.patients.some((p) => p.id === CITIZEN_OVERLAY_IDS.pendingPatient)).toBe(true);
    expect(slice.screenings.some((s) => s.patientId === CITIZEN_OVERLAY_IDS.pendingPatient)).toBe(
      false,
    );
    expect(
      sliceForApp(seed, "clinical").patients.some(
        (p) => p.id === CITIZEN_OVERLAY_IDS.pendingPatient,
      ),
    ).toBe(false);
  });

  it("has 6–10 staff reads per linked patient plus own views", () => {
    for (const link of links.filter((l) => l.status === "active")) {
      const events = accessEvents.filter((e) => e.patientId === link.patientId);
      const staff = events.filter((e) => e.actorRole !== "citizen");
      const own = events.filter((e) => e.actorId === link.personaId);
      expect(staff.length).toBeGreaterThanOrEqual(6);
      expect(staff.length).toBeLessThanOrEqual(10);
      expect(own.length).toBeGreaterThanOrEqual(1);
      expect(events.every((e) => e.occurredAt < seed.meta.demoClockIso)).toBe(true);
      expect(events.every((e) => e.occurredAt >= link.linkedAt)).toBe(true);
    }
  });

  it("no access events after CTZ-P3 withdrew consent", () => {
    const withdrawn = consents.find((c) => c.action === "withdrawn");
    const events = accessEvents.filter((e) => e.patientId === withdrawn?.patientId);
    expect(events.every((e) => e.occurredAt < (withdrawn?.recordedAt ?? ""))).toBe(true);
  });

  it("adds CTZ-P1's amended observation with the original retained (version 2)", () => {
    const [amended] = rows<{
      id: string;
      patientId: string;
      version: number;
      glucoseContext: string;
      amendments: Array<{ field: string; before: unknown; after: unknown }>;
    }>("screenings");
    expect(amended?.id).toBe(CITIZEN_OVERLAY_IDS.amendedScreening);
    expect(amended?.patientId).toBe(SEED_ANCHORS.COMPLETED_FOLLOWUP_WITH_INSTRUCTION.patientId);
    expect(amended?.version).toBe(2);
    expect(amended?.glucoseContext).toBe("not_recorded");
    expect(amended?.amendments).toMatchObject([
      { field: "glucoseContext", before: "not_recorded", after: "fasting" },
    ]);
  });

  it("seeds resolved correction requests (amended and no-change)", () => {
    const tasks = rows<{ id: string; status: string; payload: { requestStatus?: string } }>(
      "careTasks",
    );
    expect(tasks.map((t) => [t.id, t.status, t.payload.requestStatus])).toEqual([
      [CITIZEN_OVERLAY_IDS.resolvedAmendedCorrection, "done", "resolved_amended"],
      [CITIZEN_OVERLAY_IDS.resolvedNoChangeCorrection, "done", "resolved_no_change"],
    ]);
  });

  it("CTZ-P1 has read the completed follow-up step, not the upcoming appointment", () => {
    const acks = rows<{ instructionId: string }>("nextStepAcks");
    expect(acks.map((a) => a.instructionId)).toEqual([
      SEED_ANCHORS.COMPLETED_FOLLOWUP_WITH_INSTRUCTION.careInstructionId,
    ]);
  });

  it("is registered for the citizen slice only", () => {
    const slice = sliceForApp(seed, "citizen");
    expect(Object.keys(slice.extraCollections).sort()).toEqual([
      "accessEvents",
      "citizenAccounts",
      "citizenSettings",
      "consentRecords",
      "identityVerifications",
      "nextStepAcks",
      "patientLinks",
    ]);
    expect(slice.screenings.some((s) => s.id === CITIZEN_OVERLAY_IDS.amendedScreening)).toBe(true);
    expect(sliceForApp(seed, "clinical").extraCollections).toEqual({});
    expect(
      sliceForApp(seed, "clinical").screenings.some(
        (s) => s.id === CITIZEN_OVERLAY_IDS.amendedScreening,
      ),
    ).toBe(false);
  });
});
