# 01 — Clinical Web Portal phases (CLN)

App: `apps/clinical-web` (React 19 + Vite + TS + Tailwind v4, port 5173, routes `/clinical/*`, isolated Dexie DB `laif-clinical`).
Prerequisite: FND-01 … FND-11 (CLN-01 builds on the FND-11 clinical shell; see `phases/CONSISTENCY_REVIEW.md` for the cross-track conventions this track was reconciled to — package `@laif/clinical-web`, Dexie `laif-clinical`, personas `persona-clin-alpha1` / `persona-nurse-alpha2` / `persona-coord-alpha` / `persona-clin-beta1`, facilities Alpha-1/Alpha-2/Beta-1 ("A1/A2/B1"), decision kinds of FND-02, demo clock `2026-10-14T06:00Z`; monorepo, shell with DemoBanner + EN/RW switcher, `@laif/domain`, `@laif/contracts`, `@laif/mock-data`, `@laif/repositories`, `@laif/auth-demo`, `@laif/analytics`, `@laif/i18n`, `@laif/ui-web`, `@laif/test-utils`).
Build strictly in order; each phase is one commit that leaves `pnpm typecheck && pnpm lint && pnpm test && pnpm build` green.

## Phase list

| Phase | File | Goal | Depends on | Size |
|---|---|---|---|---|
| CLN-01 | `CLN-01-shell-demo-access-routing.md` | Branded shell, demo persona + facility sign-in, all §2.1 routes registered, capability guards with audited denial | FND-11 (+ FND-06, FND-07, FND-09) | M |
| CLN-02 | `CLN-02-data-layer-seed-settings.md` | Query-key/error layer over the FND-07 repository, idempotent mutations, clinical `SEED_ANCHORS` (FND-05) for WF-01..04, Settings: reset, language, fault simulation, WF-02 simulated actor | CLN-01, FND-05, FND-07, FND-08 | L |
| CLN-03 | `CLN-03-patient-search-record.md` | Scoped, paginated patient search; patient overview with identity provenance, duplicate warning, unavailable-identity stub | CLN-02 | M |
| CLN-04 | `CLN-04-screening-timeline-amendments.md` | Screening timeline with units/source/correction history; follow-up timeline; amendment with mandatory reason | CLN-03 | M |
| CLN-05 | `CLN-05-review-queue.md` | Review queue: KPI strip, tabs with reconciled counts, facility/assignee filters, sort, expandable rows | CLN-04 | M |
| CLN-06 | `CLN-06-review-detail-explainable-flag.md` | Review detail: explainable flag, evidence panel, completeness, prior records, start review with conflict handling | CLN-05 | M |
| CLN-07 | `CLN-07-clinical-decision-flow.md` | Decision: assessment / refer / repeat test / planned review / dismiss with reason; confirm, idempotency, drafts, conflicts | CLN-06 | L |
| CLN-08 | `CLN-08-referral-tracking.md` | Referral tabs + stepper; accept/schedule/edit/cancel; completion only with evidence; derived overdue | CLN-07 | L |
| CLN-09 | `CLN-09-care-team-tasks.md` | Follow-up tasks: authorised assignment, reassign with reason, completion confirmation, WF-02 conflict resolution | CLN-08 | L |
| CLN-10 | `CLN-10-audit-explorer.md` | Read-only scoped audit explorer, correlation trails, audited watermarked CSV export | CLN-09 | M |
| CLN-11 | `CLN-11-ux-states-a11y-responsive-e2e.md` | All 10 UX states, WCAG AA, 1440/1280/1024/768, RW completeness, full Playwright suites | CLN-10 | M |

Eleven phases rather than ten: the PRD asks for happy-path, permission-denied and error tests per feature, and the decision, referral and task phases are each already large. Merging any two would go past one build session.

## Route coverage (spec §2.1)

| Route | Phase |
|---|---|
| `/clinical/login` | CLN-01 |
| `/clinical/queue` | CLN-05 |
| `/clinical/patients` | CLN-03 |
| `/clinical/patients/:id` | CLN-03 (overview), CLN-04 (tabs) |
| `/clinical/reviews/:id` | CLN-06 |
| `/clinical/reviews/:id/decision` | CLN-07 |
| `/clinical/referrals` | CLN-08 |
| `/clinical/tasks` | CLN-09 |
| `/clinical/audit` | CLN-10 |
| `/clinical/settings` (added: reset / language / faults) | CLN-02 |

## FRD coverage matrix

| FRD req | Primary phase | Also exercised in | Happy / denied / error tests |
|---|---|---|---|
| CL-01 Patient search & record | CLN-03 | CLN-11 (T-02, T-07) | `PatientSearchPage.test`, `PatientPage.test`, `e2e/patient-scope` |
| CL-02 Screening timeline | CLN-04 | CLN-06 (prior records), CLN-11 (T-06) | `ReadingDisplay.test`, `AmendScreeningDialog.test`, `e2e/screening-amendment` |
| CL-03 Review work queue | CLN-05 | CLN-07 (counts update) | `ReviewQueuePage.test`, `e2e/review-queue` |
| CL-04 Explainable flag | CLN-06 | CLN-07 (sidebar), CLN-11 (T-10) | `ExplainableFlag.test`, `EvidencePanel.test`, `e2e/review-detail` |
| CL-05 Clinical decision | CLN-07 | CLN-11 (T-01, T-03, T-04, T-09) | `DecisionPage.test`, `e2e/clinician-review`, `e2e/dismiss-with-reason` |
| CL-06 Referral tracking | CLN-08 | CLN-07 (creation), CLN-11 | `CompleteReferralDialog.test`, `e2e/referral-loop` |
| CL-07 Care team tasks | CLN-09 | CLN-07 (creation), CLN-11 (T-05) | `AssignTaskDialog.test`, `e2e/followup-conflict`, `e2e/task-confirmation` |
| CL-08 Audit & access | CLN-01 (access), CLN-10 (explorer/export) | every phase emits events; CLN-02 (repository scope) | `RequireCapability.test`, `AuditExplorerPage.test`, `e2e/audit-trail` |

