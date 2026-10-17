# CTZ-04 — Next steps: clinician-approved plan, appointment and contacts

## 1. Header

| Field | Value |
|---|---|
| ID | CTZ-04 |
| Title | Next steps — only clinician-approved appointments, referrals and follow-ups, with contact details and acknowledgement |
| App | Citizen Health Wallet |
| Depends on | CTZ-03 |
| Trace | CW-03, CW-08 (contact path); WF-01 step 9; Tech spec §2.4 "Next steps", §8 "Citizen — Next-step display: only clinician-approved information appears"; FRD Scenario 1 ("read next step"); T-01, T-02, T-04, T-05, T-09 |
| Size | M |
| Status | Done |

## 2. Goal

The citizen opens **Next steps** and sees exactly what their care team has approved for them: the appointment (date, time, place), any referral destination, and follow-up instructions, each with who approved it and how to contact the facility. They can tap **"I have read this"** to acknowledge a step, which is saved once even if tapped repeatedly. Draft, withdrawn or unapproved plans never appear, and the wallet never adds its own advice.

## 3. Scope

**In scope:** next-steps list (upcoming / done), instruction detail, facility contact card (synthetic phone + hours + address), acknowledgement mutation with idempotency and conflict handling, "date passed" neutral messaging, home-card on My health linking here.

**Out of scope:** booking/rescheduling (not in FRD; shows "To change this, contact your care team"); calendar export; maps/navigation (low-bandwidth; static address only); reminders (CTZ-05).

## 4. Deliverables

- `app/(app)/(tabs)/next-steps/index.tsx`, `app/(app)/(tabs)/next-steps/[instructionId].tsx`.
- `src/features/next-steps/NextStepCard.tsx` (prototype "YOUR NEXT STEP" card: kicker with calendar icon, title, one-line body, appointment row, primary button), `InstructionDetail.tsx`, `FacilityContactCard.tsx`, `ApprovedByLine.tsx`, `AcknowledgeButton.tsx`, `DatePassedNotice.tsx`, `CompletedStepRow.tsx`.
- `src/features/next-steps/useNextSteps.ts`, `useAcknowledge.ts` (mutation with stable idempotency key per `instructionId+accountId` generated once and stored in component state until success).
- Update `health/index.tsx`: top `NextStepCard` for the nearest upcoming approved instruction (if any).

## 5. Implementation tasks

1. Query `repo.listApprovedInstructions(patientId)`; group: **Upcoming** (`status=planned`), **Done** (`status=completed` with `completed_at` and evidence type), **Cancelled** (`cancelled_with_reason`, shows "Your care team cancelled this step" — reason text not shown unless a `plain_text_key` exists).
2. `NextStepCard`: type icon (calendar = appointment, arrow = referral, clipboard = follow-up), localized title from `plain_text_key`, appointment row "Monday, 19 October · 10:30 · Kigali Demo Health Centre (synthetic)", `ApprovedByLine` "Agreed by Dr. Diane N. · 13 Oct", chip `APPROVED BY YOUR CARE TEAM`.
3. Detail: full instruction text (from key), what to bring (if key exists), `FacilityContactCard` with `Call` button using `Linking.openURL('tel:+250700000000')`-style synthetic number clearly labelled `Demo number — does not connect`; on press show a sheet instead of dialing (avoid calling a real line). Address text only.
4. `AcknowledgeButton`: "I have read this" → `repo.acknowledgeInstruction({instructionId}, key)`; disabled while pending; success state "Read on 14 Oct, 09:12"; on replay the repository returns the same row (T-04). On `CONFLICT` (instruction version changed — triggered via demo-tools `conflict-next-write` (FND-07 `conflictOnce`)) show `ConflictNotice` "Your care team updated this step. Please read the latest version." and reload; acknowledgement is not silently applied to the new version (T-05). On `error500` keep the key and offer Retry (T-09).
5. `DatePassedNotice` when `deriveDatePassed()` is true and status still `planned`: "The date for this step has passed. Your care team will contact you, or you can contact them." Never use the word "overdue" or "missed" (FRD §5 — no clinical overdue labelling without approved timing rules).
6. Completed rows show completion date and "Confirmed by your care team" only when `completion_evidence_type` is present; a delivered reminder never makes a step look completed.
7. Empty state: "Your care team has not shared any next steps. If you were told to come back, contact them." + Support link.
8. Deep link to another patient's instruction or to a draft/withdrawn instruction ID → `NOT_FOUND`/`FORBIDDEN` → `PermissionDenied` (same screen for both, to avoid leaking existence) + `access.denied`.
9. Log `citizen.next_step.list_viewed`, `citizen.next_step.viewed`.

