# FND-06 — @laif/auth-demo (personas, roles, scope) and @laif/analytics (metrics, small-cell suppression)

**Status:** Done

## 1. Header

| Field | Value |
|---|---|
| ID | FND-06 |
| Title | Demo authorization + analytics calculators |
| App | Shared (`packages/auth-demo`, `packages/analytics`) |
| Depends on | FND-02, FND-05 |
| Trace | ADR-P10; tech spec §2.3 privacy, §6 WF-03/WF-04, §8 admin rows; BR-07, BR-08; CL-08, HW-01, PA-01..PA-08, CW-01/06 |
| Size | M |

## 2. Goal

A single, testable source for "who may do what, where" (labelled demo-only, not security) and for every programme number shown in the admin dashboard — computed from records, never typed in — with small cells suppressed before any number reaches a screen or CSV.

## 3. Scope

**In scope (auth-demo):** role → permission matrix, scope model, `checkAccess`, persona session store with injected storage, device session revocation helper, route-guard helper (framework-agnostic).
**In scope (analytics):** pure metric calculators over `SeedDataset`-shaped arrays, filters, small-cell primary + complementary suppression, aggregate CSV builder with watermark and scope metadata.

**Out of scope:** emitting audit events (FND-07 repository calls `checkAccess` and audits), charts (app tracks), patient-level exports (prohibited).

## 4. Deliverables

```text
packages/auth-demo/src/
  permissions.ts   # PERMISSIONS const, ROLE_PERMISSIONS matrix
  scope.ts         # Scope union, scopeForPersona, isResourceInScope
  check-access.ts  # checkAccess(actor, permission, resource) → AccessDecision
  session.ts       # createPersonaSession({ storage, appId }) → { current(), switchTo(id), signOut(), subscribe() }
  guards.ts        # requirePermission(actor, permission, resource?) throws ForbiddenError
  device.ts        # revokeDeviceSession(session) (HW-08 demo)
  index.ts
packages/analytics/src/
  filters.ts       # MetricsFilter apply: dateRange (Kigali calendar days), districtIds, facilityIds
  metrics/screening-overview.ts   # screeningOverview(data, filter)
  metrics/funnel.ts               # pathwayFunnel(data, filter)
  metrics/timeliness.ts           # timeliness(data, filter, now)
  metrics/workload.ts             # workerWorkload(data, filter)
  metrics/quality.ts              # dataQuality(data, filter)
  metrics/programme.ts            # getProgrammeMetrics(data, filter, now) → ProgrammeMetrics (all of the above)
  suppression.ts                  # suppressCells(table, threshold) ; SuppressedNumber
  csv.ts                          # toAggregateCsv(table, meta) ; CSV_WATERMARK
  index.ts
```

## 5. Implementation tasks

**auth-demo**
1. `PERMISSIONS` (the single permission vocabulary; app phases use these names — CLN-01 "capabilities" and ADM-01 `metrics:read`-style names map onto them 1:1): `patient.read`, `patient.register`, `screening.create`, `screening.amend`, `review.read`, `review.decide`, `referral.manage`, `referral.complete`, `followup.read_assigned`, `followup.update`, `task.assign`, `task.read`, `audit.read`, `audit.read_scoped`, `audit.export`, `metrics.read`, `metrics.drilldown`, `programme_action.write`, `quality.triage`, `export.aggregate`, `roles.configure`, `settings.privacy`, `self.read`, `self.reminders.manage`, `self.correction.request`, `demo.reset`, `demo.scenario.transfer`.
2. `ROLE_PERMISSIONS` (decision; documented as "demo matrix, requires approval"; PO decision list in `phases/CONSISTENCY_REVIEW.md`):
   - clinician → patient.read, screening.amend, review.read, review.decide, referral.manage, referral.complete, task.assign, task.read, audit.read (own facilities), followup.update.
   - nurse_reviewer → as clinician (authorised review privilege), minus `audit.export`.
   - facility_coordinator → as clinician minus `review.decide` and `screening.amend`, plus `audit.export` (CLN-10).
   - community_health_worker → patient.read/register, screening.create/amend, followup.read_assigned/update, task.read; field_supervisor → same as CHW, scope = assigned facilities (HWM-01).
   - programme_lead → metrics.read, metrics.drilldown, programme_action.write, quality.triage, export.aggregate, audit.read, roles.configure, settings.privacy.
   - district_analyst → metrics.read, metrics.drilldown, programme_action.write, quality.triage, export.aggregate, audit.read_scoped.
   - facility_manager → metrics.read, metrics.drilldown, quality.triage. auditor → metrics.read, audit.read (no drill-down, no writes).
   - citizen → self.*. All roles get `demo.reset`, `demo.scenario.transfer` (demo tooling, not a privilege).
   The ADM-01 capability table is this matrix restricted to admin roles; CLN-01 adds no permission names of its own.
