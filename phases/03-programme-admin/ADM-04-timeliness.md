# ADM-04 — Timeliness: median days to review and overdue trends

Status: Not started

## 1. Header

| Field | Value |
|---|---|
| ID | ADM-04 |
| Title | Timeliness: median days to review and overdue trends |
| App | Programme Admin Dashboard |
| Depends on | ADM-02 (ADM-03 is not required; can be built in parallel after ADM-02) |
| PRD/FRD trace | PA-04 (median days to clinical review, overdue queues as aggregate counts), FRD §5 ("do not falsely label … overdue without approved timing rules"), spec §2.3 `/admin/timeliness`, spec §5.2 (overdue is derived), BO-02 |
| Size | M |

## 2. Goal

`/admin/timeliness` answers "how long does it take a flagged screening to be clinically reviewed, and how many follow-up steps are past their due date?" using only aggregates:
- KPI strip: median days to review, 90th percentile, reviews pending, overdue referrals, overdue follow-ups.
- Weekly line chart of median days to review.
- Weekly **overdue trend** line chart (referrals vs follow-ups).
- Bar list of median days by facility.
- Pending-review **age buckets**, which are deliberately not called "overdue" because no review SLA is approved.

"Overdue" applies only where a clinician-set `dueAt` has passed on an incomplete referral or follow-up. It is computed as of the pinned demo clock and is never stored.

## 3. Scope

**In scope:** timeliness calculators, timeliness page, overdue-trend chart, aging buckets, facility comparison with suppression.
**Out of scope:** setting SLAs or targets (a [DECISION] item, shown as "No approved target" in the UI); clinician-level timeliness (not shown, to avoid individual performance ranking of clinicians).

## 4. Deliverables

```text
packages/analytics/src/metrics/timeliness.ts       # EXTEND FND-06 timeliness (no parallel file)
packages/analytics/src/metrics/timeliness.test.ts
apps/programme-admin/src/
  routes/timeliness/TimelinessPage.tsx
  features/timeliness/MedianTrendChart.tsx     # LineTrend, one series + n per week in tooltip/table
  features/timeliness/OverdueTrendChart.tsx    # LineTrend, two series (referrals solid, follow-ups dashed)
  features/timeliness/AgingBuckets.tsx         # stacked thin progress bars with counts
  features/timeliness/FacilityMedianList.tsx   # HBarList, value = median days, label n
  features/timeliness/queries.ts               # useTimelinessMetrics (select over dataset)
packages/i18n/src/locales/{en,rw}/admin.timeliness.json
```

## 5. Implementation tasks

1. **Calculators** (extend FND-06 `metrics/timeliness.ts`), pure, `(ds, now: Date)`:
   - `reviewDelaysDays(ds)` → number[] of `(reviewedAt − measuredAt)/86_400_000` for reviewed flagged cohort screenings (actioned **and** dismissed, because both are clinical reviews). The same function powers ADM-02 `medianDaysToReview`, so refactor that to call it.
   - `percentile(values, p)` using linear interpolation between closest ranks (documented in `METRIC_DEFINITIONS`); `medianDaysToReview = percentile(…, 50)`, `p90DaysToReview = percentile(…, 90)`. A delay below n = k (the suppression threshold) is reported as `suppressed`, because percentiles of tiny groups can disclose individual timings.
   - `weeklyMedianDaysToReview(ds)` → `[{ weekStart, median|null, n }]`, grouped by the Kigali ISO week of `reviewedAt`.
   - `pendingReviews(ds, now)` → reviews with status ∈ {`pending`, `in_review`} for flagged cohort screenings; `pendingAgeBuckets` = `{ '0-2': n, '3-7': n, '8-14': n, '15+': n }` by days since `measuredAt`.
   - Overdue = FND-02 `isReferralOverdue` / `isFollowUpOverdue` (shared with CLN and HWM; not re-implemented here).
   - **`medianDaysToReferralCompletion`** (PDF coverage, LAIF MoH p. 17 KPI 02 "median days from screening event to professional review **and referral completion**"): median of `(referral.completionEvidence.recordedAt − screening.measuredAt)` over completed referrals of the cohort; suppressed when n < k; shown as a sixth KPI cell "Median days to referral completion" and in the `timeliness` report template.
   - `overdueSnapshot(ds, now)` → `{ referrals, followUps }`.
   - `weeklyOverdueTrend(ds, weeks)` → for each week-end instant `W` (Sunday 23:59:59 Kigali, the last point = `now`): count items with `createdAt ≤ W`, `dueAt < W`, and (`completedAt == null || completedAt > W`), excluding items cancelled before `W`. This reconstructs history from timestamps, so it needs no snapshot table.
   - `medianDaysByFacility(ds)` → `AggregateCell` per facility (suppressed when n < k).
2. **Page layout:**
   - Header eyebrow `TIMELINESS`, then the filter bar.
   - KpiStrip:
     - "Median days to review" with sub-label "n = {n} reviews"
     - "90th percentile"
     - "Reviews pending" with sub-label "{n} waiting 8+ days"
     - "Overdue referrals"
     - "Overdue follow-ups"
   - Left (8 cols): `MedianTrendChart`, then `OverdueTrendChart` with legend "Referrals past due date" / "Follow-ups past due date".
   - Right (4 cols): `AgingBuckets` card titled "Pending reviews by age", with mono micro-label `NO APPROVED REVIEW TARGET`; `FacilityMedianList`; info callout "Overdue means a due date set by a clinician has passed and the step is not completed. Review targets are not yet approved by the clinical protocol owner, so pending reviews are shown by age only."
