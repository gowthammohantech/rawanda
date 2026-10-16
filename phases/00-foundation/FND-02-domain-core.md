# FND-02 — @laif/domain: entities, state machines, invariants, demo rules engine, demo clock

**Status:** Done

## 1. Header

| Field | Value |
|---|---|
| ID | FND-02 |
| Title | Domain core |
| App | Shared (`packages/domain`) |
| Depends on | FND-01 |
| Trace | Tech spec §5.1, §5.2, §5.3, ADR-P05; FRD shared lifecycle; BR-02, BR-03, BR-05; CL-04/05/06, HW-03/04/07 |
| Size | L |

## 2. Goal

Every app shares one deterministic, pure-TypeScript domain: typed entities, the per-entity state machines from spec §5.2 with invariant enforcement, an explainable demo rules engine that **contains no thresholds of its own**, overdue derivation, and a pinned demo clock. No React, no storage, no I/O.

## 3. Scope

**In scope:** entity types and enum constants; ID branding and an injectable ID generator; state machines + transition guards; invariant assertions; pathway-stage derivation (maps entity states to the FRD uppercase lifecycle for reporting); rules engine; clock; canonical hashing helper for audit `beforeHash/afterHash`.

**Out of scope:** Zod schemas (FND-03), seed data and the actual demo ruleset numbers (FND-05), persistence (FND-07/08).

## 4. Deliverables

```text
packages/domain/src/
  ids.ts            # Brand<T>, PatientId, ScreeningId, ..., IdGenerator, createSequentialIdGenerator(prefix)
  enums.ts          # `as const` arrays + union types for every status / kind
  entities/*.ts     # patient, screening, review, referral, follow-up, care-task, reminder, care-instruction,
                    # audit-event, facility, district, persona, ruleset, sync-operation, device-session
  machines/define-machine.ts, screening.ts, review.ts, referral.ts, follow-up.ts, care-task.ts, sync-operation.ts
  invariants.ts     # assert* functions throwing DomainInvariantError
  derive.ts         # isFollowUpOverdue, isReferralOverdue, derivePathwayStage
  rules/engine.ts   # evaluateScreening(input, ruleset): FlagResult
  rules/types.ts    # DemoRuleset, FlagResult, ReasonCode
  clock/clock.ts    # Clock, createDemoClock, createSystemClock, DEMO_CLOCK_DEFAULT_ISO
  hash.ts           # canonicalJson, fnv1a64Hex
  errors.ts         # DomainInvariantError, IllegalTransitionError
  index.ts
```

## 5. Implementation tasks