3. `Scope = { kind: 'facility'; facilityIds } | { kind: 'district'; districtIds } | { kind: 'programme' } | { kind: 'self'; patientIds }` (`patientIds` covers a legal representative, CTZ-P4). When an `AccessGrant` exists for the persona (ADM-01/08), `scopeForPersona(persona, grant?)` derives the scope from the grant, so grant edits take effect on the next check. `isResourceInScope(scope, { facilityId?, districtId?, patientId?, assignedWorkerId? }, facilityToDistrict)`. CHW additionally limited to records assigned to them for `followup.*`.
4. `checkAccess(actor: ActorContext, permission, resource?) → { allowed: true } | { allowed: false; reason: 'ROLE' | 'SCOPE' | 'SESSION_REVOKED' }`. `ActorContext = { personaId, role, scope, deviceSessionId? }`.
5. `createPersonaSession({ storage: KeyValueStorage, appId, personas })` persists `laif.<appId>.persona`; `switchTo` validates the persona is allowed in that app (`persona.appIds`). Every UI using it must show the RoleBanner text "Demo role switch — not authentication" (enforced in ui components FND-09/10).

**analytics**
6. Every calculator signature: `(data: AnalyticsInput, filter: MetricsFilter, now: Date) => Result`. `AnalyticsInput = Pick<SeedDataset, 'patients'|'screenings'|'reviews'|'referrals'|'followUps'|'facilities'|'districts'>`. Outputs contain **only counts, rates and medians plus IDs of facilities/districts** — a type-level test asserts no `displayName`, `patientId` or `syntheticIdentifier` field exists in any result type (spec §5.1 "no patient names into analytics").
7. `pathwayFunnel`: stages `recorded` (submitted screenings) → `flagged` (review_required) → `reviewed` (action_recorded + dismissed) → `referred` (flagged screenings whose review is `action_recorded` with ≥1 non-cancelled referral **or** ≥1 follow-up — FRD `REFERRAL_OPEN | FOLLOW_UP_PLANNED`) → `completed` (of `referred`: a referral completed with evidence or a follow-up completed with outcome + evidence); `dismissed` reported **separately** (WF-03 step 4) and never counted as completed. Each stage carries `{ count, rateFromPrevious }`. These are the definitions ADM-03 builds on; ADM phases **extend these calculators in place** (cohort attribution, `pctOfRecorded`, `largestDrop`, group-by) rather than adding parallel `overview.ts` / `funnel.ts` / `timeliness.ts` / `workload.ts` / `quality.ts` files.
8. `timeliness`: median days screening.measuredAt → review.reviewedAt (Kigali calendar-agnostic, fractional days rounded to 1 dp), count of past-due referrals/follow-ups using FND-02 derive helpers; weekly trend buckets (ISO weeks in Kigali time).
9. `workerWorkload`: per worker (by persona ID, not name) assigned / completed / past-due follow-ups and summed `durationMinutes` + screening `captureDurationSeconds`; labelled "staff-time proxy (demo)".
10. `dataQuality`: missing glucose unit count, `possible_duplicate` identities, dismissed-after-flag count ("flags overturned at review"), amendments count.
11. **Suppression (`suppression.ts`)**: `type SuppressedNumber = { value: number | null; suppressed: boolean; reason?: 'PRIMARY' | 'COMPLEMENTARY' }`. Primary: `0 < value < threshold` → suppressed (decision: zero is shown). Complementary: if a row or column total is published and exactly one cell in that row/column is suppressed, also suppress the smallest remaining non-zero cell in it. `threshold` comes from `DEMO_SMALL_CELL_THRESHOLD` (mock-data config) and is overridable for tests. Rates whose numerator or denominator is suppressed are suppressed.
12. **CSV (`csv.ts`)**: `toAggregateCsv(table, meta)` → string — the **only** aggregate CSV builder (ADM-07 extends it; it does not add an app-local `csv.ts`). First line is always `# DEMONSTRATION — SYNTHETIC PATIENT DATA — NOT FOR CLINICAL USE` (`CSV_WATERMARK`), followed by machine-readable `# key=value` metadata lines (`export_id`, `generated_at` (Africa/Kigali), `generated_by_persona` + `role`, `scope_districts` / `scope_facilities`, `period`, `template` / `granularity`, `suppression_threshold`, `ruleset_versions`, `metric_version`, `reason_code`). Suppressed cells are empty with `suppressed=true`. RFC 4180 quoting; exported low-level helpers `escapeCsvCell` (CSV-injection guard) and `toCsvRows` are reused by CLN-10's audit export (which is not aggregate and therefore does not go through the denylist). No patient-level columns accepted (runtime guard throws on keys in a denylist). ADM-07 adds BOM, trailer checksum and `assertAggregateOnly`.

