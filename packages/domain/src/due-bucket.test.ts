import { describe, expect, it } from "vitest";

import {
  calendarDaysOverdue,
  dueBucket,
  isSameZonedDay,
  zonedDay,
  type DueBucket,
} from "./due-bucket.ts";
import type { FollowUpStatus } from "./enums.ts";

// 08:00 Kigali, Wed 14 Oct 2026 (= DEMO_CLOCK_DEFAULT_ISO). Kigali day = 13 Oct 22:00Z … 14 Oct 22:00Z.
const NOW = new Date("2026-10-14T06:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

const fu = (dueAt: string, status: FollowUpStatus = "assigned") => ({ dueAt, status });

describe("zonedDay", () => {
  it("returns the Africa/Kigali calendar day (UTC+2) by default", () => {
    expect(zonedDay(NOW)).toEqual({
      start: new Date("2026-10-13T22:00:00.000Z"),
      end: new Date("2026-10-14T22:00:00.000Z"),
      date: "2026-10-14",
    });
  });

  it("rolls over at Kigali midnight, not UTC midnight", () => {
    expect(zonedDay(new Date("2026-10-14T21:59:59.999Z")).date).toBe("2026-10-14");
    expect(zonedDay(new Date("2026-10-14T22:00:00.000Z")).date).toBe("2026-10-15");
    expect(zonedDay(new Date("2026-10-14T23:00:00.000Z"), "UTC").date).toBe("2026-10-14");
  });

  it("isSameZonedDay uses the half-open day", () => {
    expect(isSameZonedDay("2026-10-13T22:00:00.000Z", NOW)).toBe(true);
    expect(isSameZonedDay("2026-10-14T22:00:00.000Z", NOW)).toBe(false);
    expect(isSameZonedDay("2026-10-13T21:59:59.999Z", NOW)).toBe(false);
  });
});

describe("dueBucket", () => {
  it.each<[string, FollowUpStatus, DueBucket]>([
    ["2026-10-12T06:00:00.000Z", "assigned", "overdue"],
    ["2026-10-13T21:59:59.999Z", "contacted", "overdue"],
    // Earlier today (before now) is still due today — not overdue on the worklist.
    ["2026-10-13T22:00:00.000Z", "assigned", "due_today"],
    ["2026-10-14T05:00:00.000Z", "assigned", "due_today"],
    ["2026-10-14T12:00:00.000Z", "assigned", "due_today"],
    ["2026-10-14T22:00:00.000Z", "assigned", "upcoming"],
    ["2026-10-01T06:00:00.000Z", "completed", "completed"],
    ["2026-10-20T06:00:00.000Z", "completed", "completed"],
  ])("dueAt %s (%s) → %s", (dueAt, status, bucket) => {
    expect(dueBucket(fu(dueAt, status), NOW)).toBe(bucket);
  });

  it("+1 day on the clock moves due-today items to overdue (derived, nothing stored)", () => {
    const item = fu("2026-10-14T12:00:00.000Z");
    expect(dueBucket(item, NOW)).toBe("due_today");
    expect(dueBucket(item, new Date(NOW.getTime() + DAY))).toBe("overdue");
    expect(item).toEqual(fu("2026-10-14T12:00:00.000Z"));
  });

  it("overdue bucket ⊂ isFollowUpOverdue (never overdue when not past due)", () => {
    expect(dueBucket(fu("2026-10-15T06:00:00.000Z"), NOW)).toBe("upcoming");
  });
});

describe("calendarDaysOverdue", () => {
  it("counts whole Kigali calendar days past the due day", () => {
    expect(calendarDaysOverdue(fu("2026-10-13T21:00:00.000Z"), NOW)).toBe(1);
    expect(calendarDaysOverdue(fu("2026-10-12T06:00:00.000Z"), NOW)).toBe(2);
    expect(calendarDaysOverdue(fu("2026-10-09T06:00:00.000Z"), NOW)).toBe(5);
  });

  it("is 0 when due today, upcoming or completed", () => {
    expect(calendarDaysOverdue(fu("2026-10-14T05:00:00.000Z"), NOW)).toBe(0);
    expect(calendarDaysOverdue(fu("2026-10-20T05:00:00.000Z"), NOW)).toBe(0);
    expect(calendarDaysOverdue(fu("2026-10-01T05:00:00.000Z", "completed"), NOW)).toBe(0);
  });
});
