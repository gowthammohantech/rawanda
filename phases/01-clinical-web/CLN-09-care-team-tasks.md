# CLN-09 — Care-team tasks (assign/reassign, due date, status, notes, completion confirmation, WF-02 conflict)

## 1. Header

| Field | Value |
|---|---|
| ID | CLN-09 |
| Title | Follow-up task board: assign authorised worker, track status, confirm evidenced completion, resolve version conflicts |
| App | Clinical Web Portal |
| Depends on | CLN-08 |
| Trace | PRD CL-07; FRD CL-07, FRD §4, §5 (`OVERDUE` derived), T-04, T-05, T-06; spec §2.1 `/clinical/tasks`, §5.2 FollowUp machine; WF-01 step 7 (clinician confirms completion), **WF-02 steps 3–5** (stale version → 409, local vs latest, explicit resolution, audit); BRD BR-06, BO-03 |
| Size | L |
| Status | Not started |

## 2. Goal

The clinician/coordinator manages follow-up tasks for the facility: a tabbed table (`Due soon · Overdue · Unassigned · Unable to reach · Awaiting confirmation · Completed`) with an "Assigned to" column, workload chips per worker, and a task drawer to assign/reassign an **authorised** health worker, set/change due date (with reason), add notes, record status, and **confirm completion** reported by the worker. When another actor (simulated worker) has changed the same task, saving shows a side-by-side **local vs latest** comparison and requires explicit resolution — nothing is silently overwritten, and the resolution is audited (WF-02).

## 3. Scope

**In scope**: `/clinical/tasks` (+ `?id=` drawer), assign/reassign, due date edit, note, status update (`contacted`, `unable_to_reach` → reassign), clinician confirmation of worker-reported completion, completion recorded directly by clinician with evidence, `ConflictResolutionDialog`, worker workload summary.
**Out of scope**: worker-side recording of attempts (mobile app; seeded here), SMS reminders.

## 4. Deliverables

| Path (`apps/clinical-web/src/`) | Purpose |
|---|---|
| `features/tasks/TasksPage.tsx` | Header (`Create task` for a patient with decided review), KPI strip (Open · Overdue · Unassigned · Awaiting confirmation), tabs, table |
| `features/tasks/TaskTable.tsx` | PATIENT, TYPE (`Repeat test`, `Planned review`, `Referral follow-up`), ASSIGNED TO, DUE, STATUS, ATTEMPTS, ACTIONS |
| `features/tasks/WorkloadStrip.tsx` | Per-worker open/overdue counts (thin progress bars, ref-image 1) to support fair assignment |
| `features/tasks/TaskDrawer.tsx` | Detail: linked review/referral, attempts timeline (`FollowUpTimeline`), notes, actions |
| `features/tasks/AssignTaskDialog.tsx` | Worker select (authorised, active facility, shows current load), due date, reason when reassigning |
| `features/tasks/UpdateTaskStatusDialog.tsx` | `contacted` / `unable_to_reach` + note |
| `features/tasks/ConfirmCompletionDialog.tsx` | Shows worker-reported outcome + evidence; `Confirm` or `Return to worker` (reason) |
| `features/tasks/CompleteTaskDialog.tsx` | Clinician-recorded completion: completedAt, outcome, evidence type |
| `components/ConflictResolutionDialog.tsx` | Field-by-field "Your change / Latest (by X at hh:mm)"; options `Keep latest`, `Re-apply my change on latest` (re-submits with new `expectedVersion`), `Cancel` |
| `features/tasks/hooks.ts` | `useFollowUps`, `useFollowUpCounts`, `useWorkers`, `useUpdateFollowUp` |
| `packages/contracts` | Consume FND-03 `FollowUpUpdateInputSchema` |

Input = FND-03 `FollowUpUpdateInputSchema` (shared with HWM-08), actions used here: `assign`, `reassign { reason }`, `set_due_date { reason }`, `record_attempt` (status `contacted`), `record_outcome` (`unable_to_reach` + reasonCode, or clinician completion with `outcome` ∈ `attended | repeat_screening_done | referred_onward | declined` and `evidenceType` from FND-02 `COMPLETION_EVIDENCE_TYPES`), `add_note`, `confirm_completion`, `return_to_worker { reason }`. Lowercase FND enum values throughout; no app-local schema.

## 5. Implementation tasks

1. Domain: FND-02 follow-up machine. Worker-reported completion = status `completed` with `clinicianConfirmation.status: 'pending'` (seeded `WF01_WORKER_COMPLETED_FU`); clinician `confirm_completion` sets `confirmed` + `by`; `return_to_worker` (reason) sets `returned` and moves `completed → contacted` (FND-02 ★). `isFollowUpOverdue` derived.
2. Worker list = `listWorkers(activeFacilityId)` filtered to role `CHW` + `active` + facility in scope; repository rejects assignment to any other worker (`FORBIDDEN` reason `WORKER_NOT_AUTHORISED`).
3. Reassign requires `reassignReason`; previous assignee retained in history.
4. All updates through `useIdempotentMutation` with `expectedVersion`. On `CONFLICT`, open `ConflictResolutionDialog` with `error.latest`:
   - `Keep latest` → discard local, refetch, audit `conflict.resolved` (resolution `keep_latest`, original idempotency key).
   - `Re-apply my change` → user sees merged preview, confirms → new submit with latest version and **new** key, audit `conflict.resolved` (`reapply_on_latest`, links original key).
