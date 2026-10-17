/**
 * Calendar-day due buckets for worklists (HWM-03 Today, HWM-07 Tasks). Derived at view time from
 * `dueAt` + the demo clock — never stored (tech spec §5.2 overdue invariant).
 *
 * - `overdue`: not completed and `dueAt` before the START of today in `tz` — i.e.
 *   `isFollowUpOverdue(fu, startOfToday)`. A follow-up due earlier today is still `due_today`
 *   (its time is shown), not overdue.
 * - `due_today`: not completed, `dueAt` within today in `tz`.
 * - `upcoming`: not completed, `dueAt` after today.
 * - `completed`: status `completed` (whatever the due date).
 *
 * Wording stays "past the demo due date": timing rules are not clinically approved (FRD §5).
 * Time zones: only fixed-offset zones are supported (no Intl dependency — Hermes may lack time
 * zones). Africa/Kigali is UTC+02:00 all year.
 */
import { isFollowUpOverdue } from "./derive.ts";
import type { FollowUp } from "./entities/follow-up.ts";

/** Fixed UTC offsets of the supported zones (no DST). */
export const FIXED_TIME_ZONE_OFFSETS_MS = {
  "Africa/Kigali": 2 * 60 * 60 * 1000,
  UTC: 0,
} as const;
export type FixedTimeZone = keyof typeof FIXED_TIME_ZONE_OFFSETS_MS;

export const DEMO_TIME_ZONE = "Africa/Kigali" as const satisfies FixedTimeZone;

export const DUE_BUCKETS = ["overdue", "due_today", "upcoming", "completed"] as const;
export type DueBucket = (typeof DUE_BUCKETS)[number];

const DAY_MS = 24 * 60 * 60 * 1000;

export type ZonedDay = {
  /** First instant of the calendar day in `tz` (UTC `Date`). */
  start: Date;
  /** First instant of the NEXT calendar day (exclusive end). */
  end: Date;
  /** `YYYY-MM-DD` of the calendar day in `tz`. */
  date: string;
};

/** The calendar day in `tz` that contains `instant`. */
export function zonedDay(instant: Date, tz: FixedTimeZone = DEMO_TIME_ZONE): ZonedDay {
  const offset = FIXED_TIME_ZONE_OFFSETS_MS[tz];
  const wallMs = instant.getTime() + offset;
  const wallStart = Math.floor(wallMs / DAY_MS) * DAY_MS;
  const start = new Date(wallStart - offset);
  return {
    start,
    end: new Date(start.getTime() + DAY_MS),
    date: new Date(wallStart).toISOString().slice(0, 10),
  };
}

/** True when `iso` falls on the same calendar day in `tz` as `now`. */
export function isSameZonedDay(iso: string, now: Date, tz: FixedTimeZone = DEMO_TIME_ZONE) {
  const ms = Date.parse(iso);
  const { start, end } = zonedDay(now, tz);
  return ms >= start.getTime() && ms < end.getTime();
}

export function dueBucket(
  followUp: Pick<FollowUp, "status" | "dueAt">,
  now: Date,
  tz: FixedTimeZone = DEMO_TIME_ZONE,
): DueBucket {
  if (followUp.status === "completed") return "completed";
  const today = zonedDay(now, tz);
  if (isFollowUpOverdue(followUp, today.start)) return "overdue";
  return Date.parse(followUp.dueAt) < today.end.getTime() ? "due_today" : "upcoming";
}

/**
 * Whole calendar days between the due day and today in `tz` (0 when not past the due day).
 * Used for the "OVERDUE · 2 DAYS" pill.
 */
export function calendarDaysOverdue(
  followUp: Pick<FollowUp, "status" | "dueAt">,
  now: Date,
  tz: FixedTimeZone = DEMO_TIME_ZONE,
): number {
  if (dueBucket(followUp, now, tz) !== "overdue") return 0;
  const dueDay = zonedDay(new Date(Date.parse(followUp.dueAt)), tz);
  return Math.round((zonedDay(now, tz).start.getTime() - dueDay.start.getTime()) / DAY_MS);
}
