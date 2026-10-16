# CTZ-05 — Reminders: opt in/out, preferences and simulated scheduling

## 1. Header

| Field | Value |
|---|---|
| ID | CTZ-05 |
| Title | Reminders — opt-in/opt-out, timing preference, safe content, simulated schedule and history |
| App | Citizen Health Wallet |
| Depends on | CTZ-04 |
| Trace | CW-04; Tech spec §2.4 "Reminders", §5.1 `Reminder`, §8 "Citizen — Reminder opt-out: changes local preference and stops simulated scheduling", §5.2 invariant "no UI may claim a referral is complete merely because a reminder was sent"; FRD Scenario 1 ("acknowledge reminder"); PRD §10 "sensitive notifications"; T-01, T-04, T-05, T-09 |
| Size | L |
| Status | Planned |

## 2. Goal

The citizen can turn appointment reminders on or off, choose when to be reminded (the day before, or the morning of), see the reminders scheduled for their approved appointments, see past reminders, and mark a delivered reminder as seen. Turning reminders off immediately cancels every pending reminder. Reminder text never contains health details, so a reminder seen on a shared phone reveals nothing clinical.

## 3. Scope

**In scope:** reminders tab, preferences screen, opt-in/opt-out, scheduler, simulated delivery driven by the demo clock, in-app reminder inbox banner, acknowledge, history, optional on-device preview notification, cancellation on consent withdrawal.

**Out of scope:** SMS/push/real messaging channels (ADR-P09); reminders for non-appointment content; medication reminders; any reminder copy with values, conditions or facility department names.

### Scheduling decision (justification)

**Chosen: in-app simulated schedule (SQLite is the source of truth), plus an optional, explicitly-triggered on-device preview via `expo-notifications` local scheduling.**

- The demo clock is pinned (README non-negotiable); OS timers run on real time, so real scheduled notifications would fire at the wrong moments and could not be reset by `Reset demo`.
- Deterministic and testable under Vitest (FND-10) and on the Expo web target without native modules or permission prompts; Maestro flows don't depend on OS notification UI.
- Avoids putting anything on a lock screen by default (PRD §10 sensitive notifications / shared devices).
- Opt-out is verifiable by data: every `scheduled` row becomes `cancelled`.
- The preview proves the device path works: `Send a test reminder to this phone` requests permission, then `scheduleNotificationAsync({ content: safeContent, trigger: { seconds: 5 } })`. Opt-out and consent withdrawal also call `cancelAllScheduledNotificationsAsync()` so no stray OS notification survives.

## 4. Deliverables

- `app/(app)/(tabs)/reminders/index.tsx`, `app/(app)/(tabs)/reminders/preferences.tsx`.
- `src/features/reminders/ReminderToggleCard.tsx` (prototype reminder card with bell icon + accessible `Switch`, `accessibilityRole="switch"`), `TimingSelector.tsx` (radio group), `ScheduledReminderRow.tsx`, `ReminderHistoryRow.tsx`, `ReminderInboxBanner.tsx` (shown in `(tabs)/_layout.tsx` when an unacknowledged `delivered_simulated` exists), `SafeContentNote.tsx`, `PreviewNotificationButton.tsx`.
- `src/features/reminders/scheduler.ts` — pure `planReminders(instructions, prefs, clock) → ReminderPlan[]` and `processDueReminders(reminders, clock)`.
- `src/features/reminders/notificationAdapter.ts` — `NotificationAdapter` interface; `SimulatedNotificationAdapter` (default) and `ExpoLocalNotificationAdapter` (preview only). Add `expo-notifications` at the version pinned to the FND Expo SDK (`npx expo install expo-notifications`).
- `src/features/reminders/safeContent.ts` — the only source of reminder text.
- Subscribe to the CTZ-02 `onConsentWithdrawn` event.

## 5. Implementation tasks

1. `planReminders`: for each approved, `planned` appointment/follow-up with `appointment_at > now`, when `opted_in`, produce one reminder at `day_before` = previous day 09:00 Africa/Kigali, or `morning_of` = same day 07:00 (fixed demo notification times, not clinical intervals). Skip if computed time ≤ now. Unique key `(instruction_id, scheduled_at)`.
2. `repo.updateNotificationPrefs(input, expectedVersion, key)` in one transaction: write prefs; cancel all `scheduled` rows with `cancelled_reason` = `opted_out` | `timing_changed`; insert new plan rows (if opted in). Returns new version. Replay with same key = no-op returning original (T-04).
3. Opt-out path: toggle off → `ConfirmSheet` "Stop reminders? You will not get reminders for your appointments. Your appointments stay the same." → prefs `opted_in=false` → all scheduled cancelled → adapter `cancelAll()` → success toast. No new rows are produced by any later `planReminders` call while opted out (assert in scheduler and repository).
4. `processDueReminders` runs on app focus and on demo-clock change: `scheduled` with `scheduled_at ≤ now` → `delivered_simulated`, `delivered_at = now`. Show `ReminderInboxBanner` "You have a reminder from your care team" → opens reminders tab.
5. Acknowledge: on a delivered row tap `Got it` → `acknowledged` (idempotent key per reminder). Acknowledging never changes instruction status.
6. Reminders tab layout: `ReminderToggleCard` (state + timing summary "We'll remind you the day before" / "Reminders are off"), section `SCHEDULED` (rows with date, time, "Appointment reminder", chip `SCHEDULED`), section `HISTORY` (seeded + new: `DELIVERED (DEMO)`, `SEEN`, `CANCELLED`), `SafeContentNote` showing the exact reminder text the person would see.
7. `safeContent.ts`: title "CareConnect reminder", body "You have an appointment {tomorrow|today}. Open the app for details." — no result, condition, facility department or name. Unit test enforces a whitelist of interpolation tokens.
8. Preferences screen: `TimingSelector` (day before / morning of), channel row "In this app (demo)" read-only, `PreviewNotificationButton` (permission denied → explain how to enable, nothing else breaks; web → hidden).
9. Consent withdrawal handler: cancel all scheduled (`cancelled_reason='consent_withdrawn'`) + adapter cancelAll; prefs untouched so re-consent restores the person's choice but re-plans only on next opt-in confirmation (product-owner decision flagged in INDEX).
10. Conflict: demo-tools `conflict-next-write` (FND-07 `conflictOnce`) → prefs update throws `CONFLICT` → `ConflictNotice` showing current saved state, toggle reverts to saved value; no rows changed (T-05). `error500` → toggle reverts, inline error + Retry with same key (T-09).