5. WF-02 demo path: Settings "Simulate worker updating follow-up" (CLN-02) bumps `WF02_FOLLOWUP_CONFLICT` to version 4 (status `contacted`, note by simulated worker). A clinician who opened the drawer at version 3 and reassigns → conflict dialog. Document this in the drawer's dev-only hint and in the E2E.
6. `ConfirmCompletionDialog` shows worker outcome, attempt timestamps, evidence type; `Return to worker` requires reason → status back to `assigned`, audited.
7. Sidebar badge "Care-team tasks" = overdue + awaiting confirmation.
8. `Create task` (for a decided review without open task): reuses REPEAT_TEST/PLANNED_REVIEW fields; one open task per (review, type).
9. Drawer read audited `followup.viewed`.

## 6. Data, state and audit

- Reads/writes: FollowUp (attempts[], notes[], assignment history), Worker (DemoPersona role CHW), Review/Referral links.
- Audit: `followup.viewed`, `followup.created`, `followup.assigned`, `followup.reassigned` (from/to, reason), `followup.status_changed`, `followup.note_added`, `followup.completion_confirmed`, `followup.returned_to_worker`, `followup.completed` (evidence), `conflict.detected`, `conflict.resolved`.
- Invariants: only authorised workers; completion requires timestamp + outcome + evidence type; overdue derived; stale writes conflict; notes append-only.

## 7. UX states

Loading skeletons; Empty per tab ("No tasks awaiting confirmation"); Validation errors translated; Server error/timeout retry same key; Permission denied: nurse reviewer can view/add notes but cannot reassign (`task.assign` per FND-06 — PO decision) and out-of-scope `?id=` denied; Offline: read-only + banner; Stale/conflict: `ConflictResolutionDialog`; Success: toast + row moves tab with polite `aria-live` announcement.

## 8. i18n

Namespace `clinical.tasks`: `title`, `kpi.*`, `tabs.dueSoon|overdue|unassigned|unableToReach|awaitingConfirmation|completed`, `table.*`, `type.repeatTest|plannedReview|referralFollowUp`, `status.*`, `assign.*`, `reassignReason`, `workload.*`, `confirm.*`, `returnToWorker.*`, `complete.outcome.<CODE>|evidenceType.<CODE>`, `conflict.title|yours|latest|by|keepLatest|reapply|cancel`. Outcome/evidence wording flagged `needs clinical/linguistic review`.

## 9. Acceptance criteria

- [ ] Assign `REPEAT_TEST` task from CLN-07 to an authorised worker; assigning to a worker of another facility is rejected.
- [ ] Reassign without reason → error; with reason → history shows both assignees.
- [ ] WF-02: simulate worker update, then save stale change → conflict dialog shows local vs latest; `Keep latest` and `Re-apply` both audited with `conflict.resolved`; no silent overwrite.
- [ ] `WF01_WORKER_COMPLETED_FU` appears in Awaiting confirmation; confirm → `clinicianConfirmation.status = confirmed`, `by` = clinician.
- [ ] `OVERDUE_FOLLOWUP` overdue badge derived; `UNABLE_TO_REACH_FOLLOWUP` offers reassign.
- [ ] Tab counts == rows; double-submit safe.

## 10. Tests

- `src/features/tasks/__tests__/TasksPage.test.tsx` — tabs/counts, workload strip.
- `src/features/tasks/__tests__/AssignTaskDialog.test.tsx` — authorised workers only, reassign reason.
- `src/components/__tests__/ConflictResolutionDialog.test.tsx` — both resolutions, audit calls.
- `e2e/followup-conflict.spec.ts` — WF-02 clinical half.
- `e2e/task-confirmation.spec.ts` — WF-01 step 7.

## 11. Verification

```bash
pnpm --filter @laif/clinical-web typecheck && pnpm --filter @laif/clinical-web lint && pnpm --filter @laif/clinical-web test
pnpm --filter @laif/clinical-web test:e2e -- followup-conflict task-confirmation
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```
Manual: reset → clinician Alpha-1 → Care-team tasks → open `WF02` task drawer → in second tab Settings → "Simulate worker updating follow-up" → back, Reassign with reason → conflict dialog → Re-apply → saved → Audit shows `conflict.resolved`. Then Awaiting confirmation → confirm `WF01_WORKER_COMPLETED_FU`.

## 12. Commit

`feat(clinical): CLN-09 care-team tasks with authorised assignment and conflict resolution`
