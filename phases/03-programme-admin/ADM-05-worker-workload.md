# ADM-05 — Worker workload and staff-time proxies

**Status:** Done

## 1. Header

| Field | Value |
|---|---|
| ID | ADM-05 |
| Title | Worker workload and staff-time proxies |
| App | Programme Admin Dashboard |
| Depends on | ADM-02 (TimeEntry schema/seed from ADM-01) |
| PRD/FRD trace | PA-05 (capture staff-time proxies or approved workload measurements), BO-03 (minutes per patient-day), BRD §2 "without increasing worker burden", spec §2.3 `/admin/workload` ("assigned/completed tasks, time-entry summaries") |
| Size | M |

## 2. Goal

`/admin/workload` shows how much follow-up work is assigned to and completed by health workers, and a **staff-time proxy** (self-reported demo minutes per patient-day). The aim is to spot burden, **not** to rate individuals.
- Workers appear only as pseudonymous worker codes (e.g. `HW-014`), never names.
- Worker-level rows are visible only to roles with `metrics.drilldown`.
- Every measure is labelled as a proxy measure from synthetic self-reported time entries, pending an approved workload method.

## 3. Scope

**In scope:** workload calculators; workload page with KPI strip, per-worker table, task-status distribution, minutes-by-activity bars and a weekly trend; suppression of small counts; proxy disclaimer.
**Out of scope:** capturing time entries (done by the worker-mobile app; here they come from the seed); rankings, league tables, colour-coded "under-performing" labels; time-and-motion methodology (a [DECISION] item).

## 4. Deliverables

```text
packages/analytics/src/metrics/workload.ts         # EXTEND FND-06 workerWorkload (no parallel file)
packages/analytics/src/metrics/workload.test.ts
apps/programme-admin/src/
  routes/workload/WorkloadPage.tsx
  features/workload/WorkerTable.tsx          # AccessibleDataTable, sortable by code/assigned/completed (default sort: worker code, NOT by performance)
  features/workload/TaskStatusBars.tsx       # HBarList: completed / in progress / unable to reach / overdue
  features/workload/MinutesByActivity.tsx    # HBarList: screening, follow-up, travel, admin
  features/workload/WeeklyMinutesTrend.tsx   # LineTrend: median minutes per patient-day per week
  features/workload/queries.ts
packages/i18n/src/locales/{en,rw}/admin.workload.json
```

## 5. Implementation tasks

1. **Calculators** (extend FND-06 `metrics/workload.ts`), `(ds, now)`. Follow-ups are attributed to the period of their `createdAt` (task assignment date), which is documented as an exception to cohort attribution because workload is about when work happened.
   - `tasksAssigned(ds)` = follow-ups created in the period, per worker and total.
   - `tasksCompleted(ds)` = those with status `completed` and `completedAt`.
   - `tasksUnableToReach(ds)` = status `unable_to_reach` or `reassigned`; `tasksOverdue(ds, now)` via FND-02 `isFollowUpOverdue`.
   - `taskCompletionRate` = completed / assigned (suppressed when either is suppressed).
   - `patientDays(ds, workerId)` = distinct `(patientId, kigaliDate)` pairs from that worker's screenings (`workerId`, `measuredAt`) and follow-up attempts (`attempts[].at`).
   - `staffMinutesPerPatientDay(ds, workerId?)` = Σ `TimeEntry.minutes` in the period ÷ `patientDays`. It returns `null` when patientDays = 0. The overall value is computed from the pooled sums (ratio of sums, not the mean of per-worker ratios), and the definition text says so.
   - `minutesByActivity(ds)` → sums per `activity`.
   - `weeklyMinutesPerPatientDay(ds)` → `[{ weekStart, value, patientDays }]`.
   - `activeWorkers(ds)` = workers with ≥1 time entry, screening or task in the period.
   - **`minutesPerPatientDayIndex`** (PDF coverage, LAIF MoH p. 17 KPI 04 "minutes per patient-day indexed against baseline"): current-period value ÷ value in a **demo baseline window** (the first 4 seeded weeks of the overlay, labelled `DEMO BASELINE — not an approved baseline`), shown as an index (e.g. `1.08×`) next to the KPI with the `PROXY` pill; `null` when either side has patientDays < k.
2. **Suppression:**
   - Task counts per worker are counts of patient tasks, so `toCells` with threshold k applies to each worker row, with complementary suppression across the row total.
   - Minutes are not patient counts, but `minutesPerPatientDay` is suppressed when `patientDays < k`.
   - The seed (ADM-01) gives most workers ≥k tasks and one worker fewer than k, to demonstrate suppression.
3. **Visibility:**
   - `metrics.drilldown` roles (programme lead, district analyst, facility manager) see `WorkerTable`.
   - The auditor sees facility-level aggregates only (the worker table is replaced by an `EmptyState` "Worker-level view requires drill-down permission").
   - A facility manager's table is limited to their facility by the grant.
