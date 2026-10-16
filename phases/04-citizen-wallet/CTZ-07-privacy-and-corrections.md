# CTZ-07 — Privacy: access history, notices and correction requests

## 1. Header

| Field | Value |
|---|---|
| ID | CTZ-07 |
| Title | Privacy — privacy notice, demo access history, consent link, correction request that creates a care-team task |
| App | Citizen Health Wallet |
| Depends on | CTZ-06 |
| Trace | CW-06; WF-04 step 4; FRD Scenario 2; FRD §4 ("do not overwrite original… use correction/version events", reason required when correcting); FRD §7 (log access); Tech spec §2.4 "Privacy", §8 "Citizen — Correction request: task created; source clinical record unchanged"; T-01, T-03, T-04, T-05, T-06, T-09 |
| Size | L |
| Status | Planned |

## 2. Goal

From **More → Privacy**, the citizen can read a short privacy notice, see who has looked at their record in this demo (care-team members and themselves, with role and time), manage consent, and ask for a correction when something looks wrong. Sending a correction request creates a task for the care team and shows its status; it never changes the health record itself. The original stays exactly as it was until authorised staff act (simulated in the seed).

## 3. Scope

**In scope:** More hub, privacy home, privacy notice, access history list, correction request form (pick item, describe, confirm), correction request list and detail with status, `CareTask` creation, idempotency/conflict/error handling, timeline integration.

**Out of scope:** staff-side correction handling UI (Clinical portal track; resolution states come from seed only — D3); data download/export (not in FRD for wallet; REL scenario export is separate); account deletion.

## 4. Deliverables

- `app/(app)/(tabs)/more/index.tsx` — hub list: Privacy, Consent (CTZ-02), Accessibility (CTZ-08), Support (CTZ-08), Demo tools.
- `app/(app)/(tabs)/more/privacy/index.tsx`, `privacy/notice.tsx`, `privacy/access-history.tsx`, `privacy/corrections/index.tsx`, `privacy/corrections/new.tsx`, `privacy/corrections/[requestId].tsx`.
- `src/features/privacy/AccessEventRow.tsx` (avatar initials, actor display "Nurse (synthetic) · Kigali Demo Health Centre", action label, time; mono chip `VIEWED` / `UPDATED` / `YOU`), `AccessHistoryFilter.tsx` (All / Care team / Me), `PrivacyNoticeBody.tsx`, `CorrectionItemPicker.tsx`, `CorrectionForm.tsx`, `CorrectionStatusStepper.tsx` (Submitted → With care team → Resolved; ref-images stepper pattern), `RecordUnchangedNote.tsx`.
- `src/features/privacy/correctionSchema.ts` — Zod schema with translated messages.
- Seed addition: CTZ-P2 has one prior correction `resolved_no_change` with resolution note key; CTZ-P1's amended observation (CTZ-06) is linked to a prior `resolved_amended` request. **Shared-package task (`@laif/mock-data`).**

## 5. Implementation tasks

1. More hub with grouped rows (small uppercase section labels `MY DATA`, `SETTINGS`, `HELP`, `DEMO`), chevrons, 56pt rows.
2. Privacy home: three cards — "Who can see my information" (plain-language summary + notice link), "Who has looked at my record" (latest 3 access events + `See all`), "Something wrong?" (`Ask for a correction` primary button, list of my requests with status chips).
3. Notice screen: versioned (`demo-notice-v0.1`), headed `DEMO NOTICE — NOT APPROVED WORDING`, sections: what is shown, who sees it, where it is stored ("on this device only in the demo; a real service would store data in Rwanda"), how long it is kept (placeholder "To be decided by the Ministry"), your choices (consent, corrections) and **your rights under Rwanda Law No. 058/2021** (access, correction, portability, erasure — each marked "process to be defined by the Ministry; not available in this demo"). PDF coverage: LAIF MoH proposal p. 12. Content keys flagged legal review.
4. Access history: `repo.listAccessEvents(patientId)` newest first; synthetic staff events from seed plus own events from CTZ-03..06; filter chips; each row explains action in plain words ("Looked at your blood pressure result"). Viewing this list logs `citizen.access_history.viewed`. Wallet-internal system actions (scheduler) are hidden.
5. Correction flow `new.tsx` (3 steps, single screen with stepper):
   - Step 1 `CorrectionItemPicker`: choose a released observation, an approved next step, or "My personal details" (synthetic name/date of birth); preselected when entered from a result detail (add `Something wrong?` link to `health/[observationId].tsx` and `next-steps/[instructionId].tsx`).
   - Step 2 `CorrectionForm`: "What is wrong?" (required, 10–500 chars), "What should it say?" (optional, ≤200 chars), checkbox "I understand my care team will check this; my record stays the same until they do" (required).
   - Step 3 review summary → `Send request`.
