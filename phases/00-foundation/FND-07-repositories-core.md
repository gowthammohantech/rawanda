# FND-07 — @laif/repositories: CareRepository, in-memory store, audit, idempotency, versions, faults, sync, reset

**Status:** Planned

## 1. Header

| Field | Value |
|---|---|
| ID | FND-07 |
| Title | Repository core (storage-agnostic) |
| App | Shared (`packages/repositories`) |
| Depends on | FND-02, FND-03, FND-05, FND-06 |
| Trace | Tech spec §4 (interface, write result, 409, fault simulation), §5.2 invariants, §6 WF-01/WF-02/WF-04, §10 reset; FRD §6 (Idempotency-Key, optimistic concurrency, error taxonomy); BR-08, BR-09; CL-01..08, HW-02..08, PA-01..08, CW-02..06 |
| Size | L |

## 2. Goal

All four apps talk to one async `CareRepository` that behaves like a real API: every write is validated, authorised, versioned, idempotent and audited; stale writes return a 409-style `CONFLICT`; the transport can be made slow, flaky or offline on demand; the worker app gets a durable sync queue against a simulated remote; and `resetDemo()` restores the exact seed baseline. This phase implements the logic once over a `StoreAdapter`, with an in-memory adapter; FND-08 adds Dexie and SQLite adapters.

## 3. Scope

**In scope:** interface, implementation over `StoreAdapter`, in-memory adapter, audit emission, idempotency records, version checks, scope enforcement (via auth-demo), simulated transport + fault injector, sync queue + simulated remote, scenario loading, reset, shared adapter contract test-suite.

**Out of scope:** Dexie/SQLite adapters (FND-08), scenario JSON export/import (REL-01), React hooks (each app writes thin TanStack Query hooks; a helper `queryKeys` factory is exported here).

## 4. Deliverables

```text
packages/repositories/src/
  care-repository.ts        # interface CareRepository + RepositoryDeps
  create-care-repository.ts # createCareRepository(deps): CareRepository
  store/store-adapter.ts    # interface StoreAdapter, CollectionName
  store/memory-adapter.ts   # createMemoryStoreAdapter()
  store/contract-suite.ts   # runStoreAdapterContract(name, factory) — reused by FND-08
  services/{patients,screenings,reviews,referrals,follow-ups,tasks,reminders,instructions,audit,metrics,demo}.ts
  audit/emit.ts             # emitAudit(tx, event) — append-only
  idempotency.ts            # withIdempotency(tx, key, opName, payloadHash, fn)
  errors.ts                 # RepositoryError extends Error { code: ErrorCode; status; details }
  transport/faults.ts       # FaultConfig, createFaultInjector(seed)
  transport/simulated.ts    # withSimulatedTransport(repo, faults, clock) → CareRepository
  sync/sync-queue.ts        # createSyncQueue(store, deps)
  sync/simulated-remote.ts  # createSimulatedRemote(store) — authoritative copy under `remote_*` collections
  query-keys.ts             # queryKeys.patients.list(filter) etc. for TanStack Query
  index.ts
```

## 5. Implementation tasks

