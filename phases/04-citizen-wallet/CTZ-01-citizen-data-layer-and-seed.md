# CTZ-01 — Citizen data layer, visibility rules and isolated seed

## 1. Header

| Field | Value |
|---|---|
| ID | CTZ-01 |
| Title | Citizen data layer, patient-visibility rules and isolated scenario seed |
| App | Citizen Health Wallet (`apps/citizen-wallet`) |
| Depends on | FND-11 (citizen Expo shell, SQLite `laif-citizen.db`), FND-05 (citizen personas `persona-citizen-1/-2/-withdrawn/-rep/-pending` = CTZ-P1…P5, `SEED_ANCHORS`, `sliceForApp('citizen')`), FND-07 (pipeline, faults, pre-registered citizen collections, extension rule), FND-08 (adapters, `createTestSqliteExecutor`) |
| Trace | CW-01..CW-08 (data foundation), FRD §4 (validation), §5 (audit fields), §6 (domain objects), Tech spec §5.1, §5.2, §10, WF-01 step 9, WF-03 step 5, WF-04 step 4 |
| Size | L |
| Status | Planned |

## 2. Goal

Give the wallet its own isolated, deterministic, persisted dataset (decision D3) and a typed `CitizenRepository` so every later screen reads and writes real SQLite records, not static mocks. The repository exposes only **patient-visible projections**: a screening is visible only once a clinician has released it, a next step only once a clinician has approved it, and a dismissed flag is never projected as a finding. No UI ships in this phase beyond wiring `Reset demo` to the new tables.

## 3. Scope

**In scope**
- Zod schemas for the eight FRD citizen objects: `CitizenAccount`, `PatientLink`, `IdentityVerification`, `ReleasedObservation`, `CareInstruction`, `NotificationPreference`, `Reminder`, `CorrectionRequest`, plus `ConsentRecord`, `CitizenAccessEvent`, `CareTask` (correction/support task), `NextStepAcknowledgement`, `CitizenSettings`.
- `CitizenRepository` interface + **one** implementation `createCitizenRepository(deps)` over the FND-07 `StoreAdapter` (so it runs on SQLite, Dexie (Expo web) and memory unchanged) — a projection/facade, not a second storage stack.
- Pure visibility selectors (the safety core of the wallet).
- Citizen overlay `buildCitizenOverlay(seed)` in `@laif/mock-data`, registered in FND-05 `sliceForApp(seed, 'citizen')`.
- Audit/access event writer that conforms to the FRD §5 audit field list.

**Out of scope**
- Any screen (CTZ-02 onwards); notifications adapter (CTZ-05); cross-app import/export (REL track).
- Live clinical decisions: the wallet never creates reviews, referrals or flags. It only reads seeded clinician-side records.

## 4. Deliverables

- `packages/contracts/src/citizen/*.ts` — schemas + inferred types; `index.ts` re-export. **Shared-package task.**
- `packages/repositories/src/citizen/CitizenRepository.ts` (interface) + `create-citizen-repository.ts` (facade over FND-07 store + write pipeline; export `@laif/repositories/citizen`). No SQL migration. **Shared-package task.**
- `packages/domain/src/citizen/visibility.ts` — `selectReleasedObservations`, `selectApprovedInstructions`, `toCitizenResultLabel` (uses FND-02 `deriveDatePassed`, `deriveInstructionProgress`). **Shared-package task.**
- `packages/mock-data/src/overlays/citizen.ts` — `buildCitizenOverlay(seed)` (accounts, patient links, consent records, verification state, access-event history, acks, settings) keyed to FND-05 personas and `SEED_ANCHORS`. **Shared-package task.**
- `packages/test-utils/src/citizen/` — `makeCitizenRepo()`, factories `aReleasedObservation()`, `anInstruction()`.
- `apps/citizen-wallet/src/data/repo.ts` — singleton provider + `CitizenRepoProvider` React context; `useCitizenRepo()`.
- `apps/citizen-wallet/src/data/queries.ts` — TanStack Query hooks keyed `['ctz', personaId, ...]` (TanStack Query is pinned for native apps in FND-11).

## 5. Implementation tasks

