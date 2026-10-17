# CLN-07 — Clinical decision flow (assessment, refer, repeat test, planned review, dismiss with reason)

## 1. Header

| Field | Value |
|---|---|
| ID | CLN-07 |
| Title | Decision form with mandatory reasons, ConfirmDialog, double-submit guard, conflict handling, interrupted-session recovery |
| App | Clinical Web Portal |
| Depends on | CLN-06 |
| Trace | PRD CL-05, PRD §4 journeys 1–2; FRD CL-05, FRD §3 Scenarios 1–2, FRD §4 (reason when dismissing), §5, T-01, T-03, T-04, T-05, T-09; spec §2.1 `/clinical/reviews/:id/decision`, §5.2 Review machine + invariants, §8 "Review with reason"; WF-01 steps 5–6, WF-03; BRD BR-04 |
| Size | L |
| Status | Done |

## 2. Goal

From a review in `IN REVIEW`, the clinician records exactly one attributable decision: **Record assessment (no further action)**, **Refer**, **Request repeat test**, **Plan follow-up review**, or **Dismiss flag with reason**. Each option has its own required fields; refer/repeat/plan atomically create the linked Referral or FollowUp; dismiss closes the review with a mandatory reason and **creates nothing else** (WF-03). A ConfirmDialog summarises the decision before saving. Double-clicks, retries after timeouts and reloads mid-submit never create duplicate decisions or referrals; a stale version raises a conflict, never an overwrite.

## 3. Scope

**In scope**: `/clinical/reviews/:id/decision` (routed full page with evidence summary sidebar), `ReviewDecisionPanel`, Zod discriminated union, confirm step, success page state with next links, draft persistence, conflict + "already decided" handling, repository `decideReview` atomic transaction.
**Out of scope**: editing a decision after save (append-only; correction is a new audited decision note — ambiguity flagged); referral lifecycle after creation (CLN-08); task reassignment (CLN-09).

## 4. Deliverables

| Path (`apps/clinical-web/src/`) | Purpose |
|---|---|
| `features/decision/DecisionPage.tsx` | Guarded by `review.decide`; requires review `in_review` by current user else redirect to review with message |
| `features/decision/ReviewDecisionPanel.tsx` | Radio-card group of 5 outcomes + conditional field groups |
| `features/decision/fields/{AssessmentFields,ReferFields,RepeatTestFields,PlannedReviewFields,DismissFields}.tsx` | Per-outcome fields |
| `features/decision/DecisionEvidenceSummary.tsx` | Compact `ExplainableFlag` + evidence (read-only sidebar) |
| `features/decision/DecisionConfirmDialog.tsx` | `ConfirmDialog` with structured summary + attribution line "Recorded by Dr X, Clinician, Facility Alpha-1 at hh:mm (Kigali)" |
| `features/decision/DecisionSuccess.tsx` | Outcome card + links: View referral / View task / Back to queue / Next pending case |
| `features/decision/useDecisionDraft.ts` | sessionStorage draft `{ values, idempotencyKey, expectedVersion }` per review |
| `features/decision/hooks.ts` | `useDecideReview()` (via `useIdempotentMutation`) |
| `packages/contracts` | Consume FND-03 `ReviewDecisionInputSchema` (no new schema) |
| `packages/repositories` | FND-07 `decideReview` (atomic review + referral/follow-up + audit); extend only if a rule below is missing |

Input = FND-03 `ReviewDecisionInputSchema`, discriminated on `kind` (FND-02 `REVIEW_DECISION_INPUT_KINDS`). The five UI options map 1:1:

| UI option (PRD + spec merged) | `kind` | Required fields (FND-03) | Creates | Review status |
|---|---|---|---|---|
| Record assessment — no further action | `no_further_action` | `note` (≥ 10) | nothing | `action_recorded` |
| Refer | `refer` | `destinationFacilityId`, `referralReason`, `dueAt` (> demo now), `priority` (`routine` / `urgent_demo`) | Referral `created` | `action_recorded` |
| Request repeat test | `request_repeat_screening` | `assignedWorkerId`, `dueAt`, `instructionsForWorker` | FollowUp `repeat_screening`, `assigned` | `action_recorded` |
| Plan follow-up review | `plan_follow_up` | `dueAt`, `note`, `assignedWorkerId?` | FollowUp `planned_review` | `action_recorded` |
| Dismiss flag with reason | `dismiss` | `dismissReasonCode` (`DISMISS_REASON_CODES`), `reason` (≥ 10) | nothing (WF-03) | `dismissed_with_reason` |

