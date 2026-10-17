// @vitest-environment node
/**
 * HWM-04 data layer: facility-scoped cached search (name contains, identifier prefix, accents),
 * scope-checked context read (audited), duplicate candidates and the atomic, idempotent
 * offline registration that syncs to exactly one remote patient.
 */
import { deriveSyncState, type AuditEvent, type Patient } from "@laif/domain";
import { FACILITY_IDS, PERSONA_IDS } from "@laif/mock-data";
import { createTestRepository, type TestRepository } from "@laif/test-utils";
import { describe, expect, it } from "vitest";

import * as patients from "../patients.ts";

const WORKER = PERSONA_IDS.chwAlpha1A;
const FACILITY = FACILITY_IDS.alpha1;

const worker = (offline = false) =>
  createTestRepository({
    appId: "worker",
    persona: WORKER,
    ...(offline ? { faults: { offline: true } } : {}),
  });

const local = (t: TestRepository) => t.store.getAll<Patient>("patients");
const audit = (t: TestRepository) => t.store.getAll<AuditEvent>("auditEvents");

/** A patient of another facility that (wrongly) reached this device. */
async function plantForeignPatient(t: TestRepository): Promise<Patient> {
  const template = (await local(t))[0]!;
  const foreign: Patient = {
    ...template,
    id: "11111111-1111-4111-8111-111111111111" as Patient["id"],
    syntheticIdentifier: "DEMO-P-9901",
    displayName: "Qorvox Foreign",
    facilityId: FACILITY_IDS.beta1,
    districtId: "dist-beta" as Patient["districtId"],
  };
  await t.store.put("patients", foreign);
  return foreign;
}

const registration = {
  givenName: "Demo",
  familyName: "Newperson",
  dateOfBirth: "1984-05-06",
  sex: "female" as const,
  facilityId: FACILITY,
};

describe("patients.search (HWM-04 task 1)", () => {
  it("returns only the session facility's patients; 'dem' matches identifiers by prefix", async () => {
    const t = await worker();
    const foreign = await plantForeignPatient(t);
    const all = await local(t);
    expect(all.some((p) => p.id === foreign.id)).toBe(true);

    const byPrefix = await patients.search(t.repo, { facilityId: FACILITY, query: "dem" });
    expect(byPrefix.total).toBe(all.filter((p) => p.facilityId === FACILITY).length);
    expect(byPrefix.items.every((p) => p.facilityId === FACILITY)).toBe(true);
    expect(byPrefix.items.map((p) => p.id)).not.toContain(foreign.id);
    expect(byPrefix.items.length).toBeLessThanOrEqual(patients.PATIENT_SEARCH_LIMIT);

    const exact = await patients.search(t.repo, { facilityId: FACILITY, query: "demo-p-0005" });
    expect(exact.items.map((p) => p.syntheticIdentifier)).toEqual(["DEMO-P-0005"]);
    // Identifier is prefix-only ("P-0005" is inside, not a prefix).
    expect((await patients.search(t.repo, { facilityId: FACILITY, query: "P-0005" })).total).toBe(
      0,
    );
    // Foreign patient name never found from this facility.
    const foreignName = await patients.search(t.repo, { facilityId: FACILITY, query: "Foreign" });
    expect(foreignName.total).toBe(0);
  });

  it("name search is case- and diacritic-insensitive and pages with limit/offset", async () => {
    const t = await worker();
    const accented = await patients.search(t.repo, { facilityId: FACILITY, query: "QÒRVOX" });
    expect(accented.items.map((p) => p.displayName)).toEqual(["Qorvox Zelqarqo"]);
    const page = await patients.search(t.repo, {
      facilityId: FACILITY,
      query: "demo",
      limit: 5,
      offset: 5,
    });
    const all = await patients.search(t.repo, { facilityId: FACILITY, query: "demo" });
    expect(page.items.map((p) => p.id)).toEqual(all.items.slice(5, 10).map((p) => p.id));
    expect(page.total).toBe(all.total);
  });

  it("fewer than 2 characters searches nothing", async () => {
    const t = await worker();
    expect(await patients.search(t.repo, { facilityId: FACILITY, query: " q " })).toEqual({
      items: [],
      total: 0,
    });
  });
});

