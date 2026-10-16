# FND-05 — @laif/mock-data: deterministic synthetic seed and 12 named scenarios

**Status:** Done

## 1. Header

| Field | Value |
|---|---|
| ID | FND-05 |
| Title | Deterministic seed + scenarios |
| App | Shared (`packages/mock-data`) |
| Depends on | FND-02, FND-03 |
| Trace | Tech spec §10, §5.3 (externally configured DEMO thresholds), §11; README D3 + non-negotiables; WF-01..WF-04 |
| Size | L |

## 2. Goal

Every app can build the exact same fictional dataset from one function call — same IDs, same timestamps, same KPI results on every machine — and can jump to any of the 12 named demo scenarios. The demo ruleset, data-entry plausibility limits and small-cell threshold live here as **external configuration**, visibly labelled as not clinically validated.

## 3. Scope

**In scope:** seeded PRNG; reference data (districts, facilities, personas); seed generator meeting §10 counts exactly; demo ruleset + plausibility config; scenario registry with setup functions; per-app seed slices; dataset hash snapshot.

**Out of scope:** persisting the seed (FND-07/08), role/permission logic (FND-06), UI for choosing scenarios (app tracks).

## 4. Deliverables

```text
packages/mock-data/src/
  prng.ts                 # mulberry32(seed), pick, int, shuffle — no Math.random
  ids.ts                  # deterministicUuid(namespace, n) → stable UUID-shaped strings
  names.ts                # invented given/family name syllable lists (curated, fictional)
  reference/districts.ts  # DISTRICTS: 'Demo District Alpha', 'Demo District Beta'
  reference/facilities.ts # FACILITIES: 'Demo Health Centre Alpha-1', 'Demo Health Centre Alpha-2', 'Demo District Hospital Beta-1'
  reference/personas.ts   # DEMO_PERSONAS (see task 3)
  config/demo-ruleset.ts  # DEMO_RULESET_V1 (label DEMO_RULE_NOT_CLINICALLY_VALIDATED)
  config/plausibility.ts  # DEMO_PLAUSIBILITY_LIMITS (data-entry ranges, not clinical)
  config/privacy.ts       # DEMO_SMALL_CELL_THRESHOLD = 5
  seed/generate.ts        # createSeed(options?): SeedDataset
  seed/types.ts           # SeedDataset = { meta, districts, facilities, personas, patients, screenings, reviews, referrals,
                          #   followUps, careTasks, reminders, reminderPreferences, careInstructions, auditEvents, rulesets, syncOperations: [] }
  scenarios/registry.ts   # SCENARIOS: ScenarioDefinition[]; getScenario(id); applyScenario(seed, id)
  slices.ts               # sliceForApp(seed, appId, personaId?) → app-owned subset (D3)
  hash.ts                 # datasetHash(seed) via domain fnv1a64Hex(canonicalJson)
  index.ts
```

## 5. Implementation tasks

