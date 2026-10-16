# ADM-02 — Global filters, metric layer, chart kit and KPI overview

Status: Not started

## 1. Header

| Field | Value |
|---|---|
| ID | ADM-02 |
| Title | Global filters, metric layer, chart kit and KPI overview |
| App | Programme Admin Dashboard |
| Depends on | ADM-01 |
| PRD/FRD trace | PA-02 (counts by period, facility, district, approved screening type), PA-01 (scope applied to data), FRD §7 small-cell suppression, spec §2.3 `/admin/overview`, spec §8 "no fabricated KPIs", BO-04 |
| Size | L |

## 2. Goal

`/admin/overview` shows a live, record-derived KPI overview in the "Advisor insights" layout:
- A **global filter bar** (date range preset or custom, district, facility, screening type) stored in the URL, so links can be shared and reloads keep the filters.
- A **KPI strip** (screenings recorded, flagged for review, clinically reviewed, follow-up completed, median days to review).
- A weekly line chart (screenings vs flagged), horizontal bars (screenings by facility), a "Screening type" side card and a "Needs attention" side card.
- A soft-blue **data note** callout built only from the displayed figures.

Every count comes from `@laif/analytics` calculators over scoped records. Small cells are suppressed with the configurable demo threshold (default 5). Every chart has an equivalent data table.

## 3. Scope

**In scope:** filter schema and URL sync; metrics dataset loader; shared metric catalogue; suppression wrapper; chart kit (pinned library); overview page.
**Out of scope:** funnel drill-down (ADM-03); threshold editing UI (ADM-09; this phase reads it from settings with default 5).

## 4. Deliverables

```text
apps/programme-admin/src/
  features/filters/filterSchema.ts      # AdminFilterSchema (Zod)
  features/filters/useAdminFilters.ts   # read/write URL search params, defaults, invalid-param notice
  features/filters/FilterBar.tsx        # DateRangeSelect, DistrictSelect, FacilitySelect, TypeSelect, "Reset filters"
  features/metrics/loadMetricsDataset.ts# scoped repository reads -> MetricsDataset
  features/metrics/queries.ts           # useMetricsDataset, useOverviewMetrics (select)
  lib/queryKeys.ts                      # adminKeys factory
  components/KpiStrip.tsx               # one card split by dividers (ref image 1)
  components/SuppressedValue.tsx        # renders value | "<k" with sr-only explanation
  components/MetricInfo.tsx             # (i) popover: definition, formula, n, computedAt, ruleset versions
  components/DataNoteCallout.tsx        # soft-blue callout
  components/charts/chartTheme.ts       # semantic token -> series colours + dash patterns
  components/charts/ChartFrame.tsx      # title, legend, "View as table" toggle, aria summary, figure/figcaption
  components/charts/LineTrend.tsx       # Recharts LineChart wrapper
  components/charts/HBarList.tsx        # pure CSS horizontal bars (ref image 1 "Most asked topics")
  components/charts/ChartTable.tsx      # AccessibleDataTable from @laif/ui-web
  routes/overview/OverviewPage.tsx
packages/analytics/src/dataset.ts       # MetricsDataset type, filterDataset(), cohort attribution (extends FND-06 filters.ts)
packages/analytics/src/metrics/screening-overview.ts  # EXTEND FND-06 screeningOverview with the calculators below (no parallel overview.ts)
packages/analytics/src/catalogue.ts     # METRIC_DEFINITIONS (MetricDefinition records, version 'demo-metrics-1')
(packages/analytics/src/suppression.ts  # FND-06 suppressCells already does primary + complementary suppression — consume, do not re-add)
packages/i18n/src/locales/{en,rw}/admin.filters.json, admin.overview.json, admin.charts.json, admin.privacy.json
```

## 5. Implementation tasks

