# HWM-02 — Worker data layer on the FND sync queue, simulated remote and network simulation

> Reconciled with FND-07/08 (see `phases/CONSISTENCY_REVIEW.md`). The earlier draft of this phase specified its own SQLite schema, outbox table, in-app mock sync server and a second database file (`laif-worker-mockserver.db`). That duplicated FND-07's sync queue + simulated remote. There is now **one** design: the FND-07 `CareRepository` over the FND-08 SQLite store, with `repo.sync.*` and `remote_*` collections in the same `laif-worker.db`. This phase wires it into the app and adds the worker-specific glue and the Network simulation screen. File name kept for link stability.

## 1. Header

| Field | Value |
|---|---|
| ID | HWM-02 |
| Title | Worker data layer on the FND sync queue, simulated remote, network simulation settings |
| App | Health Worker Mobile |
| Depends on | HWM-01; FND-05 (`sliceForApp('worker')`, SCN-07/08/09), FND-07 (repository, sync queue, simulated remote, faults), FND-08 (SQLite adapter, `createTestSqliteExecutor`) |
| Trace | PRD HW-05, HW-08, §7 · FRD HW-05, HW-08, §4, §5, §6 (Idempotency-Key, If-Match, error codes) · Tech spec §2.2 Offline requirement, §4, §5.2 `SyncOperation`, WF-02 · FRD T-04, T-09 |
| Size | M |
| Status | Done |

## 1a. Implementation notes (as built)

- **Op names → FND op shape (mapping note).** FND-07 `SyncOperation`s have `entityType` + `opType` (`create` / `update` / `command`) and the FND-03 input as `payload`; idempotency key = the mutation's key (not the op id), stable across retries / restarts. The phase's op names are *labels* derived in `apps/worker-mobile/src/data/opLabel.ts` (`syncOpLabel`, i18n `worker:sync.op.*`):

  | Label (phase name) | entityType : opType | payload |
  |---|---|---|
  | `patient.register` | `patient:create` | — |
  | `screening.submit` | `screening:create` | — |
  | `screening.amend` | `screening:update` | — |
  | `followup.attempt` | `follow_up:update` | `action: 'record_attempt'` |
  | `followup.outcome` | `follow_up:update` | `action: 'record_outcome'` |
  | `followup.update` | `follow_up:update` | other actions |
  | `correction.request` | `care_task:create` | has `targetType` |
  | resolution ops (HWM-09) | same as the resolved op | `resolvesOpId` set (`describeSyncOp().resolution`) |

- **Rule check (task 2).** Every listed rule already exists in `@laif/repositories` `sync/sync-queue.ts` / `sync/simulated-remote.ts` with tests in `sync/sync-queue.test.ts`; nothing was added to the sync rules. The acceptance cases are re-proven over the SQLite adapter in `src/data/__tests__/workerSync.integration.test.ts`.
- **Seed slice follows the signed-in persona (decision).** Boot seeds while signed out → FND default persona slice. On sign-in (and restore) the app calls the new additive `repo.demo.refreshSlice()` (`@laif/repositories` `services/demo.ts`, meta `demo.slicePersonaId`, audit `demo.slice_refreshed`): when the signed-in worker differs from the slice on the device, the patient-scoped collections are re-sliced from the simulated remote; rows with an unsettled sync op and unsynced drafts are kept; audit log, queue, device sessions and meta untouched.
- **Audit.** `settings.network_sim_changed` = the existing FND `demo.fault_toggled` (written by every `repo.demo.setFaults`).
- **Network simulation controls.** The kit (and RN core) has no slider: delay and failure rate are preset segmented steps (values clamped by FND `normaliseFaultConfig`). "Timeout" and "dropped acknowledgement" are one FND field (`timeoutRate`, timeout after commit) → one failure type "Lost reply"; one failure type is active at a time. `conflictOnce` is armed per follow-up ("Make the next sync of this follow-up conflict"); "Simulate a clinician update" moves the follow-up's `dueAt` by one day on the remote via `repo.sync.simulateRemoteEdit`.
- **State.** `src/network/networkStore.ts` (Zustand) is the single UI view of `FaultConfig`, shared by the header `NetworkBadge`, the Network simulation screen and the FND demo-tools sheet. Query keys `['sync', …]` / `['home']` in `src/data/queryKeys.ts`; `invalidateAfterWrite()` is the helper every mutation hook calls.
- `src/repository.ts` moved to `src/data/repository.ts`.

## 2. Goal

