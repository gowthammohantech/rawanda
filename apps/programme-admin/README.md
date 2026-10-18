# Programme Admin Dashboard (demo)

`@laif/programme-admin` — the LAIF CareConnect programme dashboard prototype: aggregate,
privacy-protected monitoring of the hypertension / diabetes screening pathway for programme leads,
district analysts, facility managers and auditors.

> **DEMONSTRATION — SYNTHETIC PATIENT DATA — NOT FOR CLINICAL USE.** Every person, facility,
> district and number is synthetic. The persona switch is a demo role switch, **not
> authentication**. Rules, thresholds and baselines are demo placeholders, never approved values.

## Run

| Command                                         | What                                                            |
| ----------------------------------------------- | --------------------------------------------------------------- |
| `pnpm dev:admin`                                | Vite dev server on **http://localhost:5174/admin/** (port 5174) |
| `pnpm --filter @laif/programme-admin test`      | Vitest (jsdom): unit, page, UX-state inventory, i18n, contrast  |
| `pnpm --filter @laif/programme-admin test:e2e`  | Playwright (Chromium) against `vite build && vite preview`      |
| `pnpm --filter @laif/programme-admin build`     | Type check + production build (`dist/`)                         |
| `pnpm --filter @laif/programme-admin typecheck` | `tsc --noEmit`                                                  |

E2E builds set `VITE_LAIF_E2E=1` (no simulated 150–450 ms latency). If port 5174 is taken, copy
`playwright.config.ts` with another port. Data lives in the browser (IndexedDB `laif-admin`);
Settings → **Reset demo** (type `RESET`) restores the exact baseline.

## Routes

`/admin/login` · `/admin/overview` · `/admin/funnel` · `/admin/funnel/:stage` ·
`/admin/timeliness` · `/admin/workload` · `/admin/quality` · `/admin/reports` ·
`/admin/governance?tab=rulesets|audit|access|roles` · `/admin/settings` · `/admin/forbidden` · 404.
Global filters live in the URL (`preset`, `from`, `to`, `district`, `facility`, `type`); invalid
values are reset to defaults with a notice.

## Personas and grants (demo)

| Persona (demo name) | Role             | AccessGrant (seed, version 1)          |
| ------------------- | ---------------- | -------------------------------------- |
| Vaqvox Varqezo      | Programme lead   | Programme-wide (Districts Alpha, Beta) |
| Quavel Quoriqua     | District analyst | Demo District Alpha (WF-04 actor)      |
| Xelzo Xaboxe        | Facility manager | Demo Health Centre Alpha-1             |
| Zorqa Zelqumbra     | Auditor          | Programme-wide, governance read-only   |

Grants are edited on Governance → Roles & access (programme lead; versioned, audited, never
deleted; the last administrator cannot be removed).

### Permission matrix (FND-06 `ROLE_PERMISSIONS`, admin capabilities)

| Capability               | Programme lead | District analyst | Facility manager | Auditor |
| ------------------------ | :------------: | :--------------: | :--------------: | :-----: |
| `metrics.read`           |       ✓        |        ✓         |        ✓         |    ✓    |
| `metrics.drilldown`      |       ✓        |        ✓         |        ✓         |         |
| `programme_action.write` |       ✓        |        ✓         |                  |         |
| `quality.triage`         |       ✓        |        ✓         |        ✓         |         |
| `export.aggregate`       |       ✓        |        ✓         |                  |         |
| `audit.read`             |       ✓        |                  |                  |    ✓    |
| `audit.read_scoped`      |                |        ✓         |                  |         |
| `roles.configure`        |       ✓        |                  |                  |         |
| `settings.privacy`       |       ✓        |                  |                  |         |

Nav items a role lacks are locked, and every route checks the capability itself (403 page +
`access.denied`). Out-of-scope districts / facilities in the URL give the 403 page (WF-04).

## Metrics

Definitions, numerators, denominators and caveats: `METRIC_DEFINITIONS` in
`packages/analytics/src/catalogue.ts` (shown in each (i) popover with n, threshold, computed time
and ruleset versions). Staff time is a self-reported **proxy**; no SLA or review target exists.

## Seed scenarios (Demo tools → Load scenario)

`SCN-03-clinician-dismissal`, `SCN-04-overdue-referral`, `SCN-06-missing-unit`,
`SCN-10-consent-withdrawn`, `SCN-11-unauthorized-district-access`,
`SCN-12-suppressed-small-aggregate` (plus the admin analytics overlay in the base seed).

