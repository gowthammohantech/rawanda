/**
 * CTZ-06 projection rules (pure, no I/O): released → recorded + reviewed (done); pending →
 * waiting without values; planned → waiting (+ neutral date-passed line, never "overdue");
 * completed needs evidence for done; cancelled; acks / reminders are info (never done);
 * amendments → changed with before/after; corrections waiting → changed / info; unapproved
 * steps dropped; over every seeded persona: no reminder / ack row is ever done, nothing staff-
 * internal leaks, CTZ-P1's draft referral is absent.
 */
import type { CorrectionRequest } from "@laif/contracts";
import { asId, type Reminder } from "@laif/domain";
import { CITIZEN_OVERLAY_IDS, PERSONA_IDS, SEED_ANCHORS } from "@laif/mock-data";
import {
  aPendingReview,
  aReleasedObservation,
  anInstruction,
  makeCitizenRepo,
} from "@laif/test-utils";
import { describe, expect, it, vi } from "vitest";

import {
  buildCitizenTimeline,
  filterCounts,
  matchesFilter,
  type TimelineInput,
} from "../buildCitizenTimeline.ts";
import { groupByMonth, monthKeyOf } from "../timelineDates.ts";

const empty: TimelineInput = { observations: [], instructions: [], reminders: [], corrections: [] };
const build = (patch: Partial<TimelineInput>, options = {}) =>
  buildCitizenTimeline({ ...empty, ...patch }, options);

function aReminder(overrides: Partial<Reminder> = {}): Reminder {
  return {
    id: asId<never>("rem-1"),
    patientId: asId<never>("pat-test-1"),
    instructionId: asId<never>("ci-test-1"),
    followUpId: null,
    channel: "in_app",
    consentBasis: "citizen_opt_in",
    scheduledAt: "2026-10-18T08:30:00.000Z",
    status: "delivered_simulated",
    deliveredAt: "2026-10-18T08:30:00.000Z",
    acknowledgedAt: null,
    cancelReason: null,
    version: 2,
    createdAt: "2026-10-02T08:24:00.000Z",
    updatedAt: "2026-10-18T08:30:00.000Z",
    synthetic: true,
    ...overrides,
  };
}

function aCorrection(overrides: Partial<CorrectionRequest> = {}): CorrectionRequest {
  return {
    id: asId<never>("task-1"),
    patientId: asId<never>("pat-test-1"),
    targetType: "screening",
    targetId: "scr-test-1",
    description: "The time looks wrong.",
    status: "submitted",
    createdBy: asId<never>("persona-citizen-1"),
    resolvedAt: null,
    suggestedText: null,
    resolutionKey: null,
    version: 1,
    createdAt: "2026-10-06T08:24:00.000Z",
    updatedAt: "2026-10-06T08:24:00.000Z",
    synthetic: true,
    ...overrides,
  };
}

