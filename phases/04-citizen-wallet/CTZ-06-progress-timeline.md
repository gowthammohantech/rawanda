# CTZ-06 — Progress timeline: completed and pending care, with changes

## 1. Header

| Field | Value |
|---|---|
| ID | CTZ-06 |
| Title | Timeline — completed screenings, pending and completed follow-ups, and record changes |
| App | Citizen Health Wallet |
| Depends on | CTZ-05 |
| Trace | CW-05; FRD Scenario 1 ("attend review → see updated status"), Scenario 2 ("change is audited" — citizen-visible outcome); PRD §2 "distinguish pending work from verified completed care", "trust data provenance"; Tech spec §2.4 "Timeline", §5.2 invariants; T-06 (citizen view of correction), T-09 |
| Size | M |
| Status | Done |

## 2. Goal

The citizen opens **Timeline** and sees, in date order, what has happened in their care journey and what is still waiting: screenings recorded and reviewed, next steps agreed, steps completed (only when the care team confirmed them), reminders sent, and changes to their record (such as a corrected reading, shown as "updated", with the original kept). Pending items are clearly different from completed ones, so a reminder or acknowledgement is never mistaken for care that happened.

## 3. Scope

**In scope:** timeline tab with grouped, filterable vertical timeline; event detail sheet; "what changed" view for amended items showing original vs. updated with provenance; link-outs to result/next step/correction.

**Out of scope:** editing anything; showing staff-internal events (assignment changes, worker attempts, review queue status); aggregate analytics; charts.

## 4. Deliverables

- `app/(app)/(tabs)/timeline/index.tsx`.
- `src/features/timeline/buildCitizenTimeline.ts` — pure projection `(observations, instructions, acks, reminders, corrections, clock) → TimelineItem[]`.
- `src/features/timeline/TimelineList.tsx` (`SectionList` grouped by month; mono date labels `OCT 13` as in ref-images "Recent activity"), `TimelineItemRow.tsx`, `TimelineFilterChips.tsx` (`All`, `Waiting`, `Done`, `Changes`; counts in chips), `ChangeDetailSheet.tsx`, `ProvenanceLine.tsx`.
- Seed addition (in `@laif/mock-data` citizen scenario): one **amended** observation for CTZ-P1 (glucose context corrected `not recorded → fasting` by synthetic clinician with reason key, version 2, original retained) so the Changes filter has data. **Shared-package task.**

## 5. Implementation tasks

1. Define `TimelineItem = { id, kind, state: 'done'|'waiting'|'changed'|'cancelled'|'info', occurredAt, titleKey, bodyKey, params, provenance?, linkRoute? }`.
2. Projection rules (unit-tested, no I/O):
   - Released observation → `done` "Check recorded" at `measured_at` + `done` "Reviewed by your care team" at `released_at`.
   - `awaiting_review` → `waiting` "Waiting for your care team to review a check" (no values, no date of flag).
   - Approved instruction `planned` → `waiting` "Appointment on {date}"; with `deriveDatePassed` → same `waiting` state + date-passed sub-line (no "overdue").
   - Instruction `completed` **with** evidence type → `done` "Appointment attended — confirmed by your care team". Without evidence (should not exist) → stays `waiting` and logs a dev warning.
   - `cancelled_with_reason` → `cancelled`.
   - Acknowledgement → `info` "You read your next step".
   - Reminder delivered/acknowledged → `info` "Reminder sent (demo)"; never `done`.
   - Observation version > 1 → `changed` "Your record was updated" with `ChangeDetailSheet` (field, before, after, who, when, reason key).
   - Correction request → `waiting` "You asked for a correction" / `changed` when resolved (wired fully in CTZ-07; projection supports it now).
   - Unapproved/draft/withdrawn instructions are excluded by the repository; projection asserts and drops anything not approved.
3. Visual distinction (never colour-only): `done` = filled check-circle icon + "DONE" mono chip; `waiting` = hollow clock icon + "WAITING"; `changed` = pencil icon + "UPDATED"; `info` = small dot, muted text; `cancelled` = slash icon + "CANCELLED". Vertical rail line between items.
4. Filters with counts; persisted per session in Zustand (not DB).
5. `ChangeDetailSheet`: "Before" and "After" rows side by side (ref-images conflict card pattern), provenance "Updated by Dr. Diane N. · 12 Oct · Reason: reading context was entered wrongly", note "Your earlier record is kept. Nothing was deleted."
6. Pull-to-refresh re-runs queries and `processDueReminders` (so timeline reflects demo-clock advances).
7. Tapping an item navigates via `linkRoute` (result detail, next-step detail, correction detail from CTZ-07).
8. Access events: `citizen.timeline.viewed` on focus; `citizen.change.viewed` when opening a change sheet.