1. **Enums (`enums.ts`)** — exact values (lowercase snake, per spec §5.2):
   - `SCREENING_STATUSES = ['draft','submitted','review_required','no_review_required']`
   - `REVIEW_STATUSES = ['pending','in_review','action_recorded','dismissed_with_reason']`
   - `REVIEW_DECISION_KINDS = ['refer','plan_follow_up','request_repeat_screening','no_further_action']` (decision: covers spec §2.1 "refer, request repeat test"; dismissal is a status, not a kind). `REVIEW_DECISION_INPUT_KINDS = [...REVIEW_DECISION_KINDS, 'dismiss']` is the discriminator of the decision input (FND-03). **Canonical mapping to the five UI options of CLN-07** (PRD CL-05 + spec §2.1 merged): "Record assessment — no further action" = `no_further_action`; "Refer" = `refer`; "Request repeat test" = `request_repeat_screening`; "Plan follow-up review" = `plan_follow_up`; "Dismiss flag with reason" = `dismiss` → review status `dismissed_with_reason`. Every other kind → `action_recorded`.
   - `REVIEW_PRIORITIES = ['routine','urgent_demo']` (urgency comes only from fixtures labelled demo — no approved protocol), `REVIEW_ORIGINS = ['rule_flag','manual_escalation']`
   - `DISMISS_REASON_CODES = ['measurement_error_suspected','repeat_reading_acceptable','known_managed_condition','duplicate_flag','other']` (demo placeholders, CLN-07)
   - `REFERRAL_STATUSES = ['created','accepted','scheduled','completed','cancelled_with_reason']`
   - `REFERRAL_OUTCOMES = ['attended_seen','attended_further_care_planned','attended_returned_to_community']`, `REFERRAL_CANCEL_REASON_CODES = ['patient_declined','duplicate','no_longer_indicated','destination_unavailable','other']` (demo placeholders, CLN-08)
   - `FOLLOW_UP_STATUSES = ['assigned','contacted','completed','unable_to_reach','reassigned']` (`overdue` is **not** a status)
   - `FOLLOW_UP_PURPOSES = ['referral_attendance','planned_review','repeat_screening','post_referral_check']`
   - `FOLLOW_UP_OUTCOMES = ['attended','repeat_screening_done','referred_onward','unable_to_reach','declined']`, `UNABLE_TO_REACH_REASONS = ['not_at_home_repeatedly','moved_away','phone_unreachable','declined_contact','other']`, `CONTACT_METHODS = ['home_visit','phone','facility']`, `CONTACT_RESULTS = ['reached','not_reached','declined']`
   - `CLINICIAN_CONFIRMATION_STATES = ['not_required','pending','confirmed','returned']` (WF-01 step 7; PO decision on when it is required)
   - `CARE_TASK_KINDS = ['follow_up_assignment','correction_request','callback_request','programme_action','data_quality']`, `CARE_TASK_STATUSES = ['open','in_progress','done','cancelled_with_reason']`
   - `SYNC_OP_STATUSES = ['queued','sending','acknowledged','retryable_failure','conflict','needs_resolution','rejected','superseded','blocked_revoked']` (single sync design shared with HWM-02/09/10 — see task 4)
   - `CONFLICT_RESOLUTIONS = ['reapply_on_latest','keep_latest']` (used by web `ConflictNotice` flows and by `sync.resolveConflict`)
   - `GLUCOSE_UNITS = ['mmol/L','mg/dL']`, `GLUCOSE_CONTEXTS = ['fasting','non_fasting','not_recorded']` (decision aligned with CLN-04, HWM-05, CTZ-03; `not_recorded` is an explicit choice, never a default)
   - `CONSENT_STATES = ['granted','withdrawn','not_recorded']`, `IDENTITY_STATUSES = ['verified_local','unverified','possible_duplicate','needs_match_review']`
   - `COMPLETION_EVIDENCE_TYPES = ['facility_attendance_record','clinician_confirmation','return_slip_reference','facility_register_checked','appointment_card_seen','worker_accompanied_visit','patient_verbal_confirmation']` — one list for all apps (demo placeholders needing clinical sign-off). Subsets: `REFERRAL_EVIDENCE_TYPES` = first three (clinical portal, CLN-08); `WORKER_EVIDENCE_TYPES` = last four (worker app, HWM-08); clinician-recorded follow-up completion (CLN-09) may use any.
   - `REMINDER_STATUSES = ['scheduled','delivered_simulated','acknowledged','cancelled']`, `REMINDER_CANCEL_REASONS = ['opted_out','timing_changed','consent_withdrawn','instruction_cancelled']`, `REMINDER_CHANNELS = ['in_app','sms_simulated']` (prototype uses `in_app` only — CTZ-05)
   - `ROLES = ['clinician','nurse_reviewer','facility_coordinator','community_health_worker','field_supervisor','programme_lead','district_analyst','facility_manager','auditor','citizen']` (PRD/FRD actor lists: HW "approved field supervisors"; PA "programme leads, authorized district analysts, facility managers and auditors")
   - `PATHWAY_STAGES` = FRD uppercase lifecycle values (`DRAFT_SCREENING` … `CLOSED`).