1. No migration API is needed (FND-08 single-table store). The citizen collections are pre-registered in FND-07 `COLLECTIONS`: `citizenAccounts`, `patientLinks`, `identityVerifications`, `consentRecords`, `nextStepAcks`, `citizenSettings`, `accessEvents`. Clinical-side data the wallet projects comes from the FND collections already on the device via `sliceForApp('citizen')`: `screenings` + `reviews` (→ released observations), `careInstructions` (status `released` only), `referrals` / `followUps` (→ instruction progress), `reminders`, `reminderPreferences`, `careTasks` (correction/callback requests, kinds `correction_request` / `callback_request`), `auditEvents`.
2. Logical model (the table names used in CTZ-02…09 text are these collections; read `ctz_*` as the mapping below):
   | Name in CTZ text | FND collection / derivation |
   |---|---|
   | `ctz_citizen_accounts` (`status: pending_verification|active|locked`) | `citizenAccounts` |
   | `ctz_patient_links` (`relationship: self|legal_representative`) | `patientLinks` (drives FND-06 `self` scope `patientIds`) |
   | `ctz_identity_verifications` | `identityVerifications` |
   | `ctz_consent_records` (append-only) | `consentRecords` (current state = latest; mirrored to `Patient.consentState`) |
   | `ctz_released_observations` (`review_state: released_follow_up|released_no_action|dismissed_with_reason|awaiting_review`) | **derived** from `screenings` + `reviews` by `selectReleasedObservations` (never stored twice); amended values via `effectiveReadings` |
   | `ctz_care_instructions` (`approval_state`, `status`) | `careInstructions` with FND `status: 'released'` (= "approved"; drafts never reach the device) + progress from `deriveInstructionProgress` (`planned|completed|cancelled`) |
   | `ctz_next_step_acks` | `nextStepAcks` |
   | `ctz_notification_prefs` | `reminderPreferences` (`optedIn`, `timing`, `channel: 'in_app'`) |
   | `ctz_reminders` | `reminders` (FND-02 statuses `scheduled|delivered_simulated|acknowledged|cancelled` + `cancelReason`) |
   | `ctz_correction_requests`, `ctz_care_tasks` | `careTasks` (`correction_request` with request status in payload; `callback_request`) |
   | `ctz_access_events` | `accessEvents` (citizen-visible projection) + `auditEvents` |
   | `ctz_settings` | `citizenSettings` (language mirrored to FND-04 storage) |
3. Implement `CitizenRepository` methods: `listPersonas`, `getSession`, `startSession`, `getConsent`, `recordConsent`, `listReleasedObservations(patientId)`, `getObservation(id, patientId)`, `listApprovedInstructions(patientId)`, `acknowledgeInstruction(input, key)`, `getNotificationPrefs`, `updateNotificationPrefs(input, expectedVersion, key)`, `listReminders`, `listTimeline(patientId)`, `listAccessEvents(patientId)`, `createCorrectionRequest(input, key)`, `listCorrectionRequests`, `createCallbackRequest(input, key)`, `getSettings`, `updateSettings`. Every read checks the active `patientLinks` record **and** current consent = granted, else throws `RepositoryError` `FORBIDDEN` with reason `SCOPE` or `CONSENT_REQUIRED` (FND-03) and writes `access.denied`.
4. Every write reuses the FND-07 write pipeline (one store transaction, idempotency replay, `expectedVersion` → `CONFLICT` with `latest`, audit with correlation ID) and returns FND-03 `WriteResult<T>`.
5. Wrap the facade with FND-07 `withSimulatedTransport` so the shared `FaultConfig` (`latencyMs`, `timeoutRate`, `serverErrorRate`, `dependencyUnavailableRate`, `conflictOnce`) drives error/retry states; CTZ toggle names `error500` / `unavailable` / `conflict-next-write` (FND-07 `conflictOnce`) map to these fields.
6. Visibility selectors in `@laif/domain/citizen/visibility.ts`:
   - `selectReleasedObservations` excludes `awaiting_review` values (returns a value-less `PendingReviewPlaceholder` instead).
   - `selectApprovedInstructions` returns only `approval_state = approved`.
   - `toCitizenResultLabel` maps `released_follow_up → 'followUpAgreed'`, `released_no_action → 'noActionNeeded'`, `dismissed_with_reason → 'reviewedNoActionNeeded'` (the original flag reason codes are never mapped to citizen copy).
   - `deriveDatePassed(appointmentAt, status, clock)` returns a boolean; it is never named or rendered as `overdue`.
7. Overlay `buildCitizenOverlay(seed)` (deterministic, FND PRNG, pinned demo clock `2026-10-14T06:00:00.000Z`) on top of FND-05 records and `SEED_ANCHORS` (display names come from FND-05 `names.ts`; "Marie U." etc. in these phase files are placeholders):
   - **CTZ-P1 `persona-citizen-1` (self, consent granted)**: reviewed BP+glucose result (released, follow-up agreed); one released appointment instruction (19 Oct 10:30 Kigali, after the demo clock); `CTZ_P1_UNRELEASED_REFERRAL` exists clinically but has **no** released instruction; one follow-up `completed` with evidence; reminder history from FND-05 (2 `delivered_simulated` (1 `acknowledged`), 1 `scheduled`); prefs opted-in `day_before`; one amended observation (CTZ-06).
   - **CTZ-P2 `persona-citizen-2`**: `CTZ_P2_DISMISSED_SCREENING`; `CTZ_P2_AWAITING_REVIEW_SCREENING`; one `withdrawn` instruction; reminders opted-out with 1 `cancelled` (`opted_out`).
   - **CTZ-P3 `persona-citizen-withdrawn`**: consent rows granted → withdrawn; data exists but is unreachable.
   - **CTZ-P4 `persona-citizen-rep`**: link `legal_representative` for `CTZ_P4_REPRESENTED_PATIENT` only (released no-action result + approved follow-up).
   - **CTZ-P5 `persona-citizen-pending`**: account `pending_verification`; demo verification code `246810`.
   - Access-event history: 6–10 synthetic clinician/worker read events per linked patient plus own views.
