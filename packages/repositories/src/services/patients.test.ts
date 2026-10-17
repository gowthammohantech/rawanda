import type { AuditEvent, Patient } from "@laif/domain";
import { FACILITY_IDS, PERSONA_IDS, SEED_ANCHORS } from "@laif/mock-data";
import { describe, expect, it } from "vitest";

import { createHarness } from "../testing/harness.ts";

const registration = {
  givenName: "Xelrix",
  familyName: "Quorezo",
  sex: "male" as const,
  facilityId: FACILITY_IDS.alpha1,
  dateOfBirth: "1953-04-04",
};

describe("patients service", () => {
  it("lists in scope, searches by name or identifier, pages deterministically", async () => {
    const h = await createHarness({ personaId: PERSONA_IDS.clinAlpha1 });
    const all = await h.repo.listPatients({ pageSize: 200 });
    const names = all.items.map((p) => p.displayName);
    expect([...names].sort()).toEqual(names);
    const first = all.items[0]!;
    const byName = await h.repo.listPatients({ q: first.displayName.slice(0, 5).toUpperCase() });
    expect(byName.items.map((p) => p.id)).toContain(first.id);
    const byId = await h.repo.listPatients({ q: first.syntheticIdentifier.toLowerCase() });
    expect(byId.items.map((p) => p.id)).toEqual([first.id]);
    const page2 = await h.repo.listPatients({ page: 2, pageSize: 3 });
    expect(page2).toMatchObject({ page: 2, pageSize: 3, total: all.total });
    expect(page2.items.map((p) => p.id)).toEqual(all.items.slice(3, 6).map((p) => p.id));
    const own = await h.repo.listPatients({
      facilityIds: [FACILITY_IDS.alpha1],
      districtIds: ["dist-alpha"],
    });
    expect(own.total).toBe(all.total);
    await expect(h.repo.listPatients({ pageSize: 0 })).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });

  it("a programme-wide citizen sees only own linked records", async () => {
    const h = await createHarness({ appId: "citizen", personaId: PERSONA_IDS.citizen1 });
    const linked = h.persona(PERSONA_IDS.citizen1).linkedPatientIds;
    const list = await h.repo.listPatients();
    expect(list.items.map((p) => p.id).sort()).toEqual([...linked].sort());
    expect((await h.repo.getPatient(linked[0]!))?.id).toBe(linked[0]);
  });

  it("registerPatient creates an unverified synthetic record and audits it", async () => {
    const h = await createHarness({ appId: "worker", personaId: PERSONA_IDS.chwAlpha1A });
    const result = await h.repo.registerPatient(
      {
        ...registration,
        givenName: "Demo",
        familyName: "Newcomer",
        estimatedAgeYears: 33,
        dateOfBirth: undefined,
      },
      h.key(),
    );
    expect(result.data).toMatchObject({
      displayName: "Demo Newcomer",
      facilityId: FACILITY_IDS.alpha1,
      districtId: "dist-alpha",
      identityStatus: "unverified",
      estimatedAgeYears: 33,
      dateOfBirth: null,
      synthetic: true,
      version: 1,
    });
    expect(result.data.syntheticIdentifier).toMatch(/^DEMO-R-/u);
    const audit = (await h.store.getAll<AuditEvent>("auditEvents")).find(
      (e) => e.id === result.auditEventId,
    );
    expect(audit).toMatchObject({ action: "patient.registered", patientId: result.data.id });
    expect((await h.repo.sync.list())[0]).toMatchObject({
      entityType: "patient",
      opType: "create",
    });
  });

  it("registration outside the worker's facility / unknown facility is refused", async () => {
    const h = await createHarness({ appId: "worker", personaId: PERSONA_IDS.chwAlpha1A });
    await expect(
      h.repo.registerPatient({ ...registration, facilityId: FACILITY_IDS.beta1 }, h.key()),
    ).rejects.toMatchObject({ code: "FORBIDDEN", reason: "SCOPE" });
    await expect(
      h.repo.registerPatient({ ...registration, facilityId: "fac-nowhere" }, h.key()),
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      fieldErrors: { facilityId: { key: "invalid" } },
    });
    h.as(PERSONA_IDS.clinAlpha1);
    await expect(h.repo.registerPatient(registration, h.key())).rejects.toMatchObject({
      reason: "ROLE",
    });
  });

  it("findPatientMatches scores in-scope candidates; register anyway flags needs_match_review", async () => {
    const h = await createHarness({ appId: "worker", personaId: PERSONA_IDS.chwAlpha1A });
    const existing = h.seed.patients.find((p) => p.facilityId === FACILITY_IDS.alpha1)!;
    const [given, ...family] = existing.displayName.split(" ");
    const input = {
      ...registration,
      givenName: given!,
      familyName: family.join(" "),
      dateOfBirth: existing.dateOfBirth ?? "1970-01-01",
      sex: existing.sexOptional === "female" ? ("female" as const) : ("male" as const),
    };
    const matches = await h.repo.findPatientMatches(input);
    expect(matches[0]?.patient.id).toBe(existing.id);
    expect(matches[0]?.score).toBeGreaterThanOrEqual(0.75);
    expect(matches.every((m) => m.patient.facilityId === FACILITY_IDS.alpha1)).toBe(true);
    const scores = matches.map((m) => m.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);

    const flagged = await h.repo.registerPatient(
      { ...input, matchDecision: "register_anyway_flagged" },
      h.key(),
    );
    expect(flagged.data.identityStatus).toBe("needs_match_review");
    expect(flagged.data.duplicateCandidateIds).toContain(existing.id);
    const actions = (await h.store.getAll<AuditEvent>("auditEvents")).map((e) => e.action);
    expect(actions).toContain("patient.match_flagged");
    await expect(h.repo.findPatientMatches({ ...input, sex: "x" } as never)).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });

  it("HWM-04: register keeps the optional village label + synthetic phone; replays are idempotent", async () => {
    const h = await createHarness({ appId: "worker", personaId: PERSONA_IDS.chwAlpha1A });
    const input = {
      ...registration,
      givenName: "Demo",
      familyName: "Village-Person",
      villageLabel: "Demo Cell A",
      syntheticPhone: "0780000001",
    };
    const key = h.key();
    const first = await h.repo.registerPatient(input, key);
    expect(first.data).toMatchObject({ villageLabel: "Demo Cell A", syntheticPhone: "0780000001" });
    const again = await h.repo.registerPatient(input, key);
    expect(again.data.id).toBe(first.data.id);
    const rows = (await h.store.getAll<Patient>("patients")).filter(
      (p) => p.displayName === "Demo Village-Person",
    );
    expect(rows).toHaveLength(1);
    const bare = await h.repo.registerPatient({ ...registration, familyName: "Bare" }, h.key());
    expect("villageLabel" in bare.data).toBe(false);
    expect("syntheticPhone" in bare.data).toBe(false);
  });

  it("getPatient: null when missing, audited access when found", async () => {
    const h = await createHarness({ personaId: PERSONA_IDS.clinBeta1 });
    const patient = (await h.store.get<Patient>(
      "patients",
      SEED_ANCHORS.WF04_OTHER_FACILITY_PATIENT.patientId,
    ))!;
    expect(await h.repo.getPatient(patient.id)).toEqual(patient);
    expect(await h.repo.getPatient("nope")).toBeNull();
  });
});