2. **Entities** — implement spec §5.1 fields verbatim, plus these additions (each marked `// ext:` with reason):
   - All persisted entities: `version: number` (starts at 1), `createdAt`, `updatedAt` (ISO UTC strings), `synthetic: true` (literal type; privacy assertion hook).
   - `Patient`: `identityStatus`, `duplicateCandidateIds: PatientId[]`, `preferredLanguage: 'en'|'rw'`.
   - `Screening`: `patientId, workerId, facilityId, districtId`, `glucoseUnit: GlucoseUnit | null` (null allowed only in `draft` / imported records — models the *missing unit* scenario), `flag: FlagResult | null`, `clientMutationId`, `captureDurationSeconds`, `notes`, `amendments: ScreeningAmendment[]` (`{ id, field, before, after, reason, amendedBy, amendedAt }`).
   - `Review`: `patientId, facilityId`, `decision: { kind: ReviewDecisionInputKind, note, reasonCode?, decidedBy, decidedAt } | null`, `startedBy`, `reviewedBy`, `assignedClinicianId | null`, `priority: ReviewPriority` (fixture-labelled), `reviewDueAt | null` (demo fixture only — no approved review SLA), `origin: ReviewOrigin`, `evidenceSnapshot` (frozen `FlagResult` + inputs at flag time; never mutated by amendments).
   - `Referral`: `facilityId, destinationFacilityId, assignedWorkerId, dueAt, priority, appointmentAt | null, cancelled: { reasonCode, reason } | null, completionEvidence: { type, reference, outcome: ReferralOutcome, note, recordedBy, recordedAt } | null`.
   - `FollowUp`: `purpose`, `dueAt`, `assignedWorkerId | null`, `assignmentHistory[]`, `notes[]` (append-only), `attempts: ContactAttempt[]` (`{ id, at, method: ContactMethod, result: ContactResult, note, durationMinutes, recordedBy }`), `outcome: { kind: FollowUpOutcome, occurredAt, evidenceType | null, reasonCode | null, note, recordedBy } | null`, `clinicianConfirmation: { status: ClinicianConfirmationState, by?, at?, reason? }`.
   - New: `CareTask` (kinds above; `payload` discriminated by kind, e.g. correction request `{ targetType, targetId, description, suggestedValue }`, callback `{ topic, window, note }`), `CareInstruction` (`patientId, kind: 'appointment'|'referral'|'follow_up', sourceType: 'review'|'referral'|'follow_up', sourceId, messageKey, params, appointmentAt | null, facilityId, releasedBy, releasedAt, status: 'released'|'withdrawn'`) — the only thing the citizen wallet may show as a next step; its citizen-visible progress (`planned | completed | cancelled`) is **derived** from the linked referral/follow-up by `deriveInstructionProgress()` (never stored twice); `ReminderPreference` (`patientId, optedIn, timing: 'day_before'|'morning_of', channel, updatedAt, version`); `Reminder` (`patientId, instructionId, scheduledAt, status: ReminderStatus, cancelReason | null, deliveredAt | null, acknowledgedAt | null`); `DeviceSession` (`id, personaId, deviceId, facilityId, status: 'active'|'revoked'`).
   - `AuditEvent`: spec fields + `category: 'access'|'change'|'export'|'security'|'demo'`, `outcome: 'success'|'denied'`, `facilityId|null, districtId|null, patientId|null`, `changeSummary`, `justification|null`. `AccessEvent` = `AuditEvent & { category: 'access' }`.
   - `SyncOperation`: `id, clientMutationId, idempotencyKey, localSeq, entityType, entityId, opType, payload, baseVersion|null, dependsOnOpId|null, resolvesOpId|null, status, attempts, nextAttemptAt|null, lastError|null, deviceTimestamp, serverSnapshot|null, correlationId`.
   - `DemoRuleset`: `{ version, status: 'active'|'retired', label: 'DEMO_RULE_NOT_CLINICALLY_VALIDATED', approvedBy: null, effectiveFrom, effectiveTo?, requiredInputs: string[], thresholds: DemoThresholds, plausibility: PlausibilityLimits }` — types only.