## 6. Data, state and audit

- Reads/writes: `ctz_notification_prefs`, `ctz_reminders`; reads `ctz_care_instructions` (approved only).
- Transitions: `scheduled → delivered_simulated → acknowledged`; `scheduled → cancelled(opted_out|timing_changed|consent_withdrawn|instruction_cancelled)`.
- Audit: `citizen.reminder.opted_in`, `citizen.reminder.opted_out`, `citizen.reminder.preference_changed`, `citizen.reminder.scheduled` (system actor `wallet-scheduler`), `citizen.reminder.cancelled`, `citizen.reminder.delivered_simulated`, `citizen.reminder.acknowledged`, `citizen.reminder.preview_sent`.
- Invariants: opted-out ⇒ zero `scheduled` rows for the account; reminders only for approved instructions; reminder delivery/ack never marks care completed.

## 7. UX states

| State | Presentation |
|---|---|
| initial/loading | toggle card skeleton |
| loaded | toggle + scheduled + history |
| empty | scheduled: "No upcoming reminders" (opted in, no future appointments) or "Reminders are off"; history: "No reminders yet" |
| validation error | timing must be selected when opting in (translated) |
| server error | toggle reverts + inline error + Retry |
| permission denied | OS notification permission denied (preview only) → info card; consent withdrawn → guard |
| offline | n/a (local) |
| stale-conflict | `ConflictNotice`, toggle shows saved state |
| success | toast "Reminders turned off" / "Reminders turned on"; screen-reader announcement |

## 8. i18n

Namespace `citizen.reminders`: `title`, `toggle.label`, `toggle.onSummary.dayBefore|morningOf`, `toggle.offSummary`, `optOut.confirmTitle|confirmBody|confirm`, `timing.dayBefore|morningOf`, `section.scheduled|history`, `chip.scheduled|delivered|seen|cancelled`, `gotIt`, `inbox.banner`, `safe.title`, `safe.bodyTomorrow|bodyToday`, `preview.button|permissionDenied`, `channel.inApp`, `validation.timingRequired`.

| Key | EN | RW (draft — linguistic review) |
|---|---|---|
| `toggle.offSummary` | Reminders are off | Kwibutsa birahagaritswe |
| `safe.bodyTomorrow` | You have an appointment tomorrow. Open the app for details. | Ufite gahunda ejo. Fungura porogaramu urebe ibisobanuro. |
| `optOut.confirm` | Stop reminders | Hagarika kwibutsa |

Reminder text is resolved at delivery time in the person's **current** language; if the RW key is missing, EN is used (never a raw key).

## 9. Acceptance criteria

- [ ] CTZ-P1 shows reminders on, 1 scheduled, 2 history rows (1 seen) from seed.
- [ ] Turning reminders off cancels all scheduled rows (DB check) and writes `citizen.reminder.opted_out` + one `cancelled` audit per row; scheduled section shows "Reminders are off".
- [ ] While off, advancing the demo clock produces no delivered reminders and no new scheduled rows.
- [ ] Turning on with `morning_of` creates exactly one reminder per future approved appointment; replaying the request creates no duplicates.
- [ ] Advancing the clock past `scheduled_at` shows the inbox banner; `Got it` marks it seen; the related next step remains `planned`.
- [ ] Reminder copy passes the safe-content whitelist test in EN and RW.
- [ ] Withdrawing consent cancels scheduled reminders and OS-scheduled preview notifications.
- [ ] Conflict and error paths revert the toggle to the saved value.

## 10. Tests

- `src/features/reminders/__tests__/scheduler.test.ts` (plan, opted-out ⇒ empty, timezone at Kigali day boundary, idempotent).
- `.../__tests__/safeContent.test.ts`.
- `.../__tests__/remindersScreen.test.tsx` (toggle off flow, confirm dialog, conflict revert, error retry).
- `.../__tests__/notificationAdapter.test.ts` (mock `expo-notifications`; cancelAll on opt-out and consent withdrawal).
- Maestro: `apps/citizen-wallet/.maestro/reminder-opt-out.yaml` — Marie → Reminders → toggle off → confirm → assert "Reminders are off" and no `SCHEDULED` chip → Demo tools advance +7 days → Reminders → assert no new `DELIVERED` row.

## 11. Verification

```bash
pnpm --filter @laif/citizen-wallet typecheck && pnpm --filter @laif/citizen-wallet lint && pnpm --filter @laif/citizen-wallet test
pnpm typecheck && pnpm lint && pnpm test && pnpm build
maestro test apps/citizen-wallet/.maestro/reminder-opt-out.yaml
```
Manual (Expo Go): Marie → Reminders → note 1 scheduled → Preferences → Morning of → back (scheduled time changed) → Send a test reminder → allow permission → OS notification appears with generic text only. Toggle off → confirm → scheduled empty. Demo tools → +7 days → no banner. Toggle on → +1 day → banner → Got it.

## 12. Commit

`feat(citizen): CTZ-05 reminders opt-in/out with simulated scheduling`