## 6. Data, state and audit

auth-demo persists the selected persona per app. analytics is read-only and pure. Invariants: cross-district resource → `SCOPE` denial; dismissed ≠ completed; suppressed values never leak via totals.

## 7. UX states

Provides the decision that drives **permission denied** states; analytics outputs `suppressed` flags so UIs render a "Suppressed (<5)" chip instead of a number. Empty filter results produce zero counts (not errors).

## 8. i18n

Adds `domain:permission.<name>`, `domain:role.<role>` (if not already), `admin:metric.<name>.label|description`, `demo:roleSwitchDisclaimer`, `common:suppressed` = "Suppressed (<{{threshold}})". CSV header row labels are produced in EN only — decision: exports are English for data portability; the watermark line is bilingual (`… / AMAKURU Y'IGERAGEZA …`, RW marked for review).

## 9. Acceptance criteria

- [x] `checkAccess(analystAlpha, 'metrics.read', { districtId: BETA })` → `{ allowed: false, reason: 'SCOPE' }` (SCN-11).
- [x] Citizen persona cannot read another patient (`SCOPE`).
- [x] CHW cannot `review.decide` (`ROLE`).
- [x] On the baseline seed, `pathwayFunnel` totals equal independently computed values (recorded 57, flagged 20, reviewed 15, dismissed 3; `referred` = 12 (11 refer + 1 plan_follow_up); `completed` asserted against a naive filter over the seed).
- [x] The full role × permission matrix (10 roles) is table-tested; `scripts/gen-permissions-matrix.ts` (REL-05) reads it.
- [x] SCN-12 cell renders suppressed; its complementary cell is also suppressed when a total is shown.
- [x] CSV starts with the watermark line and contains no denylisted column (`displayName`, `patientId`, `syntheticIdentifier`, `dateOfBirth`).
- [x] All metrics are deterministic given the demo clock.

## 10. Tests

`packages/auth-demo/src/{check-access,scope,session,guards}.test.ts` (full matrix table test), `packages/analytics/src/metrics/*.test.ts`, `packages/analytics/src/suppression.test.ts` (primary, complementary, zero, rates), `packages/analytics/src/csv.test.ts`, `packages/analytics/src/no-pii.types.test.ts` (`expectTypeOf`).

## 11. Verification

```bash
pnpm --filter @laif/auth-demo --filter @laif/analytics typecheck
pnpm vitest run --project @laif/auth-demo --project @laif/analytics
pnpm verify
```

## 12. Commit

`feat(auth-demo,analytics): FND-06 demo role/scope checks and deterministic metrics with small-cell suppression`