3. **Links:**
   - Overdue KPI cells link to the funnel stage drill-down (`/admin/funnel/referred?…`).
   - Facility rows link to `/admin/timeliness?facility=<id>` (filter narrowing, still guarded).
   - The overview "Needs attention" card (ADM-02) is wired to these calculators, so both pages reconcile.
4. **Formatting:** days to 1 decimal via the i18n number formatter; units are always written out ("days"/"iminsi"). Trend tooltips and table rows show `n` so medians from small samples are visible.
5. **Query keys:** `adminKeys.timeliness(scopeKey, filters, nowIso)`. `nowIso` comes from the demo clock so a clock reset invalidates the cache.
6. **Chart accessibility:**
   - The overdue trend uses solid vs dashed lines plus distinct point markers (circle vs square).
   - The `figcaption` summary is generated, e.g. "Overdue referrals rose from 2 to 6 over 12 weeks; overdue follow-ups fell from 5 to 3".
   - The table alternative lists every week.

## 6. Data, state and audit

- Read only: Screening (measuredAt), Review (status, reviewedAt), Referral (createdAt/requestedAt, dueAt, status, completedAt), FollowUp (createdAt, dueAt, status, completedAt), demo clock.
- No writes; no audit event (aggregate view, no drill to records).
- Invariants:
  - `overdue` is derived and never persisted.
  - The last point of `weeklyOverdueTrend` equals `overdueSnapshot` (tested).
  - The facility medians' combined n equals the overall n.
  - Pending reviews are never labelled overdue.

## 7. UX states

| State | Behaviour |
|---|---|
| loading | KPI and chart skeletons |
| loaded | As above with a "Computed at" stamp and the demo-clock note "As of {DEMO_NOW Kigali}" |
| empty | No reviews in period → median shows "—" with "No completed reviews in this period"; no overdue → "0" with a positive check icon + text (not colour only) |
| suppressed | Fewer than k reviews → median shows `SUPPRESSED` pill and sr text |
| server error | ErrorState + Retry |
| permission denied | ScopeGuard 403 (ADM-01) |
| offline | Banner; local data renders |
| validation | Filter validation from ADM-02 |

## 8. i18n

Namespace `admin.timeliness`:

| Key | EN | RW (needs linguistic review) |
|---|---|---|
| `admin.timeliness.kpi.median` | Median days to review | Iminsi yo hagati kugeza isuzuma |
| `admin.timeliness.kpi.pending` | Reviews pending | Isuzuma ritegerejwe |
| `admin.timeliness.kpi.overdueReferrals` | Overdue referrals | Ibyoherezwa byarengeje igihe |
| `admin.timeliness.noTarget` | No approved review target | Nta ntego y'isuzuma yemejwe |
| `admin.timeliness.unit.days` | {count, plural, one {# day} other {# days}} | {count, plural, one {umunsi #} other {iminsi #}} |
| `admin.timeliness.asOf` | As of {datetime} (Kigali) | Kugeza {datetime} (Kigali) |

ICU plurals come from `@laif/i18n`. The generated chart summaries are i18n templates with interpolated numbers, never concatenated strings.

## 9. Acceptance criteria

- [ ] With `adminMetricsFixture`, the median is 1.5 days and p90 matches the documented interpolation (exact assertion).
- [ ] The last week of the overdue trend equals the "Overdue referrals"/"Overdue follow-ups" KPI and the overview "Needs attention" values.
- [ ] Completing a referral in the seed (test mutation) before `now` removes it from overdue in the current week but not in earlier weeks.
- [ ] Facility medians with n < k are suppressed. District Beta shows `SUPPRESSED` for the programme lead with the default threshold.
- [ ] The UI contains no element that labels pending reviews as "overdue"; this is asserted by a test querying the `admin.timeliness.*` text.
- [ ] Both charts have table alternatives and generated captions in EN and RW.

## 10. Tests

- `packages/analytics/src/timeliness.test.ts` — percentile interpolation (n = 1, 2, 5, 10), weekly grouping across a Kigali week boundary (Sunday 23:30 Kigali = Sunday 21:30 UTC), overdue historical reconstruction, cancelled items excluded, invariant last-week = snapshot.
- `apps/programme-admin/src/routes/timeliness/TimelinessPage.test.tsx` — seeded render, suppression pill, table toggle, RW plural rendering, empty period.
- `apps/programme-admin/src/features/metrics/reconcile.seed.test.ts` — extend with the timeliness vs overview reconciliation.

## 11. Verification

```bash
pnpm --filter @laif/analytics test -- timeliness
pnpm --filter @laif/programme-admin typecheck && pnpm --filter @laif/programme-admin lint && pnpm --filter @laif/programme-admin test
pnpm typecheck && pnpm lint && pnpm test && pnpm build
pnpm dev:admin
```

Manual:
1. District Alpha analyst → Timeliness. The KPI shows a median in days with n, and "Pending reviews by age" shows the `NO APPROVED REVIEW TARGET` label.
2. Toggle "View as table" on the overdue trend. Compare the last row with the Overdue KPI and with the Overview "Needs attention" card.
3. Switch the district URL param to B → 403. Switch to the programme lead and select District Beta → suppressed median.

## 12. Commit

`feat(admin): ADM-04 timeliness metrics, overdue trend and review aging`