1. **Chart library: pin `recharts` 3.x exactly** (no caret; use the newest 3.x patch at install time and record it in `apps/programme-admin/package.json`). Reasons:
   - declarative React components that work with React 19;
   - SVG output that can be labelled for screen readers;
   - `LineChart`/`BarChart`/`ResponsiveContainer` cover every chart needed, so less code than visx;
   - tree-shakeable, and lazy routes keep it off the login bundle.

   Only `ChartFrame`/`LineTrend` import Recharts, so the library can be swapped later. Simple bar lists are plain CSS (`HBarList`), which is faster and more accessible. In jsdom, tests pass `width`/`height` props through `ChartFrame` (ResizeObserver is stubbed in `@laif/test-utils`) and assert on `ChartTable` rather than on SVG geometry.
2. **Filter schema** (`AdminFilterSchema`):
   - URL params: `preset` (`30d`|`90d`|`ytd`|`custom`, default `90d`), `from`/`to` (`YYYY-MM-DD` Kigali, required when `custom`), `district` (id, optional = all in grant), `facility` (id, optional), `type` (`all`|`bp`|`glucose`, default `all`).
   - Rules: `from ≤ to`; `to ≤ demoClock.today()`; span ≤ 366 days; a facility must belong to the selected district.
   - Invalid params are replaced with defaults through `navigate(..., { replace: true })` and a dismissible notice with translated text (`admin.filters.validation.*`). The out-of-scope check runs first in ScopeGuard (ADM-01), so tampering gives a 403, not a silent reset.
3. **useAdminFilters** returns `{ filters, setFilter, reset, searchString }`. Sidebar `NavLink`s append `searchString`, so the filters carry across pages. A district-scoped persona sees the district select locked to its one value.
4. **Dataset loader.** `loadMetricsDataset(repo, grant, filters)`:
   1. Calls `assertScope` first.
   2. Reads screenings, reviews, referrals, follow-ups, time entries, facilities and districts limited to the grant via FND-07 `list*` methods (filters accept `districtIds`/`facilityIds`) and `getAggregateMetrics`; add a `timeEntries` read service in `@laif/repositories` (FND-07 extension rule).
   3. Returns a `MetricsDataset`.

   Raw arrays never reach page components. Pages consume only selector outputs (`AggregateCell` objects).
5. **Attribution rules** (`packages/analytics/src/dataset.ts`, documented in `METRIC_DEFINITIONS`):
   - Period membership uses `screening.measuredAt` converted to a Kigali date.
   - Downstream reviews, referrals and follow-ups are **attributed to the cohort of their originating screening** (no misleading denominators).
   - Drafts are excluded. Amended screenings count once (the original id).
   - Patients with `consentState='withdrawn'` are excluded, and the excluded count is shown in the footnote.
   - `type=bp` means a systolic value is present; `glucose` means a glucose value is present (`both` counts in each).
6. **Calculators** (extend FND-06 `metrics/screening-overview.ts`; funnel stage definitions are FND-06 task 7), all pure and taking `(ds: MetricsDataset)`:
   - `countScreened` = submitted screenings in the cohort; `countDistinctPeopleScreened`.
   - `countFlagged` = cohort screenings with status `review_required`.
   - `countReviewed` = reviews of flagged cohort screenings with status ∈ {`action_recorded`, `dismissed_with_reason`}. `countDismissed` and `countActioned` split it (WF-03: dismissals are never counted as completed care).
   - `countFollowUpCompleted` = cohort screenings with ≥1 referral `completed` **with** `completedAt` and `completionEvidence`, or a follow-up `completed` with `completedAt` and `outcome`.
   - `medianDaysToReview` = median of `(review.reviewedAt − screening.measuredAt) / 86_400_000` over reviewed cohort screenings, rounded to 1 decimal. For an even n it is the mean of the two middle values. With no reviews it returns `null`.
   - `weeklyScreenedVsFlagged` = Kigali ISO weeks (Monday start) → `{ weekStart, screened, flagged }`.
   - `countByFacility(metric)` and `countByScreeningType()`.
   - `needsAttention` = `{ overdueReferrals, overdueFollowUps, pendingReviewsAged8Plus, openQualityIssues }`. "Overdue" comes **only** from an explicit `dueAt < now` on an incomplete referral or follow-up. Pending review age is reported in buckets and never labelled overdue (FRD §5: no approved timing rule).