describe("buildCitizenTimeline", () => {
  it("released result → done 'Check recorded' (measured) + done 'Reviewed' (released) with reviewer", () => {
    const items = build({ observations: [aReleasedObservation()] });
    expect(items.map((i) => [i.kind, i.state, i.occurredAt])).toEqual([
      ["reviewed", "done", "2026-10-12T08:24:00.000Z"],
      ["check_recorded", "done", "2026-10-11T08:24:00.000Z"],
    ]);
    expect(items[0]!.provenance).toMatchObject({
      kind: "reviewed",
      personaId: "persona-clin-alpha1",
    });
    expect(items[1]!.bodyKey).toBe("citizen:health.kind.bpAndGlucose");
    expect(items[1]!.linkRoute).toEqual({
      pathname: "/health/[observationId]",
      params: { observationId: "scr-test-1" },
    });
  });

  it("a dismissed flag is just 'reviewed' (done); a no-review release has no reviewed row", () => {
    const dismissed = build({
      observations: [
        aReleasedObservation({
          reviewState: "dismissed_with_reason",
          label: "reviewedNoActionNeeded",
        }),
      ],
    });
    expect(dismissed.map((i) => i.kind)).toEqual(["reviewed", "check_recorded"]);
    const noReview = build({
      observations: [aReleasedObservation({ reviewedAt: null, reviewedBy: null })],
    });
    expect(noReview.map((i) => i.kind)).toEqual(["check_recorded"]);
  });

  it("awaiting review → waiting, no values / params / provenance / link", () => {
    const [item] = build({ observations: [aPendingReview()] });
    expect(item).toMatchObject({
      kind: "awaiting_review",
      state: "waiting",
      titleKey: "citizen:timeline.item.awaitingReview",
      bodyKey: null,
      params: {},
      provenance: null,
      linkRoute: null,
      change: null,
    });
  });

  it("planned step → waiting 'Appointment on {date}'; date passed adds the neutral line only", () => {
    const [planned] = build({ instructions: [anInstruction()] });
    expect(planned).toMatchObject({
      kind: "next_step",
      state: "waiting",
      titleKey: "citizen:timeline.item.appointmentOn",
      params: { date: { type: "date", iso: "2026-10-19T08:30:00.000Z" } },
      noteKey: null,
      provenance: { kind: "approved", personaId: "persona-clin-alpha1" },
    });
    const [passed] = build(
      { instructions: [anInstruction()] },
      { now: new Date(Date.parse("2026-10-20T00:00:00.000Z")) },
    );
    expect(passed).toMatchObject({ state: "waiting", noteKey: "citizen:timeline.item.datePassed" });
    const [stored] = build({ instructions: [anInstruction({ datePassed: true })] });
    expect(stored!.noteKey).toBe("citizen:timeline.item.datePassed");
    const [undated] = build({ instructions: [anInstruction({ appointmentAt: null })] });
    expect(undated!.titleKey).toBe("citizen:timeline.item.stepAgreed");
  });

  it("completed WITH evidence → done 'confirmed by your care team' at the completion time", () => {
    const [attended] = build({
      instructions: [
        anInstruction({
          progress: "completed",
          completion: {
            completedAt: "2026-10-19T09:00:00.000Z",
            evidenceType: "facility_attendance_record",
          },
        }),
      ],
    });
    expect(attended).toMatchObject({
      state: "done",
      occurredAt: "2026-10-19T09:00:00.000Z",
      titleKey: "citizen:timeline.item.appointmentAttended",
    });
    const [followUp] = build({
      instructions: [
        anInstruction({
          kind: "follow_up",
          progress: "completed",
          completion: {
            completedAt: "2026-09-06T15:36:00.000Z",
            evidenceType: "appointment_card_seen",
          },
        }),
      ],
    });
    expect(followUp!.titleKey).toBe("citizen:timeline.item.followUpDone");
  });

  it("completed WITHOUT evidence stays waiting and warns", () => {
    const warn = vi.fn();
    const [item] = build(
      {
        instructions: [
          anInstruction({
            progress: "completed",
            completion: { completedAt: "2026-10-19T09:00:00.000Z", evidenceType: null },
          }),
        ],
      },
      { warn },
    );
    expect(item!.state).toBe("waiting");
    expect(warn).toHaveBeenCalledOnce();
    const [noCompletion] = build(
      { instructions: [anInstruction({ progress: "completed", completion: null })] },
      { warn },
    );
    expect(noCompletion!.state).toBe("waiting");
  });

  it("cancelled step (incl. unable_to_reach / declined via deriveInstructionProgress) → cancelled", () => {
    const [item] = build({
      instructions: [
        anInstruction({ progress: "cancelled", updatedAt: "2026-10-10T10:00:00.000Z" }),
      ],
    });
    expect(item).toMatchObject({
      state: "cancelled",
      occurredAt: "2026-10-10T10:00:00.000Z",
      titleKey: "citizen:timeline.item.stepCancelled",
    });
  });

  it("acknowledgement → info 'You read your next step' (never done); the step stays waiting", () => {
    const items = build({
      instructions: [
        anInstruction({
          acknowledgement: { id: "ack-1", acknowledgedAt: "2026-10-03T08:00:00.000Z" },
        }),
      ],
    });
    const read = items.find((i) => i.kind === "next_step_read");
    expect(read).toMatchObject({ state: "info", titleKey: "citizen:timeline.item.readNextStep" });
    expect(items.find((i) => i.kind === "next_step")!.state).toBe("waiting");
    // Extra acks for the same id are de-duplicated; acks of non-approved steps dropped.
    const withAcks = build({
      instructions: [
        anInstruction({
          acknowledgement: { id: "ack-1", acknowledgedAt: "2026-10-03T08:00:00.000Z" },
        }),
      ],
      acks: [
        { id: "ack-1", instructionId: "ci-test-1", acknowledgedAt: "2026-10-03T08:00:00.000Z" },
        { id: "ack-x", instructionId: "ci-hidden", acknowledgedAt: "2026-10-03T08:00:00.000Z" },
      ],
    });
    expect(withAcks.filter((i) => i.kind === "next_step_read")).toHaveLength(1);
  });

  it("delivered / seen reminders → info 'Reminder sent (demo)'; scheduled / cancelled not shown", () => {
    const items = build({
      reminders: [
        aReminder({ id: asId<never>("r1") }),
        aReminder({
          id: asId<never>("r2"),
          status: "acknowledged",
          acknowledgedAt: "2026-10-18T09:00:00.000Z",
        }),
        aReminder({ id: asId<never>("r3"), status: "scheduled", deliveredAt: null }),
        aReminder({ id: asId<never>("r4"), status: "cancelled", deliveredAt: null }),
      ],
    });
    expect(items.map((i) => [i.id, i.state, i.titleKey])).toEqual([
      ["reminder:r1", "info", "citizen:timeline.item.reminderSent"],
      ["reminder:r2", "info", "citizen:timeline.item.reminderSent"],
    ]);
  });

  it("each amendment → changed 'Your record was updated' with before / after / who / when / reason key", () => {
    const items = build({
      observations: [
        aReleasedObservation({
          amendments: [
            {
              field: "glucoseContext",
              before: "not_recorded",
              after: "fasting",
              amendedBy: asId<never>("persona-clin-alpha1"),
              amendedAt: "2026-10-13T10:00:00.000Z",
              reasonKey: "glucose_context_corrected",
            },
          ],
        }),
      ],
    });
    const changed = items.filter((i) => i.state === "changed");
    expect(changed).toHaveLength(1);
    expect(changed[0]).toMatchObject({
      kind: "record_updated",
      titleKey: "citizen:timeline.item.recordUpdated",
      bodyKey: "citizen:timeline.change.fields.glucoseContext",
      change: {
        observationId: "scr-test-1",
        field: "glucoseContext",
        before: "not_recorded",
        after: "fasting",
        amendedBy: "persona-clin-alpha1",
        amendedAt: "2026-10-13T10:00:00.000Z",
        reasonKey: "glucose_context_corrected",
      },
    });
  });

  it("correction: open → waiting; resolved amended → info + changed; no change → info + info", () => {
    expect(build({ corrections: [aCorrection()] }).map((i) => i.state)).toEqual(["waiting"]);
    expect(build({ corrections: [aCorrection()] })[0]?.linkRoute).toEqual({
      pathname: "/more/privacy/corrections/[requestId]",
      params: { requestId: "task-1" },
    });
    const amended = build({
      corrections: [
        aCorrection({ status: "resolved_amended", resolvedAt: "2026-10-08T08:00:00.000Z" }),
      ],
    });
    expect(amended.map((i) => [i.kind, i.state])).toEqual([
      ["correction_resolved", "changed"],
      ["correction_requested", "info"],
    ]);
    const noChange = build({
      corrections: [
        aCorrection({ status: "resolved_no_change", resolvedAt: "2026-10-08T08:00:00.000Z" }),
      ],
    });
    expect(noChange.map((i) => [i.titleKey, i.state])).toEqual([
      ["citizen:timeline.item.correctionNoChange", "info"],
      ["citizen:timeline.item.correctionRequested", "info"],
    ]);
    // The citizen's own free text is never part of an item.
    expect(JSON.stringify(amended)).not.toContain("The time looks wrong.");
  });

  it("drops anything that is not an approved (released) step — draft / withdrawn never shown", () => {
    const items = build({
      instructions: [
        anInstruction({ id: asId<never>("withdrawn"), status: "withdrawn" as never }),
        anInstruction({ id: asId<never>("draft"), approvalState: "draft" as never }),
      ],
    });
    expect(items).toEqual([]);
  });

  it("sorts newest first; filters and counts; month grouping in Kigali time", () => {
    const items = build({
      observations: [aReleasedObservation(), aPendingReview()],
      instructions: [anInstruction()],
      reminders: [aReminder()],
    });
    const times = items.map((i) => i.occurredAt);
    expect([...times].sort().reverse()).toEqual(times);
    expect(filterCounts(items)).toEqual({ all: 5, waiting: 2, done: 2, changes: 0 });
    expect(items.filter((i) => matchesFilter(i, "done")).every((i) => i.state === "done")).toBe(
      true,
    );
    // 31 Oct 23:30 UTC is already 1 Nov in Kigali (UTC+2).
    expect(monthKeyOf("2026-10-31T23:30:00.000Z")).toBe("2026-11");
    expect(
      groupByMonth([
        { occurredAt: "2026-10-12T08:00:00.000Z" },
        { occurredAt: "2026-10-01T08:00:00.000Z" },
        { occurredAt: "2026-09-30T08:00:00.000Z" },
      ]).map((s) => [s.key, s.data.length]),
    ).toEqual([
      ["2026-10", 2],
      ["2026-09", 1],
    ]);
  });
});

