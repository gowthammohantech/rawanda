import {
  careTaskMachine,
  followUpMachine,
  referralMachine,
  reviewMachine,
  screeningMachine,
  type AuditEvent,
} from "@laif/domain";
import { describe, expect, it } from "vitest";

import { REMINDER_TRANSITIONS } from "./builder.ts";
import { createSeed } from "./generate.ts";

const seed = createSeed();

type Table = { can(from: string, to: string): boolean };
const reminderTable: Table = {
  can: (from, to) =>
    (REMINDER_TRANSITIONS[from as keyof typeof REMINDER_TRANSITIONS] ?? []).includes(to as never),
};
const MACHINES: Record<
  string,
  { table: Table; records: ReadonlyArray<{ id: string; status: string }>; initial: string[] }
> = {
  screening: { table: screeningMachine, records: seed.screenings, initial: ["draft"] },
  review: { table: reviewMachine, records: seed.reviews, initial: ["pending"] },
  referral: { table: referralMachine, records: seed.referrals, initial: ["created"] },
  follow_up: { table: followUpMachine, records: seed.followUps, initial: ["assigned"] },
  care_task: { table: careTaskMachine, records: seed.careTasks, initial: ["open"] },
  reminder: { table: reminderTable, records: seed.reminders, initial: ["scheduled"] },
  care_instruction: {
    table: { can: (from, to) => from === "released" && to === "withdrawn" },
    records: seed.careInstructions,
    initial: ["released"],
  },
};

const summary = (e: AuditEvent) =>
  e.changeSummary as { fromStatus?: string | null; toStatus?: string };

describe("seeded states are reached by legal transitions (audit replay)", () => {
  it.each(Object.keys(MACHINES))(
    "%s: every record's audit trail replays legally to its stored status",
    (entityType) => {
      const { table, records, initial } = MACHINES[entityType]!;
      for (const record of records) {
        const steps = seed.auditEvents.filter(
          (e) =>
            e.entityType === entityType &&
            e.entityId === record.id &&
            summary(e).toStatus !== undefined,
        );
        expect(steps.length, record.id).toBeGreaterThan(0);
        let state: string | null = null;
        for (const step of steps) {
          const { fromStatus, toStatus } = summary(step);
          expect(fromStatus ?? null, `${record.id} ${step.action}`).toBe(state);
          if (state === null) expect(initial).toContain(toStatus);
          else expect(table.can(state, toStatus!), `${record.id} ${state}→${toStatus}`).toBe(true);
          state = toStatus!;
        }
        expect(state, record.id).toBe(record.status);
      }
    },
  );

  it("never uses the guarded completed → contacted edge in the baseline", () => {
    const back = seed.auditEvents.filter(
      (e) => e.entityType === "follow_up" && summary(e).fromStatus === "completed",
    );
    expect(back).toEqual([]);
  });

  it("emits change events only, sorted by time, with correlation linking the pathway", () => {
    expect(seed.auditEvents.every((e) => e.category === "change" && e.outcome === "success")).toBe(
      true,
    );
    const times = seed.auditEvents.map((e) => Date.parse(e.occurredAt));
    expect(times).toEqual([...times].sort((a, b) => a - b));
    for (const fu of seed.followUps.filter((f) => f.referralId !== null)) {
      const ref = seed.referrals.find((r) => r.id === fu.referralId)!;
      const review = seed.reviews.find((r) => r.id === ref.reviewId)!;
      const corr = (id: string) =>
        new Set(seed.auditEvents.filter((e) => e.entityId === id).map((e) => e.correlationId));
      const shared = [...corr(review.screeningId)].filter(
        (c) => corr(review.id).has(c) && corr(ref.id).has(c) && corr(fu.id).has(c),
      );
      expect(shared, fu.id).toHaveLength(1);
    }
  });

  it("versions count the mutations of each record", () => {
    for (const record of [
      ...seed.screenings,
      ...seed.reviews,
      ...seed.referrals,
      ...seed.followUps,
    ]) {
      const events = seed.auditEvents.filter((e) => e.entityId === record.id);
      expect(record.version, record.id).toBe(events.length);
    }
  });
});