All branches carry `reviewId`, `expectedVersion`. No app-local decision schema is added.
Due dates are entered explicitly by the clinician (no default interval inferred from protocol — FRD non-negotiable 2).

## 5. Implementation tasks

1. `DecisionPage` loads review (CLN-06 hook); if status ≠ `in_review` by me → redirect to `routes.review(id)` with toast; if already decided → read-only outcome.
2. RHF with `zodResolver(ReviewDecisionInputSchema)` and translated error map; switching outcome clears irrelevant fields; focus moves to first field of chosen outcome; error summary at top with anchor links on submit failure.
3. Destination options: facilities from seed (labelled "(demo)"), excluding none; worker options from `listWorkers(activeFacilityId)` (role `CHW`, active) — only authorised workers (CL-07).
4. `useDecisionDraft`: autosave values every change (debounced 500 ms) with the form-session idempotency key and `expectedVersion`; on reload, offer "Restore unsaved decision draft?"; cleared on success or explicit discard. If a draft's key was already processed (repository returns the original result for that key), show the success state instead of re-submitting (T-09).
5. Submit → `DecisionConfirmDialog` (summary of outcome, linked entity to be created, due date in Kigali time, attribution). Confirm button disabled while pending (`isSubmitting`); dialog not dismissible while saving.
6. `repository.decideReview(input, key)` in one transaction:
   - Validate scope, permission `review.decide`, `expectedVersion` (`CONFLICT` with `latest`), review status `pending | in_review` (else `CONFLICT` reason `ALREADY_DECIDED`).
   - `no_further_action | refer | request_repeat_screening | plan_follow_up` → review `action_recorded`; `dismiss` → `dismissed_with_reason`.
   - `refer` → create Referral `created` linked `{ patientId, reviewId }`; enforce **one open referral per review** (`CONFLICT` reason `REFERRAL_ALREADY_OPEN`).
   - `request_repeat_screening` / `plan_follow_up` → create FollowUp `assigned` (or unassigned for a planned review without worker) linked to review.
   - Append audit events sharing one `correlationId`.
   - Same idempotency key → return stored result with `replayed: true`, no new change events (only FND-07's `sync.duplicate_suppressed`) (T-04).
7. Error handling: `VALIDATION_ERROR` → map `fieldErrors` onto RHF; `CONFLICT` → `ConflictPanel` (CLN-06) showing who decided/changed what, buttons `Reload` / `Discard my draft`; `TIMEOUT`/`OFFLINE`/`DEPENDENCY_UNAVAILABLE` → inline banner "Not saved yet" + `Retry` (same key); `FORBIDDEN` → `PermissionDenied`.
8. Success: invalidate `reviews`, `reviewCounts`, `review`, `referrals`, `followUps`, patient timeline; render `DecisionSuccess` with "Next pending case" (next row of current queue filter).
9. Keyboard: radio cards arrow-key navigable; `Ctrl/⌘+Enter` submits form (opens confirm).

## 6. Data, state and audit

- Writes: ClinicalReview decision fields (`decision`, `decisionReason`, `reviewedAt`, `reviewedBy`, `version+1`), Referral, FollowUp.
- Transitions: Review `in_review → action_recorded | dismissed_with_reason`; Referral `∅ → created`; FollowUp `∅ → assigned`. Lifecycle mapping: `REVIEWED → REFERRAL_OPEN | FOLLOW_UP_PLANNED | CLOSED_WITH_REASON`.
- Audit: `review.decided` (outcome, before/after status), `review.dismissed` (reasonCode, rationale length — full rationale stored on review), `referral.created`, `followup.created`, `conflict.detected`; all with shared `correlationId`, actor, role, facility.
- Invariants: decision requires actor + timestamp + reason/note; dismissal creates no referral/follow-up; at most one decision and one open referral per review; due date in future relative to demo clock.

## 7. UX states

| State | Behaviour |
|---|---|
| Initial | No outcome preselected; Save disabled until outcome chosen |
| Loading | Evidence sidebar skeleton; worker list skeleton |
| Validation error | Field errors + top error summary (translated, T-03) |
| Server error / timeout | "Not saved yet" banner, values kept, retry with same key |
| Permission denied | Coordinator / out-of-scope → `PermissionDenied` |
| Offline | Submit disabled, draft retained, banner "Saved as draft on this browser" |
| Stale/conflict | `ConflictPanel`; `ALREADY_DECIDED` shows existing decision read-only |
| Success | `DecisionSuccess` card, toast, queue counts updated |

## 8. i18n

Namespace `clinical.decision`: `title`, `outcomes.<kind>.label|description` (kind = FND-02 decision kind), `fields.destination|referralReason|dueAt|priority|assignedWorker|instructions|clinicalNote|dismissReasonCode.<code>|dismissRationale`, `confirm.title|summary.*|attribution|confirm|cancel`, `success.*`, `draft.restorePrompt|discard`, `errors.alreadyDecided|notSaved`. Validation keys (shared): `validation.required`, `validation.reasonMin` (with `{min}`), `validation.dueAtFuture`, `validation.selectOutcome`. Every outcome label/description and dismiss reason flagged `needs clinical/linguistic review`; outcome wording must not prescribe treatment.

## 9. Acceptance criteria

- [ ] Scenario 1 (FRD §3): `WF01_FLAGGED_REVIEW` → Refer with destination + due date → confirm → review `ACTION RECORDED`, one referral `CREATED` linked to patient + review, audit events share correlationId.
- [ ] Scenario 2 / WF-03: `WF03_DISMISSABLE_FLAG` → Dismiss without rationale → error; with rationale → `DISMISSED WITH REASON`; no referral or follow-up created.
- [ ] Rapid double-click on Confirm → exactly one decision, one referral (T-04).
- [ ] Timeout fault → retry → still one decision (same key).
- [ ] Reload mid-form → draft restore prompt; after successful save, reload shows success not resubmission (T-09).
- [ ] Conflict fault / second tab decided first → `ConflictPanel` / `ALREADY_DECIDED`, nothing overwritten (T-05).
- [ ] Repeat test requires an authorised worker from the active facility.

## 10. Tests

- (FND-03/07 tests already cover the five decision branches, atomicity, idempotency and dismiss-creates-nothing; add `decideReview.oneOpenReferral.test.ts` in `packages/repositories` only if FND lacks it.)
- `src/features/decision/__tests__/ReviewDecisionPanel.test.tsx` — conditional fields, RW validation messages, keyboard.
- `src/features/decision/__tests__/DecisionPage.test.tsx` — confirm flow, double-submit, timeout retry, conflict, draft restore.
- `e2e/clinician-review.spec.ts` — Scenario 1 through referral creation (spec §16 `clinician-review-e2e`).
- `e2e/dismiss-with-reason.spec.ts` — Scenario 2 / WF-03.

## 11. Verification

```bash
pnpm --filter @laif/repositories test
pnpm --filter @laif/clinical-web typecheck && pnpm --filter @laif/clinical-web lint && pnpm --filter @laif/clinical-web test
pnpm --filter @laif/clinical-web test:e2e -- clinician-review dismiss-with-reason
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```
Manual: reset demo → clinician Alpha-1 → queue → `WF01` → Start review → Record decision → Refer → pick destination + due date → Save → confirm → success → View referral link. Then `WF03` → Start review → Dismiss → submit empty (errors in EN, switch RW, errors in RW) → enter rationale → confirm → queue Pending count decreased by 1.

## 12. Commit

`feat(clinical): CLN-07 clinical decision flow with mandatory reasons and duplicate/conflict protection`