describe("buildCitizenTimeline over the seeded personas", () => {
  const personas = [PERSONA_IDS.citizen1, PERSONA_IDS.citizen2, PERSONA_IDS.citizenRep];

  async function timelineOf(personaId: string) {
    const h = await makeCitizenRepo({ persona: personaId });
    const session = await h.repo.getSession();
    const patientId = session!.activePatientId!;
    const [observations, instructions, reminders, corrections] = await Promise.all([
      h.repo.listReleasedObservations(patientId),
      h.repo.listApprovedInstructions(patientId),
      h.repo.listReminders(patientId),
      h.repo.listCorrectionRequests(patientId),
    ]);
    return {
      patientId,
      items: buildCitizenTimeline({ observations, instructions, reminders, corrections }),
    };
  }

  it.each(personas)("%s: no reminder or acknowledgement row is ever DONE", async (personaId) => {
    const { items } = await timelineOf(personaId);
    expect(items.length).toBeGreaterThan(0);
    for (const entry of items) {
      if (entry.kind === "reminder_sent" || entry.kind === "next_step_read") {
        expect(entry.state).toBe("info");
      }
    }
  });

  it("CTZ-P1: recorded, reviewed, appointment waiting, follow-up DONE, reminder info, one UPDATED; no draft referral", async () => {
    const { items } = await timelineOf(PERSONA_IDS.citizen1);
    const kinds = (kind: string) => items.filter((i) => i.kind === kind);
    expect(kinds("check_recorded").length).toBeGreaterThan(0);
    expect(kinds("reviewed").length).toBeGreaterThan(0);
    const appointment = items.find(
      (i) => i.id === `step:${SEED_ANCHORS.CTZ_P1_APPOINTMENT_INSTRUCTION.careInstructionId}`,
    );
    expect(appointment).toMatchObject({
      state: "waiting",
      titleKey: "citizen:timeline.item.appointmentOn",
    });
    const followUp = items.find(
      (i) => i.id === `step:${SEED_ANCHORS.COMPLETED_FOLLOWUP_WITH_INSTRUCTION.careInstructionId}`,
    );
    expect(followUp).toMatchObject({
      state: "done",
      titleKey: "citizen:timeline.item.followUpDone",
    });
    expect(kinds("reminder_sent").length).toBeGreaterThan(0);
    const updated = items.filter((i) => i.kind === "record_updated");
    expect(updated).toHaveLength(1);
    expect(updated[0]!.change).toMatchObject({
      observationId: CITIZEN_OVERLAY_IDS.amendedScreening,
      before: "not_recorded",
      after: "fasting",
    });
    const serialized = JSON.stringify(items);
    expect(serialized).not.toContain(SEED_ANCHORS.CTZ_P1_UNRELEASED_REFERRAL.referralId);
    expect(serialized).not.toContain(SEED_ANCHORS.CTZ_P1_UNRELEASED_REFERRAL.reviewId);
  });

  it("CTZ-P2: dismissed review shown as reviewed (done); awaiting review WAITING without values; withdrawn step absent", async () => {
    const { items } = await timelineOf(PERSONA_IDS.citizen2);
    const dismissed = SEED_ANCHORS.CTZ_P2_DISMISSED_SCREENING.screeningId;
    expect(items.find((i) => i.id === `reviewed:${dismissed}`)).toMatchObject({ state: "done" });
    const awaiting = items.find(
      (i) => i.id === `awaiting:${SEED_ANCHORS.CTZ_P2_AWAITING_REVIEW_SCREENING.screeningId}`,
    );
    expect(awaiting).toMatchObject({ state: "waiting", params: {}, bodyKey: null });
    expect(JSON.stringify(items)).not.toContain(
      SEED_ANCHORS.CTZ_P2_WITHDRAWN_INSTRUCTION.careInstructionId,
    );
  });
});