3. **`define-machine.ts`**: `defineMachine<S extends string>(name, transitions: Record<S, readonly S[]>)` returning `{ can(from,to), assert(from,to), next(from), terminal: S[] }`. `assert` throws `IllegalTransitionError { machine, from, to }`.
4. **Machines** (decisions where spec §5.2 is ambiguous are marked ★):
   - Screening: `draft→submitted`, `submitted→review_required|no_review_required`.
   - Review: `pending→in_review`, `pending|in_review→action_recorded|dismissed_with_reason` (★ allow direct decision from `pending`; `startReview` is optional).
   - Referral: `created→accepted→scheduled→completed`; `created|accepted|scheduled→cancelled_with_reason` (★ cancel allowed from any non-terminal).
   - FollowUp: `assigned|reassigned→contacted|unable_to_reach|completed`, `contacted→completed|unable_to_reach`, `unable_to_reach→reassigned|completed` (★ `reassigned` behaves like `assigned`; completion after unable-to-reach records outcome `unable_to_reach`). ★ `completed→contacted` is allowed **only** by the clinician action `return_to_worker` while `clinicianConfirmation.status === 'pending'` (CLN-09). A worker-recorded `attended` outcome with evidence sets `completed` + `clinicianConfirmation.status = 'pending'` (HWM-08); the clinician `confirm_completion` sets `confirmed`.
   - CareTask: `open→in_progress→done`; `open|in_progress→cancelled_with_reason`.
   - SyncOperation (the **only** sync design; HWM-02/09/10 consume it): `queued→sending→acknowledged|retryable_failure|conflict|rejected`, `retryable_failure→queued` (backoff), `conflict→needs_resolution→superseded` (resolution `reapply_on_latest` also enqueues a **new** op with `resolvesOpId` and a new idempotency key; `keep_latest` refreshes the local entity from the server snapshot), `queued|retryable_failure→blocked_revoked→queued` (device revocation / restore, HWM-10). `rejected` (VALIDATION_ERROR / FORBIDDEN) and `superseded` are terminal; no transition deletes an op.
5. **Invariants (`invariants.ts`)** — each throws `DomainInvariantError { code }`:
   `assertAttributable(decision)` (`DECISION_NOT_ATTRIBUTABLE`), `assertDismissalReason(reason)` (≥ 10 non-whitespace chars ★, `DISMISSAL_REASON_REQUIRED`), `assertCancellationReason`, `assertCompletionEvidence(referral|followUp)` (`COMPLETION_EVIDENCE_REQUIRED`: needs type, timestamp, recordedBy), `assertScreeningMutable(screening)` (`SCREENING_IMMUTABLE` once status ≠ `draft`; amendments go through `applyAmendment(screening, amendment)` which requires a reason and appends, never overwrites), `assertVersion(entity, expectedVersion)` (`STALE_VERSION`), `assertNotCompletedByReminder(...)` (a reminder status change can never transition a referral/follow-up).
6. **Derivations (`derive.ts`)**: `isFollowUpOverdue(fu, now)` = status ∉ {completed} and `dueAt < now`; `isReferralOverdue(ref, now)` = status ∉ {completed, cancelled_with_reason} and `dueAt < now` (these are the shared "isOverdue" helpers that CLN-05/08, HWM-03/07 and ADM-04/05 consume — app phases must not re-implement them). Labels use "past due date (demo timing)" wording — spec warns not to call a patient clinically overdue without approved timing rules. `derivePathwayStage({ screening, review?, referrals, followUps }, now): PathwayStage`. Also: `effectiveReadings(screening)` (original + amendments → current values, originals retained), `deriveInstructionProgress(instruction, source)`, `deriveSyncState(entityId, ops)` → `saved_locally | syncing | synced | conflict | rejected | blocked`, `deriveDatePassed(appointmentAt, progress, now)` (citizen wording, never "overdue").
7. **Rules engine (`rules/engine.ts`)**:
   ```ts
   export function evaluateScreening(input: ScreeningEvaluationInput, ruleset: DemoRuleset): FlagResult
   type FlagResult = { requiresReview: boolean; evaluable: boolean; reasonCodes: ReasonCode[];
     triggeringObservations: Array<{ code: 'SYSTOLIC'|'DIASTOLIC'|'GLUCOSE'; value: number; unit: string; comparedTo: number }>;
     rulesetVersion: string; displayDisclaimer: 'DEMO_RULE_NOT_CLINICALLY_VALIDATED' };
   ```
   Order: (a) validate units/context — missing glucose unit → `evaluable: false`, `reasonCodes: ['GLUCOSE_UNIT_MISSING']`, `requiresReview: true` (★ safe default: incomplete data goes to a human); (b) normalise glucose to mmol/L (factor 18.016 — unit conversion, not a clinical threshold); (c) compare **only** against `ruleset.thresholds` (`DEMO_SYSTOLIC_REVIEW_AT_OR_ABOVE`, `DEMO_DIASTOLIC_REVIEW_AT_OR_ABOVE`, `DEMO_GLUCOSE_REVIEW_AT_OR_ABOVE_MMOL[context]` keyed by `fasting | non_fasting | not_recorded`). Reason codes (the **only** reason codes any app may display; UI text via `domain:reason.<code>`): `DEMO_BP_SYSTOLIC_AT_OR_ABOVE_THRESHOLD`, `DEMO_BP_DIASTOLIC_AT_OR_ABOVE_THRESHOLD`, `DEMO_GLUCOSE_AT_OR_ABOVE_THRESHOLD`, `GLUCOSE_UNIT_MISSING`, `GLUCOSE_CONTEXT_NOT_RECORDED`. Never emits diagnosis words; a unit test greps outputs for `/hypertens|diabet|diagnos/i`.
   The module contains **no numeric literals** other than the unit factor (lint-asserted by a test reading the source file).