1. `createSeed({ seed = 20261016, nowIso = DEMO_CLOCK_DEFAULT_ISO } = {})`. Pure; uses only `prng.ts`; all timestamps computed as offsets from `nowIso` (range −60 days … +14 days). `meta = { seedVersion: 'seed-v1', seed, demoClockIso, generatedFor: 'SYNTHETIC DEMONSTRATION DATA — NOT FOR CLINICAL USE' }`.
2. **Reference data** (decision — fictional and self-describing): District Alpha (facilities Alpha-1, Alpha-2), District Beta (facility Beta-1). Every name includes "Demo". Export stable IDs as `SEED_IDS = { districts: { alpha, beta }, facilities: { alpha1, alpha2, beta1 } }`. **Naming in app phases:** CLN/ADM phase text that says "District A / B", "Facility A1 / A2 / B1" means District Alpha / Beta and facilities Alpha-1 / Alpha-2 / Beta-1. Patient display names are two invented names composed from curated syllable lists in `names.ts` (reviewed so they are not common real Rwandan names), and every `syntheticIdentifier` is `DEMO-P-0001`…; the existing prototype's realistic names (e.g. in `PrototypeFourApplications-main/src/App.tsx`) must **not** be reused. Example names written in app phases (e.g. "Marie U.", "Noël H.", "Aline", "Dr. Diane N.") are placeholders only — UI and tests use the generated names and the persona IDs below.
3. **Personas (`DEMO_PERSONAS`)** — stable IDs used by all apps and tests (each persona carries `appIds` and, for staff, a pseudonymous `workerCode` such as `HW-014`):
   | id | role | scope | apps |
   |---|---|---|---|
   | `persona-clin-alpha1` | clinician | facility Alpha-1 | clinical |
   | `persona-nurse-alpha2` | nurse_reviewer | facility Alpha-2 | clinical |
   | `persona-coord-alpha` | facility_coordinator | facilities Alpha-1, Alpha-2 | clinical |
   | `persona-clin-beta1` | clinician | facility Beta-1 (WF-04 counterpart) | clinical |
   | `persona-chw-alpha1-a`, `persona-chw-alpha1-b`, `persona-chw-alpha2-a`, `persona-chw-beta1-a` | community_health_worker | own facility | worker |
   | `persona-sup-alpha` | field_supervisor | facilities Alpha-1, Alpha-2 (picks one at sign-in, HWM-01) | worker |
   | `persona-lead-programme` | programme_lead | programme-wide | admin |
   | `persona-analyst-alpha` | district_analyst | district Alpha (WF-04 actor) | admin |
   | `persona-fmgr-alpha1` | facility_manager | facility Alpha-1 | admin |
   | `persona-auditor-programme` | auditor | programme-wide, read-only governance | admin |
   | `persona-citizen-1` (CTZ-P1) | citizen | self | citizen |
   | `persona-citizen-2` (CTZ-P2) | citizen | self | citizen |
   | `persona-citizen-withdrawn` (CTZ-P3) | citizen | self, consent withdrawn | citizen |
   | `persona-citizen-rep` (CTZ-P4) | citizen | legal representative of one linked patient (not self) | citizen |
   | `persona-citizen-pending` (CTZ-P5) | citizen | enrollment pending verification (no linked record until verified) | citizen |
   ADM-01 adds one `AccessGrant` per admin persona (seeded as part of the admin overlay, see task 8).
4. **Exact counts (asserted by test):** 48 patients (Alpha-1: 18, Alpha-2: 14, Beta-1: 16); 3 facilities; 2 districts; **60 screenings** (20 `review_required`, 37 `no_review_required`, 3 `draft`); **20 reviews** (4 `pending`, 1 `in_review`, 12 `action_recorded`, 3 `dismissed_with_reason`); action kinds: 11 `refer`, 1 `plan_follow_up`; **12 referrals** (2 `created`, 2 `accepted`, 3 `scheduled` of which 1 past due, 4 `completed` with evidence, 1 `cancelled_with_reason` followed by a replacement referral on the same review); **18 follow-ups** (11 `referral_attendance`, one per non-cancelled referral; 1 `planned_review` from the `plan_follow_up` decision; 6 `post_referral_check` attached to completed/scheduled referrals) with statuses 5 `assigned` (2 past due), 3 `contacted`, 6 `completed`, 2 `unable_to_reach`, 2 `reassigned`. Builders may re-balance *which* record has which status, but the totals above are fixed and asserted.
   ★ Note: there is no seeded `request_repeat_screening` decision; that path is exercised live in CLN tracks.