## 6. Data, state and audit

- Reads: `ctz_released_observations` (incl. versions), `ctz_care_instructions` (approved), `ctz_next_step_acks`, `ctz_reminders`, `ctz_correction_requests`.
- Writes: `ctz_access_events` only.
- Events: `citizen.timeline.viewed`, `citizen.change.viewed`.
- Invariants: `done` requires a care-team-confirmed completion (evidence present); amended items always show original + updated; no staff-internal events leak.

## 7. UX states

| State | Presentation |
|---|---|
| initial/loading | 4 skeleton rows on rail |
| loaded | grouped list; filter chips with counts |
| empty | "Your care history will appear here after your first check." |
| filter empty | "Nothing here for this filter." + `Show all` |
| validation error | n/a |
| server error | `ErrorState` + Retry |
| permission denied | guard (consent / scope) |
| offline | n/a (local) |
| stale | pull-to-refresh; "Updated just now" timestamp under header |
| success | n/a |

## 8. i18n

Namespace `citizen.timeline`: `title`, `filter.all|waiting|done|changes`, `chip.done|waiting|updated|cancelled`, `item.checkRecorded`, `item.reviewed`, `item.awaitingReview`, `item.appointmentOn`, `item.appointmentAttended`, `item.readNextStep`, `item.reminderSent`, `item.recordUpdated`, `item.correctionRequested`, `item.correctionResolved`, `change.before|after|by|reason|kept`, `empty`, `filterEmpty`, `updatedJustNow`, and `citizen.timeline.reason.<reasonKey>` for seeded amendment reasons.

| Key | EN | RW (draft — linguistic review) |
|---|---|---|
| `chip.waiting` | Waiting | Bitegerejwe |
| `chip.done` | Done | Byarangiye |
| `change.kept` | Your earlier record is kept. Nothing was deleted. | Amakuru yawe ya mbere arabitswe. Nta cyasibwe. |
| `item.reminderSent` | Reminder sent (demo) | Kwibutsa byoherejwe (igerageza) |

Month headers use the locale formatter (`Africa/Kigali`); RW month names fall back to EN if absent in the formatter.

## 9. Acceptance criteria

- [ ] CTZ-P1 timeline shows: check recorded, reviewed, appointment waiting, completed follow-up as `DONE` with "confirmed by your care team", reminders as info rows, and one `UPDATED` change.
- [ ] Opening the change shows before/after, author, time and reason; text states nothing was deleted.
- [ ] No reminder or acknowledgement row ever renders the `DONE` chip (test over all personas).
- [ ] CTZ-P2 shows the dismissed review as reviewed and the awaiting-review item as `WAITING` without values.
- [ ] Filters show correct counts and persist while switching tabs.
- [ ] Every state is distinguishable with screen reader (chip text read out) and in greyscale.
- [ ] Draft referral (CTZ-P1) absent from timeline.

## 10. Tests

- `src/features/timeline/__tests__/buildCitizenTimeline.test.ts` (all projection rules; done-requires-evidence; draft excluded; reminder never done).
- `.../__tests__/timelineScreen.test.tsx` (filters, counts, empty states).
- `.../__tests__/changeDetailSheet.test.tsx` (before/after/provenance, access event).
- `packages/mock-data/src/scenarios/__tests__/citizenSeed.test.ts` (extended: amended observation present, version 2, original retained).

## 11. Verification

```bash
pnpm --filter @laif/mock-data test
pnpm --filter @laif/citizen-wallet typecheck && pnpm --filter @laif/citizen-wallet lint && pnpm --filter @laif/citizen-wallet test
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```
Manual (Expo Go): Marie → Timeline → All → scroll Oct group → tap `UPDATED` → sheet shows before/after → close → filter Done → only care-team-confirmed items → Demo tools +1 day → Timeline pull to refresh → new "Reminder sent (demo)" info row, still no DONE for the appointment.

## 12. Commit

`feat(citizen): CTZ-06 progress timeline with pending, done and changes`
