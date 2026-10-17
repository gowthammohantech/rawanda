# HWM-08 — Follow-up contact attempts and outcome capture with evidence

> **Data layer (reconciled):** table, outbox, mock-server and SQL names in this file are logical names — implement them through the FND-07 repository / sync API per the term-mapping table in `02-worker-mobile/INDEX.md`. Tests run under Vitest (FND-10); device flows via `test:maestro`.

## 1. Header

| Field | Value |
|---|---|
| ID | HWM-08 |
| Title | Record contact attempts and follow-up outcomes (attempted contact, attended, referred onward, unable to reach) with evidence, timestamp and versioned offline-first writes |
| App | Health Worker Mobile |
| Depends on | HWM-07 |
| Trace | PRD HW-07, shared lifecycle ("Completed means an evidenced, timestamped care step") · FRD HW-07, §4 (no completion without timestamp, outcome, evidence type), §5 · BRD BR-05 · Tech spec §2.2 "Follow-up outcome", §5.2 FollowUp, WF-01 step 7, WF-02 step 3 · FRD T-01, T-03, T-04, T-05, T-09 |
| Size | M |
| Status | Done |

## 2. Goal

From a task, the worker records each **contact attempt** (when, how, reached or not, short note) and, when appropriate, the **outcome**: *Attended* (patient attended the referred appointment/visit — requires evidence type and occurred-at), *Referred onward* (patient directed to the clinician-set destination — does not complete the referral), or *Unable to reach* (requires at least one recorded attempt and a reason). Every write is saved to SQLite with the follow-up's current `version` as `base_version`, queued for sync, and marked "Saved on this device" until acknowledged. Nothing is marked complete without a timestamped, evidenced outcome; a stale version produces a conflict that is never silently overwritten.

## 3. Scope

**In scope**: attempt form, outcome form, evidence-type picker from a demo list, client-side state machine guard, transactional writes + `followup.attempt` / `followup.outcome` ops, optimistic local status update, confirmation for completion.

**Out of scope**: conflict resolution UI (HWM-09), clinician confirmation of completion (Clinical app), photo/document evidence upload, reassignment.

## 4. Deliverables

```text
apps/worker-mobile/app/(app)/tasks/[followUpId]/attempt.tsx   # RecordAttemptScreen
apps/worker-mobile/app/(app)/tasks/[followUpId]/outcome.tsx   # RecordOutcomeScreen
apps/worker-mobile/src/features/followup/
  RecordAttemptForm.tsx, attemptSchema.ts
  RecordOutcomeForm.tsx, outcomeSchema.ts
  OutcomeTypePicker.tsx        # radio cards with icon + description
  EvidenceTypePicker.tsx       # demo evidence list
  OccurredAtField.tsx
  ConfirmCompletionSheet.tsx
apps/worker-mobile/src/data/followUpWrites.ts   # recordAttempt(), recordOutcome()
packages/domain: consume FND-02 follow-up machine, `WORKER_EVIDENCE_TYPES`, `UNABLE_TO_REACH_REASONS`, `CONTACT_METHODS`
packages/contracts: consume FND-03 `FollowUpUpdateInputSchema` (`record_attempt`, `record_outcome`)
packages/i18n/src/locales/{en,rw}/worker/worker.followup.json
```

## 5. Implementation tasks