Every later write in the app goes through one path: a **FND-07 repository write** that, in one store transaction, writes the entity, the `SyncOperation` (sync queue) and the audit event **before any network attempt**, and shows **Saved on this device** until the simulated remote acknowledges it (**Synced**). "The network" is the FND-07 **simulated remote** — an authoritative copy in `remote_*` collections of the same SQLite file, behind the fault-injected transport — always labelled `SIMULATION` / "Simulated sync server (on this device)". A Settings → Network simulation screen lets a demonstrator go offline and inject latency, failures, dropped acks and conflicts. No feature UI beyond that screen and a live pending-count badge.

## 3. Scope

**In scope**: worker bootstrap of the FND repository (already created in FND-11) with `appId: 'worker'`; verification that the FND sync rules needed by this track exist (dependency ordering, chain rule, single-flight, crash recovery, `rejected` / `superseded` / `blocked_revoked`, `syncRuns`) and adding any missing rule **inside `@laif/repositories`** with tests; worker hooks (`usePendingCount`, `useSyncStatus`, `useEntitySyncState`); network-mode store; Network simulation screen; Sync tab badge.

**Out of scope**: backoff scheduling triggers, Sync center UI and conflict resolution UI (HWM-09); device revocation UI (HWM-10); real HTTP transport (production upgrade path: replace the simulated transport, nothing else changes).

## 4. Deliverables

```text
apps/worker-mobile/src/
  data/repository.ts                    # re-export FND-11 createAppRepository (SQLite laif-worker.db; Dexie on Expo web)
  data/hooks/usePendingCount.ts         # TanStack Query ['sync','pendingCount'] ← repo.sync.getStatus()
  data/hooks/useSyncStatus.ts           # online/offline (simulated), pending, conflicts, lastSyncedAt (latest syncRuns row with acked > 0)
  data/hooks/useEntitySyncState.ts      # domain deriveSyncState(entityId, ops) → Saved on this device | Synced | Needs decision | Not accepted
  network/networkStore.ts               # Zustand view of repo.demo.getFaults(); writes go through repo.demo.setFaults
  features/settings/NetworkSimulationScreen.tsx
app/(app)/settings/network.tsx
packages/repositories/src/sync/*        # only if a rule in task 2 is missing (with tests there)
packages/i18n/src/locales/{en,rw}/worker/{sync,netsim}.json
```

## 5. Implementation tasks

