# HWM-07 — My tasks: due / overdue / completed list and task detail with patient context

> **Data layer (reconciled):** table, outbox, mock-server and SQL names in this file are logical names — implement them through the FND-07 repository / sync API per the term-mapping table in `02-worker-mobile/INDEX.md`. Tests run under Vitest (FND-10); device flows via `test:maestro`.

## 1. Header

| Field | Value |
|---|---|
| ID | HWM-07 |
| Title | Follow-up task list with filters and counts, task detail with patient context, contact-attempt history and due date |
| App | Health Worker Mobile |
| Depends on | HWM-03 |
| Trace | PRD HW-06, §2 (pending vs verified completed) · FRD HW-06, §5 (`OVERDUE` derived), §7 · BRD BR-05, BR-06, BO-03 · Tech spec §2.2 "My tasks", §5.2 FollowUp · FRD T-01, T-02 |
| Size | M |
| Status | Planned |

## 2. Goal

The worker opens the Tasks tab and sees only follow-ups **assigned to them in their facility**, split into tabbed filters with counts — **Due** (today + upcoming), **Overdue** (derived), **Completed** — sorted by due date. Each row shows patient, task type, due date in Kigali time, attempts so far and sync state. Opening a task shows the patient context needed for the visit (identifier, age, latest screening values with units and review status, linked referral destination and due date as set by the clinician), the full contact-attempt timeline, and the actions "Record contact attempt" and "Record outcome" (implemented in HWM-08).

## 3. Scope

**In scope**: Tasks tab, filter tabs with counts, search-within-tasks, task detail screen, attempt timeline, patient context card, deep-link guard, `followup.viewed` audit.

**Out of scope**: recording attempts/outcomes (HWM-08), reassignment (clinician-only), creating tasks (clinician-only).

## 4. Deliverables

```text
apps/worker-mobile/app/(app)/(tabs)/tasks/index.tsx        # TasksScreen (?filter=due|overdue|completed)
apps/worker-mobile/app/(app)/tasks/[followUpId]/index.tsx  # TaskDetailScreen
apps/worker-mobile/src/features/tasks/
  TasksScreen.tsx, TaskFilterTabs.tsx, TaskRow.tsx, TaskListEmpty.tsx
  TaskDetailScreen.tsx, TaskHeaderCard.tsx, PatientContextCard.tsx
  ReferralContextCard.tsx, AttemptTimeline.tsx, TaskActionsBar.tsx
  useTasks.ts, useTaskDetail.ts
apps/worker-mobile/src/data/followUps.ts   # extend: listByFilter(), getDetail(), counts()
packages/domain: consume `followUpDisplayStatus(f, now)` → 'assigned'|'contacted'|'unable_to_reach'|'completed' + derived `overdue` flag
packages/ui-native: consume FND-10 `TabbedFilter`
packages/i18n/src/locales/{en,rw}/worker/worker.tasks.json
```

## 5. Implementation tasks

1. `followUps.listByFilter(db, {workerId, facilityId, filter, query})`:
   - `due`: status in (`assigned`,`contacted`) and `dueAt ≥ startOfToday(Kigali)`;
   - `overdue`: status in (`assigned`,`contacted`,`unable_to_reach` awaiting reassignment) and `dueAt < startOfToday` — computed in a selector over the SQL result using `@laif/domain` (no stored `overdue`);
   - `completed`: status `completed` (and `closed_with_reason` if present in seed) ordered by `completedAt` desc.
   SQL always constrains `assigned_worker_id` and `facility_id`.
2. `counts()` returns all three counts in one query for the tab badges; reused by Home summary (refactor HWM-03 selector to share).
3. `TaskFilterTabs`: three tabs with counts (ref-image "Needs you 8" style), persisted selection in route param; accessible as `tablist`.
4. `TaskRow`: initials, name, task type (`Blood pressure follow-up`, `Confirm clinic attendance`, `Glucose follow-up` from seed `taskType`), due pill (`OVERDUE · 2 DAYS`, `DUE TODAY · 14:00`, `DUE 18 OCT`), attempt count "2 attempts", sync pill when the latest local change is pending/conflict.
5. `TaskDetailScreen` loads with scope check (assigned to me + my facility) → else `/denied` + `access.denied` audit; on success writes `followup.viewed` audit (sensitive read).
6. Cards:
   - `TaskHeaderCard`: status pill (`ASSIGNED`, `CONTACTED`, `UNABLE TO REACH`, `COMPLETED`), mono micro-labels `DUE`, `ASSIGNED BY`, `CREATED`; derived `OVERDUE` pill with explanatory caption.
   - `PatientContextCard`: identifier, age, sex, link to patient context (HWM-04); latest screening reading with units, date and review status — no flag interpretation beyond the clinician-set reason text.
   - `ReferralContextCard` (when `referralId`): destination facility (fictional), clinician-set due date, status; text "Set by clinician".
   - `AttemptTimeline`: attempts newest first (time, channel, reached yes/no, note), outcome entry if completed (evidence type, occurred-at, recorded-by), sync state per item.
