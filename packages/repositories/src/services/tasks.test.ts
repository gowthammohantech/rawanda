import type { CareTask, Screening } from "@laif/domain";
import { FACILITY_IDS, PERSONA_IDS, SEED_ANCHORS } from "@laif/mock-data";
import { describe, expect, it } from "vitest";

import { createHarness } from "../testing/harness.ts";

describe("care tasks + correction requests", () => {
  it("createTask / updateTask lifecycle with machine checks", async () => {
    const h = await createHarness({ personaId: PERSONA_IDS.clinAlpha1 });
    const created = await h.repo.createTask(
      {
        kind: "callback_request",
        patientId: SEED_ANCHORS.WF01_FLAGGED_REVIEW.patientId,
        assignedToId: PERSONA_IDS.coordAlpha,
        payload: { topic: "appointment_question", window: "morning", note: "" },
      },
      h.key(),
    );
    expect(created.data).toMatchObject({
      status: "open",
      facilityId: FACILITY_IDS.alpha1,
      createdBy: PERSONA_IDS.clinAlpha1,
    });
    await expect(
      h.repo.updateTask(
        { taskId: created.data.id, expectedVersion: 1, action: "complete" },
        h.key(),
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR", reason: "INVALID_TRANSITION" });
    // The assignee (coordinator) may work their own task.
    h.as(PERSONA_IDS.coordAlpha);
    const started = await h.repo.updateTask(
      { taskId: created.data.id, expectedVersion: 1, action: "start" },
      h.key(),
    );
    expect(started.data.status).toBe("in_progress");
    const done = await h.repo.updateTask(
      {
        taskId: created.data.id,
        expectedVersion: started.entityVersion,
        action: "complete",
        note: "Called back.",
      },
      h.key(),
    );
    expect(done.data).toMatchObject({ status: "done", completedAt: "2026-10-14T06:00:00.000Z" });
    const reassigned = await h.repo.updateTask(
      {
        taskId: created.data.id,
        expectedVersion: done.entityVersion,
        action: "assign",
        assignedToId: null,
        dueAt: null,
      },
      h.key(),
    );
    expect(reassigned.data).toMatchObject({ assignedToId: null, dueAt: null });

    const other = await h.repo.createTask(
      {
        kind: "data_quality",
        facilityId: FACILITY_IDS.alpha1,
        payload: { issueCode: "dup", targetType: "patient", targetId: "x", note: "check" },
      },
      h.key(),
    );
    const cancelled = await h.repo.updateTask(
      {
        taskId: other.data.id,
        expectedVersion: 1,
        action: "cancel",
        reason: "Duplicate of another task.",
      },
      h.key(),
    );
    expect(cancelled.data).toMatchObject({
      status: "cancelled_with_reason",
      cancelled: { reason: "Duplicate of another task." },
    });
    const list = await h.repo.listTasks({
      kinds: ["data_quality"],
      statuses: ["cancelled_with_reason"],
      facilityIds: [FACILITY_IDS.alpha1],
    });
    expect(list.items.map((t) => t.id)).toContain(other.data.id);
    const mine = await h.repo.listTasks({
      assignedToId: null,
      patientId: SEED_ANCHORS.WF01_FLAGGED_REVIEW.patientId,
    });
    expect(mine.items.every((t) => t.assignedToId === null)).toBe(true);
    await expect(
      h.repo.createTask(
        {
          kind: "callback_request",
          patientId: "missing",
          payload: { topic: "x", window: "y", note: "" },
        },
        h.key(),
      ),
    ).rejects.toMatchObject({ fieldErrors: { patientId: { key: "invalid" } } });
  });

  it("CHW cannot create or manage others' tasks", async () => {
    const h = await createHarness({ personaId: PERSONA_IDS.chwAlpha1A });
    await expect(
      h.repo.createTask(
        { kind: "programme_action", payload: { actionKey: "x", note: "" } },
        h.key(),
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN", reason: "ROLE" });
    const task = (await h.store.getAll<CareTask>("careTasks")).find(
      (t) => t.facilityId === FACILITY_IDS.alpha1,
    )!;
    await expect(
      h.repo.updateTask(
        {
          taskId: task.id,
          expectedVersion: task.version,
          action: "assign",
          assignedToId: PERSONA_IDS.chwAlpha1A,
        },
        h.key(),
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("requestCorrection creates a task and never edits the clinical record (WF-04.4)", async () => {
    const h = await createHarness({ appId: "citizen", personaId: PERSONA_IDS.citizen1 });
    const patientId = h.persona(PERSONA_IDS.citizen1).linkedPatientIds[0]!;
    const screening = h.seed.screenings.find((s) => s.patientId === patientId)!;
    const before = await h.store.get<Screening>("screenings", screening.id);
    const result = await h.repo.requestCorrection(
      {
        patientId,
        targetType: "screening",
        targetId: screening.id,
        description: "The time shown for my screening looks wrong.",
      },
      h.key(),
    );
    expect(result.data).toMatchObject({
      kind: "correction_request",
      status: "open",
      createdBy: PERSONA_IDS.citizen1,
      payload: { targetType: "screening", targetId: screening.id, suggestedValue: null },
    });
    expect(await h.store.get("screenings", screening.id)).toEqual(before);
    const other = h.seed.patients.find(
      (p) => !h.persona(PERSONA_IDS.citizen1).linkedPatientIds.includes(p.id),
    )!;
    await expect(
      h.repo.requestCorrection(
        {
          patientId: other.id,
          targetType: "patient",
          targetId: other.id,
          description: "Not my record, should fail.",
        },
        h.key(),
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN", reason: "SCOPE" });
    // Clinicians can raise one too (task.read).
    const c = await createHarness({ personaId: PERSONA_IDS.clinAlpha1 });
    const clinical = await c.repo.requestCorrection(
      {
        patientId: SEED_ANCHORS.WF01_FLAGGED_REVIEW.patientId,
        targetType: "patient",
        targetId: SEED_ANCHORS.WF01_FLAGGED_REVIEW.patientId,
        description: "Date of birth looks wrong.",
      },
      c.key(),
    );
    expect(clinical.data.facilityId).toBe(FACILITY_IDS.alpha1);
  });
});
