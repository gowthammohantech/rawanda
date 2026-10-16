# FND-03 — @laif/contracts: Zod schemas, inputs, results and error codes

**Status:** Done

## 1. Header

| Field | Value |
|---|---|
| ID | FND-03 |
| Title | Contracts (Zod) |
| App | Shared (`packages/contracts`) |
| Depends on | FND-02 |
| Trace | Tech spec ADR-P08, §4 (write result shape, 409), §5.1; FRD §4 validation rules, §6 data contracts (error taxonomy, idempotency, ISO 8601); HW-04 |
| Size | M |

## 2. Goal

One set of runtime-validated schemas that every form, repository and import path uses, so that "what is a valid screening / decision / referral completion" is defined exactly once and produces **translation keys, not English sentences**, as validation messages.

## 3. Scope

**In scope:** entity schemas (aligned to `@laif/domain` types via `satisfies`), mutation input schemas, filter schemas, write-result and error envelope, error codes, validation-message key encoding, plausibility-limit-parametrised schema factories.

**Out of scope:** translating messages (FND-04), the scenario bundle schema (added in REL-01), form components.

## 4. Deliverables

```text
packages/contracts/src/
  primitives.ts      # IsoUtcString, IsoDate, UuidLike, NonEmptyTrimmed, Reason (min 10 chars), Version
  messages.ts        # vMsg(key, params?) encoder + parseValidationMessage + ValidationMessageKey union
  entities.ts        # PatientSchema, ScreeningSchema, ReviewSchema, ReferralSchema, FollowUpSchema, CareTaskSchema,
                     # ReminderSchema, ReminderPreferenceSchema, CareInstructionSchema, AuditEventSchema,
                     # FacilitySchema, DistrictSchema, DemoPersonaSchema, DemoRulesetSchema, SyncOperationSchema
  inputs.ts          # see task 3
  filters.ts         # PatientFilterSchema, ReviewFilterSchema, ReferralFilterSchema, FollowUpFilterSchema,
                     # TaskFilterSchema, AuditFilterSchema, MetricsFilterSchema, PageRequestSchema
  results.ts         # WriteResult<T>, Page<T>, ErrorCode, RepositoryErrorShape, ConflictDetails
  index.ts
```

## 5. Implementation tasks

1. Pin **Zod 4.x** (decision). Use `z.iso.datetime({ offset: true })` for timestamps; persisted values are normalised to UTC `Z` (`IsoUtcString` refine).
2. **Validation message encoding (`messages.ts`)**. All custom messages are i18n keys in namespace `validation`, optionally with params, encoded as `"validation:<key>|<json-params>"`:
   ```ts
   export const VALIDATION_KEYS = ['required','reasonTooShort','numberOutOfRange','integerRequired','unitRequired',
     'contextRequired','dateInFuture','dateTooOld','diastolicNotBelowSystolic','evidenceRequired','evidenceTypeRequired',
     'dueDateBeforeStart','invalidIdentifier','duplicateIdempotencyKey','consentWithdrawn','tooLong','invalidEnum'] as const;
   export function vMsg(key: ValidationMessageKey, params?: Record<string, string|number>): string;
   export function parseValidationMessage(msg: string): { key: ValidationMessageKey; params: Record<string, unknown> } | null;
   ```
   Set a Zod global error map (`z.config({ customError })`) exported as `installContractsErrorMap()` that maps built-in issue codes (`too_small`, `invalid_type`, `invalid_value` …) to `vMsg` keys so **no English Zod default ever reaches the UI**.
