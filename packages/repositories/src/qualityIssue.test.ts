/**
 * ADM-06 data-quality issues over the in-memory adapter and Dexie (fake-indexeddb): detection
 * upsert preserves triage (idempotent count, one system `admin.quality_issue.detected` per new
 * id), version conflict, idempotent triage, the state machine, FORBIDDEN for the auditor and out
 * of scope (+ `access.denied`), send-to-facility needing a programme action, no clinical record
 * touched (table snapshots before / after triage) and the metrics read carrying triage status.
 */
import { detectQualityIssues, filterDataset, openQualityIssueCount } from "@laif/analytics";
import type { DetectedQualityIssue } from "@laif/contracts";
import type { AuditEvent } from "@laif/domain";
import { FACILITY_IDS, PERSONA_IDS } from "@laif/mock-data";
import { afterEach, describe, expect, it } from "vitest";

import { openDexie, type ReopenableStore } from "../test/adapters.ts";
import { createMemoryStoreAdapter } from "./store/memory-adapter.ts";
import type { StoreAdapter } from "./store/store-adapter.ts";
import { createHarness, type Harness } from "./testing/harness.ts";

type Case = [string, () => { store: StoreAdapter; dispose: () => Promise<void> }];

let opened: ReopenableStore | null = null;
const cases: Case[] = [
  ["memory", () => ({ store: createMemoryStoreAdapter(), dispose: () => Promise.resolve() })],
  [
    "dexie",
    () => {
      opened = openDexie();
      return { store: opened.store, dispose: () => opened?.dispose() ?? Promise.resolve() };
    },
  ],
];

const CLINICAL = ["patients", "screenings", "reviews", "referrals", "followUps", "careTasks"];

async function snapshot(store: StoreAdapter) {
  return store.transaction(async (tx) =>
    Promise.all(CLINICAL.map((c) => tx.getAll(c as "patients"))),
  );
}

async function events(store: StoreAdapter, action: string): Promise<AuditEvent[]> {
  return (await store.getAll<AuditEvent>("auditEvents")).filter((e) => e.action === action);
}

const PERIOD = { from: "2000-01-01", to: "2100-01-01" } as const;

/** Detection over the actor's metrics read (the admin app's query path). */
async function detect(h: Harness): Promise<{ issues: DetectedQualityIssue[]; open: number }> {
  const read = await h.repo.getMetricsRecords(PERIOD);
  const ds = filterDataset(read.records, PERIOD, new Date(read.asOf));
  return { issues: detectQualityIssues(ds), open: openQualityIssueCount(ds) };
}

function issue(overrides: Partial<DetectedQualityIssue> = {}): DetectedQualityIssue {
  return {
    id: "dqi_00000000000000a1",
    type: "missing_field",
    subjectRef: "SCR-0000a1a1",
    facilityId: FACILITY_IDS.alpha1,
    districtId: "dist-alpha" as DetectedQualityIssue["districtId"],
    detectedAt: "2026-10-01T08:00:00.000Z",
    sourceApp: "import",
    details: {
      rule: "DQ-01-MANDATORY-FIELDS",
      fields: ["glucoseUnit"],
      rulesetVersion: "demo-ruleset-2026.10-v1",
      records: 1,
    },
    ...overrides,
  };
}

