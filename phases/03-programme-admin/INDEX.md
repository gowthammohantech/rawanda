# 03 — Programme Admin Dashboard (ADM) phase index

App: `apps/programme-admin` (React 19 + Vite + TS + Tailwind v4, port 5174, routes `/admin/*`). Isolated Dexie database `laif-admin` (decision D3). Consumes FND packages: `@laif/domain`, `@laif/contracts`, `@laif/mock-data`, `@laif/repositories`, `@laif/auth-demo`, `@laif/analytics`, `@laif/i18n`, `@laif/ui-web`, `@laif/test-utils`.

Package `@laif/programme-admin` with scripts `typecheck`, `lint`, `test`, `test:e2e`, `build` (fixed by FND-11). Personas (FND-05): `persona-lead-programme` (programme lead), `persona-analyst-alpha` (District Alpha analyst — written "District A" in older text), `persona-fmgr-alpha1` (facility manager), `persona-auditor-programme`; permissions = FND-06 (dot names, e.g. `metrics.drilldown`). Ruleset `demo-ruleset-2026.10-v1` (active) + `demo-ruleset-2026.07-v0` (retired, overlay). Analytics calculators **extend FND-06 files in place**; CSV = FND-06 `toAggregateCsv` extended. See `phases/CONSISTENCY_REVIEW.md`. The chart library is **Recharts 3.x, pinned exactly** (see ADM-02 §5.1 for the reasons).

## Phases

| ID | File | Goal | Depends on | Size |
|---|---|---|---|---|
| ADM-01 | `ADM-01-shell-demo-signin-scope-guard.md` | Shell, demo personas and sign-in with scope choice, capability matrix, ScopeGuard (403 page + `access.denied`), admin analytics seed overlay | FND-11 (+ FND-05, FND-06, FND-07) | L |
| ADM-02 | `ADM-02-filters-metric-layer-kpi-overview.md` | URL filter bar, scoped metrics dataset, metric catalogue, suppression, chart kit (Recharts), KPI overview | ADM-01 | L |
| ADM-03 | `ADM-03-pathway-funnel-drilldown-programme-actions.md` | 5-stage funnel with dismissed branch, aggregate drill-down `/admin/funnel/:stage`, idempotent/versioned programme follow-up actions | ADM-02 | L |
| ADM-04 | `ADM-04-timeliness.md` | Median/p90 days to review, derived overdue snapshot and weekly trend, pending-review age buckets (no SLA) | ADM-02 | M |
| ADM-05 | `ADM-05-worker-workload.md` | Assigned/completed tasks per pseudonymous worker, staff minutes per patient-day proxy, no ranking | ADM-02 | M |
| ADM-06 | `ADM-06-safety-quality-review-queue.md` | Missing fields, identity mismatches, overturned/missed-flag proxies, idempotent issue detection and triage queue | ADM-02 (ADM-03 for send-to-facility) | L |
| ADM-07 | `ADM-07-reports-aggregate-csv-export.md` | Report builder, aggregate-only CSV with watermark + scope metadata, reason, idempotent export, ExportAudit | ADM-03..06 | L |
| ADM-08 | `ADM-08-governance-audit-access.md` | Ruleset history, audit explorer, access report + simulator, AccessGrant configuration with lockout protection | ADM-01, ADM-07 | L |
| ADM-09 | `ADM-09-settings-ux-states-a11y-e2e.md` | Settings (threshold, faults, reset, session expiry), UX-state inventory, a11y, responsive, i18n completeness, E2E suite | ADM-01..08 | M |

Build order: 01 → 02 → (03, 04, 05 in any order) → 06 → 07 → 08 → 09. Each phase is one commit and must leave `pnpm typecheck && pnpm lint && pnpm test && pnpm build` green.

## Route coverage (spec §2.3 + additions)

| Route | Phase |
|---|---|
| `/admin/login`, `/admin/forbidden`, 404 | ADM-01 |
| `/admin/overview` | ADM-02 |
| `/admin/funnel`, `/admin/funnel/:stage` | ADM-03 |
| `/admin/timeliness` | ADM-04 |
| `/admin/workload` | ADM-05 |
| `/admin/quality` | ADM-06 |
| `/admin/reports` | ADM-07 |
| `/admin/governance?tab=rulesets\|audit\|access\|roles` | ADM-08 |
| `/admin/settings` | ADM-09 |

## FRD coverage matrix

