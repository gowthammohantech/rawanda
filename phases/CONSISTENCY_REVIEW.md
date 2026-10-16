# Cross-track consistency review

Date: 2026-10-16. Scope: all 55 phase files in `phases/` (FND 11, CLN 11, HWM 10, ADM 9, CTZ 9, REL 5), reconciled against `phases/README.md`, the FND phases, the tech spec and `docs/ref/LAIF_MOH.pdf`. Only Markdown under `phases/` was changed. No code was written.

Rule applied: FND is the source of truth for shared things. Where an app track's choice was better grounded in the PRD/FRD, FND was changed to adopt it (marked **FND adopted app choice** below), and the other tracks were pointed at the FND version.

## 1. Inconsistencies found and how each was resolved

32 inconsistencies were fixed.

| # | Topic | Conflict | Resolution |
|---|---|---|---|
| 1 | **Sync design (two designs)** | FND-07 had a sync queue plus a simulated remote in `remote_*` collections. HWM-02 had its own SQLite schema, outbox table, in-app `MockSyncServer` and a second DB file (`laif-worker-mockserver.db`). | One design: FND-07. HWM-02's rules were moved into FND-07: `dependsOnOpId`, the chain rule, single-flight runs, crash recovery, `syncRuns`, the `rejected` / `superseded` / `blocked_revoked` states, revocation, and backoff 2 s→60 s with 8 auto attempts. HWM-02 was rewritten to wire the FND design into the app. HWM INDEX has a binding term-mapping table. |
| 2 | Sync op states and conflict resolution | FND had `…needs_resolution→resolved|queued` with `keep_mine`/`take_theirs`. HWM-09, CLN-09 and REL-03 used re-apply/keep-latest with the original op superseded. | FND-02 statuses extended. `CONFLICT_RESOLUTIONS = reapply_on_latest | keep_latest` is used on web and native. Re-apply creates a new op with a new key (**FND adopted app choice**). |
| 3 | Review decision kinds | FND-02 had 4 kinds plus dismiss as a status. CLN-07 had 5 uppercase outcomes. | Mapped 1:1. `REVIEW_DECISION_INPUT_KINDS` = 4 kinds + `dismiss`. The FND-03 decision schema is now a 5-branch union with CLN-07's per-kind fields. CLN-07 consumes it and has no app schema. |
| 4 | Roles and personas | FND had `programme_analyst`/`programme_admin` and no supervisor. ADM used `programme_lead`/`district_analyst`/`facility_manager`/`auditor` with `adm-*` IDs. HWM used `field_supervisor`. CTZ had 5 personas against FND's 3. | FND-02/05 now have 10 roles (grounded in the PRD/FRD actor lists) and 18 personas: `persona-sup-alpha`, `persona-lead-programme`, `persona-fmgr-alpha1`, `persona-auditor-programme`, `persona-citizen-rep`, `persona-citizen-pending` (**FND adopted app choice**). ADM IDs were renamed. |
| 5 | Permission vocabulary | CLN-01 had its own `ClinicalCapability` (`queue.read`, `task.manage`, `demo.admin`, `authorisedReviewer` flag). ADM-01 had a colon-style matrix (`metrics:read`, `roles:configure`). | One FND-06 `PERMISSIONS` list plus a matrix for all 10 roles. Added `audit.export`, `audit.read_scoped`, `metrics.drilldown`, `programme_action.write`, `quality.triage`, `roles.configure`, `settings.privacy`, and `screening.amend` for clinicians. CLN and ADM map routes onto it. |
| 6 | Facility/district IDs | CLN used A1/A2/B1 and District A/B. ADM used District A/B and `SEED_IDS.districts.A`. | Replaced with Alpha-1/Alpha-2/Beta-1 and District Alpha/Beta. FND-05 exports `SEED_IDS` and records the alias. |
| 7 | Demo clock | CTZ pinned `2026-10-16T07:00Z`. FND pins `2026-10-14T06:00Z`. | CTZ moved to the FND clock. Sample dates that would have fallen after the clock (16/17 Oct) were moved back, and the 19 Oct weekday was corrected to Monday. |
| 8 | Seeds | CLN-02 had its own `buildClinicalSeed`/`CLINICAL_SCENARIO_IDS`. CTZ-01 had its own `citizenScenarioSeed`. ADM had an overlay outside the slice mechanism. | FND-05 now provides `SEED_ANCHORS` (all CLN anchors plus CTZ anchors) and registered `sliceForApp` overlays for admin (ADM-01) and citizen (CTZ-01). The citizen slice is the union of the 5 personas' patients. |
| 9 | Citizen data layer | CTZ-01 had a separate `CitizenRepository` with SQLite and memory implementations, 13 `ctz_*` SQL tables and a migration. | Replaced by a `createCitizenRepository` facade over the FND-07 store and pipeline. Citizen collections are pre-registered. A `ctz_*`→collection mapping table was added. Released observations and instruction progress are **derived**, not stored twice. |
| 10 | SQLite migration API | HWM-01/02 used `0001/0002` migrations with `PRAGMA user_version`. CTZ-01 assumed a "namespaced migration API". FND-08 has a single JSON `records` table. | FND-08 states there is no per-app migration API. FND-07 holds a `COLLECTIONS` registry that already includes admin and citizen collections, so the Dexie v1 schema is complete. |
| 11 | Repository method names/signatures | CLN-02 used `(input, key, expectedVersion?)` with actor passed in, `appendAudit`, `resetDemo(seedId)`, `simulateExternalUpdate`, `listWorkers`, `countReviews`. ADM used `seedAdminDatabase`. HWM used `auditLocal`. | FND-07 interface extended: `countReviews/Referrals/FollowUps`, `listWorkers`, `findPatientMatches`, `discardScreeningDraft`, `recordAuditEvent`, `sync.{process, retryNow, resolveConflict, revokeDevice, restoreDevice}`, `demo.{advanceClock, resetClock, simulateExternalUpdate}`. An extension rule was added. App phases now use `method(input, key)`, with the actor from deps. |
| 12 | WriteResult envelope | CLN-02 returned `{ entity, … }`; CTZ-01 returned `{ entity, entityVersion, auditEventId }`. | FND-03 `WriteResult<T>` (`data`, …, `replayed`) is used everywhere. |
| 13 | Error codes | HWM had `DEVICE_REVOKED`/`TASK_REASSIGNED`/`IDEMPOTENCY_KEY_REUSED`. CTZ had `CONSENT_REQUIRED`. CLN had `ALREADY_DECIDED`/`REFERRAL_ALREADY_OPEN`/`INVALID_TRANSITION`/`WORKER_NOT_AUTHORISED`. ADM had `LAST_ADMIN` and `AppError`. | FND-03 `ERROR_REASONS` on top of the 8 codes. `RepositoryError` is the only error class. |
| 14 | Conflict payload | FND had `ConflictDetails.current`; CLN, HWM and ADM used `latest`. | Renamed to `latest`, and `changedBy`/`changedAt` added (**FND adopted app choice**). |
| 15 | Fault simulation API | Four different toggle vocabularies: CLN (latency/timeout/500/offline/conflict), HWM (`failureRate`, `dropAckRate`, `conflictOnce`, `revoked`), ADM (`conflict_next_write`), CTZ (`error500`, `unavailable`, `conflict-next-write`); ADM also referenced a guessed `window.__laifRepo.faults`. | One FND-07 `FaultConfig` (`dependencyUnavailableRate`, `conflictOnce[]`, `deviceRevoked` added), with an explicit name mapping. Persisted in store meta. |
| 16 | Idempotent replay audit | ADM-06 counted `sync.duplicate_ignored` audit events. CLN-07 said replays emit no events. HWM used `sync.duplicate_suppressed`. | A replay emits no change event and exactly one `sync.duplicate_suppressed` event. CLN and ADM wording aligned. |
| 17 | Audit action names | `patient.read` vs `patient.viewed`; `auth.session_started`, `session.signed_in`, `citizen.session.started`, `admin.session.started`; `admin.access.denied`, `citizen.access.denied`, `session.scope_denied`; `admin.export.*`, `audit.exported`; `care_task.created`; `admin.demo.reset`. | FND-07 holds a single registry. Cross-cutting actions have canonical names (`session.*`, `access.denied`, `export.*`, `demo.reset`, `conflict.*`, `sync.duplicate_suppressed`, `task.created`, `correction.requested`, `*.viewed`). App-specific actions keep their app prefix. |
| 18 | Glucose context values | FND had `fasting|random|post_meal|unknown`. CLN, HWM and CTZ all used fasting / not fasting / not recorded. | FND-02 now uses `fasting|non_fasting|not_recorded`, thresholds are keyed accordingly, and the reason code is `GLUCOSE_CONTEXT_NOT_RECORDED` (**FND adopted app choice**). |
| 19 | Evidence types | FND, CLN-08, CLN-09, HWM-08 and CTZ-09 had five different lists. | One FND-02 list of 7, with `REFERRAL_EVIDENCE_TYPES` and `WORKER_EVIDENCE_TYPES` subsets. Follow-up outcomes add `repeat_screening_done`. Contact methods are FND's. |
| 20 | Worker completion vs clinician confirmation | HWM-08 recorded `attended` as completed. CLN-09 used `completionPendingConfirmation` plus return-to-worker. | FND-02 `FollowUp.clinicianConfirmation` (`pending|confirmed|returned`), plus a ★ transition `completed→contacted` only via `return_to_worker`. |
| 21 | Reminder states | FND had `sent_simulated` and `opted_out`. CTZ had `delivered_simulated` and `acknowledged`, with opt-out as a cancel reason. | FND adopted the CTZ states plus `REMINDER_CANCEL_REASONS` and a `timing` preference. |
| 22 | CareInstruction shape | CTZ had `approval_state` plus its own `status`. FND had `released|withdrawn`. | FND keeps `released` (= "approved"), adds `kind`/`appointmentAt`/`facilityId`, and derives progress with `deriveInstructionProgress`. Drafts never reach the device. |
| 23 | Review entity fields | CLN needed `assignedClinicianId`, urgency, `reviewDueAt`, evidence snapshot. ADM needed `origin = manual_escalation`. | Added to the FND-02 `Review`. CLN-05 now uses `review.priority === 'urgent_demo'`. |
| 24 | Amendments storage | CLN-04 used a separate `ScreeningAmendment` entity and projection. HWM-06 used a `screening_amendments` table. | FND `Screening.amendments[]` + `effectiveReadings`. One FND-03 input schema (`after`, `expectedVersion`). |
| 25 | Reason codes in UI | CLN-05 invented `BP_ABOVE_DEMO_THRESHOLD`/`REPEAT_ELEVATED_DEMO`; HWM used `domain.flags.*`. | Only FND-02 reason codes, displayed via `domain:reason.*`. |
| 26 | Ruleset versions | CLN/ADM used `demo-0.4`/`demo-0.3`. FND used `demo-ruleset-2026.10-v1`. | FND name used. The retired version is `demo-ruleset-2026.07-v0` (admin overlay only). FND-02 ruleset gains `status` and `requiredInputs`. |
| 27 | Plausibility limits | HWM-05 created `DEMO_ENTRY_PLAUSIBILITY` in domain with different ranges and a 7-day back-dating limit. | FND-05 `DEMO_PLAUSIBILITY_LIMITS` via FND-03 schema factory with 30 days. The difference is listed as a PO decision. |
| 28 | Package/script names | ADM/HWM "assumed" package names. FND-11 did not state them or `test:e2e`. HWM used `e2e:maestro`; CTZ used `e2e`; REL-03 used `test:e2e:device`. | FND-11 fixes package names, the per-web-app `test:e2e` (Playwright), and `test:maestro` for Expo apps. Root `test:e2e` / `test:maestro` go through turbo. Playwright is pinned in FND-11. |
| 29 | Playwright location | CLN/ADM put specs in `apps/*/e2e/`. REL-03 duplicated the same specs in a central package and filtered only `@laif/e2e`. | App suites stay in the apps. REL-03 reuses them, adds only cross-app and Expo-web specs, and runs all suites via turbo. Maestro flow names come from HWM-10/CTZ. |
| 30 | i18n API/paths/check script | Paths `catalogs/`, `catalogues/` and `locales/`. Keys written `clinical.queue.x`. Review metadata `needsReview`/`_review` per key. Scripts `check-catalogue` and `check:citizen`. | FND-04 convention: `<ns>:<area>.<key>`, area files `locales/<lng>/<ns>/<area>.json`, review flags only in `_review.json`, and a single `pnpm i18n:check [--ns] [--report] [--unused]`. |
| 31 | ui-web/ui-native components | HWM asked for 8 native components "if missing". CLN/ADM built their own conflict dialogs. Tech spec §7 lists `ExplainableFlag`/`ReadingDisplay` as shared. CTZ's `ConfirmDialog` does not exist on native. | FND-09 adds `ExplainableFlag`, `ReadingDisplay`, and a richer `ConflictNotice` (the single web conflict UI). FND-10 adds `ExplainableFlag`, `SummaryStrip`, `TabbedFilter`, `RadioCardGroup`, `CheckboxField`, and an enriched `ConflictCard`; HWM names were mapped. CTZ now uses `ConfirmSheet`. |
| 32 | Analytics duplication / test tooling / deps | ADM-02…07 created parallel `overview/funnel/timeliness/workload/quality.ts`, `applyComplementarySuppression`, `suppressSmallCells` and an app-local CSV builder, all already in FND-06. The funnel `referred` definition differed. HWM/CTZ assumed jest-expo and `expo-router/testing-library`. Native TanStack Query was undecided. Dependencies were "FND-*". Dexie name was `laif-clinical-web`. | ADM now extends the FND-06 files in place. FND-06 adopts ADM's `referred` definition (**FND adopted app choice**; acceptance numbers updated). There is one `toAggregateCsv`. Tests use Vitest plus the FND-08 SQLite shim. TanStack Query, Zustand and RHF are pinned for native in FND-11. Every app INDEX/first phase now names concrete FND IDs. Dexie name is `laif-clinical`. |

