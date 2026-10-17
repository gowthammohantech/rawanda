# CLN-08 — Referral tracking (create, assign, update, complete with evidence, cancel, derived overdue)

## 1. Header

| Field | Value |
|---|---|
| ID | CLN-08 |
| Title | Referral list with tabs/counts, referral drawer with stepper, status transitions, evidenced completion |
| App | Clinical Web Portal |
| Depends on | CLN-07 |
| Trace | PRD CL-06; FRD CL-06, FRD §4 (completion needs timestamp, outcome, approved evidence type), §5; T-01, T-03, T-04, T-05; spec §2.1 `/clinical/referrals`, §5.2 Referral machine + invariants, §8 "Create referral"; WF-01 steps 6–7; BRD BR-05; PRD §10 "canceled referral" |
| Size | L |
| Status | Done |

## 2. Goal

Coordinators and clinicians track every referral in scope: a tabbed table (`Open N · Overdue N · Completed N · Cancelled N · All N`) and a detail drawer with a **ReferralStepper** (`Created → Accepted → Scheduled → Completed`, cancellation branch). Users can create a referral for a decided review that lacks one, assign/change destination and due date, advance status, **complete only with evidence** (timestamp, outcome, evidence type, reference), or cancel with a reason. Overdue is a derived badge, never a stored status. A reminder or notification never marks a referral complete.

## 3. Scope

**In scope**: `/clinical/referrals` (+ `?id=` opens drawer, deep-linkable), create referral dialog (from patient page and referrals page, requires a linked decided review), status transitions, completion evidence form, cancel with reason, sidebar badge (open + overdue), conflict handling.
**Out of scope**: inter-facility messaging/notifications (simulated adapters later), attachments upload (evidence is typed metadata + reference string in demo).

## 4. Deliverables

| Path (`apps/clinical-web/src/`) | Purpose |
|---|---|
| `features/referrals/ReferralsPage.tsx` | Header + KPI strip (Open · Overdue · Completed this month · Median days to completion (demo)) + tabs + table |
| `features/referrals/ReferralTable.tsx` | `AccessibleDataTable`: PATIENT, DESTINATION, PRIORITY, DUE, STATUS, LAST UPDATE, ACTIONS |
| `features/referrals/ReferralDrawer.tsx` | Side drawer: patient, linked review (link), `ReferralStepper`, history, actions |
| `features/referrals/ReferralStepper.tsx` | Uses `@laif/ui-web` `Stepper` (ref-image 4): numbered steps, check for done, current highlighted, cancelled branch rendered as terminal pill |
| `features/referrals/CreateReferralDialog.tsx` | For decided reviews without an open referral |
| `features/referrals/UpdateReferralDialog.tsx` | Accept / Schedule (appointment datetime) / change destination or due date (reason required) |
| `features/referrals/CompleteReferralDialog.tsx` | Evidence form |
| `features/referrals/CancelReferralDialog.tsx` | Reason code + text |
| `features/referrals/hooks.ts` | `useReferrals(filter)`, `useReferralCounts`, `useTransitionReferral`, `useCreateReferral` |
| `packages/domain` | Consume FND-02 referral machine + `isReferralOverdue` |
| `packages/contracts` | Consume FND-03 schemas below |

Inputs = FND-03 `ReferralTransitionInputSchema` (`to`: `accepted` / `scheduled { appointmentAt }` / `completed { completedAt, outcome: REFERRAL_OUTCOMES, evidenceType: REFERRAL_EVIDENCE_TYPES (facility_attendance_record, clinician_confirmation, return_slip_reference), evidenceReference, note? }` / `cancelled_with_reason { cancelReasonCode: REFERRAL_CANCEL_REASON_CODES, reason }`) and `ReferralEditInputSchema` (`destinationFacilityId?`, `dueAt?`, `changeReason`). Enum values are the lowercase FND-02 lists; no app-local schema.
Evidence types and outcomes are **demo placeholders** pending approval (ambiguity flagged in INDEX).

## 5. Implementation tasks

