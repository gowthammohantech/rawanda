# HWM-09 — Sync center: pending queue, manual sync, retries/backoff and conflict resolution

> **Data layer (reconciled):** table, outbox, mock-server and SQL names in this file are logical names — implement them through the FND-07 repository / sync API per the term-mapping table in `02-worker-mobile/INDEX.md`. Tests run under Vitest (FND-10); device flows via `test:maestro`.

## 1. Header

| Field | Value |
|---|---|
| ID | HWM-09 |
| Title | Sync center UI, automatic triggers with exponential backoff, duplicate-tap dedupe, conflict screen (local vs latest) with explicit, audited resolution |
| App | Health Worker Mobile |
| Depends on | HWM-06, HWM-08 |
| Trace | PRD HW-05, HW-08, §10 edge cases · FRD HW-05, HW-08, §5 (`SYNC_PENDING`, `SYNC_CONFLICT`), §6 · BRD BR-09 · Tech spec §2.2 "Sync center", §5.2 SyncOperation, WF-02 (all steps), §8 Worker rows · FRD T-04, T-05, T-09 |
| Size | L |
| Status | Planned |

## 2. Goal

The Sync tab is the worker's single place to understand what is **saved on this device** versus **synced**. It shows connection state (simulated), last successful sync, a grouped queue (Needs your decision · Waiting · Not accepted · Synced recently), and a **Sync now** button that is safe to tap repeatedly (one run, one server apply per idempotency key). Failures retry automatically with exponential backoff and are never dropped. A conflict opens a screen that shows **your version** and the **latest version** side by side, blocks silent overwrite, and requires an explicit choice — *Re-apply my update on the latest version* or *Keep the latest and withdraw mine* — with a confirmation and an audit record that links the original operation ID.

## 3. Scope

**In scope**: Sync tab, op detail, conflict resolution screen, backoff scheduler, triggers (app foreground, network back online, after local write, manual), `sync.conflict_resolution` handling, "Retry now" for failed ops, rejected-op explanation, removal of the HWM-02 "Run one sync pass" dev button (moved here).

**Out of scope**: background sync while app is closed (`expo-background-fetch` not used in demo — PO decision), device revocation (HWM-10), merging field-by-field.

## 4. Deliverables

```text
apps/worker-mobile/app/(app)/(tabs)/sync/index.tsx        # SyncCenterScreen
apps/worker-mobile/app/(app)/sync/[opId].tsx              # OpDetailScreen
apps/worker-mobile/app/(app)/sync/conflicts/[opId].tsx    # ConflictResolutionScreen
apps/worker-mobile/src/sync/
  (backoff schedule itself is FND-07: 2s ×2, cap 60s, ±20 % seeded jitter, 8 auto attempts — this phase only displays `nextAttemptAt`)
  triggers.ts        # AppState 'active', network store online transition, post-write, manual
  (resolution = `repo.sync.resolveConflict(opId, 'reapply_on_latest' | 'keep_latest', key, note?)`, FND-07)
apps/worker-mobile/src/features/sync/
  SyncCenterScreen.tsx, ConnectionCard.tsx, SyncNowButton.tsx
  QueueSection.tsx, OpRow.tsx, OpDetail.tsx
  ConflictResolutionScreen.tsx, VersionCompareTable.tsx, ResolutionChoice.tsx
  RejectedExplanation.tsx, SyncHistoryList.tsx
packages/ui-native: consume FND-10 `ConflictCard` (= CompareTable)
packages/i18n/src/locales/{en,rw}/worker/worker.sync.json (extend)
```

## 5. Implementation tasks

1. Backoff (implemented in FND-07, verified here): on `retryable_failure` set `next_attempt_at = now + min(60s, 2s·2^(attempt−1)) ± jitter`; ops are eligible when `next_attempt_at ≤ now`; after 8 attempts stop auto-retry (status stays `retryable_failure`, row shows "Retry now") — **never** delete or downgrade.
2. `triggers.ts`: subscribe to AppState `active`, network store `offline→online`, outbox enqueue event; debounce 1s; all call `engine.drainOnce(trigger)` (single-flight from HWM-02). A timer re-runs at the earliest `next_attempt_at` while the app is foregrounded.
3. `SyncNowButton`: disabled + spinner while a run is active; additional taps attach to the in-flight run (WF-02 step 2). Shows result toast "3 synced · 1 needs your decision".
4. `ConnectionCard`: micro-label `CONNECTION`, state text + icon (`Online (simulated)` / `Offline (simulated)`), last successful sync, pending count, link "Network simulation" (HWM-02 screen), pill `SIMULATED SYNC SERVER`.
5. Queue sections (counts in headers, ref-image tabbed list style):
   - **Needs your decision** — `conflict` / `needs_resolution`.
   - **Waiting** — `queued`, `sending`, `retryable_failure` (with "Retrying in 8s" or "Retry now"); row shows op type label, patient, created time, attempts, last error code in plain words.
   - **Not accepted** — `rejected` with `RejectedExplanation` (validation/forbidden/reassigned), "Keep on device" (default) and "Copy details" for supervisor.
   - **Synced recently** — last 20 acknowledged with server event ID short form.
