/**
 * Citizen reminder scheduling (CTZ-05) — pure functions over the demo clock, shared by the
 * `CitizenRepository` (which writes the rows in one transaction) and the wallet
 * (`src/features/reminders/scheduler.ts`).
 *
 * - One reminder per approved, still-`planned` appointment / follow-up step with a future
 *   `appointmentAt`, only while the person is opted in.
 * - Fixed DEMO notification times (not clinical intervals): `day_before` = 09:00 Africa/Kigali on
 *   the previous calendar day, `morning_of` = 07:00 Africa/Kigali on the appointment day.
 * - A reminder time that is not in the future, or not before the appointment, is skipped.
 * - Unique key `(instructionId, scheduledAt)`.
 * - Delivery is simulated: `scheduled` rows whose time has come become `delivered_simulated`.
 *   A reminder never changes a next step / referral / follow-up (spec §5.2).
 */
import { DEMO_TIME_ZONE, zonedDay, type FixedTimeZone } from "../due-bucket.ts";
import type { Reminder } from "../entities/reminder.ts";
import type { CareInstructionKind, ReminderTiming } from "../enums.ts";
import type { ApprovedInstruction } from "./visibility.ts";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Wall-clock reminder time per timing (demo values, Africa/Kigali). */
export const REMINDER_DEMO_TIMES: Readonly<
  Record<ReminderTiming, { dayOffset: number; hour: number }>
> = {
  day_before: { dayOffset: -1, hour: 9 },
  morning_of: { dayOffset: 0, hour: 7 },
};

/** Step kinds that get appointment reminders (referrals do not, CTZ-05 task 1). */
export const REMINDABLE_INSTRUCTION_KINDS: readonly CareInstructionKind[] = [
  "appointment",
  "follow_up",
];

/** The clock seam (`Clock` / `DemoClock` satisfy it). */
export type ReminderClock = { now(): Date };

export type ReminderPrefsLike = { optedIn: boolean; timing: ReminderTiming };

export type ReminderPlanInstruction = Pick<
  ApprovedInstruction,
  "id" | "kind" | "approvalState" | "progress" | "appointmentAt" | "sourceType" | "sourceId"
>;

export type ReminderPlan = {
  /** `${instructionId}@${scheduledAt}` — the unique key. */
  key: string;
  instructionId: string;
  /** Source follow-up of the step (null for other sources). */
  followUpId: string | null;
  appointmentAt: string;
  scheduledAt: string;
  timing: ReminderTiming;
};

export const reminderKey = (instructionId: string, scheduledAt: string): string =>
  `${instructionId}@${scheduledAt}`;

/** The UTC instant of the reminder for an appointment (fixed-offset zone, no DST). */
export function reminderTimeFor(
  appointmentAt: string,
  timing: ReminderTiming,
  tz: FixedTimeZone = DEMO_TIME_ZONE,
): string {
  const { dayOffset, hour } = REMINDER_DEMO_TIMES[timing];
  const day = zonedDay(new Date(Date.parse(appointmentAt)), tz);
  return new Date(day.start.getTime() + dayOffset * DAY_MS + hour * HOUR_MS).toISOString();
}

/** True when the step may have a reminder now (approved, planned, remindable, future date). */
export function isRemindable(instruction: ReminderPlanInstruction, now: Date): boolean {
  return (
    instruction.approvalState === "approved" &&
    instruction.progress === "planned" &&
    REMINDABLE_INSTRUCTION_KINDS.includes(instruction.kind) &&
    instruction.appointmentAt !== null &&
    Date.parse(instruction.appointmentAt) > now.getTime()
  );
}

/**
 * The reminders that should exist for these steps. Opted out (or no preference) ⇒ always empty.
 * Sorted by time, de-duplicated by key.
 */
export function planReminders(
  instructions: readonly ReminderPlanInstruction[],
  prefs: ReminderPrefsLike | null,
  clock: ReminderClock,
): ReminderPlan[] {
  if (prefs === null || !prefs.optedIn) return [];
  const now = clock.now();
  const plans = new Map<string, ReminderPlan>();
  for (const instruction of instructions) {
    if (!isRemindable(instruction, now) || instruction.appointmentAt === null) continue;
    const scheduledAt = reminderTimeFor(instruction.appointmentAt, prefs.timing);
    const at = Date.parse(scheduledAt);
    if (at <= now.getTime() || at >= Date.parse(instruction.appointmentAt)) continue;
    const key = reminderKey(instruction.id, scheduledAt);
    plans.set(key, {
      key,
      instructionId: instruction.id,
      followUpId: instruction.sourceType === "follow_up" ? instruction.sourceId : null,
      appointmentAt: instruction.appointmentAt,
      scheduledAt,
      timing: prefs.timing,
    });
  }
  return [...plans.values()].sort((a, b) =>
    a.scheduledAt < b.scheduledAt ? -1 : a.scheduledAt > b.scheduledAt ? 1 : a.key < b.key ? -1 : 1,
  );
}

/** A due reminder and what it becomes (the repository persists it with a version bump). */
export type DueReminder<R extends ReminderDueLike = Reminder> = {
  reminder: R;
  next: Pick<Reminder, "status" | "deliveredAt">;
};

export type ReminderDueLike = { id: string } & Pick<Reminder, "status" | "scheduledAt">;

/**
 * Simulated delivery: every `scheduled` reminder with `scheduledAt ≤ now` becomes
 * `delivered_simulated` with `deliveredAt = now`. Other statuses are untouched (idempotent).
 */
export function processDueReminders<R extends ReminderDueLike>(
  reminders: readonly R[],
  clock: ReminderClock,
): DueReminder<R>[] {
  const now = clock.now();
  const nowIso = now.toISOString();
  return reminders
    .filter((r) => r.status === "scheduled" && Date.parse(r.scheduledAt) <= now.getTime())
    .map((reminder) => ({
      reminder,
      next: { status: "delivered_simulated" as const, deliveredAt: nowIso },
    }));
}
