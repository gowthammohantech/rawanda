import { describe, expect, it } from "vitest";

import { createDemoClock } from "../../clock/clock.ts";
import {
  planReminders,
  processDueReminders,
  reminderTimeFor,
  type ReminderPlanInstruction,
} from "../reminders.ts";

const clock = createDemoClock(); // 2026-10-14T06:00Z = 08:00 Kigali

const step = (overrides: Partial<ReminderPlanInstruction> = {}): ReminderPlanInstruction => ({
  id: "ci-1" as ReminderPlanInstruction["id"],
  kind: "appointment",
  approvalState: "approved",
  progress: "planned",
  appointmentAt: "2026-10-19T08:30:00.000Z",
  sourceType: "follow_up",
  sourceId: "fu-1",
  ...overrides,
});

describe("reminderTimeFor (Africa/Kigali, UTC+2)", () => {
  it("day_before = 09:00 Kigali the previous day; morning_of = 07:00 Kigali the same day", () => {
    expect(reminderTimeFor("2026-10-19T08:30:00.000Z", "day_before")).toBe(
      "2026-10-18T07:00:00.000Z",
    );
    expect(reminderTimeFor("2026-10-19T08:30:00.000Z", "morning_of")).toBe(
      "2026-10-19T05:00:00.000Z",
    );
  });

  it("uses the Kigali calendar day, not the UTC one (23:30Z is already the next day)", () => {
    // 2026-10-19T23:30Z = 20 Oct 01:30 Kigali.
    expect(reminderTimeFor("2026-10-19T23:30:00.000Z", "morning_of")).toBe(
      "2026-10-20T05:00:00.000Z",
    );
    expect(reminderTimeFor("2026-10-19T23:30:00.000Z", "day_before")).toBe(
      "2026-10-19T07:00:00.000Z",
    );
    // 2026-10-19T21:59Z = 19 Oct 23:59 Kigali.
    expect(reminderTimeFor("2026-10-19T21:59:00.000Z", "morning_of")).toBe(
      "2026-10-19T05:00:00.000Z",
    );
  });
});

describe("planReminders", () => {
  it("one reminder per approved, planned, future appointment / follow-up", () => {
    const plans = planReminders(
      [
        step(),
        step({ id: "ci-2" as never, kind: "follow_up", appointmentAt: "2026-10-21T10:00:00.000Z" }),
        step({ id: "ci-3" as never, kind: "referral" }),
        step({ id: "ci-4" as never, progress: "completed" }),
        step({ id: "ci-5" as never, progress: "cancelled" }),
        step({ id: "ci-6" as never, appointmentAt: null }),
        step({ id: "ci-7" as never, appointmentAt: "2026-10-13T08:00:00.000Z" }),
      ],
      { optedIn: true, timing: "morning_of" },
      clock,
    );
    expect(plans.map((p) => [p.instructionId, p.scheduledAt, p.followUpId])).toEqual([
      ["ci-1", "2026-10-19T05:00:00.000Z", "fu-1"],
      ["ci-2", "2026-10-21T05:00:00.000Z", "fu-1"],
    ]);
    expect(plans[0]?.key).toBe("ci-1@2026-10-19T05:00:00.000Z");
  });

  it("opted out or no preference ⇒ always empty", () => {
    expect(planReminders([step()], { optedIn: false, timing: "day_before" }, clock)).toEqual([]);
    expect(planReminders([step()], null, clock)).toEqual([]);
  });

  it("skips reminder times that are not in the future or not before the appointment", () => {
    // Appointment tomorrow 08:00 Kigali: day_before = today 09:00 Kigali (> 08:00 now) is kept.
    const tomorrow = step({ appointmentAt: "2026-10-15T06:00:00.000Z" });
    expect(planReminders([tomorrow], { optedIn: true, timing: "day_before" }, clock).length).toBe(
      1,
    );
    // Appointment today 10:00 Kigali: morning_of 07:00 already passed; day_before too.
    const today = step({ appointmentAt: "2026-10-14T08:00:00.000Z" });
    expect(planReminders([today], { optedIn: true, timing: "morning_of" }, clock)).toEqual([]);
    expect(planReminders([today], { optedIn: true, timing: "day_before" }, clock)).toEqual([]);
    // Appointment at 06:30 Kigali in two days: morning_of 07:00 is after it → skipped.
    const early = step({ appointmentAt: "2026-10-16T04:30:00.000Z" });
    expect(planReminders([early], { optedIn: true, timing: "morning_of" }, clock)).toEqual([]);
  });

  it("is idempotent: the same input gives the same, de-duplicated plan", () => {
    const prefs = { optedIn: true, timing: "day_before" } as const;
    const a = planReminders([step(), step()], prefs, clock);
    expect(a).toHaveLength(1);
    expect(planReminders([step(), step()], prefs, clock)).toEqual(a);
  });
});

describe("processDueReminders", () => {
  const row = (id: string, status: string, scheduledAt: string) =>
    ({ id, status, scheduledAt }) as never;

  it("delivers only scheduled reminders whose time has come", () => {
    const later = createDemoClock();
    later.advanceBy(7 * 24 * 60 * 60 * 1000);
    const due = processDueReminders(
      [
        row("r1", "scheduled", "2026-10-18T07:00:00.000Z"),
        row("r2", "scheduled", "2026-10-30T07:00:00.000Z"),
        row("r3", "cancelled", "2026-10-15T07:00:00.000Z"),
        row("r4", "delivered_simulated", "2026-10-15T07:00:00.000Z"),
      ],
      later,
    );
    expect(due.map((d) => (d.reminder as { id: string }).id)).toEqual(["r1"]);
    expect(due[0]?.next).toEqual({
      status: "delivered_simulated",
      deliveredAt: "2026-10-21T06:00:00.000Z",
    });
    expect(
      processDueReminders([row("r1", "scheduled", "2026-10-18T07:00:00.000Z")], clock),
    ).toEqual([]);
  });
});