6. `OpDetailScreen`: op ID, idempotency key, seq, base version, correlation ID, attempt history from audit, payload summary (no free-text notes in logs).
7. `ConflictResolutionScreen` (WF-02 step 4): explanation callout "This task changed on the server after you saved your update. Nothing has been overwritten."; `VersionCompareTable` rows (status, outcome, attempts, due date, assignee, updated by/at) with changed rows marked `CHANGED`; choices:
   - **Re-apply my update on the latest version** → creates a new op (`followup.outcome`/`followup.attempt`/`screening.amend`) with `base_version = latest.version`, `payload = original payload`, `resolves_op_id = original`; original → `superseded`. Disabled with explanation if the latest state makes the update invalid (e.g. task already completed or reassigned) — then only option 2.
   - **Keep the latest and withdraw mine** → original → `superseded`; local entity rows refreshed from `latest`; the withdrawn payload is retained in `outbox_ops.payload_json` (viewable in op detail) — never deleted.
   - Both require `ConfirmSheet`; optional note.
8. `repo.sync.resolveConflict` (FND-07) transaction: status changes + new op (if any) + local entity refresh + audit `sync.conflict_resolved {originalOpId, choice, newOpId?, latestVersion, note}`; then `drainOnce('after_resolution')`. Server side mirrors the resolution audit with the original op ID (WF-02 step 5).
9. Sync tab badge = waiting + needs-decision counts; Home strip already links here.

## 6. Data, state and audit

- `SyncOperation` full machine: `queued → sending → acknowledged`; `sending → retryable_failure → queued (scheduled)`; `sending → conflict → needs_resolution → superseded (+ new queued op)`; `sending → rejected`.
- Entity `sync_state` recomputed from its ops: any needs-decision → `conflict`; any waiting → `pending`; else `synced`/`rejected`.
- Audit: `sync.run_started`, `sync.run_finished`, `sync.retry_scheduled`, `sync.manual_requested`, `sync.duplicate_tap_coalesced`, `sync.conflict_resolved`, server `sync.duplicate_suppressed`.
- Invariants: no op deleted; conflict never auto-resolved; every resolution attributable with original op ID; idempotency keys of new ops are new UUIDs (they are new intents).

## 7. UX states

| State | Behaviour |
|---|---|
| Loading | Section skeletons |
| Empty | "Everything on this device is synced" with last sync time |
| Offline | Sync now disabled with reason "Offline (simulated) — items are safe on this device" |
| Server error | Toast summarises; rows show plain-language error + next retry |
| Stale/conflict | Needs-decision section first, danger pill + icon |
| Permission denied | Not accepted section with explanation |
| Success | Toast + rows move to Synced recently; live region announces counts |

## 8. i18n

Namespace `worker.sync` (extend). RW drafts flagged `needs linguistic review`.

| Key | EN | RW (draft) |
|---|---|---|
| `worker.sync.syncNow` | Sync now | Huza ubu |
| `worker.sync.section.decision` | Needs your decision | Bikeneye icyemezo cyawe |
| `worker.sync.section.waiting` | Waiting to sync | Bitegereje guhuzwa |
| `worker.sync.section.notAccepted` | Not accepted | Ntibyemewe |
| `worker.sync.conflict.explain` | This changed on the server after you saved. Nothing has been overwritten. | Ibi byahindutse kuri seriveri nyuma yo kubika. Nta cyasimbujwe. |
| `worker.sync.conflict.reapply` | Re-apply my update on the latest version | Ongera ushyireho ibyanjye ku bigezweho |
| `worker.sync.conflict.keepLatest` | Keep the latest and withdraw mine | Gumana ibigezweho ukureho ibyanjye |
| `worker.sync.retryIn` | Retrying in {seconds}s | Birongera kugerageza mu masegonda {seconds} |

## 9. Acceptance criteria

- [ ] Tapping Sync now 5× quickly produces one `sync_runs` row and, per op, one server apply (T-04, tech spec §8 "exactly one screening per idempotency key").
- [ ] With failure rate 100%, ops reschedule with growing `next_attempt_at`, are never removed, and sync after failures are cleared.
- [ ] Conflict screen shows local vs latest; no server change happens until a choice is confirmed (T-05).
- [ ] "Re-apply" creates one new op with latest base version and marks the original `superseded`; "Keep latest" refreshes local rows and keeps the withdrawn payload visible.
- [ ] Both resolutions write `sync.conflict_resolved` containing the original op ID; server mirrors it.
- [ ] Offline → online transition triggers a sync without user action while app is foreground.

## 10. Tests

- `src/sync/__tests__/scheduler.test.ts` — backoff curve, cap, deterministic jitter, max attempts.
- `src/sync/__tests__/triggers.test.ts` — debounce, single-flight coalescing.
- `src/sync/__tests__/resolve.test.ts` — both choices, invalid re-apply, audit contents.
- `src/features/sync/__tests__/SyncCenterScreen.test.tsx`, `ConflictResolutionScreen.test.tsx`.
- `.maestro/hwm09-duplicate-tap.yaml`, `.maestro/hwm09-conflict.yaml` (inject conflict via Network simulation → record outcome → sync → resolve → audit visible in op detail).

## 11. Verification

```bash
pnpm --filter @laif/worker-mobile typecheck && pnpm --filter @laif/worker-mobile lint
pnpm --filter @laif/worker-mobile test -- src/sync src/features/sync
pnpm --filter @laif/worker-mobile exec expo export --platform android --output-dir .expo-export-check
pnpm typecheck && pnpm lint && pnpm test && pnpm build
maestro test apps/worker-mobile/.maestro/hwm09-conflict.yaml   # Expo Go/dev client running
```

Manual (Expo Go): Network simulation → "Simulate a clinician update" on task X → record outcome on X → Sync tab → Sync now (tap several times) → X under "Needs your decision" → open → compare table → Re-apply → confirm → synced; repeat with "Keep latest" → op detail shows withdrawn payload and resolution audit.

## 12. Commit

`feat(worker): HWM-09 sync center with backoff, duplicate-tap dedupe and audited conflict resolution`