1. Attempt form fields: `attemptedAt` (default now, ≤ now + 5 min, ≥ task created), `method` (`home_visit` | `phone` | `facility` — FND-02 `CONTACT_METHODS`; phone is simulated), `result` (`reached` | `not_reached` | `declined`), `note` ≤ 300 chars (optional; hint "Do not record diagnoses").
2. Outcome types and rules (all validated by `outcomeSchema`, messages i18n keys):
   - `attended` → requires `occurredAt`, `evidenceType` ∈ FND-02 `WORKER_EVIDENCE_TYPES` (`facility_register_checked`, `appointment_card_seen`, `worker_accompanied_visit`, `patient_verbal_confirmation`), optional note; transitions follow-up to `completed` with `clinicianConfirmation.status: 'pending'` (FND-02; the clinician confirms in CLN-09).
   - `referred_onward` → requires `occurredAt`, destination prefilled from referral (read-only), evidence type; status → `contacted`; caption "The clinician confirms when the referral is complete".
   - `unable_to_reach` → requires ≥ 1 recorded attempt with `result: 'not_reached'` (or the form records one inline), reason ∈ `UNABLE_TO_REACH_REASONS` (`not_at_home_repeatedly`, `moved_away`, `phone_unreachable`, `declined_contact`, `other` + text); status → `unable_to_reach`; caption "Your supervisor or clinician will decide next steps".
   - "Attempted contact" from spec §2.2 is the attempt form (#1); an attempt with `result: 'reached'` moves `assigned → contacted`.
3. `followUpTransition` guard: reject outcome on `completed` tasks; reject `attended` on `unable_to_reach` without a newer reached attempt; client shows a blocking message rather than writing.
4. `ConfirmCompletionSheet` for `attended`: summary (outcome, evidence, time) + "This marks the follow-up as completed" → Confirm / Back.
5. `recordAttempt()` / `recordOutcome()` in `withTx`: insert `contact_attempts` row or set `follow_ups.outcome_json` + local status + `completed_at`; `outbox.enqueue(op, {baseVersion: follow_ups.version})`; audit; `sync_state='pending'`. Do **not** bump `version` locally — version comes from the server ack.
6. Multiple local changes on the same follow-up before sync: each op carries the same `base_version`; the engine (HWM-02) sends them in `seq` order and, after each ack, rewrites the next queued op's `base_version` to the acked `entityVersion` **only if that op was created against the version just acknowledged by this device** (chain rule, unit-tested). A remote change in between still yields `CONFLICT`.
7. Double-submit: form instance UUID = op ID; second press is a no-op returning the same result.
8. Post-save: navigate back to task detail; toast "Saved on this device"; timeline shows the new item with `SAVED ON THIS DEVICE` pill, then `SYNCED`.
9. Server side (MockSyncServer, extend HWM-02): validate same schema, enforce assignment/scope (`FORBIDDEN`, and `TASK_REASSIGNED` if the server copy's `assigned_worker_id` changed), version check (`CONFLICT` + latest), apply transition, return new `entityVersion`; audit `followup.outcome_recorded` with correlation ID linking to the referral/review.

## 6. Data, state and audit

- Writes `contact_attempts`, `follow_ups`, `outbox_ops`, `audit_events`.
- Transitions: `assigned → contacted` (reached attempt / referred_onward), `assigned|contacted → completed` (attended + evidence), `assigned|contacted → unable_to_reach`. `overdue` remains derived; completing an overdue task clears the derived flag.
- Audit: `followup.contact_attempted`, `followup.outcome_recorded` (outcome, evidence type, occurredAt, base version), server mirror events.
- Invariants: no `completed` without `occurredAt` + outcome + evidence type (FRD §4); no op without `base_version`; one attempt/outcome per idempotency key; previous outcome never overwritten locally.

## 7. UX states

| State | Behaviour |
|---|---|
| Initial | Outcome cards unselected; evidence hidden until an outcome needing it is chosen |
| Validation error | Field errors + summary; Confirm disabled |
| Offline | Saves locally; "Saved on this device" |
| Server error | Retryable → "Will retry" in timeline |
| Stale/conflict | `CONFLICT` → task banner "Someone else updated this task — your record is kept. Decide in Sync." |
| Permission denied | `FORBIDDEN` / `TASK_REASSIGNED` → `NOT ACCEPTED` pill with explanation; local record retained |
| Success | Toast + timeline entry; completed tasks move to Completed tab |

## 8. i18n

Namespace `worker.followup`; RW flagged `needs clinical/linguistic review`.

| Key | EN | RW (draft) |
|---|---|---|
| `worker.followup.outcome.attended` | Attended | Yitabiriye |
| `worker.followup.outcome.referredOnward` | Referred onward | Yoherejwe ahandi |
| `worker.followup.outcome.unableToReach` | Unable to reach | Ntibyashobotse kumubona |
| `worker.followup.evidenceType` | How was this confirmed? | Byemejwe gute? |
| `worker.followup.confirmCompletion` | This marks the follow-up as completed | Ibi byemeza ko ikurikirana ryarangiye |
| `validation.followup.evidenceRequired` | Choose how the visit was confirmed | Hitamo uko uruzinduko rwemejwe |
| `validation.followup.attemptRequired` | Record at least one unsuccessful attempt first | Banza wandike nibura igerageza rimwe ritagenze neza |

## 9. Acceptance criteria

- [ ] `attended` without evidence type or occurred-at cannot be saved (T-03).
- [ ] `unable_to_reach` with no unsuccessful attempt is blocked.
- [ ] Offline outcome → one local row + one op with `base_version`; task moves to Completed tab immediately, labelled "Saved on this device".
- [ ] Double-tap Confirm yields one op (T-04).
- [ ] With `conflictOnce` set for the task, sync ends in `conflict`, local outcome retained, no overwrite of server state (T-05).
- [ ] Two sequential offline changes on one task sync without a false conflict (chain rule).
- [ ] Network failure mid-sync followed by retry yields exactly one server outcome (T-09).

## 10. Tests

- `src/features/followup/__tests__/outcomeSchema.test.ts`, `attemptSchema.test.ts`.
- `src/data/__tests__/followUpWrites.test.ts` — transitions, atomicity, base_version, idempotent submit.
- `src/sync/__tests__/engine.chain.test.ts` — chained base_version rewrite vs remote conflict.
- `src/features/followup/__tests__/RecordOutcomeForm.test.tsx` — conditional fields, EN/RW errors, confirm sheet.
- `.maestro/hwm08-outcome-offline.yaml` — offline, record attempt + attended outcome, restart, still completed & pending, go online, sync, synced.

## 11. Verification

```bash
pnpm --filter @laif/worker-mobile typecheck && pnpm --filter @laif/worker-mobile lint
pnpm --filter @laif/worker-mobile test -- src/features/followup src/data src/sync
pnpm --filter @laif/domain test && pnpm --filter @laif/contracts test
pnpm --filter @laif/worker-mobile exec expo export --platform android --output-dir .expo-export-check
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

Manual (Expo Go): Tasks → Overdue task → Record contact attempt (home visit, not reached) → Record outcome → Unable to reach → reason → saved → open another task → Record outcome → Attended → skip evidence → error → choose "Facility register checked" → Confirm sheet → Confirm → task in Completed with "Saved on this device" → go Online → sync → "Synced".

## 12. Commit

`feat(worker): HWM-08 follow-up attempts and evidenced outcome capture`