6. Zod `correctionSchema`: `targetType` enum required, `targetId` required unless personal details, `description` min 10 / max 500 trimmed, `suggestedValue` max 200, `understood` literal true. Messages map to `citizen.validation.correction.*` keys (EN+RW), rendered inline with `accessibilityLiveRegion`.
7. `repo.createCorrectionRequest(input, key)` (FND-07 `requestCorrection` via the citizen facade) in one transaction: insert a `careTasks` record `kind: 'correction_request'` (payload status `submitted`, `assignedRole: 'clinician'`); audit `correction.requested` + `task.created` with the same correlation ID; **no write** to `ctz_released_observations`, `ctz_care_instructions` or account identity. Return entity + task ID.
8. Idempotency: key generated when the review step mounts; double-tap or retry after `error500` returns the same request (T-04, T-09). Duplicate guard: if an open (`submitted`/`in_review`) request exists for the same target, show "You already asked about this on {date}" with link, and do not create another (business rule, test-covered).
9. Conflict: if target observation version changed between pick and send (demo-tools `conflict-next-write` (FND-07 `conflictOnce`)) → `ConflictNotice` "This item was updated by your care team. Please check it again before sending." → return to step 1 with refreshed item (T-05).
10. Success screen: check icon, "Request sent", reference `CR-xxxx` (short ID), `RecordUnchangedNote` "Your record has not been changed. Your care team will review your request." → `View request`.
11. Detail `[requestId].tsx`: stepper, submitted date, description, target summary, task status mapped to citizen copy; resolved variants show the seeded outcome key and, for `resolved_amended`, a link to the timeline change (CTZ-06) showing original retained (T-06).
12. Timeline integration: requests appear as `waiting` / `changed` items (projection already exists).

## 6. Data, state and audit

- Reads: `ctz_access_events`, `ctz_correction_requests`, `ctz_care_tasks`, observations/instructions for picker.
- Writes: `ctz_correction_requests`, `ctz_care_tasks`, `ctz_access_events`, audit.
- Audit/access: `correction.requested`, `task.created`, `citizen.correction.duplicate_blocked`, `citizen.correction.viewed`, `citizen.access_history.viewed`, `citizen.privacy_notice.viewed`.
- Invariants: hash of `ctz_released_observations` + `ctz_care_instructions` identical before/after any correction request (test asserts); one task per request; one open request per target.

## 7. UX states

| State | Presentation |
|---|---|
| initial | privacy home cards |
| loading | skeleton rows; send button spinner, disabled |
| loaded | lists with counts |
| empty | access history: "No one has looked at your record in this demo yet."; requests: "You have not asked for any corrections." |
| validation error | inline per field, translated; focus moves to first error |
| server error | inline banner + Retry (same key) |
| permission denied | guard; representative (CTZ-P4) may request corrections only for Grace (scope) |
| offline | n/a (local) |
| stale-conflict | `ConflictNotice` → back to step 1 |
| success | success screen with reference and unchanged-record note |

## 8. i18n

Namespaces `citizen.privacy`, `citizen.correction`, `citizen.validation.correction`.

| Key | EN | RW (draft — linguistic + legal review) |
|---|---|---|
| `citizen.correction.cta` | Ask for a correction | Saba ko bikosorwa |
| `citizen.correction.unchanged` | Your record has not been changed. Your care team will review your request. | Amakuru yawe ntiyahinduwe. Itsinda rikwitaho rizasuzuma icyifuzo cyawe. |
| `citizen.validation.correction.descriptionMin` | Please tell us a little more (at least 10 letters). | Twongerere ibisobanuro (nibura inyuguti 10). |
| `citizen.validation.correction.mustUnderstand` | Please tick the box to continue. | Kanda ku kazu kugira ngo ukomeze. |
| `citizen.privacy.whoLooked` | Who has looked at my record | Abarebye amakuru yanjye |

User-entered description text is stored and shown verbatim (not translated).

## 9. Acceptance criteria

- [ ] Access history for CTZ-P1 shows seeded staff views and own views with role, facility (synthetic) and Kigali time; filter works.
- [ ] Submitting with an empty/short description shows translated field errors in EN and RW; nothing written.
- [ ] Valid submit creates exactly one request + one open `correction_review` task + two audit events sharing a correlation ID, even on double-tap or retry.
- [ ] Observation and instruction table hashes unchanged after submit.
- [ ] Second request for the same target while open is blocked with link to the existing one.
- [ ] Conflict toggle → conflict notice; no request created.
- [ ] Seeded resolved requests display outcome; `resolved_amended` links to the timeline change showing the original.
- [ ] Representative can only pick Grace's items.

## 10. Tests

- `src/features/privacy/__tests__/correctionSchema.test.ts` (EN/RW messages).
- `.../__tests__/correctionFlow.test.tsx` (steps, validation focus, success, duplicate block, conflict, retry same key).
- `.../__tests__/recordUnchanged.test.ts` (repository-level hash invariant).
- `.../__tests__/accessHistory.test.tsx` (rows, filter, access event).
- Maestro: `apps/citizen-wallet/.maestro/correction-request.yaml` — Marie → My health → result → Something wrong? → type description → tick → Send → assert "Request sent" → Privacy → request shows `SUBMITTED` → My health result values unchanged.

## 11. Verification

```bash
pnpm --filter @laif/mock-data test
pnpm --filter @laif/citizen-wallet typecheck && pnpm --filter @laif/citizen-wallet lint && pnpm --filter @laif/citizen-wallet test
pnpm typecheck && pnpm lint && pnpm test && pnpm build
maestro test apps/citizen-wallet/.maestro/correction-request.yaml
```
Manual (Expo Go): Marie → More → Privacy → See all access → filter Care team → back → Ask for a correction → pick glucose result → type "abc" → error → type full sentence → tick → Send twice quickly → one request → View request → stepper at Submitted → My health → values unchanged. Switch language to RW and repeat validation error.

## 12. Commit

`feat(citizen): CTZ-07 privacy access history and correction requests`
