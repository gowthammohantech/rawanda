/**
 * CTZ-05 scheduler: plan (one per approved, planned, future appointment), opted out ⇒ empty,
 * the Africa/Kigali day boundary, idempotency, and simulated delivery on the demo clock.
 */
import { createDemoClock, type ApprovedInstruction } from "@laif/domain";
import { describe, expect, it } from "vitest";

import { planReminders, processDueReminders, REMINDER_DEMO_TIMES } from "../scheduler.ts";

const step = (overrides: Partial<ApprovedInstruction> = {}) =>
  ({
    id: "ci-appt",
    kind: "appointment",
    approvalState: "approved",
    progress: "planned",
    appointmentAt: "2026-10-19T08:30:00.000Z", // 19 Oct 10:30 Kigali
    sourceType: "follow_up",
    sourceId: "fu-1",
    ...overrides,
  }) as ApprovedInstruction;

describe("planReminders", () => {
  const clock = createDemoClock();

  it("plans one reminder per approved future appointment at the fixed demo times", () => {
    expect(REMINDER_DEMO_TIMES).toEqual({
      day_before: { dayOffset: -1, hour: 9 },
      morning_of: { dayOffset: 0, hour: 7 },
    });
    expect(
      planReminders([step()], { optedIn: true, timing: "day_before" }, clock).map(
        (p) => p.scheduledAt,
      ),
    ).toEqual(["2026-10-18T07:00:00.000Z"]); // 18 Oct 09:00 Kigali
    expect(
      planReminders([step()], { optedIn: true, timing: "morning_of" }, clock).map(
        (p) => p.scheduledAt,
      ),
    ).toEqual(["2026-10-19T05:00:00.000Z"]); // 19 Oct 07:00 Kigali
  });

  it("only approved, planned appointments / follow-ups — never drafts, done, cancelled or referrals", () => {
    const plans = planReminders(
      [
        step({ id: "a" as never }),
        step({ id: "b" as never, progress: "completed" }),
        step({ id: "c" as never, progress: "cancelled" }),
        step({ id: "d" as never, kind: "referral" }),
        step({ id: "e" as never, approvalState: "draft" as never }),
      ],
      { optedIn: true, timing: "day_before" },
      clock,
    );
    expect(plans.map((p) => p.instructionId)).toEqual(["a"]);
  });

  it("opted out ⇒ no reminders, whatever the steps", () => {
    expect(planReminders([step()], { optedIn: false, timing: "morning_of" }, clock)).toEqual([]);
  });

  it("uses the Kigali calendar day at the UTC midnight boundary", () => {
    // 22:30Z on 19 Oct is already 20 Oct 00:30 in Kigali: "the day before" is 19 Oct 09:00
    // Kigali; 07:00 on 20 Oct would be after the appointment, so no morning-of reminder.
    const late = step({ appointmentAt: "2026-10-19T22:30:00.000Z" });
    expect(
      planReminders([late], { optedIn: true, timing: "day_before" }, clock)[0]?.scheduledAt,
    ).toBe("2026-10-19T07:00:00.000Z");
    expect(planReminders([late], { optedIn: true, timing: "morning_of" }, clock)).toEqual([]);
    // 21:30Z on 19 Oct is still 19 Oct 23:30 in Kigali: morning-of = 19 Oct 07:00 Kigali.
    const evening = step({ appointmentAt: "2026-10-19T21:30:00.000Z" });
    expect(
      planReminders([evening], { optedIn: true, timing: "morning_of" }, clock)[0]?.scheduledAt,
    ).toBe("2026-10-19T05:00:00.000Z");
  });

  it("is idempotent (same input → same plan, unique keys)", () => {
    const prefs = { optedIn: true, timing: "day_before" } as const;
    const once = planReminders([step(), step()], prefs, clock);
    expect(once).toHaveLength(1);
    expect(planReminders([step(), step()], prefs, clock)).toEqual(once);
  });
});

describe("processDueReminders", () => {
  it("delivers scheduled reminders once the demo clock passes their time", () => {
    const clock = createDemoClock();
    const rows = [
      { id: "r1", status: "scheduled", scheduledAt: "2026-10-18T07:00:00.000Z" },
    ] as const;
    expect(processDueReminders(rows, clock)).toEqual([]);
    clock.advanceBy(5 * 86_400_000);
    expect(processDueReminders(rows, clock)).toEqual([
      {
        reminder: rows[0],
        next: { status: "delivered_simulated", deliveredAt: "2026-10-19T06:00:00.000Z" },
      },
    ]);
  });
});