## Privacy rules

- **Aggregate first**: pages show counts, rates and medians by facility / district / week only;
  no patient-level screen or export exists (de-identified record export is "not available").
- **Small-cell suppression**: counts with `0 < n < k` show as `<k` with sr text; complementary
  suppression hides a second cell wherever a total would reveal the first. Default `k = 5`;
  Settings lets the programme lead choose **3–20** (3 = governance minimum; demo policy, not
  approved for production; audited with a justification). `k` is part of every query key, the
  CSV metadata (`suppression_threshold`) and the export audit.
- **One suppression pass per scope**: every view picks its cells from one pass over the actor's
  whole grant scope; since ADM-09 the Overview and the Pathway funnel share that pass, so a figure
  both publish is hidden on both or on neither (no differencing between pages or views).
- **Exports** are aggregate CSV only, watermarked with persona, scope, period, threshold and
  reason, re-checked against the grant and audited (`export.generated` / `export.denied`).

## Settings, faults and session (ADM-09)

- **Language**: EN / RW, saved by `@laif/i18n` on the device (survives reload and offline).
- **Threshold**: programme lead only (`settings.privacy`); others see it read-only; a direct
  repository call is rejected and audited (`admin.settings.denied`). Live preview of the number
  of Overview cells suppressed at the candidate `k`. Stored in store meta `admin.settings`
  (absent = baseline).
- **Fault simulation**: slow network, server error, timeout (lost response after commit),
  offline, conflict on the next threshold write → FND-07 `FaultConfig`. A "Fault simulation on"
  pill stays in the top bar while any fault is active. Demo tooling, not governance records.
- **Expire session now**: records `session.expired`; the next navigation or failing call goes to
  the sign-in with the "session expired" notice and returns to the same URL (filters kept).
  Open dialogs keep a sessionStorage draft with their idempotency key; after re-login the draft
  reopens and a submit that already reached the repository is replayed, never duplicated.
- **Reset demo**: type `RESET`; restores data, audit baseline (+ one `demo.reset`), settings,
  demo clock and faults; ends the session and returns to the sign-in.

## Accessibility and responsive layout

Landmarks (banner, navigation, main, complementary), skip link "Skip to main content", focus moves to the page
`h1` on navigation, titles "{Page} · Programme Dashboard · CareConnect (Demo)", tables with
captions / `scope` / `aria-sort`, charts as `figure` + summary + "View as table" (the SVG is
removed while the table shows; no chart animation), AA token contrast (unit test), axe in E2E.
Layouts: 1440 / 1280 sidebar + 8/4 grid; 1024 narrower sidebar, KPI strip 3 + 2; 768 icon rail +
menu button, stacked cards; 390 off-canvas navigation, 2-column KPIs, stacked table cards,
"Filters (n)" disclosure. Wide tables scroll inside their card, never the page.

## Performance budget

E2E (`admin-story.spec.ts`) measures the Overview's first meaningful render (route start → KPI
strip visible) and asserts < 1 s on the seeded dataset. Route pages are `lazy()` chunks, each far
below 250 kB gzip (ADM-09 build: largest is the shared chart chunk with Recharts, ≈ 107 kB gzip;
the page chunks are ≤ 14 kB gzip). Recharts is not in the sign-in path: the entry chunk only
references the chart chunk by URL. The entry chunk itself (≈ 450 kB gzip) carries the shared
foundation — synthetic seed generator, EN/RW catalogues, repository — which is above the 250 kB
route-chunk budget and is a known limitation of the in-browser demo (not a route chunk). After
sign-in the shell prefetches every page chunk so offline navigation keeps working.

## Known limitations

- Demo authentication only (persona switch; no OIDC / MFA / password).
- The demo audit log is append-only by API but **not tamper-evident**.
- Thresholds, rulesets, baselines and the workload proxy are unapproved demo placeholders.
- Timeliness has no approved SLA; "overdue" is derived from person-set due dates only.
- Kinyarwanda copy is draft; the strings below await clinical / linguistic review.
- Fault toggles are recorded as `demo.*` repository events (outside the governance trail).

## Kinyarwanda strings awaiting clinical / linguistic review

