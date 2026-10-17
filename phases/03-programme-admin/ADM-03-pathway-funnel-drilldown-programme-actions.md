# ADM-03 — Pathway funnel, drill-down and programme follow-up actions

**Status:** Done

## 1. Header

| Field | Value |
|---|---|
| ID | ADM-03 |
| Title | Pathway funnel, drill-down and programme follow-up actions |
| App | Programme Admin Dashboard |
| Depends on | ADM-02 |
| PRD/FRD trace | PA-03 (Recorded → flagged → reviewed → referred → completed), FRD Scenario 1 ("drill into aggregated facility metrics → assign programme follow-up outside clinical decision workflow"), WF-03 step 4, WF-01 step 8, spec §8 "Funnel drill-down", FRD T-01/T-03/T-04/T-05, BO-01 |
| Size | L |

## 2. Goal

`/admin/funnel` shows the five-stage care pathway as horizontal share bars, like the "Trial funnel" in ref image 2. Each stage shows its count, its % of the previous stage and its % of recorded screenings, and the stage with the largest proportional drop carries a `LARGEST DROP` pill. "Dismissed with reason" appears as a separate branch off *Reviewed* and is never mixed into completion (WF-03). Clicking a stage opens `/admin/funnel/:stage`, which breaks the stage down by district → facility → week as aggregates only (no patient rows). From a facility row, an authorised user can **assign a programme follow-up action**. This is a non-clinical task (for example "data completeness check" or "supervision visit") for a facility manager. It is versioned and idempotent, and creating or updating it is audited.

## 3. Scope

**In scope:** funnel calculator, funnel page, stage drill-down route, ProgrammeAction entity + create/update dialog + side list, conflict and duplicate handling.
**Out of scope:** any clinical decision, review, referral or patient-level list. Programme actions never change clinical records.

## 4. Deliverables

```text
packages/analytics/src/metrics/funnel.ts    # EXTEND FND-06 pathwayFunnel: computeFunnel (= pathwayFunnel + pctOfRecorded), funnelByGroup, largestDrop
packages/contracts/src/programmeAction.ts   # ProgrammeActionSchema, ProgrammeActionInputSchema
packages/repositories/src/...               # createProgrammeAction(input, key), updateProgrammeAction(id, patch, expectedVersion, key), listProgrammeActions(filter)  (Dexie + in-memory impls)
apps/programme-admin/src/
  routes/funnel/FunnelPage.tsx
  routes/funnel/FunnelStagePage.tsx         # /admin/funnel/:stage
  features/funnel/FunnelBars.tsx            # CSS share bars with pills, keyboard-focusable rows (buttons/links)
  features/funnel/StageBreakdownTable.tsx   # district > facility rows, expandable (ref image 4 expandable rows)
  features/funnel/WeeklyStageTrend.tsx      # LineTrend for selected stage, per facility
  features/programme-actions/ProgrammeActionDialog.tsx  # RHF + Zod
  features/programme-actions/ProgrammeActionsCard.tsx   # side card, status pills, status change
  features/programme-actions/mutations.ts   # useCreateProgrammeAction, useUpdateProgrammeAction
apps/programme-admin/e2e/funnel-drilldown.spec.ts
packages/i18n/src/locales/{en,rw}/admin.funnel.json, admin.actions.json
```

## 5. Implementation tasks

1. **Stages** (`FunnelStageId` = `recorded | flagged | reviewed | referred | completed`, plus branch `dismissed`):
   - `recorded` = `countScreened`
   - `flagged` = `countFlagged`
   - `reviewed` = `countReviewed` (actioned + dismissed)
   - `dismissed` = `countDismissed` (branch; shown under Reviewed)
   - `referred` = flagged cohort screenings with an `action_recorded` review that has ≥1 referral not `cancelled_with_reason`, or ≥1 follow-up (the "REFERRAL_OPEN | FOLLOW_UP_PLANNED" state)
   - `completed` = `countFollowUpCompleted` limited to `referred`

   `computeFunnel(ds)` returns `{ stages: [{ id, n, pctOfPrevious, pctOfRecorded }], dismissed: { n, pctOfReviewed } }`. Conversion uses the previous **pathway** stage. For `referred`, the denominator is `reviewed − dismissed` (actioned reviews), and the label says so: "of reviews with action recorded". Monotonic invariant: each stage ≤ the previous one, which the test asserts on the seed.