1. **`StoreAdapter`** (document-store; dataset is < 5k rows so filtering happens in JS — decision):
   ```ts
   interface StoreAdapter {
     get<T>(c: CollectionName, id: string): Promise<T | undefined>;
     getAll<T>(c: CollectionName): Promise<T[]>;
     put<T extends { id: string }>(c: CollectionName, v: T): Promise<void>;
     bulkPut<T extends { id: string }>(c: CollectionName, vs: T[]): Promise<void>;
     delete(c: CollectionName, id: string): Promise<void>;
     clearAll(): Promise<void>;
     transaction<R>(fn: (tx: StoreAdapter) => Promise<R>): Promise<R>;   // all-or-nothing
     getMeta(key: string): Promise<string | undefined>; setMeta(key: string, v: string): Promise<void>;
   }
   ```
   Collections (`COLLECTIONS` registry — declared **here, once**, so FND-08's Dexie schema v1 already contains every table and no app phase needs a SQL migration or a Dexie version bump): `patients, screenings, reviews, referrals, followUps, careTasks, reminders, reminderPreferences, careInstructions, auditEvents, idempotency, syncOperations, syncRuns, deviceSessions, facilities, districts, personas, rulesets` + admin (ADM-01..09): `accessGrants, timeEntries, programmeActions, dataQualityIssues, exportAudits` + citizen (CTZ-01..08): `citizenAccounts, patientLinks, identityVerifications, consentRecords, nextStepAcks, citizenSettings, accessEvents` + `remote_*` mirrors used only by the simulated remote. App phases that discover a missing collection add it to this registry (with a Dexie version bump in the same commit) — they never create app-local tables, separate database files or `ctz_*`/`outbox_*` SQL schemas.
2. **Interface** — keeps spec §4 method names and adds the rest. Deviation (decision): writes return `WriteResult<T>` (spec §4 says `Promise<Screening>` but also requires `eventId/entityVersion/updatedAt/auditEventId`). Actor is injected once via `deps.getActor()` instead of a parameter on each call, so the §4 signatures stay intact:
   ```ts
   interface CareRepository {
     listPatients(f: PatientFilter): Promise<Page<Patient>>; getPatient(id: string): Promise<Patient | null>;   // f: { q?, facilityIds?, page, pageSize }
     registerPatient(i: RegisterPatientInput, key: string): Promise<WriteResult<Patient>>;
     findPatientMatches(i: RegisterPatientInput): Promise<Array<{ patient: Patient; score: number }>>;     // HWM-04 (scorePatientMatch in domain)
     listScreenings(f: ScreeningFilter): Promise<Page<Screening>>; getScreening(id: string): Promise<Screening | null>;
     saveScreeningDraft(i: ScreeningDraftInput, key: string): Promise<WriteResult<Screening>>;   // device-local: never enqueued for sync
     discardScreeningDraft(id: string, key: string): Promise<WriteResult<Screening>>;
     createScreening(i: ScreeningInput, key: string): Promise<WriteResult<Screening>>;      // submit + evaluate + create Review if flagged
     amendScreening(i: ScreeningAmendmentInput, key: string): Promise<WriteResult<Screening>>;
     listReviews(f: ReviewFilter): Promise<Page<Review>>; getReview(id: string): Promise<ReviewDetail | null>;
     countReviews(f: ReviewFilter): Promise<Record<'pending'|'urgent'|'overdue'|'assigned'|'all', number>>;  // same predicates as listReviews (CLN-05)
     countReferrals(f: ReferralFilter): Promise<Record<string, number>>; countFollowUps(f: FollowUpFilter): Promise<Record<string, number>>;
     listWorkers(facilityId: string): Promise<DemoPersona[]>;   // authorised CHWs for assignment (CLN-07/09)
     startReview(i: StartReviewInput, key: string): Promise<WriteResult<Review>>;
     decideReview(i: ReviewDecisionInput, key: string): Promise<WriteResult<Review>>;
     listReferrals(f: ReferralFilter): Promise<Page<Referral>>;
     createReferral(i: ReferralInput, key: string): Promise<WriteResult<Referral>>;
     transitionReferral(i: ReferralTransitionInput, key: string): Promise<WriteResult<Referral>>;
     listFollowUps(f: FollowUpFilter): Promise<Page<FollowUp>>;
     createFollowUp(i: FollowUpInput, key: string): Promise<WriteResult<FollowUp>>;
     updateFollowUp(i: FollowUpUpdateInput, key: string): Promise<WriteResult<FollowUp>>;
     listTasks(f: TaskFilter): Promise<Page<CareTask>>; createTask(...); updateTask(...);
     requestCorrection(i: CorrectionRequestInput, key: string): Promise<WriteResult<CareTask>>;  // never edits clinical record (WF-04.4)
     listReminders(patientId: string): Promise<Reminder[]>; setReminderPreference(i, key): Promise<WriteResult<ReminderPreference>>;
     listCareInstructions(patientId: string): Promise<CareInstruction[]>; releaseCareInstruction(i, key): Promise<WriteResult<CareInstruction>>;
     getAggregateMetrics(f: MetricsFilter): Promise<ProgrammeMetrics>;
     recordExport(i: ExportRecordInput, key: string): Promise<WriteResult<AuditEvent>>;
     listAuditEvents(f: AuditFilter): Promise<Page<AuditEvent>>;
     recordAuditEvent(i: ClientAuditInput): Promise<AuditEvent>;   // UI-originated access/session/demo events only (route-guard denials, session.started); replaces app-proposed `appendAudit` / `auditLocal` / `emitAdminAudit` sinks
     sync: SyncApi;   // list(filter), getStatus(), process({ trigger }), retryNow(opId), resolveConflict(opId, 'reapply_on_latest'|'keep_latest', key, note?),
                      // simulateRemoteEdit(entityType, id, patch), revokeDevice(), restoreDevice()
     demo: DemoApi;   // ensureSeeded(), resetDemo(), loadScenario(id), getDemoState(), setFaults(cfg), getFaults(),
                      // advanceClock(ms), resetClock(), simulateExternalUpdate(entityType, id, patch, actorPersonaId)  (web WF-02 "another actor")
   }
   ```
   **Extension rule:** app phases add domain services (e.g. `programmeActions`, `qualityIssues`, `accessGrants`, `exportAudits` for ADM) as new `services/*.ts` modules exposed on the same repository object, reusing the write pipeline (task 3), with tests in the shared contract suite. **Citizen facade:** CTZ-01 adds `createCitizenRepository(deps)` (export `@laif/repositories/citizen`) — a projection layer over the same `StoreAdapter`, pipeline, faults and audit — not a second storage implementation.
3. **Write pipeline** (every mutating method, in one `transaction`): (a) `checkAccess` → on deny write an `access`/`security` audit event with `outcome: 'denied'` and throw `FORBIDDEN` (WF-04.2); (b) Zod-parse input → `VALIDATION_ERROR` with field issues; (c) idempotency lookup — same key + same op + same payload hash → return stored result with `replayed: true`, no new change event, and one `sync.duplicate_suppressed` audit event (category `security`; evidence for BR-09 and ADM-06 "duplicates prevented"); same key + different payload → `VALIDATION_ERROR` reason `IDEMPOTENCY_KEY_REUSED`; (d) load entity, `assertVersion(expectedVersion)` → `CONFLICT` with `ConflictDetails` (`latest` entity included); (e) domain transition + invariants (`DomainInvariantError` → `VALIDATION_ERROR` with the invariant code); (f) bump `version`, set `updatedAt` from clock; (g) append `AuditEvent` with `beforeHash/afterHash`, `correlationId` (propagated from screening → review → referral → follow-up); (h) store idempotency record; (i) return `WriteResult`.
4. **Sensitive reads** (`getPatient`, `getReview`, `listAuditEvents`) append `category: 'access'` audit events (CL-08), de-duplicated per actor+entity per minute of demo clock to keep the log readable.
5. `createScreening`: evaluates with the active ruleset from store (`evaluateScreening`), sets status `review_required`/`no_review_required`, creates a `pending` Review in the same transaction when required. Uses the **ruleset stored with the dataset**, never a constant.
6. `decideReview` dismiss path creates no referral (WF-03.3). `transitionReferral('completed')` requires evidence (invariant). Reminders never change referral/follow-up status.
7. **Faults (`transport/faults.ts`)** — the single fault API every app's Settings/Demo tools drive (CLN-02, HWM-02 network simulation, ADM-09, CTZ-02): `FaultConfig = { latencyMs: [min, max]; timeoutRate: number /* applied after commit = "dropped ack" */; serverErrorRate: number; dependencyUnavailableRate: number; offline: boolean; conflictOnce: Array<{ entityType; entityId }> /* next write to each conflicts */; deviceRevoked: boolean }`, defaults `{ latencyMs: [150, 450], 0, 0, 0, false, [], false }`. UI toggle names in app phases map as: latency → `latencyMs`; timeout / drop-ack → `timeoutRate`; 500 / `error500` / `server_error` → `serverErrorRate`; unavailable → `dependencyUnavailableRate`; `conflict` / `conflict-next-write` / `conflict_next_write` → `conflictOnce`; revoked → `deviceRevoked`. Deterministic PRNG seeded per session. `withSimulatedTransport` wraps every method: sleeps latency; if `offline` → `OFFLINE`; random timeout → `TIMEOUT` **after** the inner write may have committed (models "did it save?"; idempotency makes the retry safe); random 500 → `INTERNAL` before write. Config persisted in store meta `demo.faults` so the toggle survives reload.
8. **Sync (`sync/*`)** for offline-first apps (HWM): local writes go to the local repository immediately (status shown as *Saved on this device*) **and** enqueue a `SyncOperation` (`localSeq` monotonic from meta counter, `clientMutationId`, `idempotencyKey`, `baseVersion`). `sync.process()` sends ops in `localSeq` order through the fault-injected transport to `createSimulatedRemote` (an independent authoritative copy in `remote_*` collections seeded identically). Remote dedupes by idempotency key (WF-02.2) and returns 409 on stale `baseVersion` (WF-02.3) → op `conflict → needs_resolution` with `serverSnapshot`. `sync.resolveConflict(opId, 'reapply_on_latest' | 'keep_latest', key, note?)` → original op `superseded`; `reapply_on_latest` enqueues a **new** op (new idempotency key, `resolvesOpId`, `baseVersion = latest.version`); `keep_latest` refreshes the local entity from `serverSnapshot` and keeps the withdrawn payload on the superseded op; audit `sync.conflict_resolved` with original op ID (WF-02.5). `sync.simulateRemoteEdit(entityType, id, patch)` lets a demo create a conflict ("another actor edited this", incl. reassignment → `FORBIDDEN` reason `TASK_REASSIGNED`). **This is the only sync design** — HWM-02 wires it into the worker app and HWM-09/10 build UI on it; there is no app-local outbox, mock server or second SQLite file. Rules shared with HWM: ops sent in `localSeq` order; an op with `dependsOnOpId` waits for that op's ack (e.g. screening after its pending `patient.register`); **chain rule** — after an ack, the next queued op on the same entity that was created against the just-acknowledged local version has its `baseVersion` rewritten to the acked `entityVersion`, while a remote change in between still yields `CONFLICT`; `VALIDATION_ERROR`/`FORBIDDEN` → `rejected` (kept); `deviceRevoked` → remote answers `FORBIDDEN` reason `DEVICE_REVOKED`, waiting ops → `blocked_revoked` until `restoreDevice()`; `process()` is single-flight (concurrent callers await the same run) and records a `syncRuns` row; on startup `sending` ops are reset to `queued` (crash recovery). Retry backoff: `min(60s, 2s·2^(attempt−1))` ± 20 % seeded jitter on the demo clock, auto-retry stops after 8 attempts (op stays `retryable_failure`, "Retry now" via `retryNow`). Never deletes an op.
9. **Demo API**: `resetDemo()` = `clearAll` + `bulkPut(sliceForApp(createSeed(), appId, personaId))` + full `createSeed()` into `remote_*` (worker only) + reset idempotency, sync queue, meta (`seedVersion`, `demoClockIso`, faults defaults) + one audit event `demo.reset`. `loadScenario(id)` = reset + `applyScenario` + set scenario clock. `getDemoState()` returns `{ seedVersion, datasetHash, scenarioId, clockIso, pendingSyncCount }`. Bootstrap: `ensureSeeded()` seeds on first run only (meta `seedVersion` absent).
10. `RepositoryDeps = { store: StoreAdapter; clock: Clock; ids: IdGenerator; getActor: () => ActorContext | null; appId: AppId; ruleset?: DemoRuleset }`.
11. `query-keys.ts`: hierarchical keys; mutations return the entity types whose queries to invalidate.
12. `runStoreAdapterContract(name, factory)`: ~25 cases (CRUD, transaction rollback on throw, meta, clearAll) — run against memory here, Dexie/SQLite in FND-08.

## 6. Data, state and audit

Reads/writes all entities. Audit actions (string constants in `audit/actions.ts` — the single registry; app phases append their app-specific actions here, prefixed with the app area such as `admin.programme_action.created` or `citizen.consent.granted`, while **cross-cutting actions always use the canonical names below**, never app-prefixed variants: `session.started`, `session.ended`, `session.expired`, `access.denied`, `export.requested`, `export.generated`, `export.denied`, `demo.reset`, `conflict.detected`, `conflict.resolved`, `sync.duplicate_suppressed`, `task.created`, `correction.requested`): `patient.viewed`, `review.viewed`, `patient.registered`, `screening.draft_saved`, `screening.submitted`, `screening.amended`, `review.started`, `review.decided`, `review.dismissed`, `referral.created`, `referral.transitioned`, `followup.created`, `followup.attempt_recorded`, `followup.outcome_recorded`, `followup.reassigned`, `task.created`, `task.updated`, `correction.requested`, `reminder.preference_changed`, `instruction.released`, `export.generated`, `access.denied`, `sync.op_acknowledged`, `sync.conflict_resolved`, `demo.reset`, `demo.scenario_loaded`, `session.started`, `session.ended`, `conflict.detected`, `conflict.resolved`, `sync.duplicate_suppressed`, `sync.op_rejected`, `device.revoked`, `device.restored`. Audit is append-only: no method updates or deletes `auditEvents` except `resetDemo`.

## 7. UX states

Error codes map 1:1 to UI states: `VALIDATION_ERROR` → validation, `FORBIDDEN` → permission denied, `CONFLICT` → stale/conflict, `OFFLINE` → offline, `TIMEOUT`/`INTERNAL`/`DEPENDENCY_UNAVAILABLE` → server error with retry (same idempotency key), `replayed: true` → success (no duplicate toast).

## 8. i18n

No UI strings. Audit `action` values are stable codes; UIs translate via `domain:audit.<action>` (keys added here to EN + RW).

## 9. Acceptance criteria

- [ ] Same `createScreening` input + key twice → one screening, one review, second result `replayed: true` (T-04).
- [ ] `decideReview` with `expectedVersion` one behind → `CONFLICT` with current entity; nothing written (T-05).
- [ ] District-Alpha analyst calling `getAggregateMetrics({ districtIds: [BETA] })` → `FORBIDDEN` and a denied audit event (WF-04, T-02).
- [ ] Dismissal without reason → `VALIDATION_ERROR`; with reason → review `dismissed_with_reason`, no referral, audit has actor + justification.
- [ ] `offline: true` → every call rejects `OFFLINE`; sync ops stay `queued`; after `offline: false` + `sync.process()` each op is acknowledged exactly once even if `process()` is called twice concurrently.
- [ ] Timeout-after-commit + retry with same key → exactly one record.
- [ ] `resetDemo()` → `datasetHash` equals fresh seed slice; audit log equals baseline + one `demo.reset`.
- [ ] Contract suite passes for the memory adapter.

## 10. Tests

`src/store/memory-adapter.test.ts` (runs contract suite), `src/services/*.test.ts` per service, `src/idempotency.test.ts`, `src/conflict.test.ts`, `src/scope.test.ts`, `src/audit.test.ts` (correlation chain WF-01.10), `src/transport/faults.test.ts`, `src/sync/sync-queue.test.ts` (WF-02 end-to-end), `src/demo/reset.test.ts`, `src/workflows/wf01.test.ts`, `src/workflows/wf03.test.ts`.

## 11. Verification

```bash
pnpm --filter @laif/repositories typecheck
pnpm vitest run --project @laif/repositories --coverage   # ≥ 90% lines in services/, sync/, idempotency.ts
pnpm verify
```

## 12. Commit

`feat(repositories): FND-07 care repository with audit, idempotency, optimistic versions, simulated faults and sync queue`