## Scenario and test-case coverage

| Item | Where |
|---|---|
| FRD Scenario 1 (sign in → queue → evidence → decide → assign → close with evidence) | CLN-01, 05, 06, 07, 08, 09; `e2e/full-pathway` (CLN-11) |
| FRD Scenario 2 / WF-03 (dismiss with reason) | CLN-07 `e2e/dismiss-with-reason` |
| WF-01 (from review onward, incl. clinician confirms completion, correlation trail) | Seed `WF01_*` (CLN-02); CLN-06..10 |
| WF-02 (stale follow-up → conflict → explicit resolution, audited) | Seed `WF02_FOLLOWUP_CONFLICT` + simulated actor (CLN-02); CLN-09 |
| WF-04 (scope; denied direct URL, audited) | Seed `WF04_OTHER_FACILITY_PATIENT` (CLN-02); CLN-01, 03, 10 |
| T-01 … T-10 | One spec each in `e2e/frd-test-cases` (CLN-11). First introduced in: T-01 CLN-07, T-02 CLN-03, T-03 CLN-04/07, T-04 CLN-02/07, T-05 CLN-06/09, T-06 CLN-04, T-07 CLN-03, T-08 CLN-10, T-09 CLN-07, T-10 CLN-06 |
| FRD §4 business rules (reasons, evidence, no overwrite, backend-style enforcement) | CLN-02 (repository enforcement), CLN-04, 07, 08, 09 |
| FRD §10 edge cases: missing units, repeated screening, duplicate identity, concurrent reviews, cancelled referral, corrected measurement | CLN-04, 04, 03, 06, 08, 04. "Unavailable clinical reviewer" is only partly covered by take-over in CLN-06 (see open decisions) |

## Shared-package tasks owned by this track

After reconciliation, FND delivers almost everything this track needs; CLN phases **consume** it:
- Delivered by FND (do not re-specify): personas + permission matrix (FND-05/06), `SEED_ANCHORS` (FND-05), repository methods incl. `countReviews` / `countReferrals` / `countFollowUps` / `listWorkers` / `recordAuditEvent` / `demo.simulateExternalUpdate` / atomic `decideReview` (FND-07), referral + follow-up machines and overdue derivations (FND-02), decision / referral transition / follow-up update / amendment schemas (FND-03), `ExplainableFlag`, `ReadingDisplay`, `ConflictNotice` (FND-09), `pnpm i18n:check` (FND-04).
- Still added by this track: `@laif/domain` `reviewQueuePredicates` + `explainFlag` view model (CLN-05/06); `@laif/contracts` `PatientSearchSchema`, `ReviewQueueFilterSchema`, audit-filter extensions (CLN-03/05/10); `@laif/i18n` `clinical:*` keys.

## Open decisions for the product owner

Consolidated and de-duplicated with the other tracks in `phases/CONSISTENCY_REVIEW.md` §3 (that list is authoritative; the items below are kept for traceability). Item 5 is resolved: the five UI options map 1:1 onto FND-02 decision kinds (see CLN-07).
1. **Role capabilities.** Can a facility coordinator record review decisions? The plan says no. Can a nurse reviewer reassign tasks or export the audit log? The plan lets them reassign but not export.
2. **Taking over a review.** Can a clinician take over a review that another clinician is part-way through? The plan allows it with an audited reason. The rule for an "unavailable clinical reviewer" is not defined.
3. **Overdue timing.** The FRD forbids calling something clinically overdue without approved timing rules. The plan derives overdue only from due dates a person set, or from demo-ruleset `reviewDueAt` fixtures labelled demo. Please confirm that is acceptable.
4. **"Urgent per approved protocol"** has no approved protocol yet, so urgency comes from fixtures labelled `urgent_demo`.
5. **Decision outcomes.** The PRD lists four (assessment, referral, planned review, dismiss) and the spec lists four different ones (outcome, refer, repeat test, dismiss). The plan merges them into five. Please confirm, and confirm whether a decision can be corrected after it is saved. The plan makes decisions append-only with no edit.
6. **Evidence types, outcomes, and dismiss/cancel reason codes** for referrals and tasks are demo placeholders and need clinical sign-off.
7. **Who may amend a recorded screening.** The plan lets a clinician do it with a reason. Should an amendment trigger a re-review or a new rule evaluation? The plan only shows a notice.
8. **Clinician confirmation of worker-reported completion.** WF-01 step 7 says "where policy requires", and that policy is undefined. The plan always requires it for follow-up tasks.
9. **Exports from the clinical portal.** CL-08 mentions exports, but no export screen is specified. The plan limits it to an audit-log CSV with no names. Should audit CSV header lines be bilingual?
10. **Route `/clinical/settings`** is not in spec §2.1 but is needed for reset, language and fault simulation. Please confirm adding it.
11. **Kinyarwanda copy.** Who reviews it, and is draft RW acceptable for the stakeholder demo? Spec §15 Q3 is still open.
12. **FRD acceptance criteria are identical boilerplate for CL-01..CL-08.** The plan reads the "submit / unauthorized / idempotent retry" criteria as applying to mutations only. For read-only features (CL-02 display, CL-03, CL-04) it reads "unauthorized" as no data exposed plus an audited denial.