describe.each(cases)("data-quality issues (%s)", (_name, make) => {
  let dispose: () => Promise<void> = () => Promise.resolve();
  afterEach(async () => {
    await dispose();
    opened = null;
  });

  async function setup(personaId: string = PERSONA_IDS.analystAlpha) {
    const made = make();
    dispose = made.dispose;
    return createHarness({ appId: "admin", personaId, store: made.store });
  }

  it("upsert inserts new ids only, never resets triage; detection is idempotent", async () => {
    const h = await setup();
    const first = await h.repo.upsertDetectedIssues([issue(), issue()]);
    expect(first).toEqual({ inserted: [issue().id], total: 1 });
    const detected = await events(h.store, "admin.quality_issue.detected");
    expect(detected).toHaveLength(1);
    expect(detected[0]).toMatchObject({
      actorId: null,
      actorRole: null,
      entityType: "data_quality_issue",
      entityId: issue().id,
      facilityId: FACILITY_IDS.alpha1,
      patientId: null,
      changeSummary: { type: "missing_field", subjectRef: "SCR-0000a1a1" },
    });
    await h.repo.triageQualityIssue(
      { action: "acknowledge", id: issue().id, expectedVersion: 1 },
      h.key(),
    );
    // Re-running detection keeps the triage and writes no second detected event.
    const again = await h.repo.upsertDetectedIssues([
      issue({ detectedAt: "2026-10-02T08:00:00.000Z" }),
    ]);
    expect(again).toEqual({ inserted: [], total: 1 });
    const [stored] = await h.repo.listQualityIssues();
    expect(stored).toMatchObject({ status: "acknowledged", version: 2 });
    expect(stored?.detectedAt).toBe("2026-10-01T08:00:00.000Z");
    expect(await events(h.store, "admin.quality_issue.detected")).toHaveLength(1);
  });

  it("detection over the metrics read is idempotent; triage status flows into the read", async () => {
    const h = await setup();
    const { issues, open } = await detect(h);
    expect(issues.length).toBeGreaterThan(0);
    expect(open).toBe(issues.length);
    expect((await h.repo.upsertDetectedIssues(issues)).inserted).toHaveLength(issues.length);
    expect((await h.repo.upsertDetectedIssues(issues)).inserted).toHaveLength(0);
    expect(await h.store.getAll("dataQualityIssues")).toHaveLength(issues.length);
    const target = issues[0];
    if (target === undefined) throw new Error("no issue");
    await h.repo.triageQualityIssue(
      { action: "acknowledge", id: target.id, expectedVersion: 1 },
      h.key(),
    );
    const after = await detect(h);
    expect(after.issues).toEqual(issues);
    expect(after.open).toBe(issues.length - 1);
    // The aggregate read never carries identifiers.
    const read = await h.repo.getMetricsRecords(PERIOD);
    expect(read.records.patients.every((p) => p.syntheticIdentifier === "")).toBe(true);
    expect(read.records.qualityIssueStatus?.[target.id]).toBe("acknowledged");
  });

  it("resolve: note 10–500 required; history lists actor, role and time; audit has the note length", async () => {
    const h = await setup();
    await h.repo.upsertDetectedIssues([issue()]);
    const before = await snapshot(h.store);
    await expect(
      h.repo.triageQualityIssue(
        { action: "resolve", id: issue().id, expectedVersion: 1, note: "abc" },
        h.key(),
      ),
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      fieldErrors: { note: { key: "tooShort" } },
    });
    const note = "Unit confirmed with the facility register";
    const resolved = await h.repo.triageQualityIssue(
      { action: "resolve", id: issue().id, expectedVersion: 1, note, correlationId: "corr-adm-1" },
      h.key(),
    );
    expect(resolved.data).toMatchObject({
      status: "resolved_with_note",
      note,
      version: 2,
      updatedBy: PERSONA_IDS.analystAlpha,
      history: [
        {
          by: PERSONA_IDS.analystAlpha,
          role: "district_analyst",
          action: "resolve",
          fromStatus: "open",
          toStatus: "resolved_with_note",
          noteLength: note.length,
        },
      ],
    });
    expect(resolved.data.history[0]?.at).toBe(resolved.data.updatedAt);
    const [event] = await events(h.store, "admin.quality_issue.triaged");
    expect(event).toMatchObject({
      actorId: PERSONA_IDS.analystAlpha,
      actorRole: "district_analyst",
      facilityId: FACILITY_IDS.alpha1,
      correlationId: "corr-adm-1",
      changeSummary: {
        fromStatus: "open",
        toStatus: "resolved_with_note",
        noteLength: note.length,
        actorRole: "district_analyst",
      },
    });
    expect(JSON.stringify(event)).not.toContain(note);
    // Terminal.
    await expect(
      h.repo.triageQualityIssue(
        { action: "acknowledge", id: issue().id, expectedVersion: 2 },
        h.key(),
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR", reason: "INVALID_TRANSITION" });
    // Triage never changes a clinical record.
    expect(await snapshot(h.store)).toEqual(before);
  });

  it("version conflict returns the latest; replay with the same key writes once", async () => {
    const h = await setup();
    await h.repo.upsertDetectedIssues([issue()]);
    const key = h.key();
    const first = await h.repo.triageQualityIssue(
      { action: "acknowledge", id: issue().id, expectedVersion: 1 },
      key,
    );
    const replay = await h.repo.triageQualityIssue(
      { action: "acknowledge", id: issue().id, expectedVersion: 1 },
      key,
    );
    expect(replay.replayed).toBe(true);
    expect(replay.data).toEqual(first.data);
    expect(await events(h.store, "admin.quality_issue.triaged")).toHaveLength(1);
    await expect(
      h.repo.triageQualityIssue(
        { action: "resolve", id: issue().id, expectedVersion: 1, note: "Stale tab resolving it" },
        h.key(),
      ),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      conflict: { expectedVersion: 1, currentVersion: 2, latest: { status: "acknowledged" } },
    });
    expect((await events(h.store, "conflict.detected")).at(-1)).toMatchObject({
      entityType: "data_quality_issue",
      entityId: issue().id,
    });
  });

  it("send to facility needs programme_action.write and a programme action of that facility", async () => {
    const h = await setup();
    await h.repo.upsertDetectedIssues([issue()]);
    await expect(
      h.repo.triageQualityIssue(
        {
          action: "send_to_facility",
          id: issue().id,
          expectedVersion: 1,
          programmeActionId: "nope",
        },
        h.key(),
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR", fieldErrors: { programmeActionId: {} } });
    const action = await h.repo.createProgrammeAction(
      {
        facilityId: FACILITY_IDS.alpha1,
        category: "data_completeness_check",
        title: "Review MISSING FIELD issue SCR-0000a1a1",
        dueDate: "2026-10-30",
        sourceContext: { page: "quality", filters: {} },
      },
      h.key(),
    );
    const sent = await h.repo.triageQualityIssue(
      {
        action: "send_to_facility",
        id: issue().id,
        expectedVersion: 1,
        programmeActionId: action.data.id,
      },
      h.key(),
    );
    expect(sent.data).toMatchObject({
      status: "sent_to_facility",
      programmeActionId: action.data.id,
    });
    // A facility manager can resolve but not send.
    await h.repo.upsertDetectedIssues([
      issue({ id: "dqi_00000000000000b2", subjectRef: "SCR-0000b2b2" }),
    ]);
    h.as(PERSONA_IDS.fmgrAlpha1);
    await expect(
      h.repo.triageQualityIssue(
        {
          action: "send_to_facility",
          id: "dqi_00000000000000b2",
          expectedVersion: 1,
          programmeActionId: action.data.id,
        },
        h.key(),
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const done = await h.repo.triageQualityIssue(
      {
        action: "resolve",
        id: issue().id,
        expectedVersion: 2,
        note: "Facility corrected at source",
      },
      h.key(),
    );
    expect(done.data.status).toBe("resolved_with_note");
  });

  it("FORBIDDEN: the auditor cannot triage; out-of-scope upserts and triage are denied", async () => {
    const h = await setup(PERSONA_IDS.leadProgramme);
    await h.repo.upsertDetectedIssues([
      issue(),
      issue({
        id: "dqi_00000000000000c3",
        subjectRef: "SCR-0000c3c3",
        facilityId: FACILITY_IDS.beta1,
        districtId: "dist-beta" as DetectedQualityIssue["districtId"],
      }),
    ]);
    h.as(PERSONA_IDS.auditorProgramme);
    expect(await h.repo.listQualityIssues()).toHaveLength(2);
    await expect(
      h.repo.triageQualityIssue(
        { action: "acknowledge", id: issue().id, expectedVersion: 1 },
        h.key(),
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN", reason: "ROLE" });
    expect((await events(h.store, "access.denied")).at(-1)).toMatchObject({
      entityType: "data_quality_issue",
      outcome: "denied",
      actorRole: "auditor",
    });
    h.as(PERSONA_IDS.analystAlpha);
    expect((await h.repo.listQualityIssues()).map((i) => i.id)).toEqual([issue().id]);
    await expect(
      h.repo.triageQualityIssue(
        { action: "acknowledge", id: "dqi_00000000000000c3", expectedVersion: 1 },
        h.key(),
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN", reason: "SCOPE" });
    await expect(
      h.repo.upsertDetectedIssues([
        issue({
          id: "dqi_00000000000000d4",
          subjectRef: "SCR-0000d4d4",
          facilityId: FACILITY_IDS.beta1,
          districtId: "dist-beta" as DetectedQualityIssue["districtId"],
        }),
      ]),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await h.store.getAll("dataQualityIssues")).toHaveLength(2);
    expect(
      (await h.store.getAll<{ status: string }>("dataQualityIssues")).map((i) => i.status),
    ).toEqual(["open", "open"]);
  });
});