8. **Clock (`clock/clock.ts`)**: `interface Clock { now(): Date; nowIso(): string }`; `DEMO_CLOCK_DEFAULT_ISO = '2026-10-14T06:00:00.000Z'` (08:00 Africa/Kigali, a Wednesday — decision); `createDemoClock({ pinnedIso, mode: 'frozen'|'ticking' })` (ticking advances from the pinned instant with real elapsed time, so restarts within a session stay coherent); `advanceBy(ms)` for demo "time travel". `createSystemClock()` exists only for tests of the clock itself.
9. **IDs**: `IdGenerator = () => string`; `createSequentialIdGenerator('pat')` for tests; runtime UUID generators are injected by repositories (web `crypto.randomUUID`, native `expo-crypto`).
10. **Hash**: `canonicalJson(value)` (sorted keys) + `fnv1a64Hex(str)`; used for audit hashes and seed snapshot hashing. Documented as "not tamper-proof" (spec §11).

## 6. Data, state and audit

Defines (does not persist) every entity. Enforces all spec §5.2 invariants listed in the README non-negotiables. Audit events are *typed* here; emission happens in FND-07.

## 7. UX states

Not applicable. Exports `ReasonCode` and status unions that UI layers map to i18n keys (`domain:status.review.pending`, etc.).

## 8. i18n

No catalogue files here. Every enum value must have a matching key added in FND-04 under namespace `domain` (`status.<machine>.<value>`, `reason.<ReasonCode>`, `decision.<kind>`, `evidence.<type>`). FND-04 adds a test that iterates these arrays to guarantee coverage.

## 9. Acceptance criteria

- [ ] Every legal transition in task 4 passes `can()`; every other pair (exhaustively enumerated) fails and `assert()` throws `IllegalTransitionError`.
- [ ] `overdue` is not a member of any status union (type test).
- [ ] Dismissal with empty/whitespace/9-char reason throws `DISMISSAL_REASON_REQUIRED`.
- [ ] Referral completion without evidence throws `COMPLETION_EVIDENCE_REQUIRED`.
- [ ] Modifying a submitted screening via any helper other than `applyAmendment` throws; `applyAmendment` keeps the original value in `amendments[].before`.
- [ ] `evaluateScreening` returns `displayDisclaimer: 'DEMO_RULE_NOT_CLINICALLY_VALIDATED'` and `rulesetVersion` from the input ruleset in 100% of property-test cases.
- [ ] Changing a threshold in a test ruleset changes the result; the engine source has no clinical numeric literals.
- [ ] `createDemoClock()` with no args returns `2026-10-14T06:00:00.000Z` in frozen mode.
- [ ] Package has zero runtime dependencies.

## 10. Tests

`src/machines/*.test.ts` (exhaustive transition tables), `src/invariants.test.ts`, `src/derive.test.ts` (overdue at boundary `dueAt === now` is **not** overdue), `src/rules/engine.test.ts` (mmol/mg conversion, missing unit, unknown context, disclaimer, no-diagnosis-words), `src/rules/engine.property.test.ts` (`fast-check` devDependency), `src/clock/clock.test.ts`, `src/hash.test.ts` (key-order independence).

## 11. Verification

```bash
pnpm --filter @laif/domain typecheck
pnpm --filter @laif/domain lint
pnpm vitest run --project @laif/domain --coverage   # ≥ 95% lines in machines/, rules/, invariants.ts
pnpm verify
```

## 12. Commit

`feat(domain): FND-02 entities, state machines, invariants, demo rules engine and pinned clock`