5. Additional seeded records: 6 care tasks (2 `correction_request` incl. one from `persona-citizen-1`, 2 `follow_up_assignment`, 1 `programme_action`, 1 `data_quality`), reminder preferences for every patient with a citizen persona, 8 reminders (incl. 1 `cancelled`/`opted_out` for `persona-citizen-2`, 2 `cancelled`/`consent_withdrawn` for the consent-withdrawn patient, 2 `delivered_simulated` (1 `acknowledged`) and 1 `scheduled` for `persona-citizen-1`), 6 released `careInstructions` + 1 `withdrawn` (CTZ-P2), 2 patients with `identityStatus: 'possible_duplicate'` referencing each other, one submitted screening with one amendment (original retained), one follow-up `completed` by a worker with `clinicianConfirmation.status: 'pending'`, attempt `durationMinutes` on all attempts (workload metrics), and a baseline audit trail (one `change` event per seeded transition, correlation IDs linking screening → review → referral → follow-up).
5a. **Named anchors (`src/anchors.ts`, `SEED_ANCHORS`)** — stable record IDs that app phases and E2E specs reference instead of building their own seeds (replaces CLN-02 `buildClinicalSeed` / `CLINICAL_SCENARIO_IDS` and CTZ-01 `citizenScenarioSeed`): `WF01_FLAGGED_REVIEW` (Alpha-1, pending, assigned to `persona-clin-alpha1`, BP+glucose with units; same record as SCN-02), `WF01_WORKER_COMPLETED_FU` (confirmation pending), `WF02_FOLLOWUP_CONFLICT` (open follow-up, version 3, used by `demo.simulateExternalUpdate` on web and SCN-09 on worker), `WF03_DISMISSABLE_FLAG` (pending review whose evidence includes a repeat reading), `WF04_OTHER_FACILITY_PATIENT` (Beta-1 patient + review), `MISSING_UNIT_SCREENING` (= SCN-06), `DUPLICATE_IDENTITY_PAIR`, `AMENDED_SCREENING`, `OVERDUE_REFERRAL` (= SCN-04), `CANCELLED_REFERRAL`, `COMPLETED_REFERRAL_WITH_EVIDENCE`, `OVERDUE_FOLLOWUP`, `UNABLE_TO_REACH_FOLLOWUP`, `CTZ_P1_UNRELEASED_REFERRAL` (referral `created` with **no** released instruction — must never reach the wallet), `CTZ_P2_DISMISSED_SCREENING`, `CTZ_P2_AWAITING_REVIEW_SCREENING`, `CTZ_P4_REPRESENTED_PATIENT`. Each anchor is asserted to exist and to be in the documented state.
6. **Demo ruleset (`config/demo-ruleset.ts`)** — the single ruleset version string used everywhere (CLN/ADM phase text saying `demo-0.4` means this; ADM's retired `demo-0.3` is `demo-ruleset-2026.07-v0`, added by the admin overlay only) — `DEMO_RULESET_V1 = { version: 'demo-ruleset-2026.10-v1', status: 'active', label: 'DEMO_RULE_NOT_CLINICALLY_VALIDATED', approvedBy: null, thresholds: {...}, plausibility: DEMO_PLAUSIBILITY_LIMITS }`. Threshold values are deliberately chosen illustrative placeholders, each property name prefixed `DEMO_` and the file header states: "Illustrative placeholders for software demonstration only. Not derived from, and must not be presented as, Rwanda-approved or international clinical guidance." ★ The exact numbers are a product-owner decision; until decided use the values in the PO decision list of `phases/00-foundation/INDEX.md`. Seeded screenings carry a **pre-computed** `flag` (spec §5.3 allows pre-labelled fixtures) and a test asserts `evaluateScreening(seededInput, DEMO_RULESET_V1)` agrees with the stored flag.
7. **Scenario registry** — `ScenarioDefinition = { id; titleKey; descriptionKey; apps: AppId[]; anchors: { patientId?; screeningId?; reviewId?; referralId?; followUpId?; personaId? }; clockIso?; setup?: (seed: SeedDataset) => SeedDataset }`. IDs and anchors:
   | id | what it guarantees |
   |---|---|
   | `SCN-01-normal-screening` | submitted screening, `no_review_required`, worker Alpha-1 |
   | `SCN-02-flagged-screening` | `review_required`, review `pending`, full explainable flag |
   | `SCN-03-clinician-dismissal` | review `dismissed_with_reason`, no referral, reason + actor in audit |
   | `SCN-04-overdue-referral` | referral `scheduled`, `dueAt` before demo clock |
   | `SCN-05-completed-follow-up` | follow-up `completed` with evidence + released care instruction |
   | `SCN-06-missing-unit` | one imported screening with `glucoseUnit: null` (flag `GLUCOSE_UNIT_MISSING`) + one worker draft missing unit |
   | `SCN-07-duplicate-submission` | `setup` queues two sync ops with the **same** idempotency key |
   | `SCN-08-offline-sync` | `setup` queues 2 offline screenings (`queued`) for `persona-chw-alpha1-a` |
   | `SCN-09-version-conflict` | `setup` puts a queued follow-up update with `baseVersion` one behind the stored version |
   | `SCN-10-consent-withdrawn` | patient with `consentState: 'withdrawn'`, reminders cancelled, citizen persona linked |
   | `SCN-11-unauthorized-district-access` | anchors `persona-analyst-alpha` + a District Beta route/resource |
   | `SCN-12-suppressed-small-aggregate` | a District Beta facility/metric cell with value 1–4 |
   `applyScenario(seed, id)` = `setup?.(structuredClone(seed)) ?? seed`.
8. **Slices (D3)**: `sliceForApp(seed, 'worker', personaId)` returns only patients/tasks in that worker's facility (the simulated remote in FND-07 is seeded with the **full** seed so cross-facility scope denial can be proven); `'citizen'` returns the records of the patients linked to the five citizen personas (each persona's view is still limited to its own/represented patient at runtime by `self` scope) **and only released care instructions**, plus the citizen overlay (`buildCitizenOverlay`, delivered in CTZ-01: accounts, patient links, consent records, verification state, access-event history, acknowledgements, settings); `'clinical'` gets the full seed; `'admin'` gets the full seed **plus** `buildAdminAnalyticsOverlay` (delivered in ADM-01: ≥ 12 weeks of history, retired ruleset, AccessGrants, TimeEntries). Overlays are deterministic, registered in `slices.ts`, and do not change the base-seed counts asserted in task 4. Records keep their IDs so REL-01 bundles can be merged.
9. `datasetHash(seed)`; commit the expected hash in `src/seed/seed.snapshot.ts` and a test comparing it (changing the generator requires consciously updating the hash).

