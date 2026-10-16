# 02 — Health Worker Mobile (HWM) phase index

App: `apps/worker-mobile` — Expo (React Native) + Expo Router, `expo-sqlite`, pinned Expo SDK (from FND), isolated dataset (README D2/D3).
Package `@laif/worker-mobile` (FND-11). Personas: `persona-chw-alpha1-a` (default), `persona-chw-alpha1-b`, `persona-chw-alpha2-a`, `persona-chw-beta1-a`, `persona-sup-alpha` (field supervisor) — FND-05. Demo clock `2026-10-14T06:00:00.000Z`. Tests run under Vitest (FND-10), not jest-expo; device flows under Maestro (`test:maestro` script, FND-11).

**Sync model (reconciled — one design).** There is no server and no app-local sync stack. "Sync" is the FND-07 sync queue sending `SyncOperation`s through the fault-injected transport to the FND-07 **simulated remote** (`remote_*` collections in the same `laif-worker.db`), always labelled `SIMULATION` / "Simulated sync server" in the UI. It applies idempotency-key dedupe, optimistic version checks (`CONFLICT` + `latest`), remote scope checks (`FORBIDDEN`), and configurable latency / failures / dropped acks / injected remote edits / device revocation (FND-07 `FaultConfig`). Production upgrade path: replace the simulated transport with HTTP; nothing else changes.

**Write path (every phase).** A FND-07 repository write stores entity + sync op (`localSeq`, idempotency key = op ID, `baseVersion`) + audit event in **one store transaction before any network attempt**. UI shows **Saved on this device** until acknowledged, then **Synced**.

**Term mapping (binding).** Phase files HWM-01 and HWM-03…10 were written before reconciliation and still use logical SQL-style names; read them through this table. No HWM phase creates SQL tables, migrations or a second database file.

| Name in HWM phase text | Actual implementation (FND) |
|---|---|
| `outbox_ops`, `outbox.enqueue`, `seq`, `base_version`, `depends_on_op_id`, `resolves_op_id` | `syncOperations` collection, written implicitly by repository mutations; `localSeq`, `baseVersion`, `dependsOnOpId`, `resolvesOpId` (FND-02/07) |
| `MockSyncServer`, `MockSyncTransport`, `laif-worker-mockserver.db`, "server DB" | FND-07 simulated remote (`remote_*` in `laif-worker.db`) behind `withSimulatedTransport` |
| `engine.drainOnce(trigger)`, `recoverInFlight()` | `repo.sync.process({ trigger })` (single-flight), startup recovery in FND-07 |
| `withTx(db, fn)` | `store.transaction(fn)` inside repository services |
| `patients`, `screenings`, `follow_ups` tables / SQL `WHERE facility_id = ?` | `repo.listPatients({ q, facilityIds })`, `repo.listScreenings`, `repo.listFollowUps({ assignedWorkerId })` — scope enforced in the repository |
| `screening_drafts`, `drafts.save/discard` | Screening records with `status: 'draft'` via `repo.saveScreeningDraft` / `repo.discardScreeningDraft` (never synced) |
| `screening_amendments` | `Screening.amendments[]` via `repo.amendScreening` (FND-03 input) |
| `contact_attempts`, `recordAttempt()`, `recordOutcome()` | `FollowUp.attempts[]` / `FollowUp.outcome` via `repo.updateFollowUp({ action: 'record_attempt' | 'record_outcome' })` |
| `audit_events`, `auditLocal()` | `auditEvents` via repository writes / `repo.recordAuditEvent` |
| `device_session`, `app_settings`, `local_counters` | `deviceSessions` collection + FND-06 `createPersonaSession`; store meta |
| `sync_runs` | `syncRuns` collection |
| `sync_state` column | derived `deriveSyncState(entityId, ops)` (FND-02) |
| HWM `FaultConfig` (`failureRate`, `dropAckRate`, `conflictOnce`, `revoked`) | FND-07 `FaultConfig` (`serverErrorRate`/`timeoutRate`/`dependencyUnavailableRate`, `timeoutRate`, `conflictOnce`, `deviceRevoked`) |
| `DEVICE_REVOKED`, `TASK_REASSIGNED`, `IDEMPOTENCY_KEY_REUSED` codes | FND-03 `FORBIDDEN` / `VALIDATION_ERROR` with that `reason` |
| conflict choices "Re-apply my update" / "Keep the latest" | `repo.sync.resolveConflict(opId, 'reapply_on_latest' | 'keep_latest', key, note?)` |
| `migrations/0001_session.ts`, `0002_worker_core.ts`, `PRAGMA user_version` | none (FND-08 single-table store) |

## Phases