describe("patients.get (HWM-04 task 3)", () => {
  it("in scope → ok + patient.viewed audit", async () => {
    const t = await worker();
    const patient = (await local(t))[0]!;
    const access = await patients.get(t.repo, FACILITY, patient.id);
    expect(access).toEqual({ status: "ok", patient });
    const viewed = (await audit(t)).filter((e) => e.action === "patient.viewed");
    expect(viewed.map((e) => e.entityId)).toEqual([patient.id]);
  });

  it("another facility's id → denied + exactly one access.denied, never the record", async () => {
    const t = await worker();
    const foreign = await plantForeignPatient(t);
    const access = await patients.get(t.repo, FACILITY, foreign.id);
    expect(access.status).toBe("denied");
    expect("patient" in access).toBe(false);
    const denied = (await audit(t)).filter((e) => e.action === "access.denied");
    expect(denied).toHaveLength(1);
    expect(denied[0]).toMatchObject({ entityType: "patient", entityId: foreign.id });
    expect((await audit(t)).some((e) => e.action === "patient.viewed")).toBe(false);
  });

  it("an id not on this device → denied (NOT_ON_DEVICE) + access.denied", async () => {
    const t = await worker();
    const access = await patients.get(t.repo, FACILITY, "patient-not-here");
    expect(access).toEqual({ status: "denied", reason: "NOT_ON_DEVICE" });
    const denied = (await audit(t)).filter((e) => e.action === "access.denied");
    expect(denied).toHaveLength(1);
    expect(denied[0]).toMatchObject({
      outcome: "denied",
      changeSummary: { reason: "NOT_ON_DEVICE", route: "patient_context" },
    });
  });

  it("history: submitted screenings newest first (no drafts) + open follow-ups", async () => {
    const t = await worker();
    const followUps = await t.repo.listFollowUps({ assignedWorkerId: WORKER, pageSize: 200 });
    const withTask = followUps.items.find((f) => f.status === "assigned")!;
    const result = await patients.history(t.repo, FACILITY, withTask.patientId);
    expect(result.openFollowUps.map((f) => f.id)).toContain(withTask.id);
    expect(result.openFollowUps.every((f) => ["assigned", "contacted"].includes(f.status))).toBe(
      true,
    );
    expect(result.screenings.every((s) => s.status !== "draft")).toBe(true);
    const dates = result.screenings.map((s) => s.measuredAt);
    expect([...dates].sort().reverse()).toEqual(dates);
  });
});

describe("patients.findCandidates (HWM-04 task 6)", () => {
  it("same DOB + similar name → candidate with reasons; a different person → none", async () => {
    const t = await worker();
    const now = new Date(t.clock.nowIso());
    const near = await patients.findCandidates(
      t.repo,
      {
        givenName: "Qorvoks",
        familyName: "Zelqarqo",
        dateOfBirth: "1981-12-11",
        sex: "male",
        facilityId: FACILITY,
      },
      now,
    );
    expect(near.map((c) => c.patient.syntheticIdentifier)).toEqual(["DEMO-P-0005"]);
    expect(near[0]!.reasons).toEqual(["similar_name", "same_date_of_birth", "same_sex"]);
    expect(near[0]!.score).toBeGreaterThanOrEqual(0.75);

    const none = await patients.findCandidates(t.repo, registration, now);
    expect(none).toEqual([]);
  });
});

describe("patients.register (HWM-04 task 7)", () => {
  it("offline: one patient row + one patient.register op + audit; double tap → one; syncs to one remote patient", async () => {
    const t = await worker(true);
    const before = (await local(t)).length;
    const key = t.key();
    const [first, second] = await Promise.all([
      patients.register(t.repo, registration, key),
      patients.register(t.repo, registration, key),
    ]);
    expect(second.id).toBe(first.id);
    // FND entities start at version 1 (the phase's `version=0` / `origin='device'` are logical).
    expect(first).toMatchObject({
      version: 1,
      identityStatus: "unverified",
      facilityId: FACILITY,
    });
    expect(first.syntheticIdentifier).toMatch(/^DEMO-/u);
    const rows = await local(t);
    expect(rows).toHaveLength(before + 1);

    const ops = await t.repo.sync.list({ entityId: first.id });
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ entityType: "patient", opType: "create", status: "queued" });
    expect(deriveSyncState(first.id, ops)).toBe("saved_locally");
    const actions = (await audit(t)).filter((e) => e.entityId === first.id).map((e) => e.action);
    // The second tap is suppressed by the idempotency key (and audited as such).
    expect(actions.sort()).toEqual(["patient.registered", "sync.duplicate_suppressed"]);

    // Offline pass sends nothing.
    await t.repo.sync.process({ trigger: "manual" });
    expect((await t.store.getAll<Patient>("remote_patients")).some((p) => p.id === first.id)).toBe(
      false,
    );
    await t.repo.demo.setFaults({ offline: false });
    await t.repo.sync.process({ trigger: "manual" });
    await t.repo.sync.process({ trigger: "manual" });
    const remote = (await t.store.getAll<Patient>("remote_patients")).filter(
      (p) => p.displayName === "Demo Newperson",
    );
    expect(remote).toHaveLength(1);
    expect((await t.repo.sync.list({ entityId: first.id }))[0]!.status).toBe("acknowledged");
  });

  it("register anyway → needs_match_review + patient.match_flagged; nothing merged", async () => {
    const t = await worker();
    const flagged = await patients.register(
      t.repo,
      {
        givenName: "Qorvox",
        familyName: "Zelqarqo",
        dateOfBirth: "1981-12-11",
        sex: "male",
        facilityId: FACILITY,
        matchDecision: "register_anyway_flagged",
      },
      t.key(),
    );
    expect(flagged.identityStatus).toBe("needs_match_review");
    const existing = (await local(t)).find((p) => p.syntheticIdentifier === "DEMO-P-0005")!;
    expect(flagged.duplicateCandidateIds).toContain(existing.id);
    expect(existing.identityStatus).toBe("verified_local");
    const actions = (await audit(t)).filter((e) => e.entityId === flagged.id).map((e) => e.action);
    expect(actions.sort()).toEqual(["patient.match_flagged", "patient.registered"]);
  });
});
