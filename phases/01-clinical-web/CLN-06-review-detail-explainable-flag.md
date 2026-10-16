# CLN-06 — Review detail with explainable flag

## 1. Header

| Field | Value |
|---|---|
| ID | CLN-06 |
| Title | Review detail: explainable flag, evidence panel, data completeness, prior records, start review |
| App | Clinical Web Portal |
| Depends on | CLN-05 |
| Trace | PRD CL-04, PRD §6 (flags are not diagnoses; show review status and responsible professional); FRD CL-04, T-10, T-05 (concurrent reviews); spec §2.1 `/clinical/reviews/:id`, §5.3 `FlagResult`; WF-01 step 5, WF-03 step 1; BRD BR-03 |
| Size | M |
| Status | Not started |

## 2. Goal

Opening a case shows **why** it was flagged, in a layout modelled on ref-image 2: a header card (`FLAG FOR REVIEW` mono label, plain-language reason, ruleset chip `Demo ruleset demo-ruleset-2026.10-v1 · not clinically validated`, data-completeness meter), an **Evidence** panel listing each input against the demo rule with `WITHIN DEMO RANGE` / `TRIGGERED` / `MISSING` / `NOT EVALUATED` pills, a "How to read this" callout, prior records, source/provenance, and the responsible clinician. The clinician clicks **Start review** (pending → in_review, version-checked) before the "Record decision" action becomes available.

## 3. Scope

**In scope**: `/clinical/reviews/:id`; evidence snapshot rendering; completeness; prior screenings (last 5); amendment notice; assignment display; Start review with conflict handling; audited read.
**Out of scope**: decision form (CLN-07); editing rules (admin app); reassigning reviewer (shown read-only; ambiguity noted).

## 4. Deliverables

| Path (`apps/clinical-web/src/`) | Purpose |
|---|---|
| `features/reviews/ReviewDetailPage.tsx` | Breadcrumb `Review queue › <synthetic ID>`, header actions (`Open patient`, `Start review` / `Record decision`) |
| `features/reviews/ReviewFlagHeader.tsx` | Composes `@laif/ui-web` `ExplainableFlag` (FND-09) + ruleset chip, completeness, disclaimer |
| `features/reviews/EvidencePanel.tsx` | Rows: input name, recorded value + unit, demo rule text ("Demo threshold: configured in demo-ruleset-2026.10-v1"), status pill |
| `features/reviews/DataCompletenessMeter.tsx` | Thin progress bar `4 of 5 required inputs present` + list of missing |
| `features/reviews/HowToReadCallout.tsx` | Soft-blue callout explaining the flag is a prompt for review, not a diagnosis |
| `features/reviews/PriorRecordsCard.tsx` | Last 5 screenings mini-table with trend arrows (text, not colour) |
| `features/reviews/ProvenanceCard.tsx` | Recorded by, device, facility, measuredAt, syncedAt, screening version, amendments notice |
| `features/reviews/ResponsibilityCard.tsx` | Assigned clinician, status, started at, decided by |
| `features/reviews/hooks.ts` | `useReview(id)`, `useStartReview()` |

Evidence item type (view model derived in `@laif/domain` `explainFlag(review.evidenceSnapshot, screening, ruleset)` from FND-02 `FlagResult`; not a persisted contract):
```ts
EvidenceItemSchema = z.object({
  inputKey: z.enum(['systolic','diastolic','glucoseValue','glucoseUnit','glucoseContext','repeatReading']),
  value: z.union([z.number(), z.string(), z.null()]),
  unit: z.string().nullable(),
  ruleRef: z.string().nullable(),                 // e.g. 'demo-ruleset-2026.10-v1/BP-1'
  ruleDescriptionKey: z.string().nullable(),      // i18n key, no numeric threshold claims in copy
  status: z.enum(['TRIGGERED','WITHIN_DEMO_RANGE','MISSING','NOT_EVALUATED']),
})
```

## 5. Implementation tasks

1. `useReview(id)` → `repository.getReview(id)` returns review + `evidenceSnapshot` (frozen at flag time) + patient summary + screening + current screening projection; `FORBIDDEN` / `NOT_FOUND` handled as in CLN-03.
2. `useAuditedRead('review', id)` → `review.viewed`.
3. `ExplainableFlag`: summary from `reasonCodes` → translated sentences ("Systolic reading above the demo threshold configured in ruleset demo-ruleset-2026.10-v1"); ruleset chip links to a modal listing the ruleset's rule descriptions and its `DEMO_RULE_NOT_CLINICALLY_VALIDATED` status. Never render a numeric threshold as an approved clinical value; demo thresholds may be shown only with the label "Demo placeholder value".
4. `EvidencePanel` renders every evidence item; `MISSING` and `NOT_EVALUATED` items rendered in amber with icon + text; if screening was amended after the snapshot, show callout "Evidence amended after flag — see correction history" with link to CLN-04 history.
5. `DataCompletenessMeter`: required inputs list is FND-02 `DemoRuleset.requiredInputs`; meter text always present for screen readers.
6. `PriorRecordsCard` → `listScreenings(patientId, { limit: 5 })`; marks repeat readings.
7. `useStartReview()` → `repository.startReview({ reviewId, expectedVersion }, key)`:
   - pending → in_review, `assignedClinicianId = me` (if unassigned or assigned to me).
   - If `in_review` by someone else → button reads "In review by Dr X" and a secondary "Take over review" opens `ConfirmDialog` requiring a reason (`StartReviewInput.takeOverReason`, audited `review.taken_over`). Flag for product owner (see INDEX).
   - `CONFLICT` → `ConflictPanel` ("Another clinician changed this review") with reload.
   - Decided/dismissed reviews render read-only with outcome summary and link to audit trail.