| ID | File | Goal | Depends on | Size |
|---|---|---|---|---|
| HWM-01 | `HWM-01-shell-navigation-device-sign-in.md` | Route groups, 5-tab shell (Today · Find · Screen · Tasks · Sync), demo persona sign-in, district/facility scope, device ID, Settings basics | FND-11 (+ FND-06, FND-07, FND-10) | M |
| HWM-02 | `HWM-02-local-store-outbox-mock-sync-endpoint.md` | Wire the FND-07 sync queue + simulated remote into the worker app (scoped seed, sync hooks, rule check), Network simulation screen | HWM-01, FND-07, FND-08 | M |
| HWM-03 | `HWM-03-home-today-worklist.md` | Today screen: derived overdue / due today / completed, next follow-ups, drafts, sync status strip | HWM-02 | M |
| HWM-04 | `HWM-04-find-and-register-patient.md` | Cached facility-scoped search, patient context, offline synthetic registration with uncertain-match flag | HWM-02 | M |
| HWM-05 | `HWM-05-screening-form-drafts-validation.md` | BP + glucose (unit + context required) form, SQLite draft autosave that survives app kill, translated plausibility validation | HWM-04 | L |
| HWM-06 | `HWM-06-screening-review-submit-amend.md` | Review with illustrative explainable demo flag, atomic offline-first submit, Synced status, amendment with reason | HWM-05 | M |
| HWM-07 | `HWM-07-my-tasks-and-task-detail.md` | Tasks tab Due / Overdue / Completed with counts, task detail with patient context and attempt timeline | HWM-03 | M |
| HWM-08 | `HWM-08-follow-up-outcome-capture.md` | Contact attempts and outcomes (attended, referred onward, unable to reach) with evidence, versioned writes | HWM-07 | M |
| HWM-09 | `HWM-09-sync-center-retries-conflicts.md` | Sync center, backoff, duplicate-tap coalescing, local-vs-latest conflict screen with audited explicit resolution | HWM-06, HWM-08 | L |
| HWM-10 | `HWM-10-settings-revocation-privacy-a11y.md` | Final Settings, Reset demo baseline, simulated device revocation, reassignment/clock-drift cases, privacy + a11y pass, Maestro suite | HWM-09 | M |

Build order: 01 → 02 → {03 → 07 → 08} and {04 → 05 → 06} (the two branches can be interleaved; one phase at a time) → 09 → 10.

## FRD coverage matrix (HW-01..HW-08)

| FRD | Requirement | Primary phase(s) | Supporting |
|---|---|---|---|
| HW-01 | Secure device login (simulated), device session, facility assignment | HWM-01 | HWM-10 (revocation, restore) |
| HW-02 | Patient lookup / register, uncertain-match flag | HWM-04 | HWM-02 (server scope) |
| HW-03 | Screening form: BP, glucose, units, context, timestamp, notes | HWM-05, HWM-06 | — |
| HW-04 | Local validation, no diagnosis | HWM-05 | HWM-06 (flag disclaimer), HWM-04, HWM-08 (form validation) |
| HW-05 | Offline drafts; pending / synced / conflict marking | HWM-02, HWM-05, HWM-06 | HWM-09 |
| HW-06 | Follow-up task list, attempts, due dates | HWM-07 | HWM-03 |
| HW-07 | Outcome capture with evidence and timestamp | HWM-08 | HWM-09 (conflicts) |
| HW-08 | Sync and recovery: idempotent retries, conflict resolution, device revocation | HWM-02, HWM-09 | HWM-10 |

## Tech spec §2.2 screen coverage

| Screen | Route(s) | Phase |
|---|---|---|
| Sign-in / role | `(auth)/sign-in`, `(auth)/scope` | HWM-01 |
| Home | `(app)/(tabs)/index` | HWM-03 |
| Find patient | `(app)/(tabs)/patients/index`, `(app)/patients/[patientId]`, `(app)/patients/register` | HWM-04 |
| New screening | `(app)/(tabs)/screen`, `(app)/screenings/new`, `(app)/screenings/draft/[draftId]` | HWM-05 |
| Screening review | `(app)/screenings/draft/[draftId]/review`, `(app)/screenings/[screeningId]`, `…/amend` | HWM-06 |
| My tasks | `(app)/(tabs)/tasks/index`, `(app)/tasks/[followUpId]` | HWM-07 |
| Follow-up outcome | `(app)/tasks/[followUpId]/attempt`, `…/outcome` | HWM-08 |
| Sync center | `(app)/(tabs)/sync/index`, `(app)/sync/[opId]`, `(app)/sync/conflicts/[opId]` | HWM-09 |
| Settings | `(app)/settings/index`, `…/network`, `…/activity`, `…/reset`, `/revoked` | HWM-01, HWM-02, HWM-10 |

## FRD test cases (§8) → phases