Choices that were already consistent and were left alone: Prettier (no track used oxfmt), Zod 4 (app snippets in Zod 3 style are now covered by the FND-03 note), the Expo SDK policy (HWM/CTZ defer to FND-11), Recharts (app-local to ADM, recorded in the FND INDEX decisions table), ports, and routes.

## 2. Files changed

| File | Change |
|---|---|
| `README.md` | Phase index with real counts (55); recommended global build order; binding cross-track conventions section. |
| `00-foundation/INDEX.md` | 14 new pinned decisions; threshold keys follow the new contexts; PO items point to §3. |
| `FND-02` | Roles (10), decision input kinds and the CLN mapping, priorities/origins, reason/outcome/evidence/contact/reminder enums, glucose contexts, sync op statuses and resolutions, Review/Referral/FollowUp/CareInstruction/Reminder/DeviceSession/SyncOperation/DemoRuleset fields, follow-up ★ transition, derivations (`effectiveReadings`, `deriveInstructionProgress`, `deriveSyncState`, `deriveDatePassed`), reason code rename. |
| `FND-03` | Amendment/register/start-review inputs; 5-branch decision union; referral transition/edit; expanded follow-up update union; callback, export inputs; extension rule; `ERROR_REASONS`; `RepositoryErrorShape`; `ConflictDetails.latest`. |
| `FND-04` | Key/file convention; `i18n:check --ns/--report/--unused`. |
| `FND-05` | `SEED_IDS`, A/B alias, placeholder-name rule, 18-persona table, reminder and instruction seed details, `SEED_ANCHORS`, ruleset naming, admin/citizen overlays in `sliceForApp`, updated acceptance criteria. |
| `FND-06` | Permission list and 10-role matrix; scope from AccessGrant and multi-patient `self`; funnel definitions plus the extend-in-place rule; CSV metadata format and shared helpers; updated acceptance criteria. |
| `FND-07` | Collections registry; interface additions; extension rule and citizen facade; replay audit; unified `FaultConfig`; full single sync design; audit registry and canonical names. |
| `FND-08` | Exact Dexie names; no migration API; SQLite shim and test helpers for app tracks. |
| `FND-09` | `ExplainableFlag`, `ReadingDisplay`, richer `ConflictNotice`; chart decision. |
| `FND-10` | New native components; HWM name mapping; CTZ-08 additive tokens; sync-state mapping via domain. |
| `FND-11` | Fixed package names; Playwright pin; native TanStack Query/Zustand/RHF; `test:e2e` / `test:maestro` scripts; single DB file per app. |
| `01-clinical-web/*` | Facility/district/ruleset/DB renames everywhere; concrete dependencies; CLN-01 uses FND permissions/personas; CLN-02 consumes the FND repository, anchors and faults; CLN-04/07/08/09 consume FND schemas and enums (decision table in CLN-07); CLN-05/06 use FND reason codes, fields and components; CLN-10 uses the shared CSV helpers and `export.generated`; CLN-11 uses `i18n:check`; INDEX reconciled. |
| `02-worker-mobile/*` | INDEX: single sync model + term-mapping table, shared-work list, dependencies. HWM-02 rewritten. HWM-01: no migrations, FND session/audit, Vitest guard test. HWM-03…10: data-layer note plus targeted fixes (components, plausibility, contexts, evidence/methods, confirmation, conflict API, reset/revocation via FND, `test:maestro`). HWM-04: adult-age warning (PDF). |
| `03-programme-admin/*` | Persona/capability/district/audit/ruleset renames; ADM-01 uses FND personas, matrix, session and overlay registration; ADM-02 extends FND-06 calculators and suppression, adds the pilot-KPI catalogue (PDF); ADM-03…07 extend FND files and use the single CSV builder; ADM-04 adds median days to referral completion (PDF); ADM-05 adds the workload index against a demo baseline (PDF); ADM-06 adds fairness disaggregation and the dismissal-reason distribution (PDF); ADM-09 uses the FND fault/reset API; INDEX reconciled. |
| `04-citizen-wallet/*` | CTZ-01 rewritten onto the facade and overlay with a mapping table; clock/date fixes; canonical audit names; `i18n:check`; Vitest; `test:maestro`; fault names; CTZ-02 session/clock/faults via FND; CTZ-07 adds Law 058/2021 rights to the notice (PDF); CTZ-08 callback as a `careTasks` record; CTZ-09 demo confirmation via `simulateExternalUpdate`; INDEX reconciled. |
| `05-release/*` | REL-03 reuses app suites/flows, uses the resolution vocabulary, turbo scripts and the FND-11 Playwright pin; REL-05 known limitations include Law 058/2021 obligations and the excluded proposal features (PDF); INDEX: concrete dependencies and script names. |