3. **Inputs (`inputs.ts`)** — all mutation inputs carry `idempotencyKey: string` (UUID) and, for updates, `expectedVersion: number`:
   - `createScreeningInputSchema({ limits: PlausibilityLimits, now: () => Date })` → `ScreeningInputSchema` (the `now` getter is the demo clock, so date checks stay deterministic): `patientId, measuredAt (not > clock now + 5 min, not older than 30 days ★), systolic, diastolic, glucoseValue|null, glucoseUnit (required when glucoseValue present → 'unitRequired'), glucoseContext (required when glucoseValue present), notes ≤ 500, captureDurationSeconds?`. Integer and range checks use `limits` (**data-entry plausibility, not clinical thresholds**; values supplied by mock-data config). Cross-field: `diastolic < systolic` → `diastolicNotBelowSystolic`.
   - `ScreeningDraftInputSchema` (same fields all optional except `patientId`).
   - `ScreeningAmendmentInputSchema` (`screeningId, expectedVersion, field: 'systolic'|'diastolic'|'glucoseValue'|'glucoseUnit'|'glucoseContext'|'measuredAt', after, reason: Reason`) — shared by CLN-04 and HWM-06.
   - `RegisterPatientInputSchema` (`givenName, familyName, dateOfBirth | estimatedAgeYears, sex: 'female'|'male'|'not_recorded', facilityId, localIdentifier?, matchDecision?: 'register_anyway_flagged'`) — HWM-04.
   - `StartReviewInputSchema` (`reviewId, expectedVersion, takeOverReason?: Reason`), `ReviewDecisionInputSchema` = discriminated union on `kind` (`REVIEW_DECISION_INPUT_KINDS`, FND-02), common `{ reviewId, expectedVersion, note? }`:
     `no_further_action { note: Reason }` | `refer { destinationFacilityId, referralReason: Reason, dueAt (> demo now), priority: ReviewPriority }` (creates Referral `created` atomically) | `request_repeat_screening { assignedWorkerId, dueAt, instructionsForWorker (5–300) }` (creates FollowUp `repeat_screening`) | `plan_follow_up { assignedWorkerId?, dueAt, note: Reason }` (creates FollowUp `planned_review`) | `dismiss { dismissReasonCode: DismissReasonCode, reason: Reason }` (creates nothing — WF-03). This is the single decision contract used by CLN-07; CLN-07's UI labels map 1:1 onto these kinds.
   - `ReferralInputSchema` (`reviewId, patientId, destinationFacilityId, dueAt, priority, assignedWorkerId?, referralReason: Reason`), `ReferralEditInputSchema` (`referralId, expectedVersion, destinationFacilityId?, dueAt?, changeReason: Reason`), `ReferralTransitionInputSchema` (discriminated on `to`, all with `referralId, expectedVersion`): `accepted { note? }` | `scheduled { appointmentAt }` | `completed { completedAt (≤ demo now), outcome: ReferralOutcome, evidenceType: ReferralEvidenceType, evidenceReference (3–100), note? }` | `cancelled_with_reason { cancelReasonCode, reason: Reason }`.
   - `FollowUpInputSchema` (create), `FollowUpUpdateInputSchema` discriminated on `action`, all with `followUpId, expectedVersion`: `assign { assignedWorkerId, dueAt }` | `reassign { assignedWorkerId, dueAt?, reason: Reason }` | `set_due_date { dueAt, reason: Reason }` | `record_attempt { at, method, result, note?, durationMinutes? }` | `record_outcome { outcome: FollowUpOutcome, occurredAt, evidenceType? (required for attended / repeat_screening_done / referred_onward), reasonCode? (required for unable_to_reach), note? }` | `add_note { note (3–500) }` | `confirm_completion {}` | `return_to_worker { reason: Reason }`. Shared by CLN-09 (clinician) and HWM-08 (worker); permissions decide which actions each role may send.
   - `CareTaskInputSchema`, `CareTaskUpdateInputSchema`, `CorrectionRequestInputSchema`, `CallbackRequestInputSchema`, `ReminderPreferenceInputSchema` (`optedIn, timing`), `ReleaseCareInstructionInputSchema`, `ExportRecordInputSchema` (`reasonCode, reasonText?, template, granularity, scope, filters, rowCount, suppressedCells, sha256`).
   - **Extension rule:** app phases add their own schemas to this package (CLN filters, `citizen/*` (CTZ-01), `programmeAction`, `dataQualityIssue`, `exportAudit`, `accessGrant`, `timeEntry` (ADM)), using these primitives and `vMsg`; new validation keys are appended to `VALIDATION_KEYS` (never English messages). Use `IsoUtcString` / `z.iso.datetime` (Zod 4), not the Zod 3 `z.string().datetime()` form shown in some app phases.