4. **Page layout** (Advisor-insights pattern):
   - Header eyebrow `WORKER BURDEN`, filter bar.
   - KpiStrip:
     - "Active workers"
     - "Follow-up tasks assigned"
     - "Completed" with sub-label "{pct}%"
     - "Unable to reach"
     - "Staff minutes per patient-day" with mono pill `PROXY`
   - Left (8 cols): `WorkerTable`. Columns: code, facility, assigned, completed, completion %, overdue, unable to reach, minutes/patient-day, thin progress bar for completion, all with `SuppressedValue`. Below it, `WeeklyMinutesTrend`.
   - Right (4 cols): `TaskStatusBars`, `MinutesByActivity`, and a callout "These are proxy measures from self-reported demo time entries. They describe workload, not individual performance. An approved workload measurement method is pending."
5. **No ranking UI:**
   - The default sort is by worker code.
   - Sorting by a numeric column is allowed, but there are no "top/bottom" badges and no red/green performance colouring. Overdue counts use the neutral warning token with icon + text.
   - A unit test asserts that `WorkerTable` renders no `danger` tone.
6. **Linking:** a facility filter link from the worker table's facility cell. No link to individual tasks or patients.
7. **Query keys:** `adminKeys.workload(scopeKey, filters, nowIso)`.

## 6. Data, state and audit

- Read only: FollowUp (assignedWorkerId, createdAt, status, attempts, completedAt), Screening (workerId, patientId, measuredAt), TimeEntry, worker directory (code, facilityId; no names in the admin dataset), demo clock.
- Audit: `admin.drilldown.viewed` with `entityType: 'workload_worker_table'` when the worker table is rendered (sensitive staff-level read), once per session + filter key.
- Invariants:
  - Per-worker assigned sums to the total (pre-suppression).
  - Pooled minutes/patient-day equals Σ minutes / Σ patientDays.
  - No worker names or patient identifiers in selector output; the `WorkerRow` type has only `workerCode`.

## 7. UX states

| State | Behaviour |
|---|---|
| loading | Table skeleton (8 rows), KPI skeleton |
| loaded | As above |
| empty | No tasks in period → `EmptyState` "No follow-up tasks were assigned in this period"; worker with 0 patient-days → minutes "—" with tooltip "No patient contacts recorded" |
| suppressed | `<k` cells with pill and sr text |
| permission (partial) | Auditor: worker table replaced by an explanation, page otherwise visible |
| permission denied | Out-of-scope filter → 403 |
| server error | ErrorState + Retry |
| offline | Banner |

## 8. i18n

Namespace `admin.workload`:

| Key | EN | RW (needs linguistic review) |
|---|---|---|
| `admin.workload.title` | Worker workload | Akazi k'abakozi b'ubuzima |
| `admin.workload.kpi.minutesPerPatientDay` | Staff minutes per patient-day | Iminota y'umukozi ku murwayi ku munsi |
| `admin.workload.proxy` | PROXY | IGERERANYA |
| `admin.workload.disclaimer` | These are proxy measures from self-reported demo time entries. They describe workload, not individual performance. | Iyi ni imibare igereranya ivuye mu gihe abakozi biyandikiye mu igerageza. Igaragaza ingano y'akazi, si imikorere y'umuntu ku giti cye. |
| `admin.workload.activity.travel` | Travel | Ingendo |
| `admin.workload.noDrilldown` | Worker-level view requires drill-down permission | Kureba umukozi umwe bisaba uruhushya rwo gucukumbura |

## 9. Acceptance criteria

- [ ] On the fixture (add 3 workers and 12 time entries to `adminMetricsFixture`), assigned, completed, minutes per patient-day pooled and per worker match hand-calculated values.
- [ ] Worker rows show only codes. A DOM search for any seeded worker display name returns nothing.
- [ ] The low-volume seeded worker shows `<5` for assigned/completed, and complementary suppression hides one more cell.
- [ ] The auditor sees the page without the worker table. The facility manager sees only their facility's workers.
- [ ] The `PROXY` pill and the disclaimer are visible in EN and RW. There is no ranking or performance colour.

## 10. Tests

- `packages/analytics/src/workload.test.ts` — patient-day dedupe (two contacts with the same patient on the same Kigali day = 1), ratio-of-sums, null when 0, createdAt attribution, overdue.
- `apps/programme-admin/src/features/workload/WorkerTable.test.tsx` — codes only, suppression, no danger tone, keyboard sort (Enter on header), `aria-sort` attribute.
- `apps/programme-admin/src/routes/workload/WorkloadPage.test.tsx` — role variations (auditor, facility manager), empty state, RW.

## 11. Verification

```bash
pnpm --filter @laif/analytics test -- workload
pnpm --filter @laif/programme-admin typecheck && pnpm --filter @laif/programme-admin lint && pnpm --filter @laif/programme-admin test
pnpm typecheck && pnpm lint && pnpm test && pnpm build
pnpm dev:admin
```

Manual:
1. Facility manager → Workload: only their facility's worker codes. Sort by "Completed" with the keyboard; screen-reader `aria-sort` updates.
2. Switch persona to the auditor: the worker table is replaced by the explanation.
3. Programme lead → District Beta: suppressed cells. Switch to RW: the disclaimer is translated.

## 12. Commit

`feat(admin): ADM-05 worker workload and staff-time proxy metrics`