Generated from `packages/i18n/src/locales/rw/_review.json` (status `needs clinical/linguistic
review`, admin namespace and admin audit labels); `src/test/i18n.test.ts` keeps this list
complete.

<!-- rw-review:start -->

- **domain audit** (11): `domain:audit.admin.drilldown.viewed`, `domain:audit.admin.programme_action.created`, `domain:audit.admin.programme_action.status_changed`, `domain:audit.admin.quality_issue.detected`, `domain:audit.admin.quality_issue.triaged`, `domain:audit.admin.audit.viewed`, `domain:audit.admin.access_simulation.run`, `domain:audit.admin.access_grant.changed`, `domain:audit.admin.access_grant.revoked`, `domain:audit.admin.settings.suppression_threshold_changed`, `domain:audit.admin.settings.denied`
- **funnel** (10): `admin:funnel.stage.recorded`, `admin:funnel.stage.flagged`, `admin:funnel.stage.reviewed`, `admin:funnel.stage.referred`, `admin:funnel.stage.completed`, `admin:funnel.branch.dismissed`, `admin:funnel.howTo.title`, `admin:funnel.howTo.completion`, `admin:funnel.howTo.dismissed`, `admin:funnel.howTo.privacy`
- **metric** (37): `admin:metric.screenings_recorded.label`, `admin:metric.screenings_recorded.description`, `admin:metric.distinct_patients_screened.label`, `admin:metric.distinct_patients_screened.description`, `admin:metric.screenings_flagged.label`, `admin:metric.screenings_flagged.description`, `admin:metric.reviews_pending.label`, `admin:metric.reviews_pending.description`, `admin:metric.reviews_completed.label`, `admin:metric.reviews_completed.description`, `admin:metric.reviews_dismissed.label`, `admin:metric.reviews_dismissed.description`, `admin:metric.pathway_referred.label`, `admin:metric.pathway_referred.description`, `admin:metric.pathway_completed.label`, `admin:metric.pathway_completed.description`, `admin:metric.referrals_completed.label`, `admin:metric.referrals_completed.description`, `admin:metric.follow_ups_completed.label`, `admin:metric.follow_ups_completed.description`, `admin:metric.median_days_to_review.label`, `admin:metric.median_days_to_review.description`, `admin:metric.overdue_referrals.label`, `admin:metric.overdue_referrals.description`, `admin:metric.overdue_follow_ups.label`, `admin:metric.overdue_follow_ups.description`, `admin:metric.missing_glucose_unit.label`, `admin:metric.missing_glucose_unit.description`, `admin:metric.possible_duplicate_identities.label`, `admin:metric.possible_duplicate_identities.description`, `admin:metric.flags_overturned_at_review.label`, `admin:metric.flags_overturned_at_review.description`, `admin:metric.screening_amendments.label`, `admin:metric.screening_amendments.description`, `admin:metric.staff_time_minutes.label`, `admin:metric.staff_time_minutes.description`, `admin:metric.staffTimeProxyNote`
- **overview** (94): `admin:overview.kpi.label`, `admin:overview.kpi.screened`, `admin:overview.kpi.screenedSub`, `admin:overview.kpi.flagged`, `admin:overview.kpi.flaggedSub`, `admin:overview.kpi.pctSuppressed`, `admin:overview.kpi.reviewed`, `admin:overview.kpi.reviewedSub`, `admin:overview.kpi.completed`, `admin:overview.kpi.completedSub`, `admin:overview.kpi.median`, `admin:overview.kpi.days`, `admin:overview.kpi.medianSub`, `admin:overview.attention.title`, `admin:overview.attention.overdueReferrals`, `admin:overview.attention.overdueFollowUps`, `admin:overview.attention.pendingAged`, `admin:overview.attention.quality`, `admin:overview.attention.note`, `admin:overview.dataNote.title`, `admin:overview.dataNote.text`, `admin:overview.dataNote.disclaimer`, `admin:overview.catalogue.screened.label`, `admin:overview.catalogue.screened.numerator`, `admin:overview.catalogue.peopleScreened.label`, `admin:overview.catalogue.peopleScreened.numerator`, `admin:overview.catalogue.flagged.label`, `admin:overview.catalogue.flagged.numerator`, `admin:overview.catalogue.reviewed.label`, `admin:overview.catalogue.reviewed.numerator`, `admin:overview.catalogue.dismissed.label`, `admin:overview.catalogue.dismissed.numerator`, `admin:overview.catalogue.actioned.label`, `admin:overview.catalogue.actioned.numerator`, `admin:overview.catalogue.referred.label`, `admin:overview.catalogue.referred.numerator`, `admin:overview.catalogue.followUpCompleted.label`, `admin:overview.catalogue.followUpCompleted.numerator`, `admin:overview.catalogue.medianDaysToReview.label`, `admin:overview.catalogue.medianDaysToReview.numerator`, `admin:overview.catalogue.weeklyScreenedVsFlagged.label`, `admin:overview.catalogue.weeklyScreenedVsFlagged.numerator`, `admin:overview.catalogue.screeningType.label`, `admin:overview.catalogue.screeningType.numerator`, `admin:overview.catalogue.overdueReferrals.label`, `admin:overview.catalogue.overdueReferrals.numerator`, `admin:overview.catalogue.overdueFollowUps.label`, `admin:overview.catalogue.overdueFollowUps.numerator`, `admin:overview.catalogue.pendingReviewAge.label`, `admin:overview.catalogue.pendingReviewAge.numerator`, `admin:overview.catalogue.openQualityIssues.label`, `admin:overview.catalogue.openQualityIssues.numerator`, `admin:overview.catalogue.workloadMinutes.label`, `admin:overview.catalogue.workloadMinutes.numerator`, `admin:overview.catalogue.promptIdReliability.label`, `admin:overview.catalogue.promptIdReliability.numerator`, `admin:overview.catalogue.medicineHistoryCompleteness.label`, `admin:overview.catalogue.medicineHistoryCompleteness.numerator`, `admin:overview.catalogue.patientUnderstanding.label`, `admin:overview.catalogue.patientUnderstanding.numerator`, `admin:overview.catalogue.denominator.screened`, `admin:overview.catalogue.denominator.flagged`, `admin:overview.catalogue.denominator.referred`, `admin:overview.catalogue.inclusion.cohort`, `admin:overview.catalogue.inclusion.deferred`, `admin:overview.catalogue.attribution.period`, `admin:overview.catalogue.attribution.cohort`, `admin:overview.catalogue.attribution.snapshot`, `admin:overview.catalogue.attribution.none`, `admin:overview.catalogue.qualityMissingFields.label`, `admin:overview.catalogue.qualityMissingFields.numerator`, `admin:overview.catalogue.qualityMissingByField.label`, `admin:overview.catalogue.qualityMissingByField.numerator`, `admin:overview.catalogue.identityMismatches.label`, `admin:overview.catalogue.identityMismatches.numerator`, `admin:overview.catalogue.overturnedFlagRate.label`, `admin:overview.catalogue.overturnedFlagRate.numerator`, `admin:overview.catalogue.missedFlagProxy.label`, `admin:overview.catalogue.missedFlagProxy.numerator`, `admin:overview.catalogue.duplicateSubmissionsPrevented.label`, `admin:overview.catalogue.duplicateSubmissionsPrevented.numerator`, `admin:overview.catalogue.completedWithoutEvidence.label`, `admin:overview.catalogue.completedWithoutEvidence.numerator`, `admin:overview.catalogue.weeklyQualityTrend.label`, `admin:overview.catalogue.weeklyQualityTrend.numerator`, `admin:overview.catalogue.flagReviewOutcomesByGroup.label`, `admin:overview.catalogue.flagReviewOutcomesByGroup.numerator`, `admin:overview.catalogue.dismissalReasonDistribution.label`, `admin:overview.catalogue.dismissalReasonDistribution.numerator`, `admin:overview.catalogue.inclusion.reviewProxy`, `admin:overview.catalogue.attribution.detection`, `admin:overview.catalogue.attribution.audit`, `admin:overview.catalogue.denominator.reviewed`, `admin:overview.catalogue.denominator.dismissed`
- **quality** (69): `admin:quality.correctAtSource`, `admin:quality.callout.title`, `admin:quality.callout.body`, `admin:quality.kpi.overturned`, `admin:quality.kpi.overturnedSub`, `admin:quality.kpi.missed`, `admin:quality.kpi.missedSub`, `admin:quality.field.patientId`, `admin:quality.field.facilityId`, `admin:quality.field.workerId`, `admin:quality.field.measuredAt`, `admin:quality.field.source`, `admin:quality.field.rulesetVersion`, `admin:quality.field.glucoseUnit`, `admin:quality.field.glucoseContext`, `admin:quality.field.systolic`, `admin:quality.field.diastolic`, `admin:quality.type.missing_field`, `admin:quality.type.duplicate_identifier`, `admin:quality.type.orphan_screening`, `admin:quality.type.overturned_flag`, `admin:quality.type.manual_escalation`, `admin:quality.typeChip.missing_field`, `admin:quality.typeChip.duplicate_identifier`, `admin:quality.typeChip.orphan_screening`, `admin:quality.typeChip.overturned_flag`, `admin:quality.typeChip.manual_escalation`, `admin:quality.detected.missing_field`, `admin:quality.detected.duplicate_identifier`, `admin:quality.detected.orphan_screening`, `admin:quality.detected.overturned_flag`, `admin:quality.detected.manual_escalation`, `admin:quality.rule.missing_field`, `admin:quality.rule.duplicate_identifier`, `admin:quality.rule.orphan_screening`, `admin:quality.rule.overturned_flag`, `admin:quality.rule.manual_escalation`, `admin:quality.outcomes.title`, `admin:quality.outcomes.overturnedRate`, `admin:quality.outcomes.ofReviewed`, `admin:quality.outcomes.missed`, `admin:quality.outcomes.proxyLabel`, `admin:quality.fairness.title`, `admin:quality.fairness.label`, `admin:quality.fairness.caption`, `admin:quality.fairness.group`, `admin:quality.fairness.column.flagged`, `admin:quality.fairness.column.overturned`, `admin:quality.fairness.column.manualEscalation`, `admin:quality.fairness.sex.female`, `admin:quality.fairness.sex.male`, `admin:quality.fairness.sex.not_recorded`, `admin:quality.fairness.age.18-39`, `admin:quality.fairness.age.40-59`, `admin:quality.fairness.age.60+`, `admin:quality.fairness.age.unknown`, `admin:quality.reasons.title`, `admin:quality.reasons.measurement_error_suspected`, `admin:quality.reasons.repeat_reading_acceptable`, `admin:quality.reasons.known_managed_condition`, `admin:quality.reasons.duplicate_flag`, `admin:quality.reasons.other`, `admin:quality.reasons.not_recorded`, `admin:quality.invariants.title`, `admin:quality.invariants.evidence`, `admin:quality.invariants.holds`, `admin:quality.invariants.broken`, `admin:quality.invariants.duplicates`, `admin:quality.invariants.duplicatesSub`
- **reports** (38): `admin:reports.ack`, `admin:reports.recordLevelUnavailable`, `admin:reports.recordLevelNote`, `admin:reports.watermark.title`, `admin:reports.watermark.body`, `admin:reports.metric.screened`, `admin:reports.metric.flagged`, `admin:reports.metric.reviewed`, `admin:reports.metric.dismissed`, `admin:reports.metric.referred`, `admin:reports.metric.follow_up_completed`, `admin:reports.metric.median_days_to_review`, `admin:reports.metric.p90_days_to_review`, `admin:reports.metric.reviews_completed`, `admin:reports.metric.overdue_referrals`, `admin:reports.metric.overdue_follow_ups`, `admin:reports.metric.weekly_median_days_to_review`, `admin:reports.metric.weekly_reviews_completed`, `admin:reports.metric.weekly_overdue_referrals`, `admin:reports.metric.weekly_overdue_follow_ups`, `admin:reports.metric.screenings_missing_fields`, `admin:reports.metric.identity_mismatches`, `admin:reports.metric.duplicate_identifiers`, `admin:reports.metric.orphan_screenings`, `admin:reports.metric.overturned_flag_rate`, `admin:reports.metric.missed_flag_proxy`, `admin:reports.metric.duplicate_submissions_prevented`, `admin:reports.metric.tasks_assigned`, `admin:reports.metric.tasks_completed`, `admin:reports.metric.task_completion_rate`, `admin:reports.metric.tasks_unable_to_reach`, `admin:reports.metric.tasks_overdue`, `admin:reports.metric.patient_days`, `admin:reports.metric.minutes_per_patient_day`, `admin:reports.metric.missing_field`, `admin:reports.metric.pending_reviews`, `admin:reports.metric.funnel`, `admin:reports.metric.fairness`

<!-- rw-review:end -->