1. **Bootstrap.** Use the FND-11 repository (`createSqliteStoreAdapter(openExpoSqliteExecutor('laif-worker.db'))`, native ID generator, demo clock, `getActor` from the HWM-01 session). `repo.demo.ensureSeeded()` seeds the local store with `sliceForApp(seed, 'worker', personaId)` (only the session facility's patients, screenings, follow-ups — minimum necessary on device) and `remote_*` with the **full** seed (so the remote can prove cross-facility `FORBIDDEN`).
2. **Sync rule check (FND-07 task 8).** Confirm, with tests in `packages/repositories/src/sync/`, that the following exist; add any missing one there, not in the app:
   - op created in the same transaction as the entity + audit (`registerPatient`, `createScreening`, `amendScreening`, `updateFollowUp` enqueue; `saveScreeningDraft` does **not**);
   - `localSeq` from a meta counter, never device time; idempotency key = op ID, stable across retries and restarts;
   - `dependsOnOpId` (screening waits for its pending `patient.register` op);
   - chain rule for several offline changes on one follow-up (HWM-08);
   - single-flight `process({ trigger })`, one `syncRuns` row per run; `sending → queued` recovery on startup;
   - remote: idempotency replay (`replayed: true`, `sync.duplicate_suppressed`), `IDEMPOTENCY_KEY_REUSED`, scope `FORBIDDEN` + `access.denied`, contract validation, version `CONFLICT` with `latest`, `createScreening` evaluates the stored demo ruleset and returns the authoritative status/flag (WF-01 step 4); on ack the local entity is replaced by the remote snapshot.
3. **Op types used by this track** (FND `opType` values): `patient.register`, `screening.submit`, `screening.amend`, `followup.attempt`, `followup.outcome`, plus resolution ops created by `sync.resolveConflict` (HWM-09).
4. **Network-mode store.** `offline` and the other toggles are the FND-07 `FaultConfig` (persisted by FND in store meta `demo.faults`); the store only mirrors it for the UI.
5. **Network simulation screen** (`/settings/network`): header pill `SIMULATION`, callout "This sync server runs inside the app to demonstrate offline behaviour. No data leaves the device."; controls mapped to `FaultConfig`: Offline switch → `offline`; latency slider → `latencyMs`; failure rate + mode (timeout / server error / dependency unavailable) → `timeoutRate` / `serverErrorRate` / `dependencyUnavailableRate`; "dropped acknowledgement" → `timeoutRate` (timeout-after-commit); "Simulate a clinician update to follow-up…" picker → `repo.sync.simulateRemoteEdit('followUp', id, patch)`; "Simulate task reassignment" (added in HWM-10) → same API changing `assignedWorkerId`; "Run one sync pass" → `repo.sync.process({ trigger: 'manual_dev' })` (moved to Sync center in HWM-09).
6. `usePendingCount()` drives the Sync tab badge and `NetworkBadge` (Online / Offline (simulated)); every repository mutation hook invalidates `['sync']` and `['home']`.

## 6. Data, state and audit

- `SyncOperation` lifecycle exactly as FND-02 (`queued → sending → acknowledged | retryable_failure | conflict | rejected`, `retryable_failure → queued`, `conflict → needs_resolution → superseded`, `queued|retryable_failure → blocked_revoked → queued`). No transition deletes an op.
- Entity sync state is derived (`deriveSyncState`): any needs-decision → conflict; any waiting → pending ("Saved on this device"); else synced / rejected.
- Audit (FND-07 registry): `sync.op_acknowledged`, `sync.op_rejected`, `sync.duplicate_suppressed`, `access.denied` (remote), plus app-specific `settings.network_sim_changed`.
- Invariants: entity write, op insert and audit are atomic; ops processed in `localSeq` order; idempotency key never changes; nothing silently discarded.

## 7. UX states

Network simulation screen: loaded; validation (sliders clamp); success toast "Simulation updated". Badge: `Offline (simulated)` with icon + text (not colour only). Other states N/A this phase.

## 8. i18n

Namespace `worker` areas `sync` (state labels reused app-wide) and `netsim` (keys `worker:sync.state.pending` etc. — FND-04 convention). RW drafts flagged in `locales/rw/_review.json`.

| Key | EN | RW (draft) |
|---|---|---|
| `worker.sync.state.pending` | Saved on this device | Byabitswe kuri iki gikoresho |
| `worker.sync.state.synced` | Synced | Byahujwe |
| `worker.sync.state.conflict` | Needs your decision | Bikeneye icyemezo cyawe |
| `worker.sync.state.rejected` | Not accepted | Ntibyemewe |
| `worker.netsim.title` | Network simulation | Kwigana umurongo wa interineti |
| `worker.netsim.offline` | Work offline (simulated) | Kora nta murandasi (kwigana) |
| `worker.netsim.notice` | This sync server runs inside the app. No data leaves the device. | Iyi seriveri ikorera muri porogaramu. Nta makuru ava ku gikoresho. |

## 9. Acceptance criteria

- [ ] A write whose transaction throws leaves neither the entity nor the sync op (FND contract test run against the SQLite adapter).
- [ ] `localSeq` strictly increases across restarts and is independent of device time.
- [ ] Two concurrent `repo.sync.process()` calls produce one `syncRuns` row and one remote apply per op.
- [ ] With `timeoutRate=1` then `0`, the same op is sent twice and the remote holds exactly one entity; the second response is `replayed: true`.
- [ ] Offline: ops stay `queued`, `remote_*` unchanged.
- [ ] Remote rejects a cross-facility op with `FORBIDDEN` and writes `access.denied`; the op ends `rejected`, not deleted.
- [ ] `conflictOnce` causes `CONFLICT` with a `latest` snapshot; op ends `needs_resolution`, not deleted.
- [ ] Killing the app while an op is `sending` → next launch resets it to `queued`; after sync exactly one remote entity exists.
- [ ] Network simulation screen is labelled `SIMULATION` and settings persist across restart.
- [ ] `apps/worker-mobile` contains no SQL schema, outbox table or second database file.

## 10. Tests

- `src/data/__tests__/workerSync.integration.test.ts` — the acceptance cases above against `createTestRepository` with `createTestSqliteExecutor()` (`@laif/test-utils`, FND-08), under Vitest (FND-10).
- `packages/repositories/src/sync/*.test.ts` — only for rules added in task 2.
- `src/features/settings/__tests__/NetworkSimulationScreen.test.tsx` — toggles map to `FaultConfig`.

## 11. Verification

```bash
pnpm --filter @laif/worker-mobile typecheck && pnpm --filter @laif/worker-mobile lint
pnpm --filter @laif/worker-mobile test -- src/data src/features/settings
pnpm --filter @laif/repositories test
pnpm --filter @laif/worker-mobile exec expo-doctor
pnpm --filter @laif/worker-mobile exec expo export --platform android --output-dir .expo-export-check   # .expo-export-check is gitignored
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

Manual (Expo Go): sign in → avatar → Settings → Network simulation → see `SIMULATION` label → toggle Offline → header shows "Offline (simulated)" → restart → still offline → set failure rate 100% → "Run one sync pass" → toast reports failure, nothing lost.

## 12. Commit

`feat(worker): HWM-02 worker data layer on FND sync queue with simulated remote and network simulation`