## 6. Data, state and audit

Writes nothing at runtime; produces `SeedDataset`. Every record has `synthetic: true` and passes its contracts schema. Seeded states respect FND-02 machines (seed is generated by replaying legal transitions, not by assigning statuses directly).

## 7. UX states

Not applicable. Supplies data for empty (filters to zero rows), overdue, conflict and permission-denied demos.

## 8. i18n

Adds keys `demo:scenario.<id>.title` / `.description` for all 12 scenarios and `demo:entity.district.<id>` / `demo:entity.facility.<id>` (EN + RW). Patient names are not translated.

## 9. Acceptance criteria

- [x] `createSeed()` twice → deep-equal; `datasetHash` equals committed snapshot.
- [x] Counts in task 4 asserted exactly; ≥ 40 patients, 3 facilities, 2 districts.
- [x] Every record parses with its `@laif/contracts` schema.
- [x] Every non-draft seeded screening's stored `flag` equals `evaluateScreening(...)` with `DEMO_RULESET_V1`.
- [x] All 12 scenarios resolve; each anchor ID exists in `applyScenario(seed, id)`.
- [x] No `Math.random`, `Date.now` or `new Date()` without argument in `src/` (lint).
- [x] A privacy test scans all string fields for patterns of real identifiers (16-digit NIDA-like numbers, `+2507…` phone numbers) and fails if found.
- [x] `sliceForApp(seed,'citizen')` contains exactly the patients linked to the five citizen personas, no unreleased instructions and no record for `CTZ_P1_UNRELEASED_REFERRAL` as a care instruction.
- [x] Every `SEED_ANCHORS` entry exists in the documented state; every persona in task 3 exists with its role and scope.

## 10. Tests

`src/seed/counts.test.ts`, `src/seed/determinism.test.ts`, `src/seed/schema-validity.test.ts`, `src/seed/flags-consistent.test.ts`, `src/seed/transitions-legal.test.ts`, `src/scenarios/registry.test.ts`, `src/slices.test.ts`, `src/privacy.test.ts`.

## 11. Verification

```bash
pnpm --filter @laif/mock-data typecheck
pnpm vitest run --project @laif/mock-data
pnpm tsx -e "import {createSeed} from './packages/mock-data/src'; const s=createSeed(); console.log(s.patients.length, s.screenings.length, s.reviews.length, s.referrals.length, s.followUps.length)"
# expect: 48 60 20 12 18
pnpm verify
```

## 12. Commit

`feat(mock-data): FND-05 deterministic synthetic seed, demo ruleset config and 12 named scenarios`