7. **Suppression.**
   - `toCells(values, k)` is a thin adapter over FND-06 `suppressCells(table, threshold)`, which already applies primary (`0 < n < k`; 0 shown) **and** complementary suppression; no second implementation.
   - Rates are suppressed when the numerator or denominator is suppressed.
   - `SuppressedValue` shows `<5` (the threshold is interpolated) with a mono `SUPPRESSED` pill. Screen readers hear "Fewer than 5, hidden to protect privacy".
8. **MetricDefinition catalogue.** Each KPI has `{ id, labelKey, numerator, denominator, inclusion, attribution, version: 'demo-metrics-1', status: 'measured' | 'deferred', pilotKpi?: 'KPI01'…'KPI06' }`. **PDF coverage (LAIF MoH proposal p. 17):** the catalogue lists all six pilot KPIs — KPI01 follow-up completed, KPI02 time to clinical review (+ referral completion, ADM-04), KPI04 workload (ADM-05), KPI06 prompt/ID reliability (ADM-06) as `measured`; KPI03 medicine-history completeness and KPI05 patient understanding as `deferred` (no field in the NCD MVP — BRD §10 says mark deferred rather than fabricate). A footnote card "Pilot KPIs" on the overview shows the six with status; deferred ones read "Not measured in this prototype (deferred)" and never show a number. `MetricInfo` renders it with `n`, "Computed {Kigali time}" (from TanStack `dataUpdatedAt`) and the ruleset versions present in the cohort.
9. **Overview layout** (desktop 1440/1280/1024: 12-column grid, 8 + 4):
   - Page header: eyebrow `PROGRAMME PERFORMANCE`, greeting, subtitle with period + scope.
   - Filter bar (right side).
   - `KpiStrip` with 5 cells. Each cell has a sub-label, e.g. "{pct}% of screenings", "{dismissed} dismissed with reason".
   - Left column: `ChartFrame` "Screenings per week" (LineTrend: screened vs flagged), then `HBarList` "Screenings by facility" (rows link to `/admin/funnel?facility=`).
   - Right column: card "Screening type", card "Needs attention" (rows link to Timeliness and Quality), `DataNoteCallout`.
   - Footnote: "Synthetic demonstration data · {n} records excluded (consent withdrawn) · metrics version demo-metrics-1".
10. **Data note** `deriveOverviewNote(metrics)`: picks the facility with the lowest unsuppressed completion rate and states "{facility}: {completed} of {referred} referred screenings reached a completed follow-up ({pct}%)". It is labelled "Summary of figures shown — not a recommendation". If no facility has unsuppressed data, the callout is omitted.
11. **Query keys** (`lib/queryKeys.ts`): `adminKeys.all = ['admin']`, `dataset(scopeKey, filters)`, `overview(scopeKey, filters)` (derived via `select`), with `scopeKey = ${grantId}@${grantVersion}`. The settings threshold is part of the overview key so a threshold change recomputes.

## 6. Data, state and audit

- Read only. Entities: Screening, Review, Referral, FollowUp, Patient (consent state only), Facility, District, Ruleset ids.
- No audit event for routine aggregate views; filter changes are UI state, not audited.
- Invariants: every displayed number has a catalogue definition; overview totals equal the sum of unsuppressed and suppressed facility values before masking (tested); no patient identifiers in any selector output (type `AggregateCell` has no id fields).

## 7. UX states

| State | Behaviour |
|---|---|
| loading | KpiStrip and chart skeletons (fixed height, no layout shift); filter bar stays interactive |
| loaded | As above; "Computed 09:00 (Kigali)" stamp |
| empty | Period with zero screenings: KPI "0", charts replaced by `EmptyState` "No screenings recorded in this period" + "Widen date range" |
| validation error | Invalid URL filter → notice banner, defaults applied; custom range `from > to` → inline field error |
| server error | Fault simulation `500`/`DEPENDENCY_UNAVAILABLE` → `ErrorState` with Retry; **never** stale fabricated numbers |
| permission denied | Out-of-grant filter → 403 (ADM-01) |
| offline | Banner; local data still renders |
| stale | Data older than the last repository write (`meta.lastWriteAt > dataUpdatedAt`) → "Data changed — Refresh" chip |

