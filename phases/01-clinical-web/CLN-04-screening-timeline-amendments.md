# CLN-04 — Screening timeline, follow-up timeline and audited corrections

## 1. Header

| Field | Value |
|---|---|
| ID | CLN-04 |
| Title | Screening timeline (BP/glucose with units, source, correction history), patient follow-up timeline, record amendment with reason |
| App | Clinical Web Portal |
| Depends on | CLN-03 |
| Trace | PRD CL-02; FRD CL-02, FRD §4 (units/source mandatory, reason for correction, never overwrite), T-03, T-06; spec §2.1 `/clinical/patients/:id`, §5.2 invariant "submitted screenings immutable except through amendment"; PRD §10 edge cases (missing units, repeated screening, corrected measurement) |
| Size | M |
| Status | Done |

## 2. Goal

On the patient record, the **Screenings** tab shows every screening chronologically with BP (mmHg) and glucose values **with explicit units and measurement context**, date/time in Africa/Kigali, recording source (worker, device, facility), ruleset version, flag/review status and a correction-history disclosure. Missing units are shown as a data-quality warning, never silently assumed. An authorised clinician can **record an amendment** with a mandatory reason; the original value stays visible and the amendment is attributable and audited. The **Reviews** and **Referrals & tasks** tabs show a combined follow-up timeline for the patient.

## 3. Scope

**In scope**: Screenings tab, `ReadingDisplay`, correction history, `AmendScreeningDialog`, Reviews tab (list linking to `/clinical/reviews/:id`), Referrals & tasks tab with `FollowUpTimeline`.
**Out of scope**: creating new screenings (worker app); re-evaluating rules after amendment (amendment flags "re-review suggested" only; see ambiguity in INDEX).

## 4. Deliverables

| Path (`apps/clinical-web/src/`) | Purpose |
|---|---|
| `features/timeline/ScreeningTimeline.tsx` | Vertical list grouped by date (mono date labels like ref-image "OCT 2") |
| `features/timeline/ScreeningCard.tsx` | Values, units, context, source, ruleset version, status chip, expandable history |
| `features/timeline/ReadingDisplay.tsx` | `152/96 mmHg`, `7.8 mmol/L · non-fasting`; `UNIT MISSING` pill when unit null |
| `features/timeline/CorrectionHistory.tsx` | Original → amended values, reason, author, timestamp, version |
| `features/timeline/AmendScreeningDialog.tsx` | RHF + Zod form inside `ConfirmDialog` |
| `features/timeline/FollowUpTimeline.tsx` | Merged events: review decided, referral created/status, follow-up assigned/attempts/completed |
| `features/patients/tabs/{ScreeningsTab,ReviewsTab,ReferralsTasksTab}.tsx` | Tab content |
| `features/timeline/hooks.ts` | `useScreenings(patientId)`, `useAmendScreening()`, `usePatientTimeline(patientId)` |
| `packages/contracts` | Consume FND-03 `ScreeningAmendmentInputSchema` (no new schema) |

Input = FND-03 `ScreeningAmendmentInputSchema` `{ screeningId, expectedVersion, field, after, reason }` (reason ≥ 10 chars, `validation:reasonTooShort`; `glucoseUnit` ∈ `GLUCOSE_UNITS`; `glucoseContext` ∈ `fasting | non_fasting | not_recorded`; `measuredAt` ≤ demo now).
(No clinical plausibility thresholds are hard-coded; only type/format checks.)

## 5. Implementation tasks