| Test | Where proven |
|---|---|
| T-01 Authorized happy path + audit | HWM-04, HWM-06, HWM-08 |
| T-02 Cross-facility access denied | HWM-01, HWM-04, HWM-07, HWM-02 (server) |
| T-03 Missing required clinical data | HWM-05, HWM-08 |
| T-04 Duplicate submission | HWM-02, HWM-06, HWM-08, HWM-09 |
| T-05 Concurrent update → conflict | HWM-08, HWM-09 |
| T-06 Correction keeps original | HWM-06 |
| T-07 Unavailable integration, no fabricated identity | HWM-04 |
| T-08 Aggregated export | N/A for worker app (Programme Admin) |
| T-09 Interrupted network/session | HWM-02, HWM-05, HWM-08, HWM-10 |
| T-10 Flag explanation (rule version + inputs) | HWM-06 |

Tech spec §8 worker rows: save offline survives restart (HWM-06, Maestro `offline-save-restart`), exactly one screening per idempotency key after reconnect (HWM-02/09, `duplicate-submission`), conflict with no lost data + logged resolution (HWM-09, `conflict-resolution`).

## Shared-package work raised by this track

Reconciled: FND now delivers `SummaryStrip`, `ListRow` (= `ListRowCard`), `NumberField` (= `NumericUnitField`), `SegmentedControl`, `TabbedFilter`, `ExplainableFlag`, `ReadingDisplay`, `ConflictCard` (= `CompareTable`) in `@laif/ui-native` (FND-10); `DEMO_PLAUSIBILITY_LIMITS` (FND-05, not a new `DEMO_ENTRY_PLAUSIBILITY`), `COMPLETION_EVIDENCE_TYPES` / `WORKER_EVIDENCE_TYPES`, `UNABLE_TO_REACH_REASONS`, `CONTACT_METHODS` (FND-02); `FollowUpUpdateInputSchema` record_attempt / record_outcome (FND-03, replaces `ContactAttemptInput` / `FollowUpOutcomeInput`); sync rules incl. dependency ordering and chain rule (FND-07, no `applyOperation(envelope)`); `createTestSqliteExecutor` Node SQLite shim (FND-08). Still added here: `@laif/domain` `scorePatientMatch` + `DEMO_MATCH_THRESHOLD` (HWM-04); `@laif/i18n` `worker:*` keys and `validation` keys appended to `VALIDATION_KEYS`.

## Open questions for the product owner

Consolidated with the other tracks in `phases/CONSISTENCY_REVIEW.md` §3 (authoritative). Q2 is resolved by FND-02 `GLUCOSE_CONTEXTS` (`not_recorded` is an explicit choice, reason `GLUCOSE_CONTEXT_NOT_RECORDED`); Q11 by FND-05/06 (`persona-sup-alpha`, CHW permissions over two facilities).

1. **Local encryption.** PRD HW-05 says "encrypt locally" and the old prototype claims encryption, but `expo-sqlite` in Expo Go is not encrypted (SQLCipher needs a dev build). The plan does **not** claim encryption in the UI. Accept, or require a dev build with SQLCipher?
2. **Glucose context "Not recorded".** FRD §4 makes context mandatory, but the prototype offers "Not recorded". The plan allows it as an explicit choice and shows reason `CONTEXT_NOT_RECORDED`. Should it be blocked instead?
3. **Plausibility ranges and the 7-day back-dating limit** are placeholders. Who signs off on them, and are repeat BP readings required?
4. **"Referred" outcome meaning.** The plan treats it as "directed to the clinician-set destination". It moves the task to `contacted` and does not complete the referral. Confirm that workers never complete or create referrals.
5. **Evidence types** for completion (facility register, appointment card, accompanied visit, verbal confirmation) are demo values. Is a patient's verbal confirmation acceptable evidence?
6. **Unable to reach.** How many failed attempts are needed, and who reassigns (supervisor or clinician)?
7. **Lost or revoked device.** The demo keeps pending data and does not send it. Production could remote-wipe or upload first. Policy needed (PRD §10, BRD open decisions).
8. **Task reassigned while offline.** The plan rejects the outcome and keeps it on the device (`TASK_REASSIGNED`). Should it go to the new assignee or the clinician as information instead?
9. **Uncertain patient match.** The 0.75 score threshold and the "register anyway and flag" path are placeholders. Who resolves `needs_match_review` records? The Clinical app is isolated under D3.
10. **Background sync** while the app is closed is not planned; sync runs only in the foreground. Acceptable for the demo?
11. **Supervisor persona** capabilities beyond picking a facility (for example, viewing other workers' tasks) are not specified. The plan gives supervisors the same worker scope.
12. **Kinyarwanda copy** is draft and needs linguistic and clinical review. Who signs off, and are clinical terms such as "fasting" and "blood pressure" fixed?
13. `Implementation_notes.md` contains only the EN⇄RW P0 line, so the plan relies on README + tech spec for the rest.
