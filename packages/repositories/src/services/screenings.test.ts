import type { AuditEvent, DemoRuleset, Review, Screening } from "@laif/domain";
import { FACILITY_IDS, PERSONA_IDS, SEED_ANCHORS } from "@laif/mock-data";
import { describe, expect, it } from "vitest";

import { createHarness, type Harness } from "../testing/harness.ts";

const patientOf = (h: Harness) =>
  h.seed.patients.find((p) => p.facilityId === FACILITY_IDS.alpha1)!;

describe("screenings service", () => {
  it("drafts: create, update in place, list own drafts only, discard; never synced", async () => {
    const h = await createHarness({ appId: "worker", personaId: PERSONA_IDS.chwAlpha1A });
    const patient = patientOf(h);
    const draft = await h.repo.saveScreeningDraft(
      { patientId: patient.id, systolic: 141, glucoseValue: 7.2, notes: "partial" },
      h.key(),
    );
    expect(draft.data).toMatchObject({
      status: "draft",
      systolic: 141,
      flag: null,
      source: "worker_mobile",
    });
    const updated = await h.repo.saveScreeningDraft(
      {
        screeningId: draft.data.id,
        patientId: patient.id,
        measuredAt: "2026-10-14T05:00:00.000Z",
        diastolic: 90,
        glucoseUnit: "mmol/L",
        glucoseContext: "fasting",
        captureDurationSeconds: 120,
      },
      h.key(),
    );
    expect(updated.data).toMatchObject({
      id: draft.data.id,
      systolic: 141,
      diastolic: 90,
      version: 2,
    });
    const drafts = await h.repo.listScreenings({ statuses: ["draft"], patientId: patient.id });
    expect(drafts.items.map((s) => s.id)).toContain(draft.data.id);
    const normal = await h.repo.listScreenings({ patientId: patient.id });
    expect(normal.items.some((s) => s.status === "draft")).toBe(false);
    expect(await h.repo.getScreening(draft.data.id)).toMatchObject({ id: draft.data.id });
    expect(await h.repo.sync.list()).toEqual([]);

    h.as(PERSONA_IDS.chwAlpha1B);
    expect(await h.repo.getScreening(draft.data.id)).toBeNull();
    await expect(
      h.repo.saveScreeningDraft({ screeningId: draft.data.id, patientId: patient.id }, h.key()),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(h.repo.discardScreeningDraft(draft.data.id, h.key())).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    h.as(PERSONA_IDS.chwAlpha1A);
    const discarded = await h.repo.discardScreeningDraft(draft.data.id, h.key());
    expect(discarded.data.id).toBe(draft.data.id);
    expect(await h.store.get("screenings", draft.data.id)).toBeUndefined();
    const actions = (await h.store.getAll<AuditEvent>("auditEvents")).map((e) => e.action);
    expect(actions).toEqual(
      expect.arrayContaining(["screening.draft_saved", "screening.draft_discarded"]),
    );
    expect(await h.repo.sync.list()).toEqual([]);
  });

  it("a submitted screening is immutable except via amendment", async () => {
    const h = await createHarness({ personaId: PERSONA_IDS.chwAlpha1A });
    const submitted = h.seed.screenings.find(
      (s) => s.status !== "draft" && s.workerId === PERSONA_IDS.chwAlpha1A,
    )!;
    await expect(
      h.repo.saveScreeningDraft(
        { screeningId: submitted.id, patientId: submitted.patientId },
        h.key(),
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR", invariantCode: "SCREENING_IMMUTABLE" });
    await expect(h.repo.discardScreeningDraft(submitted.id, h.key())).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      invariantCode: "SCREENING_IMMUTABLE",
    });
    await expect(
      h.repo.saveScreeningDraft({ patientId: "missing-patient" }, h.key()),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("amendScreening appends an attributable amendment and bumps the version", async () => {
    const h = await createHarness({ personaId: PERSONA_IDS.nurseAlpha2 });
    const amended = SEED_ANCHORS.AMENDED_SCREENING.screeningId;
    const before = (await h.store.get<Screening>("screenings", amended))!;
    const result = await h.repo.amendScreening(
      {
        screeningId: amended,
        expectedVersion: before.version,
        field: "diastolic",
        after: 88,
        reason: "Transcription error corrected from paper form.",
      },
      h.key(),
    );
    expect(result.data.version).toBe(before.version + 1);
    expect(result.data.diastolic).toBe(before.diastolic);
    expect(result.data.amendments).toHaveLength(before.amendments.length + 1);
    expect(result.data.amendments.at(-1)).toMatchObject({
      field: "diastolic",
      before: before.diastolic,
      after: 88,
      amendedBy: PERSONA_IDS.nurseAlpha2,
    });
    await expect(
      h.repo.amendScreening(
        {
          screeningId: amended,
          expectedVersion: before.version,
          field: "systolic",
          after: 120,
          reason: "Stale version attempt here.",
        },
        h.key(),
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      h.repo.amendScreening(
        {
          screeningId: amended,
          expectedVersion: result.entityVersion,
          field: "systolic",
          after: 400,
          reason: "Out of plausible range here.",
        },
        h.key(),
      ),
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      fieldErrors: { after: { key: "numberOutOfRange" } },
    });
    await expect(
      h.repo.amendScreening(
        {
          screeningId: amended,
          expectedVersion: result.entityVersion,
          field: "systolic",
          after: 120,
          reason: "short",
        },
        h.key(),
      ),
    ).rejects.toMatchObject({ fieldErrors: { reason: { key: "reasonTooShort" } } });
  });

  it("createScreening uses the ruleset STORED with the dataset (not a constant)", async () => {
    const h = await createHarness({ personaId: PERSONA_IDS.chwAlpha1A });
    const [stored] = await h.store.getAll<DemoRuleset & { id: string }>("rulesets");
    await h.store.put("rulesets", {
      ...stored!,
      thresholds: { ...stored!.thresholds, DEMO_SYSTOLIC_REVIEW_AT_OR_ABOVE: 120 },
    });
    const result = await h.repo.createScreening(
      {
        patientId: patientOf(h).id,
        measuredAt: "2026-10-14T05:00:00.000Z",
        systolic: 125,
        diastolic: 80,
      },
      h.key(),
    );
    expect(result.data.status).toBe("review_required");
    const reviews = (await h.store.getAll<Review>("reviews")).filter(
      (r) => r.screeningId === result.data.id,
    );
    expect(reviews).toHaveLength(1);
    expect(reviews[0]?.evidenceSnapshot.inputs.systolic).toBe(125);

    const normal = await h.repo.createScreening(
      {
        patientId: patientOf(h).id,
        measuredAt: "2026-10-14T05:00:00.000Z",
        systolic: 110,
        diastolic: 70,
        notes: " ok ",
      },
      h.key(),
    );
    expect(normal.data).toMatchObject({
      status: "no_review_required",
      notes: "ok",
      source: "clinical_web",
    });

    await h.store.delete("rulesets", stored!.id);
    await expect(
      h.repo.createScreening(
        {
          patientId: patientOf(h).id,
          measuredAt: "2026-10-14T05:00:00.000Z",
          systolic: 110,
          diastolic: 70,
        },
        h.key(),
      ),
    ).rejects.toMatchObject({ code: "DEPENDENCY_UNAVAILABLE" });
  });

  it("validation: future / too old measuredAt, diastolic ≥ systolic, missing glucose unit", async () => {
    const h = await createHarness({ personaId: PERSONA_IDS.chwAlpha1A });
    const base = {
      patientId: patientOf(h).id,
      measuredAt: "2026-10-14T05:00:00.000Z",
      systolic: 120,
      diastolic: 80,
    };
    await expect(
      h.repo.createScreening({ ...base, measuredAt: "2026-10-15T06:00:00.000Z" }, h.key()),
    ).rejects.toMatchObject({
      fieldErrors: { measuredAt: { key: "dateInFuture" } },
    });
    await expect(
      h.repo.createScreening({ ...base, measuredAt: "2026-08-01T06:00:00.000Z" }, h.key()),
    ).rejects.toMatchObject({
      fieldErrors: { measuredAt: { key: "dateTooOld" } },
    });
    await expect(
      h.repo.createScreening({ ...base, diastolic: 130 }, h.key()),
    ).rejects.toMatchObject({
      fieldErrors: { diastolic: { key: "diastolicNotBelowSystolic" } },
    });
    await expect(
      h.repo.createScreening({ ...base, glucoseValue: 6 }, h.key()),
    ).rejects.toMatchObject({
      fieldErrors: { glucoseUnit: { key: "unitRequired" } },
    });
  });

  it("list filters and getScreening scope", async () => {
    const h = await createHarness({ personaId: PERSONA_IDS.clinAlpha1 });
    const flagged = await h.repo.listScreenings({ statuses: ["review_required"], pageSize: 200 });
    expect(
      flagged.items.every(
        (s) => s.status === "review_required" && s.facilityId === FACILITY_IDS.alpha1,
      ),
    ).toBe(true);
    const ranged = await h.repo.listScreenings({
      from: "2026-10-01T00:00:00.000Z",
      to: "2026-10-14T06:00:00.000Z",
    });
    expect(ranged.items.every((s) => s.measuredAt >= "2026-10-01")).toBe(true);
    const dates = ranged.items.map((s) => s.measuredAt);
    expect([...dates].sort().reverse()).toEqual(dates);
    const district = await h.repo.listScreenings({
      districtIds: ["dist-alpha"],
      facilityIds: [FACILITY_IDS.alpha1],
    });
    expect(district.total).toBeGreaterThan(0);
    await expect(
      h.repo.getScreening(SEED_ANCHORS.WF04_OTHER_FACILITY_PATIENT.screeningId),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(await h.repo.getScreening("missing")).toBeNull();
    await expect(
      h.repo.listScreenings({ from: "2026-10-10T00:00:00.000Z", to: "2026-10-01T00:00:00.000Z" }),
    ).rejects.toMatchObject({ fieldErrors: { to: { key: "dateRangeOrder" } } });
  });
});