4. **Entity schemas** declared as `export const PatientSchema = z.object({...}) satisfies z.ZodType<Patient>;` so a drift between domain types and schemas is a compile error. All entities require `synthetic: z.literal(true)`.
5. **Results (`results.ts`)**:
   ```ts
   export const ERROR_CODES = ['VALIDATION_ERROR','FORBIDDEN','NOT_FOUND','CONFLICT','DEPENDENCY_UNAVAILABLE','TIMEOUT','OFFLINE','INTERNAL'] as const;
   export const HTTP_STATUS_BY_CODE = { VALIDATION_ERROR: 422, FORBIDDEN: 403, NOT_FOUND: 404, CONFLICT: 409,
     DEPENDENCY_UNAVAILABLE: 503, TIMEOUT: 504, OFFLINE: 0, INTERNAL: 500 } as const;
   export type WriteResult<T> = { data: T; eventId: string; entityVersion: number; updatedAt: string; auditEventId: string; replayed: boolean };
   export type ConflictDetails<T> = { entityType: string; entityId: string; expectedVersion: number; currentVersion: number; latest: T; changedBy?: string; changedAt?: string };
   export type Page<T> = { items: T[]; total: number; page: number; pageSize: number };
   export const ERROR_REASONS = ['ROLE','SCOPE','SESSION_REVOKED','DEVICE_REVOKED','TASK_REASSIGNED','WORKER_NOT_AUTHORISED',
     'CONSENT_REQUIRED','LAST_ADMIN','ALREADY_DECIDED','REFERRAL_ALREADY_OPEN','INVALID_TRANSITION','IDEMPOTENCY_KEY_REUSED',
     'DUPLICATE_OPEN_REQUEST'] as const;
   export type RepositoryErrorShape = { code: ErrorCode; status: number; reason?: ErrorReason;
     fieldErrors?: Record<string, ParsedValidationMessage>; conflict?: ConflictDetails<unknown> };
   ```
   The FRD taxonomy has 5 codes; `TIMEOUT`, `OFFLINE`, `INTERNAL` are added for the simulated transport (spec §4 latency/timeout/500/offline) — decision, documented in a header comment. **App-specific failure causes are `reason`s, never new codes** (e.g. HWM `DEVICE_REVOKED` / `TASK_REASSIGNED` → `FORBIDDEN` + reason; CTZ `CONSENT_REQUIRED` → `FORBIDDEN` + reason; CLN `ALREADY_DECIDED` / `REFERRAL_ALREADY_OPEN` → `CONFLICT` + reason; ADM `LAST_ADMIN` → `VALIDATION_ERROR` + reason). The thrown class is `RepositoryError` (FND-07); there is no separate `AppError`.
6. Export `safeParseToFieldErrors(schema, data): Record<string, ParsedValidationMessage>` helper for non-RHF callers (native forms).

## 6. Data, state and audit

No state. Enforces FRD §4: mandatory patient/facility/author/time/units/source; reason required for dismissal, override and amendment; completion requires timestamp + outcome + evidence type.

## 7. UX states

Supports the **validation error** state: every failure yields field path + translatable key + params. No UI.

## 8. i18n

Introduces the canonical list of `validation` namespace keys (`VALIDATION_KEYS`). FND-04 must provide EN + RW strings for every key; a test there imports `VALIDATION_KEYS`.

## 9. Acceptance criteria

- [x] `ScreeningInputSchema` rejects glucose value without unit with message `validation:unitRequired` (no English text).
- [x] Dismiss decision (`kind: 'dismiss'`) with reason `"ok"` fails with `validation:reasonTooShort|{"min":10}`; each of the five decision kinds has a valid and an invalid fixture.
- [x] Referral transition to `completed` without `evidence` fails with `validation:evidenceRequired`.
- [x] Changing a field type in `@laif/domain` `Patient` without updating `PatientSchema` fails `pnpm typecheck`.
- [x] After `installContractsErrorMap()`, parsing `{}` with any schema yields only messages that `parseValidationMessage` can decode.
- [x] Timestamps with `+02:00` offsets are accepted and normalised to `Z`.
- [x] Every entity schema rejects `synthetic: false`.

## 10. Tests

`src/messages.test.ts` (round-trip encode/parse), `src/inputs.screening.test.ts`, `src/inputs.review.test.ts`, `src/inputs.referral.test.ts`, `src/inputs.follow-up.test.ts`, `src/entities.test.ts` (parse a hand-written valid fixture per entity), `src/error-map.test.ts` (no English leakage: every message matches `/^validation:/`).

## 11. Verification

```bash
pnpm --filter @laif/contracts typecheck
pnpm vitest run --project @laif/contracts
pnpm verify
```

## 12. Commit

`feat(contracts): FND-03 zod entity and input schemas with translatable validation keys`