## 8. i18n

Namespaces: `admin.filters`, `admin.overview`, `admin.charts`, `admin.privacy`. All numbers and dates go through `@laif/i18n` formatters (Africa/Kigali, locale-aware digits).

| Key | EN | RW (needs linguistic review) |
|---|---|---|
| `admin.overview.kpi.screened` | Screenings recorded | Ibipimo byafashwe |
| `admin.overview.kpi.flagged` | Flagged for review | Byagaragajwe ngo bisuzumwe |
| `admin.overview.kpi.reviewed` | Clinically reviewed | Byasuzumwe na muganga |
| `admin.overview.kpi.completed` | Follow-up completed | Ikurikirana ryarangiye |
| `admin.filters.district` | District | Akarere |
| `admin.filters.validation.rangeOrder` | Start date must be on or before end date | Itariki itangira igomba kuba mbere y'itariki irangiriraho |
| `admin.privacy.suppressed.sr` | Fewer than {k}, hidden to protect privacy | Biri munsi ya {k}, byahishwe kubera ibanga |
| `admin.charts.viewAsTable` | View as table | Reba mu mbonerahamwe |

## 9. Acceptance criteria

- [ ] Changing any filter updates the URL. Reloading restores the same view. Copying the URL into a new tab (same session) shows identical numbers.
- [ ] The KPI values equal the expected values from `adminMetricsFixture` (reconciliation test) and the seed reconciliation test.
- [ ] As the programme lead, District Beta values that fall below the threshold show `<5` with the `SUPPRESSED` pill. Complementary suppression is applied when a total is shown.
- [ ] Dismissed reviews appear in the "Clinically reviewed" sub-label and are **not** counted in "Follow-up completed".
- [ ] Every chart has a working "View as table" toggle, a `figcaption` summary, and series that are distinguishable without colour (dash pattern + legend markers).
- [ ] No string in `OverviewPage` is hard-coded (lint rule `i18next/no-literal-string` or the FND equivalent passes).

## 10. Tests

- `packages/analytics/src/overview.test.ts` — exact values on `adminMetricsFixture` (add to `@laif/test-utils`: 10 screenings, 6 flagged, 5 reviewed of which 1 is dismissed, 3 referred, 2 completed, review delays [0.5,1,1.5,2,4] → median 1.5), even/odd median, empty → null, consent exclusion, type filter.
- `packages/analytics/src/suppression.test.ts` — primary, complementary, rate suppression, k = 3/5/10.
- `apps/programme-admin/src/features/filters/filterSchema.test.ts` — defaults, invalid params, the 366-day limit.
- `apps/programme-admin/src/routes/overview/OverviewPage.test.tsx` — renders seeded metrics, table toggle, empty and error states (fault injection), RW rendering.
- `apps/programme-admin/src/features/metrics/reconcile.seed.test.ts` — calculators vs naive independent filters over the seeded Dexie (`fake-indexeddb`); facility sum = district = overall.

## 11. Verification

```bash
pnpm --filter @laif/analytics test
pnpm --filter @laif/programme-admin typecheck && pnpm --filter @laif/programme-admin lint && pnpm --filter @laif/programme-admin test
pnpm typecheck && pnpm lint && pnpm test && pnpm build
pnpm dev:admin
```

Manual:
1. Programme lead → Overview. Set the preset to 30 days; the URL shows `preset=30d`. Choose District Beta: KPI cells show `<5`. Click "View as table" on the weekly chart.
2. Switch to RW: labels and number formatting change, and the values stay identical.
3. Set the custom range end before the start → inline error.
4. Demo tools (FND-11 `DemoToolsMenu`) → "Server errors" (FND-07 `serverErrorRate`; full panel arrives in ADM-09) → ErrorState → Retry.

## 12. Commit

`feat(admin): ADM-02 URL filters, metric layer, chart kit and KPI overview`