1. `useScreenings` → `repository.listScreenings(patientId)` key `clinicalKeys.screenings(fac, patientId)`, sorted `measuredAt desc`.
2. `ScreeningCard` shows: measuredAt (Kigali), recorded-at vs synced-at if different, source (`Worker · Device HW-014 · Facility Alpha-1 (demo)`), `rulesetVersion` + `DEMO_RULE_NOT_CLINICALLY_VALIDATED` pill when flagged, status chip (`REVIEW REQUIRED` / `NO REVIEW REQUIRED` / `REVIEWED` / `AMENDED`). Status chips use icon + text (never colour only).
3. Missing unit → `UNIT MISSING` warning pill + text "Value recorded without unit — not evaluated by demo rules"; value is displayed raw, never converted.
4. Repeated screening on same day → "Repeat reading" mono label linking the pair.
5. `CorrectionHistory` (disclosure, collapsed by default, count badge): each amendment shows field, original value (struck-through but readable), new value, reason, author name + role, timestamp, version. Per FND-02, `amendScreening` appends to `screening.amendments[]` via `applyAmendment` (original values kept in `before`, version + 1); current values come from `effectiveReadings(screening)`. No separate `ScreeningAmendment` collection.
6. `AmendScreeningDialog` (capability `screening.amend`): field select, new value, reason (required, ≥10 chars), shows current value; submit via `useIdempotentMutation`; on `CONFLICT` show "This screening changed since you opened it" with latest values and reload button (no overwrite). On success, invalidate screenings + patient timeline; toast. If screening has an open review, show info callout "Review uses the evidence snapshot taken at flag time; the amendment is shown to the reviewer."
7. `ReviewsTab`: table of reviews (status, flag reason codes, assigned clinician, reviewed at) linking to review detail.
8. `ReferralsTasksTab`: `FollowUpTimeline` merging referrals + follow-ups + review decisions by `occurredAt`, each item with status pill, actor, due date; `OVERDUE` pill derived (`dueAt < demoNow && status not terminal`) with text "Overdue (derived from due date)".
9. Sensitive reads: opening Screenings tab emits `screening.history_viewed` once per patient per mount.

## 6. Data, state and audit

- Reads: Screening, ScreeningAmendment, Review, Referral, FollowUp. Writes: ScreeningAmendment (append-only).
- Transition: Screening `submitted` stays `submitted`; projection flag `amended: true`, `version+1`.
- Audit: `screening.history_viewed`, `screening.amended` (before/after summary, reason, correlationId).
- Invariants: original values retained (T-06); reason mandatory; units explicit; no silent unit conversion.

## 7. UX states

Loading: card skeletons. Empty: "No screenings recorded for this synthetic patient". Validation: field-level messages translated (T-03). Server error/timeout: dialog stays open with values preserved + retry (same idempotency key). Permission denied: amend button hidden for coordinator and replaced by text "Amendments require clinician privileges" (capability-based, plus repository rejects). Offline: amend disabled with reason. Conflict: inline conflict panel. Success: toast + new history entry highlighted.

## 8. i18n

Namespace `clinical.timeline`: `screening.bp|glucose|source|` (context labels from `domain:glucoseContext.fasting|non_fasting|not_recorded`), `rulesetVersion|repeatReading|unitMissing.title|body`, `status.*`, `history.title|original|amended|reason|by`, `amend.title|field|newValue|reason|reasonHint|submit|conflict|success`, `followUp.*`. Units (`mmHg`, `mmol/L`, `mg/dL`) are not translated. Clinical copy (contexts, statuses, unit-missing) flagged `needs clinical/linguistic review`. Validation messages via shared `validation.*` keys (`required`, `reasonMin`, `positiveNumber`, `notInFuture`).

## 9. Acceptance criteria

- [ ] Every rendered reading shows a unit or an explicit `UNIT MISSING` warning.
- [ ] `AMENDED_SCREENING` shows original and amended values, reason, author.
- [ ] Amend with empty reason → field error in active language; nothing persisted.
- [ ] Double-click submit → one amendment, one `screening.amended` event.
- [ ] With conflict fault on → conflict panel, no overwrite; reload shows latest.
- [ ] Coordinator cannot amend (UI + repository `FORBIDDEN`).
- [ ] Overdue pill appears only where `dueAt` exists and is past.

## 10. Tests

- `src/features/timeline/__tests__/ReadingDisplay.test.tsx` — units, missing unit, context.
- `src/features/timeline/__tests__/AmendScreeningDialog.test.tsx` — validation (EN + RW messages), double-submit, conflict.
- `src/features/timeline/__tests__/CorrectionHistory.test.tsx` — original retained.
- `src/features/timeline/__tests__/FollowUpTimeline.test.tsx` — ordering, derived overdue.
- `e2e/screening-amendment.spec.ts` — amend and verify history (T-06).

## 11. Verification

```bash
pnpm --filter @laif/clinical-web typecheck && pnpm --filter @laif/clinical-web lint && pnpm --filter @laif/clinical-web test
pnpm --filter @laif/clinical-web test:e2e -- screening-amendment
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```
Manual: clinician Alpha-1 → Patients → open `MISSING_UNIT_SCREENING` patient → Screenings tab → see `UNIT MISSING` → open `AMENDED_SCREENING` patient → expand history → Amend → submit empty reason (error) → enter reason → save → history shows 2 entries → Referrals & tasks tab shows timeline.

## 12. Commit

`feat(clinical): CLN-04 screening timeline, follow-up timeline and audited amendments`
