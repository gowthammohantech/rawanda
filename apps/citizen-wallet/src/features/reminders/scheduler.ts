/**
 * Reminder scheduling for the wallet (CTZ-05 task 1 / 4). The pure planner lives in
 * `@laif/domain` (`citizen/reminders.ts`) so the `CitizenRepository` can write the planned rows
 * in the same transaction as the preference; this module is the app's entry point to it.
 *
 * - `planReminders(instructions, prefs, clock)` — one reminder per approved, planned, future
 *   appointment / follow-up while opted in (day before 09:00 / morning of 07:00 Africa/Kigali,
 *   fixed demo times); opted out ⇒ `[]`.
 * - `processDueReminders(reminders, clock)` — `scheduled` with `scheduledAt ≤ now` →
 *   `delivered_simulated`. The repository's `processDueReminders(patientId)` persists that; the
 *   wallet runs it on app focus and on demo-clock change (`useReminderProcessor`).
 */
export {
  planReminders,
  processDueReminders,
  reminderTimeFor,
  REMINDER_DEMO_TIMES,
  type ReminderPlan,
  type ReminderClock,
} from "@laif/domain";