8. `Reset demo` = FND-07 `repo.demo.resetDemo()` (citizen slice incl. overlay, demo clock); nothing app-specific to wire.

## 6. Data, state and audit

- **Reads:** all `ctz_*` tables. **Writes:** consent, acks, prefs, reminders, corrections, tasks, settings, access events, audit.
- **Transitions:** consent `granted ⇄ withdrawn` (append-only); reminder `scheduled → delivered_simulated → acknowledged`, `scheduled → cancelled`; correction `submitted → in_review → resolved_*` (only staff side moves beyond `submitted`; seeded examples cover later states).
- **Invariants:** wallet user actions never mutate `ctz_released_observations` or `ctz_care_instructions` clinical fields (sole exception: the labelled `demo.simulateStaffConfirmation` Demo-tools action added in CTZ-09, audited as a synthetic clinician); unapproved instructions and `awaiting_review` values are unreachable through the repository API; replays return the original entity; stale `expectedVersion` → `CONFLICT`.
- **Audit/access events defined here (used by later phases):** `session.started`, `access.denied`, `citizen.consent.granted`, `citizen.consent.withdrawn`, `citizen.result.viewed`, `citizen.next_step.acknowledged`, `citizen.reminder.*`, `correction.requested`, `task.created`, `citizen.support.callback_requested`, `citizen.settings.changed`, `demo.reset`.

## 7. UX states

No screens. Repository returns typed error codes (`VALIDATION_ERROR`, `FORBIDDEN`, `CONSENT_REQUIRED`, `NOT_FOUND`, `CONFLICT`, `DEPENDENCY_UNAVAILABLE`) that later phases map to the shared `ErrorState`, `PermissionDenied` and `ConflictNotice` components.

## 8. i18n

- Create namespace files `packages/i18n/src/locales/{en,rw}/citizen/common.json` with error-code keys: `citizen.errors.forbidden`, `.consentRequired`, `.notFound`, `.conflict`, `.unavailable`, `.generic`.
- EN example: `"conflict": "This was changed somewhere else. We reloaded the latest version."`; RW draft: `"Ibi byahinduwe ahandi. Twazanye verisiyo iheruka."` — flag `needs linguistic review`.
- Seed stores `plain_text_key`s only (no free-text clinical copy) so all citizen-visible wording is translatable.

## 9. Acceptance criteria

- [ ] `ensureSeeded` / `resetDemo` on a clean SQLite DB produce the citizen collections idempotently; `apps/citizen-wallet` and `@laif/repositories` contain no `ctz_*` SQL.
- [ ] Seed produces exactly 5 personas with the states listed in task 7; deterministic IDs across runs.
- [ ] `listApprovedInstructions(<CTZ-P1 patient>)` returns the appointment and completed follow-up but never the draft referral.
- [ ] `listReleasedObservations(<CTZ-P2 patient>)` returns the dismissed screening as `reviewedNoActionNeeded` and the newer screening as a value-less placeholder.
- [ ] Any read for CTZ-P3's patient throws `FORBIDDEN`/`CONSENT_REQUIRED` and writes one `access.denied`.
- [ ] CTZ-P4 reading a patient outside its link throws `FORBIDDEN`, no data returned (T-02).
- [ ] Replaying `acknowledgeInstruction` with the same key returns the same ack ID; one row (T-04).
- [ ] Stale `expectedVersion` on prefs update throws `CONFLICT`; row unchanged (T-05).
- [ ] Reset restores identical row counts and hashes.

## 10. Tests

- `packages/domain/src/citizen/__tests__/visibility.test.ts`
- `packages/contracts/src/citizen/__tests__/schemas.test.ts` (required fields, units explicit, ISO timezone)
- `packages/repositories/src/citizen/__tests__/citizenRepository.test.ts` — run against memory and SQLite (`createTestSqliteExecutor`) adapters under Vitest.
- `packages/mock-data/src/overlays/__tests__/citizenOverlay.test.ts` — determinism + persona coverage assertions.

## 11. Verification

```bash
pnpm --filter @laif/contracts --filter @laif/domain --filter @laif/repositories --filter @laif/mock-data test
pnpm --filter @laif/citizen-wallet typecheck
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```
Manual (Expo Go via `pnpm dev:citizen`): app still boots to the FND shell; open FND `Reset demo`; no crash; demo state hash equals the citizen slice hash.

## 12. Commit

`feat(citizen): CTZ-01 citizen data layer, visibility rules and isolated seed`