7. `TaskActionsBar` (sticky, safe-area aware): "Record contact attempt" and "Record outcome" buttons (≥44pt) routed to HWM-08 stubs; hidden for completed tasks, replaced by "Completed {date}" summary.
8. Pull-to-refresh behaves as on Home.

## 6. Data, state and audit

- Reads `follow_ups`, `contact_attempts`, `patients`, `screenings`; no domain writes.
- FollowUp states (spec §5.2): `assigned → contacted → completed`; `assigned → unable_to_reach → reassigned`; `overdue` derived. FRD §5 caveat displayed: overdue reflects demo due dates, not approved clinical timing.
- Audit: `followup.viewed`, `access.denied`.
- Invariants: worker never sees tasks assigned to another worker; completed is shown only when an outcome with evidence exists (seed validated by a test).

## 7. UX states

| State | Behaviour |
|---|---|
| Loading | Row skeletons; detail skeleton cards |
| Empty | Per-filter empty copy ("Nothing overdue — well done" avoided; neutral "No overdue tasks") |
| Offline | Full read access; action buttons still enabled (writes are local-first) |
| Permission denied | `/denied` for other worker's / facility's task |
| Stale/conflict | Task with conflict shows `NEEDS DECISION` pill and banner linking to Sync center |
| Error | DB read error → `ErrorState` Retry |

## 8. i18n

Namespace `worker.tasks`. Relative dates ("2 days") via `Intl.RelativeTimeFormat` with RW fallback strings from catalogue when the runtime lacks `rw` locale data (Hermes `Intl` coverage — fallback test required).

| Key | EN | RW (draft, needs review) |
|---|---|---|
| `worker.tasks.filter.due` | Due | Ibigomba gukorwa |
| `worker.tasks.filter.overdue` | Overdue | Byarengeje igihe |
| `worker.tasks.filter.completed` | Completed | Byarangiye |
| `worker.tasks.recordAttempt` | Record contact attempt | Andika igerageza ryo guhura |
| `worker.tasks.recordOutcome` | Record outcome | Andika umusaruro |
| `worker.tasks.setByClinician` | Set by clinician | Byashyizweho na muganga |
| `worker.tasks.attempts` | {count, plural, one {# attempt} other {# attempts}} | Igerageza {count} |
| `worker.tasks.empty.overdue` | No overdue tasks | Nta bikorwa byarengeje igihe |

## 9. Acceptance criteria

- [ ] Tab counts equal list lengths and equal Home summary numbers for the same demo date.
- [ ] Overdue membership changes when the demo clock advances, with no DB writes.
- [ ] Opening another worker's task ID shows denied and logs `access.denied`; no patient data rendered (T-02).
- [ ] Opening own task logs exactly one `followup.viewed` per open.
- [ ] Detail shows due date, attempts timeline and patient's latest reading with units.
- [ ] RW relative-date fallback works when `Intl` lacks Kinyarwanda.

## 10. Tests

- `src/data/__tests__/followUps.filters.test.ts` — filters, counts, scope, derived overdue.
- `src/features/tasks/__tests__/TasksScreen.test.tsx` — tabs, counts, empty states, RW.
- `src/features/tasks/__tests__/TaskDetailScreen.test.tsx` — denied path, audit, timeline order.
- `.maestro/hwm07-tasks.yaml` — open Tasks, switch to Overdue, open task, see timeline.

## 11. Verification

```bash
pnpm --filter @laif/worker-mobile typecheck && pnpm --filter @laif/worker-mobile lint
pnpm --filter @laif/worker-mobile test -- src/features/tasks src/data
pnpm --filter @laif/worker-mobile exec expo export --platform android --output-dir .expo-export-check
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

Manual (Expo Go): Tasks tab → counts on tabs → Overdue → open "Habimana Noël" (seed name may differ) → see patient card, referral card, attempts → back → Completed tab → open completed task → evidence shown, no action buttons → switch RW → labels translate.

## 12. Commit

`feat(worker): HWM-07 my tasks with due/overdue/completed filters and task detail`