8. Header primary action: `Start review` (pending) → `Record decision` (in_review by me) → hidden (decided). Requires `review.decide`; coordinator sees read-only view with text "Decisions require a clinician or authorised reviewer".
9. Shared `components/ConflictPanel.tsx` (used again in CLN-07..09) is a thin wrapper around `@laif/ui-web` `ConflictNotice` (FND-09) fed by `RepositoryError.conflict` (`latest`, `changedBy`, `changedAt`): "Your version" vs "Latest version" with `CONFLICT` pill and actions `Reload latest` (= `keep_latest`) / `Cancel`.

## 6. Data, state and audit

- Reads: Review, evidenceSnapshot, Ruleset (demo), Screening(s), Patient summary.
- Transition: Review `pending → in_review` (version+1).
- Audit: `review.viewed`, `review.started`, `review.taken_over` (reason), `conflict.detected` (entity, expected vs actual version).
- Invariants: evidence snapshot immutable; flag never labelled a diagnosis; start requires capability + scope (repository enforced).

## 7. UX states

Loading: two-column skeleton. Loaded: as above. Empty: evidence with zero items → "No evidence captured — cannot be reviewed; contact data quality" (should not occur in seed; test fixture). Validation: take-over reason required. Server error: `ErrorState`; start button error toast with retry (same key). Permission denied: out-of-scope review → `PermissionDenied`; coordinator → read-only. Offline: start disabled with reason. Stale/conflict: `ConflictPanel`. Success: status pill animates to `IN REVIEW`, toast.

## 8. i18n

Namespace `clinical.review`: `flag.label|summary.<REASON_CODE>|rulesetChip|disclaimer|rulesetModal.*`, `evidence.title|subtitle|status.TRIGGERED|WITHIN_DEMO_RANGE|MISSING|NOT_EVALUATED|amendedAfterFlag|demoPlaceholderValue`, `evidence.inputs.<inputKey>`, `completeness.label|missing`, `howToRead.title|body`, `prior.title`, `provenance.*`, `responsibility.*`, `actions.start|recordDecision|takeOver|takeOverReason|inReviewBy|readOnlyCoordinator`. All flag/evidence/how-to-read copy flagged `needs clinical/linguistic review`.

## 9. Acceptance criteria

- [ ] `WF01_FLAGGED_REVIEW` shows ruleset version, every triggering input with value + unit, completeness meter and disclaimer (T-10).
- [ ] `MISSING_UNIT_SCREENING` review shows `MISSING`/`NOT_EVALUATED` with icon + text.
- [ ] Start review moves status to `IN REVIEW`; exactly one `review.started` event; double click safe.
- [ ] With conflict fault on (or second tab starting first) → `ConflictPanel`, no silent overwrite (T-05).
- [ ] Coordinator sees evidence but no Start/Record buttons.
- [ ] No numeric threshold appears without "Demo placeholder value" label.

## 10. Tests

- `src/features/reviews/__tests__/ReviewFlagHeader.test.tsx` — ruleset + disclaimer + reason sentences (EN/RW).
- `src/features/reviews/__tests__/EvidencePanel.test.tsx` — statuses, amended notice.
- `src/features/reviews/__tests__/ReviewDetailPage.test.tsx` — start review, conflict, read-only coordinator, forbidden.
- `src/components/__tests__/ConflictPanel.test.tsx`.
- `e2e/review-detail.spec.ts` — open from queue, start review, verify status in queue.

## 11. Verification

```bash
pnpm --filter @laif/clinical-web typecheck && pnpm --filter @laif/clinical-web lint && pnpm --filter @laif/clinical-web test
pnpm --filter @laif/clinical-web test:e2e -- review-detail
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```
Manual: clinician Alpha-1 → queue → expand `WF01` row → Open review → read evidence + "How to read this" → Start review → pill `IN REVIEW` → back to queue → row shows `IN REVIEW (you)` → Settings: conflict fault on → open `WF03` → Start review → conflict panel.

## 12. Commit

`feat(clinical): CLN-06 review detail with explainable flag and evidence panel`