2. `largestDrop(funnel)` returns the stage with the lowest `pctOfPrevious` (ties go to the earlier stage). Its pill text is the derived fact only, e.g. "LARGEST DROP · 58% of previous".
3. `funnelByGroup(ds, 'district'|'facility'|'week')` → rows of `AggregateCell`s, which go through `applyComplementarySuppression` per row and per column. When a stage count is suppressed, its downstream percentages are suppressed too.
4. **FunnelPage**:
   - Left card (8 cols): `FunnelBars` (each stage row is a `<Link>` to `/admin/funnel/<stage>?<filters>`), plus the dismissed branch row with the mono pill `CLOSED WITH REASON`.
   - Right column: an "Evidence" card listing stage-to-stage conversions with `MetricInfo`, a "How to read this" callout (completion requires evidenced, timestamped care; dismissals are counted separately), and `ProgrammeActionsCard` (open actions in scope).
5. **FunnelStagePage** (`/admin/funnel/:stage`):
   - An invalid `:stage` shows 404. ScopeGuard (ADM-01) still applies to the query string.
   - Breadcrumb Funnel › {Stage}; KPI strip for the stage (n, % of previous, % of recorded, change vs previous equal-length period).
   - `StageBreakdownTable`: district rows expand to facility rows; columns are n, % of previous stage, completion %, and the action menu.
   - `WeeklyStageTrend`: a line per facility with a table alternative.
   - Viewing a drill-down emits `admin.drilldown.viewed` (sensitive-read logging, PRD §8 "full access audit") once per `(session, stage, search)`.
   - Requires `metrics.drilldown`; the auditor gets 403.
6. **ProgrammeAction entity** (cross-package task):
   - Schema: `{ id, idempotencyKey, facilityId, districtId, category: 'data_completeness_check'|'supervision_visit'|'workload_review'|'process_review'|'other', title, note, ownerRole: 'facility_manager', dueDate, status: 'open'|'in_progress'|'done'|'cancelled_with_reason', statusReason?, createdBy, createdAt, updatedBy, updatedAt, version, sourceContext: { page, stage?, filters } }`.
   - Zod rules (translated messages): `category` required; `title` 5–120 chars; `note` ≤ 500; `dueDate` ≥ demo today and ≤ +180 days; the facility must be inside the grant; `statusReason` is required (≥10 chars) when cancelling.
   - The repository create is idempotent on `idempotencyKey`: the same key returns the original record and does not create a second audit event. Update requires `expectedVersion`; a mismatch throws `RepositoryError('CONFLICT', { latest })`.
7. **ProgrammeActionDialog**:
   - Header banner `PROGRAMME ACTION — NOT A CLINICAL DECISION`. Facility is prefilled from the row. `sourceContext` captures the stage and filters.
   - The idempotency key is created when the dialog opens (`crypto.randomUUID()`) and reused on retry.
   - The submit button is disabled while pending (no double-submit). Success shows a toast "Programme action assigned", closes the dialog and invalidates `adminKeys.programmeActions`.
   - Requires `programme_action.write`. Without it the menu item is disabled with a reason tooltip, and the repository also rejects the write with FORBIDDEN.
8. **Status updates** in `ProgrammeActionsCard`: Start → `in_progress`, Mark done → `done`, Cancel (requires a reason, ConfirmDialog).
   - On CONFLICT a `ConflictNotice` (from `@laif/ui-web`) shows "yours" vs "latest" status, owner and timestamp, and offers "Use latest" or "Re-apply my change". Re-applying re-submits with the new version and is audited.
   - Fault simulation `conflict` and `timeout` must be exercised.
9. **Query keys:** `adminKeys.funnel(scopeKey, filters)`, `adminKeys.funnelStage(scopeKey, stage, filters)`, `adminKeys.programmeActions(scopeKey)`.

## 6. Data, state and audit

- Reads: the metrics dataset (ADM-02) and ProgrammeAction. Writes: ProgrammeAction, AuditEvent.
- ProgrammeAction state machine: `open → in_progress → done`, `open|in_progress → cancelled_with_reason`. Terminal states cannot be edited, which is enforced in the repository.
- Audit events: `admin.drilldown.viewed`, `admin.programme_action.created`, `admin.programme_action.status_changed` (before/after status, version), `admin.programme_action.conflict` (expected vs actual version), `admin.programme_action.denied`. Each carries actorId, actorRole, entityType `programme_action`, entityId, facilityId, correlationId (session) and justification where one is required.
- Invariants: no clinical entity is written; funnel numbers derive from the same dataset as the overview (identical `recorded`/`flagged` values tested); idempotent create; no silent overwrite.

## 7. UX states