## 3. Consolidated product-owner decisions (de-duplicated across tracks)

The default in brackets is what the plans implement until someone decides. Source items: FND INDEX, CLN INDEX, HWM INDEX, ADM INDEX, CTZ INDEX.

1. **Demo rule thresholds, plausibility ranges and back-dating limit.** [Systolic ≥ 145, diastolic ≥ 95; glucose ≥ 7.5 mmol/L fasting, ≥ 11.5 otherwise. Entry ranges 60–260 / 30–160 mmHg, 1.0–35.0 mmol/L. Back-dating 30 days, with a non-blocking warning after 24 h. All labelled `DEMO_RULE_NOT_CLINICALLY_VALIDATED`.] (FND 1, HWM 3)
2. **Kinyarwanda copy: who writes it and who signs it off; are drafts acceptable for the stakeholder demo?** [Builders write drafts flagged in `_review.json`. Not blocking for the demo; the backlog is reported in REL-05.] (FND 3, CLN 11, HWM 12, CTZ 10)
3. **Role/permission matrix.** [FND-06 matrix. Coordinators cannot decide reviews. Nurse reviewers can decide and reassign but not export the audit log. Only coordinators export the audit log. Supervisors get CHW scope over two facilities. The auditor gets no drill-down. Worker rows are shown as pseudonymous codes to drill-down roles. Demo reset is open to all roles.] (CLN 1, HWM 11, ADM 5, ADM 9)
4. **Clinical decision options and editability.** [Five options mapped to FND kinds. Decisions are append-only; a correction is a new audited note. Taking over another clinician's in-progress review needs an audited reason. No rule yet for an "unavailable reviewer".] (CLN 2, CLN 5, FND 5)
5. **Overdue and urgency without approved timing rules.** [Overdue only where a person-set `dueAt` (or a fixture `reviewDueAt` labelled demo) has passed. Pending reviews are shown by age bucket only. Urgency comes only from `urgent_demo` fixtures. The citizen app says "date passed", never "overdue".] (CLN 3, CLN 4, ADM 4)
6. **Completion evidence, outcomes and reason codes, including whether a patient's verbal confirmation counts as evidence.** [Seven demo evidence types including `patient_verbal_confirmation`. Demo outcome, dismiss and cancel code lists, all needing clinical sign-off.] (CLN 6, HWM 5)
7. **Clinician confirmation of worker-reported completion (WF-01 step 7).** [Always required: worker `attended` → `completed` with confirmation `pending`. The clinician confirms or returns it with a reason.] (CLN 8)
8. **Small-cell suppression and export policy.** [k = 5, range 3–20, editable only by the programme lead. Zero is shown. Complementary suppression is on. Quality-queue rows are shown to triage roles below k. Aggregate-only CSV; record-level export shown as disabled. Audit CSV has no names and has EN + RW header lines. CSV watermark stays English.] (FND 6, ADM 2, ADM 3, ADM 8, CLN 9)
9. **Local encryption on devices.** [Not encrypted in Expo Go; shown as a labelled limitation. No SQLCipher dev build.] (FND 2, HWM 1)
10. **Lost or revoked device and offline reassignment policy.** [On revocation, pending data is kept on the device and not sent. A task reassigned while offline is rejected as `TASK_REASSIGNED` and kept on the device. No background sync; foreground only.] (HWM 7, HWM 8, HWM 10)
11. **Patient identity matching.** [Match score threshold 0.75; "register anyway" sets `needs_match_review`. Nobody resolves the flag in the prototype (apps are isolated). Duplicates are never merged.] (HWM 9)
12. **Glucose context "not recorded".** [Allowed as an explicit choice. The flag reason is `GLUCOSE_CONTEXT_NOT_RECORDED`, evaluated against the non-fasting placeholder.] (HWM 2)
13. **Who may amend a screening, and does an amendment trigger re-review?** [Clinician, nurse reviewer and CHW, with a reason. The reviewer sees a notice only; no re-evaluation.] (CLN 7)
14. **Unable to reach / "referred onward".** [One unsuccessful attempt is enough. The supervisor or clinician decides the next step. "Referred onward" moves the task to `contacted` and never completes a referral.] (HWM 4, HWM 6)
15. **Admin metric semantics.** [Cohort attribution (workload uses task creation date). Consent-withdrawn patients excluded with a footnote count. Screening types BP / glucose / both. Overturn and manual-escalation proxies labelled PROXY. New fairness view by sex and age band. Workload = self-reported demo minutes per patient-day, indexed against a demo baseline (first 4 weeks).] (ADM 1, 6, 7, 10, 11)
16. **Citizen display and reminders.** [Unreleased results shown as a value-less "waiting" card. Dismissed flags shown as "Reviewed — no extra visit needed". No emergency phone number. Reminders the day before at 09:00 or the morning of at 07:00 Kigali. Re-consent does not re-plan reminders until opt-in. In-app channel only, no SMS.] (CTZ 1–5, 11)
17. **Representative scope, access-history detail and personal-detail corrections.** [A representative sees and corrects only the linked person and cannot withdraw their consent. Access history shows role + synthetic name + facility. Personal-detail corrections are allowed in the wallet.] (CTZ 6–8)
18. **Isolated-app demo shortcuts.** [Wallet "simulate care-team confirmation" demo action, labelled. Route `/clinical/settings` added. Admin is import-only for scenario bundles.] (CTZ 9, CLN 10, REL-01)
19. **Toolchain.** [Node 22 / pnpm 10 pinned via mise, even though the machine has Node 24 / pnpm 11.] (FND 4)
20. **FRD acceptance-criteria boilerplate.** [For read-only features, "submit / unauthorized / idempotent retry" means: no data exposed, plus an audited denial.] (CLN 12)
21. **New, from reconciliation and PDF coverage:**
    - (a) Pilot scope is adults: [non-blocking warning under 18 in HWM-04; not an eligibility rule].
    - (b) Pilot KPI 03 (medicine history) and KPI 05 (patient understanding): [shown as "deferred", no numbers].
    - (c) Privacy notice lists Law 058/2021 rights as "process to be defined".
    - (d) Ruleset version naming `demo-ruleset-2026.10-v1`.

**Top 10 for the product owner, by impact on the build:** 1, 3, 4, 5, 6, 7, 8, 2, 10, 16.

## 4. LAIF MoH proposal (`docs/ref/LAIF_MOH.pdf`) coverage

Pages read: 5–6, 10–14, 17, 20.

**Covered by existing phases:**
- Six-step care journey, p. 6: identify (HWM), understand (CTZ), review (CLN-06), act/dismiss with reason (CLN-07), follow up (CLN-08/09, HWM-07/08), learn (ADM).
- "Clinician must always be able to challenge an output", "explainable prompt with data visible", "humans decide", p. 13: CLN-06/07.
- No diagnosis or prescribing anywhere.
- Pilot scope p. 14 (record outcomes, apply review criteria, assign follow-up, track referral, agreed reminders, measure time to review and % completed): CLN, HWM, CTZ-05, ADM-02/04.
- "PII never caches on analytics models", p. 10–11: FND-06 no-PII result types.
- "No data stored outside Rwanda", p. 14: local-only apps, REL-04 no external requests.
- KPI 01, 02 (review part), 04 and 06 on p. 17: ADM-02/04/05/06.

**Gaps that got small coverage tasks:**
- KPI 02 "and referral completion" → ADM-04 `medianDaysToReferralCompletion`.
- KPI 04 "indexed against baseline" → ADM-05 demo-baseline index.
- p. 13 "audited for … fairness" and "learns from every recorded reason" → ADM-06 sex/age-band disaggregation and the dismissal-reason distribution.
- KPI 03 and KPI 05 → ADM-02 catalogue lists them as `deferred` (BRD §10: mark deferred, do not fabricate).
- p. 14 "adults screened" → HWM-04 non-blocking age warning.
- p. 12 data-subject rights (portability, erasure) → CTZ-07 notice section.
- p. 12 Law 058/2021 obligations and the excluded proposal features → REL-05 `KNOWN_LIMITATIONS.md`.

**Listed but not built (excluded by tech spec, BRD or PRD; no scope added):**
- Predictive indices 3–12 months ahead, wallet trajectory forecasts, nudges and daily risk indicators (tech spec §2.4/§11: no score or forecast; wellness scoring excluded).
- Medication-conflict detection and diabetic markers (BRD BR-12, Later).
- NIDA e-ID handshake, FHIR canonical model, EHR/lab/pharmacy ingest (ADR-P09, BR-11; stubbed as `DEPENDENCY_UNAVAILABLE` in CLN-03/HWM-04).
- Regional/national predictive heatmap (PRD out of scope; ADM shows district/facility breakdowns instead).
- Public safety dashboard (KPI 06 "public"; admin is authenticated demo only).
- Citizen reporting of medicines, allergies or symptoms (p. 5; medicines pilot is BR-12 Later).
- Clinician UI feedback/evaluation mechanism (p. 20, Phase 02).
- In-country hosting, DPO and 48 h breach notification, encryption at rest/in transit (Gate 1/2).

**Contradictions:** none in the reconciled phases. Everything the PDF claims as live (AI prediction, NIDA, sovereign cloud) is explicitly labelled out of scope, and REL-02 narration guardrails forbid claiming it.
