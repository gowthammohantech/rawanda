/**
 * The ONLY source of reminder text (CTZ-05 task 7, PRD §10 sensitive notifications). A reminder
 * may be seen on a lock screen or a shared phone, so it says only that an appointment is
 * tomorrow / today: no result, value, condition, facility department or name — and it takes NO
 * interpolation tokens (`SAFE_CONTENT_ALLOWED_TOKENS` is empty; a unit test enforces it on the
 * EN and RW catalogues). Text is resolved at delivery time in the person's CURRENT language
 * (i18next falls back to EN for a missing RW key, never a raw key).
 */
import type { ReminderTiming } from "@laif/domain";

export const SAFE_REMINDER_KEYS = {
  title: "citizen:reminders.safe.title",
  bodyTomorrow: "citizen:reminders.safe.bodyTomorrow",
  bodyToday: "citizen:reminders.safe.bodyToday",
} as const;

/** Interpolation tokens reminder copy may use — none. */
export const SAFE_CONTENT_ALLOWED_TOKENS: readonly string[] = [];

export type SafeReminderContent = { title: string; body: string };

type Translate = (key: (typeof SAFE_REMINDER_KEYS)[keyof typeof SAFE_REMINDER_KEYS]) => string;

/** `day_before` reminders arrive the day before ("tomorrow"); `morning_of` on the day. */
export function reminderDay(timing: ReminderTiming): "tomorrow" | "today" {
  return timing === "day_before" ? "tomorrow" : "today";
}

export function safeReminderContent(t: Translate, timing: ReminderTiming): SafeReminderContent {
  return {
    title: t(SAFE_REMINDER_KEYS.title),
    body: t(
      reminderDay(timing) === "tomorrow"
        ? SAFE_REMINDER_KEYS.bodyTomorrow
        : SAFE_REMINDER_KEYS.bodyToday,
    ),
  };
}

/** `{{token}}` names used in a catalogue string. */
export function interpolationTokens(text: string): string[] {
  return [...text.matchAll(/\{\{\s*([^}\s]+)\s*\}\}/gu)].map((m) => m[1] ?? "");
}
