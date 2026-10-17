# HWM-03 — Home: today's visits, overdue follow-ups and sync status

> **Data layer (reconciled):** table, outbox, mock-server and SQL names in this file are logical names — implement them through the FND-07 repository / sync API per the term-mapping table in `02-worker-mobile/INDEX.md`. Tests run under Vitest (FND-10); device flows via `test:maestro`.

## 1. Header

| Field | Value |
|---|---|
| ID | HWM-03 |
| Title | Home / Today screen with worklist summary, next follow-ups, drafts and sync status |
| App | Health Worker Mobile |
| Depends on | HWM-02 |
| Trace | PRD HW-06, §5 (home/worklist), §6 · FRD HW-06, §5 (`OVERDUE` derived) · Tech spec §2.2 "Home", §5.2 FollowUp overdue invariant · BRD BO-03 |
| Size | M |
| Status | Done |

## 2. Goal

On opening the app the worker sees, for the pinned demo date in `Africa/Kigali`: a greeting with their facility, a **sync status strip** (Online/Offline (simulated), "N items saved on this device", last successful sync time), a primary "Start a new screening" card, a three-cell summary (Overdue · Due today · Completed today), the next prioritised follow-ups, and any unfinished screening drafts. Every count is computed from local SQLite records — no hard-coded numbers — and "overdue" is derived from `dueAt` versus the demo clock, never stored.

## 3. Scope

**In scope**: Today tab content; `useTodaySummary()` selectors; follow-up preview rows linking to task detail (route stub until HWM-07); drafts preview linking to draft (route stub until HWM-05); sync strip linking to Sync tab; pull-to-refresh (re-query, and trigger `drainOnce` if online).

**Out of scope**: task filtering (HWM-07), outcome capture (HWM-08), notifications/bell (not in §2.2 — bell hidden).

## 4. Deliverables

```text
apps/worker-mobile/app/(app)/(tabs)/index.tsx          # HomeScreen
apps/worker-mobile/src/features/home/
  HomeScreen.tsx
  Greeting.tsx                 # mono micro-label date (e.g. "MONDAY, 16 OCTOBER"), "Good morning, {name}", facility
  SyncStatusStrip.tsx          # NetworkBadge + pending count + last synced
  StartScreeningCard.tsx       # → /(app)/(tabs)/screen
  WorklistSummary.tsx          # 3 cells, icon + number + label
  NextFollowUpsList.tsx        # top 5 by priority
  DraftsPreview.tsx            # unfinished drafts (count + first 3)
  useTodaySummary.ts
apps/worker-mobile/src/data/followUps.ts   # listForWorker(), selectors
apps/worker-mobile/src/data/drafts.ts      # listDrafts() (read-only here)
packages/domain: consume FND-02 `isFollowUpOverdue(followUp, now)`; add `dueBucket(followUp, now, tz)` (new, tested)
packages/ui-native: consume FND-10 `SummaryStrip` and `ListRow` (no additions)
packages/i18n/src/locales/{en,rw}/worker/worker.home.json
```

## 5. Implementation tasks

1. `followUps.listForWorker(db, {workerId, facilityId})` → follow-ups joined with patient display name + identifier; facility filter is always applied in SQL.
2. `useTodaySummary()` (query key `['home','summary', workerId, demoDate]`): uses `@laif/domain` demo clock `now()` and `dueBucket()` to compute `overdue` (incomplete and `dueAt < startOfToday(Kigali)`), `dueToday`, `completedToday` (completedAt within today), plus `pendingCount`, `lastSyncedAt` (latest `sync_runs.finished_at` with `acked>0`), `draftCount`.
3. Priority ordering for `NextFollowUpsList`: overdue (oldest due first) → due today (earliest) → upcoming; ties by `seq`-independent stable ID. No clinical urgency is inferred.
4. Row content: initials avatar, patient name, task type label, due pill (`OVERDUE · 1 DAY` danger, `DUE TODAY · 14:00` warning, `UPCOMING` neutral) with icon + text, sync-state micro-pill when pending/conflict.
5. `SyncStatusStrip`: offline → "Working offline (simulated) · 3 saved on this device"; online + pending → "3 waiting to sync"; conflicts → danger pill "1 needs your decision" linking to Sync tab.
6. Pull-to-refresh: invalidate `['home']`, `['outbox']`; if network mode online, call `engine.drainOnce('pull_to_refresh')`.
7. Query invalidation contract: every write helper (outbox enqueue, ack) invalidates `['home']` so the screen updates live.
8. Reference look: white cards (radius 14, hairline border token `border`), mono uppercase micro-labels (`TODAY'S WORK`, `NEXT FOLLOW-UPS`, `DRAFTS`), thin progress bar under summary showing completed / assigned today.