| FRD | Requirement | Primary | Supporting |
|---|---|---|---|
| PA-01 | Scoped sign-in (programme/district/facility) | ADM-01 | ADM-02 (scoped data), ADM-07 (export re-check), ADM-08 (grant edits), ADM-09 (session expiry) |
| PA-02 | Screening overview by period/facility/district/type | ADM-02 | ADM-07 (`programme_summary`) |
| PA-03 | Follow-up funnel | ADM-03 | ADM-07 (`funnel_by_facility`) |
| PA-04 | Timeliness | ADM-04 | ADM-02 (needs-attention card), ADM-07 |
| PA-05 | Worker burden | ADM-05 | ADM-01 (TimeEntry seed), ADM-07 (facility-level only) |
| PA-06 | Quality and safety | ADM-06 | ADM-08 (ruleset history) |
| PA-07 | Exports | ADM-07 | ADM-09 (threshold in CSV) |
| PA-08 | Governance logs and role configuration | ADM-08 | ADM-01 (access audit), ADM-07 (export audit), ADM-09 (settings audit) |

| Scenario / test | Phases |
|---|---|
| FRD Scenario 1 (scope → funnel → drill-down → programme follow-up) | ADM-01, ADM-03; E2E `funnel-drilldown.spec.ts`, `admin-story.spec.ts` |
| FRD Scenario 2 (date range → privacy-safe report → export with reason + audit) | ADM-07; E2E `export.spec.ts` |
| WF-03 (dismissal counted separately) | ADM-02, ADM-03, ADM-06 |
| WF-04 (District Alpha only; District Beta → 403 + audit; suppression; watermarked CSV) | ADM-01, ADM-02, ADM-07, ADM-08; E2E `scope-denial.spec.ts` |
| T-01 authorised happy path | ADM-03, ADM-06, ADM-07, ADM-08 |
| T-02 cross-facility access | ADM-01, ADM-07, ADM-08 |
| T-03 missing required data (field-level errors; missing-field monitoring) | ADM-03, ADM-06, ADM-07, ADM-08, ADM-09 |
| T-04 duplicate submission | ADM-03, ADM-06, ADM-07 |
| T-05 concurrent update | ADM-03, ADM-06, ADM-08, ADM-09 |
| T-06 correction/override keeps the original | ADM-06, ADM-08 |
| T-07 unavailable integration (no fabricated numbers) | ADM-02, ADM-09 |
| T-08 aggregated export | ADM-07 |
| T-09 interrupted network/session | ADM-03, ADM-09 |
| T-10 flag explanation (ruleset version visible) | ADM-02 (MetricInfo), ADM-06, ADM-08 |

## Cross-package tasks (shared code added by ADM phases)

- `@laif/mock-data`: `buildAdminAnalyticsOverlay` (ADM-01).
- `@laif/contracts`:
  - `AccessGrant` and `TimeEntry` if missing (ADM-01)
  - `ProgrammeAction` (ADM-03)
  - `DataQualityIssue` (ADM-06)
  - `ExportAudit` (ADM-07)
- `@laif/analytics`:
  - `dataset`, `overview`, `catalogue`, complementary suppression (ADM-02)
  - `funnel` (ADM-03)
  - `timeliness` (ADM-04)
  - `workload` (ADM-05)
  - `quality` (ADM-06)
  - `reports` (ADM-07)
- `@laif/domain`: `isOverdue` if missing (ADM-04).
- `@laif/auth-demo`: `evaluateAccess` (ADM-08).
- `@laif/repositories`:
  - scoped `list*` (ADM-02)
  - programme actions (ADM-03)
  - quality issues (ADM-06)
  - grants/audit paging (ADM-08)
- `@laif/test-utils`: `adminMetricsFixture`, `renderWithAdmin`, `readStoreCollection`.

## Open product-owner decisions (prototype default in brackets)

Consolidated with the other tracks in `phases/CONSISTENCY_REVIEW.md` §3 (authoritative).

1. **Period attribution:** count downstream steps in the originating screening's period (cohort) or in the event's own period? [cohort; workload uses task creation date]
2. **Suppression policy:** whether 0 is shown, complementary suppression, and who may change k. [0 shown; complementary on; k = 5, programme lead only, range 3–20]
3. **"De-identified CSV" (PA-07) vs "no patient-level export" (spec §2.3).** [aggregate only; record-level shown as disabled]
4. **Overdue reviews:** no review SLA is approved. [Pending reviews shown by age bucket only; "overdue" only from a clinician-set `dueAt`]
5. **Worker-level visibility:** pseudonymous codes, which roles, and whether suppression applies to staff rows. [codes only; drill-down roles; suppression applied]
6. **Quality proxies:** whether "dismissed after review" and "manual escalation" are acceptable proxies for false/missed flags. [yes, labelled PROXY]
7. **Consent-withdrawn patients:** excluded from aggregates? [excluded, with footnote count]
8. **Quality queue:** may operational issue rows (opaque refs, no names) be shown to triage roles below k? [yes]
9. **Role taxonomy and audit visibility:** what auditors and facility managers may see. [see the ADM-01 matrix]
10. **"Approved screening type" taxonomy (PA-02).** [BP / glucose / both]
11. **PA-05 workload measure:** an approved method is pending. [self-reported demo minutes per patient-day]