## 6. Data, state and audit

- Reads: `ctz_care_instructions` (approved only), facility reference data from `@laif/mock-data`.
- Writes: `ctz_next_step_acks`, `ctz_access_events`, audit.
- Audit: `citizen.next_step.acknowledged` (entityType `CareInstruction`, entityId, correlationId, idempotency key in metadata); access: `citizen.next_step.list_viewed`, `citizen.next_step.viewed`, `access.denied`.
- Invariants: acknowledgement ≠ completion; wallet cannot change instruction status; seeded draft referral (CTZ-P1) and withdrawn instruction (CTZ-P2) are unreachable.

## 7. UX states

| State | Presentation |
|---|---|
| initial/loading | skeleton next-step card |
| loaded | Upcoming first, then Done, then Cancelled sections with counts |
| empty | message + Support link (task 7) |
| validation error | n/a (single-button mutation) |
| server error | inline error under button + Retry (same idempotency key) |
| permission denied | `PermissionDenied` for cross-patient/draft IDs |
| offline | n/a (local) |
| stale-conflict | `ConflictNotice` + reload (task 4) |
| success | button replaced by "Read on {date}" with check icon; screen-reader announcement |

## 8. i18n

Namespace `citizen.nextSteps`: `title`, `section.upcoming|done|cancelled`, `chip.approved`, `approvedBy`, `type.appointment|referral|followUp`, `acknowledge`, `acknowledgedOn`, `datePassed`, `cancelledByTeam`, `confirmedByTeam`, `contact.title`, `contact.demoNumber`, `empty`, `toChangeContact`, plus instruction content keys `citizen.nextSteps.instruction.<plain_text_key>` seeded for every instruction.

| Key | EN | RW (draft — clinical + linguistic review) |
|---|---|---|
| `acknowledge` | I have read this | Nabisomye |
| `chip.approved` | Approved by your care team | Byemejwe n'itsinda rikwitaho |
| `datePassed` | The date for this step has passed. Your care team will contact you, or you can contact them. | Itariki y'iyi ntambwe yarenze. Itsinda rikwitaho rizakuvugisha, cyangwa ushobora kuribaza. |

Dates/times formatted `Africa/Kigali` with locale-aware weekday/month names (RW month names from `@laif/i18n` formatter; fallback EN if missing).

## 9. Acceptance criteria

- [ ] CTZ-P1 sees the approved 19 Oct appointment and the completed follow-up; the seeded draft referral is absent from list, detail and deep link.
- [ ] CTZ-P2 sees no withdrawn instruction; empty state shown if nothing else approved.
- [ ] Double-tap / replay of acknowledge produces one `ctz_next_step_acks` row and one audit event.
- [ ] Conflict toggle → acknowledge shows conflict notice; no ack row written for the stale version.
- [ ] With demo clock advanced past an appointment (demo-tools), the card shows the date-passed notice and no "overdue"/"missed" text.
- [ ] Contact "Call" never dials; sheet states it is a demo number.
- [ ] My health shows the nearest upcoming approved step card linking here.

## 10. Tests

- `src/features/next-steps/__tests__/nextStepsList.test.tsx` (approved-only, grouping, empty).
- `.../__tests__/acknowledge.test.tsx` (idempotent, conflict, retry same key).
- `.../__tests__/datePassed.test.tsx` (copy check, no forbidden words).
- `.../__tests__/nextStepAccess.test.tsx` (draft/withdrawn/cross-patient deep link denied).

## 11. Verification

```bash
pnpm --filter @laif/citizen-wallet typecheck && pnpm --filter @laif/citizen-wallet lint && pnpm --filter @laif/citizen-wallet test
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```
Manual (Expo Go): Marie → My health shows "YOUR NEXT STEP" card → tap → detail → "I have read this" twice quickly → one "Read on …". Demo tools → Reset demo → enable `conflict-next-write` (FND-07 `conflictOnce`) → Next steps → appointment → "I have read this" → conflict notice and reloaded step. Demo tools → advance clock +7 days → appointment shows date-passed notice. Switch to Noël → Next steps empty state.

## 12. Commit

`feat(citizen): CTZ-04 next steps with approved-only plans and acknowledgement`