## 6. Data, state and audit

- Reads: `follow_ups`, `patients`, `screening_drafts`, `outbox_ops`, `sync_runs`. No writes.
- Derived state only: `overdue` is a view-time computation (invariant from tech spec §5.2); FRD §5 caveat surfaced as small caption "Overdue = past the demo due date; timing rules not clinically approved".
- Audit: none (aggregated own worklist is not a sensitive per-patient read; patient-level read audit begins at task/patient detail).

## 7. UX states

| State | Behaviour |
|---|---|
| Loading | Skeleton cards for summary and list (no spinner-only screen) |
| Loaded | As above |
| Empty | "No follow-ups assigned for today" `EmptyState` + still shows Start screening |
| Offline | Strip shows offline (simulated); everything readable |
| Stale/conflict | Conflict pill in strip; rows with `sync_state=conflict` show `NEEDS DECISION` pill |
| Server error | N/A (local reads); DB read failure → `ErrorState` with Retry |
| Success | After returning from a saved screening, toast already shown by HWM-06; counts updated |

## 8. i18n

Namespace `worker.home`. Dates via `@laif/i18n` `formatDate(…, {tz:'Africa/Kigali'})` in active locale; plurals via ICU.

| Key | EN | RW (draft, needs review) |
|---|---|---|
| `worker.home.greeting.morning` | Good morning, {name} | Mwaramutse, {name} |
| `worker.home.startScreening` | Start a new screening | Tangira isuzuma rishya |
| `worker.home.overdue` | Overdue | Byarengeje igihe |
| `worker.home.dueToday` | Due today | Bigomba uyu munsi |
| `worker.home.completed` | Completed | Byarangiye |
| `worker.home.pending` | {count, plural, one {# saved on this device} other {# saved on this device}} | {count} byabitswe kuri iki gikoresho |
| `worker.home.empty` | No follow-ups assigned for today | Nta bikorwa byo gukurikirana uyu munsi |
| `worker.home.overdueCaveat` | Overdue = past the demo due date; timing rules not clinically approved | Byarengeje = byarenze itariki y'igerageza; amategeko ntaremezwa n'abaganga |

## 9. Acceptance criteria

- [ ] Summary numbers equal SQL counts for the signed-in worker and facility at the pinned demo date (unit-tested against seed fixtures).
- [ ] Changing the demo clock by +1 day in a test moves "due today" items into "overdue" without any DB write.
- [ ] No follow-up from another facility appears even if present in the worker DB (defensive filter test).
- [ ] Pending count updates within one render after a new outbox op is enqueued.
- [ ] Urgency pills carry text + icon; colour is never the sole cue.
- [ ] All text (incl. dates) switches EN⇄RW instantly; offline switch works.

## 10. Tests

- `src/features/home/__tests__/useTodaySummary.test.ts` — counts, derived overdue, facility filter.
- `src/features/home/__tests__/HomeScreen.test.tsx` — loading → loaded, empty state, offline strip text, RW rendering.
- `.maestro/hwm03-home.yaml` — sign in, assert summary visible, toggle offline in settings, assert offline strip.

## 11. Verification

```bash
pnpm --filter @laif/worker-mobile typecheck && pnpm --filter @laif/worker-mobile lint
pnpm --filter @laif/worker-mobile test -- src/features/home
pnpm --filter @laif/worker-mobile exec expo export --platform android --output-dir .expo-export-check
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

Manual (Expo Go): sign in → Today shows date micro-label, facility, summary (Overdue/Due today/Completed) and next follow-ups → Settings → Network simulation → Offline → back → strip reads "Working offline (simulated)" → switch to RW → all copy and the date change language.

## 12. Commit

`feat(worker): HWM-03 today worklist with derived overdue and sync status`