1. Domain: FND-02 referral machine (`created→accepted→scheduled→completed`, `created|accepted|scheduled → cancelled_with_reason`); repository rejects others with `VALIDATION_ERROR` reason `INVALID_TRANSITION`. `isReferralOverdue = dueAt < now && status ∉ {completed, cancelled_with_reason}`.
2. Tabs predicates: Open = not terminal; Overdue = derived; Completed; Cancelled; All. Counts from `repository.countReferrals(filter)` and must equal rows.
3. URL state `?tab=&facility=&q=&id=`; drawer open state from `id` so links from CLN-07 success and patient timeline land on the drawer.
4. Drawer shows step timestamps and actors per step, overdue badge with text "Overdue — due dd MMM (derived)", linked review summary (outcome, decided by), and full referral history from audit (`listAuditEvents({ entityId })`).
5. Actions by capability `referral.manage` (accept/schedule/edit/cancel) and `referral.complete` (complete). Only the allowed next transition buttons render; others absent.
6. `CompleteReferralDialog` requires completedAt, outcome, evidenceType, evidenceReference; copy states "A reminder or message being sent is not evidence of completion." Confirm via `ConfirmDialog` (irreversible).
7. `CreateReferralDialog`: choose a decided review (in scope, outcome ≠ DISMISS, no open referral) → destination, reason, due date, priority. Repository enforces one-open-referral-per-review (`CONFLICT` reason `REFERRAL_ALREADY_OPEN` with link).
8. Edits to destination/due date require `changeReason`; the previous values remain in history.
9. All mutations via `useIdempotentMutation` with `expectedVersion`; conflict → `ConflictPanel`; invalidate referrals, counts, patient timeline, review.
10. Sidebar badge on "Referrals" = open overdue count (icon + number).
11. `useAuditedRead('referral', id)` on drawer open → `referral.viewed`.

## 6. Data, state and audit

- Reads/writes: Referral, Review (link), Facility, AuditEvent.
- Transitions per §5.2 Referral machine; overdue derived only.
- Audit: `referral.viewed`, `referral.created`, `referral.status_changed` (from→to), `referral.updated` (changed fields + reason), `referral.completed` (evidence type, reference), `referral.cancelled` (reason), `conflict.detected`.
- Invariants: completion requires timestamp + outcome + approved evidence type (FRD §4); cancellation requires reason; one open referral per review; no destructive "overdue" transition.

## 7. UX states

Loading: table + KPI skeletons. Empty per tab ("No overdue referrals in Facility Alpha-1"). Validation: field errors in dialogs (translated). Server error/timeout: dialog keeps values + retry same key. Permission denied: action buttons absent with explanatory text; out-of-scope `?id=` → drawer shows `PermissionDenied`. Offline: actions disabled, list readable. Conflict: `ConflictPanel` in dialog. Success: stepper advances with focus moved to new step + toast.

## 8. i18n

Namespace `clinical.referrals`: `title|subtitle`, `kpi.*`, `tabs.*`, `table.*`, `status.created|accepted|scheduled|completed|cancelled_with_reason`, `overdueDerived`, `stepper.*`, `actions.accept|schedule|edit|complete|cancel|create`, `complete.outcome.<CODE>|evidenceType.<CODE>|evidenceReference|notEvidenceNotice`, `cancel.reason.<CODE>|rationale`, `edit.changeReason`, `errors.alreadyOpen|invalidTransition`. Outcomes, evidence types and cancel reasons flagged `needs clinical/linguistic review`. Dates via Kigali formatter.

## 9. Acceptance criteria

- [ ] Referral created in CLN-07 for `WF01` shows `CREATED` step, linked patient + review.
- [ ] Complete without evidence fields → field errors; with evidence → `COMPLETED`, evidence visible in drawer (spec §8).
- [ ] `OVERDUE_REFERRAL` appears in Overdue tab with derived label; completing it removes it from Overdue without any stored "overdue" status.
- [ ] Cancel requires reason; `CANCELLED_REFERRAL` shows reason and actor.
- [ ] Creating a second referral for the same review → `REFERRAL_ALREADY_OPEN`.
- [ ] Tab counts == rows; double-click complete → one event.
- [ ] Nurse reviewer / coordinator permissions follow capability map; out-of-scope referral id denied.

## 10. Tests

- `src/features/referrals/__tests__/ReferralsPage.test.tsx` — tabs/counts, URL drawer.
- `src/features/referrals/__tests__/ReferralStepper.test.tsx` — a11y (`aria-current="step"`), cancelled branch.
- `src/features/referrals/__tests__/CompleteReferralDialog.test.tsx` — evidence required, double submit, conflict.
- `e2e/referral-loop.spec.ts` — decide → referral → accept → schedule → complete with evidence (spec §16 `referral-loop-e2e`).

## 11. Verification

```bash
pnpm --filter @laif/clinical-web typecheck && pnpm --filter @laif/clinical-web lint && pnpm --filter @laif/clinical-web test
pnpm --filter @laif/clinical-web test:e2e -- referral-loop
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```
Manual: coordinator Alpha-1 → Referrals → Overdue tab → open `OVERDUE_REFERRAL` → Accept → Schedule (date) → Complete → submit empty (errors) → fill evidence → confirm → stepper complete, Overdue count −1 → Cancelled tab → open `CANCELLED_REFERRAL` → reason shown.

## 12. Commit

`feat(clinical): CLN-08 referral tracking with stepper and evidenced completion`