| State | Behaviour |
|---|---|
| loading | Bar skeletons; drill table skeleton rows |
| loaded | Bars with counts, percentages and pills; expandable rows |
| empty | Stage n = 0 → "No screenings reached this stage in the selected period"; zero open actions → "No programme actions yet" |
| validation error | Field-level messages in the dialog (EN/RW), focus moves to the first invalid field |
| server error | ErrorState + Retry; a create that fails keeps the dialog open with input preserved |
| permission denied | Auditor: drill-down 403; facility manager: assign menu disabled |
| offline / timeout | Mutation shows "Not saved — retry"; retry reuses the key and gives exactly one record |
| stale/conflict | ConflictNotice as above |
| success | Toast + new card row highlighted for 2 s |

## 8. i18n

Namespaces `admin.funnel` and `admin.actions`. Stage names, pills, category labels, dialog fields, validation messages and the conflict copy are all externalised.

| Key | EN | RW (needs linguistic review) |
|---|---|---|
| `admin.funnel.stage.recorded` | Recorded | Byanditswe |
| `admin.funnel.stage.flagged` | Flagged for review | Byagaragajwe ngo bisuzumwe |
| `admin.funnel.stage.reviewed` | Clinically reviewed | Byasuzumwe na muganga |
| `admin.funnel.stage.referred` | Referred / follow-up planned | Yoherejwe / ikurikirana ryateganyijwe |
| `admin.funnel.stage.completed` | Follow-up completed (evidenced) | Ikurikirana ryarangiye (rifite gihamya) |
| `admin.funnel.branch.dismissed` | Dismissed with reason | Byahagaritswe hatanzwe impamvu |
| `admin.actions.banner` | Programme action — not a clinical decision | Igikorwa cya porogaramu — si icyemezo cy'ubuvuzi |
| `admin.actions.validation.titleLength` | Title must be 5 to 120 characters | Umutwe ugomba kugira inyuguti 5 kugeza 120 |

## 9. Acceptance criteria

- [ ] The five stage counts are monotonically non-increasing and match the overview KPIs for the same filters.
- [ ] The dismissed branch count equals the seeded District Alpha dismissals for the District Alpha analyst. These dismissals are excluded from `referred` and `completed`.
- [ ] Clicking "Reviewed" opens `/admin/funnel/reviewed?…` with district → facility breakdown rows whose unsuppressed values plus suppressed markers reconcile to the stage total.
- [ ] No drill-down view shows a patient name, synthetic identifier or record id.
- [ ] Assigning an action twice with the same key (double click or simulated timeout + retry) creates exactly one record and one audit event.
- [ ] A version conflict shows the ConflictNotice; nothing is overwritten until the user chooses.
- [ ] The auditor gets 403 on `/admin/funnel/reviewed`, and the facility manager cannot assign.

## 10. Tests

- `packages/analytics/src/funnel.test.ts` — fixture exact values, monotonicity, dismissed branch, suppression propagation, `largestDrop` ties.
- `packages/repositories/src/programmeAction.test.ts` — idempotent create, version conflict, terminal state immutability, FORBIDDEN outside grant (in-memory and Dexie via `fake-indexeddb`).
- `apps/programme-admin/src/features/programme-actions/ProgrammeActionDialog.test.tsx` — validation EN/RW, disabled while pending, retry reuses key.
- `apps/programme-admin/src/routes/funnel/FunnelStagePage.test.tsx` — invalid stage → 404, breakdown expand via keyboard (Enter/Space), audit emitted once.
- `apps/programme-admin/e2e/funnel-drilldown.spec.ts` (Playwright):
  1. District Alpha analyst → Funnel → click Reviewed.
  2. Expand the district row and check the facility values sum.
  3. Assign an action, then confirm it appears in the side card.
  4. Reload and confirm it persists.
  5. Set fault `conflict` and change the status to get the conflict dialog.

## 11. Verification

```bash
pnpm --filter @laif/analytics test && pnpm --filter @laif/repositories test
pnpm --filter @laif/programme-admin typecheck && pnpm --filter @laif/programme-admin lint && pnpm --filter @laif/programme-admin test
pnpm --filter @laif/programme-admin test:e2e -- funnel-drilldown.spec.ts
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

Manual:
1. Programme lead, All districts → Pathway funnel. Note the `LARGEST DROP` pill and the dismissed branch.
2. Click "Follow-up completed" → District Beta row shows `<5`.
3. District Alpha › facility row → "Assign programme follow-up" → submit empty to see field errors → fill in and submit → the action appears in the side card.
4. Mark it In progress. Switch to `persona-auditor-programme` → the drill-down URL gives 403.

## 12. Commit

`feat(admin): ADM-03 pathway funnel, aggregate drill-down and programme actions`
