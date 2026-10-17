# CLN-05 — Review work queue with KPI strip, filters, counts and sort

## 1. Header

| Field | Value |
|---|---|
| ID | CLN-05 |
| Title | Review queue: KPI strip, tabbed filters with counts, facility/assignee filters, sort, expandable "needs you" rows |
| App | Clinical Web Portal |
| Depends on | CLN-04 |
| Trace | PRD CL-03, PRD §4 journey 1; FRD CL-03, FRD §5 (`OVERDUE` derived, do not falsely label); spec §2.1 `/clinical/queue`, §8 "Filter review queue — counts and rows match repository"; BRD BR-04, BO-02 |
| Size | M |
| Status | Done |

## 2. Goal

The clinician's landing page shows a KPI strip (Awaiting review · Urgent (demo protocol) · Overdue (derived) · Assigned to me · Reviewed this week) and a tabbed queue (`Pending N`, `Urgent N`, `Overdue N`, `Assigned to me N`, `All in scope N`) whose counts always equal the rows the repository returns. Rows expand inline (ref-image "Needs you" pattern) to show the triggering readings, flag reason, ruleset version and source, with "Open review" as the primary action. Filters and sort are URL-persisted and scoped to the active facility/permitted facilities.

## 3. Scope

**In scope**: `/clinical/queue`; `ReviewQueueFilterSchema`; `countReviews`; KPI strip; tabs; facility + assignee filters; sort (oldest first default, flagged-at, due, patient); search within queue; expandable rows; sidebar badge for pending count.
**Out of scope**: claiming / starting a review (CLN-06); bulk actions; notifications.

## 4. Deliverables

| Path (`apps/clinical-web/src/`) | Purpose |
|---|---|
| `features/queue/ReviewQueuePage.tsx` | Page header + KPI strip + `QueueTabs` + `QueueToolbar` + `QueueList` |
| `features/queue/QueueKpiStrip.tsx` | One white card split by vertical dividers (ref-image 1/5) using `MetricCard` |
| `features/queue/QueueTabs.tsx` | `Tabs` with count badges, `role="tablist"` |
| `features/queue/QueueToolbar.tsx` | Search, facility select, assignee select (`Anyone / Me / Unassigned`), sort select |
| `features/queue/QueueRow.tsx` | Collapsed: initials, patient + synthetic ID, one-line reason, status pill (`NEEDS REVIEW`, `URGENT · DEMO`, `OVERDUE`, `IN REVIEW`), relative time, chevron |
| `features/queue/QueueRowDetail.tsx` | Expanded: `TRIGGERING READINGS` mono label + values, `WHY THIS NEEDS REVIEW` callout (reason codes → translated text), ruleset version, source, actions |
| `features/queue/useReviewQueue.ts` | `useQuery` list + counts; URL state |
| `packages/contracts` | `ReviewQueueFilterSchema` (new, in `filters.ts`, extends FND-03 `ReviewFilterSchema`) |

```ts
ReviewQueueFilterSchema = z.object({
  tab: z.enum(['pending','urgent','overdue','assigned','all']).default('pending'),
  facilityId: z.string().optional(),            // must be in permitted set
  assignee: z.enum(['any','me','unassigned']).default('any'),
  q: z.string().trim().max(60).optional(),
  sort: z.enum(['flaggedAt_asc','flaggedAt_desc','dueAt_asc','patient_asc']).default('flaggedAt_asc'),
  page: z.coerce.number().int().min(1).default(1),
})
```

## 5. Implementation tasks

1. Define tab predicates in `@laif/domain` (`reviewQueuePredicates`, new) so FND-07 `listReviews`/`countReviews` and the UI share them:
   - `pending`: status ∈ {`pending`, `in_review`}.
   - `urgent`: pending AND `review.priority === 'urgent_demo'` (FND-02 field, fixture-labelled; UI copy says "Urgent per demo protocol — not clinically validated").
   - `overdue`: pending AND `reviewDueAt` set AND `reviewDueAt < demoClock.now()` (derived, never stored).
   - `assigned`: pending AND `review.assignedClinicianId === persona.id`.
   - `all`: every review in scope (incl. decided/dismissed).
2. `repository.countReviews(filterWithoutTab)` (FND-07) returns `{ pending, urgent, overdue, assigned, all }` in one call; list + counts use the **same** facility/assignee/q filters so badges reconcile with rows.
3. `useReviewQueue`: parse URL params via schema (invalid → defaults, and invalid facility outside scope → dropped with toast "Facility not in your scope"); keys `clinicalKeys.reviews(fac, f)` and `clinicalKeys.reviewCounts(fac, f)`; `refetchInterval: 30s` (simulates new arrivals).
4. KPI strip: values from `countReviews` + `reviewedThisWeek` (from `listReviews({ decidedSince: startOfWeek(Kigali) })`). Each tile labelled; dot icon + text for urgency (not colour only).
5. Expandable rows: one open at a time (accordion), `aria-expanded`, Enter/Space toggles, `→` opens review. Primary button `Open review` → `routes.review(id)`; secondary `Open patient`.
6. Row status pill priority: `OVERDUE` > `URGENT · DEMO` > `IN REVIEW (by X)` > `NEEDS REVIEW`. `IN REVIEW` by another clinician shows their name (concurrent-review edge case).
7. Sidebar badge on "Review queue" = `counts.pending` (shared via query cache).
8. Pagination 25/page; "Showing 6 of 8" footer like ref-image.
9. Emits `queue.viewed` once per mount with filter summary (no patient data).

## 6. Data, state and audit

- Reads: Review (with evidence summary), Patient summary, Screening summary, demo clock.
- Audit: `queue.viewed`.
- Invariants: counts == rows for the same filter; overdue derived only from `reviewDueAt` present in data (no invented timing); no out-of-scope rows.

## 7. UX states

| State | Behaviour |
|---|---|
| Loading | KPI skeleton + 5 row skeletons; tabs show `—` counts |
| Loaded | Rows; first row not auto-expanded |
| Empty | Per-tab copy, e.g. Pending: "No screenings are waiting for review in Facility Alpha-1" with link to `All` |
| Validation | Bad URL params silently normalised; out-of-scope facility → toast |
| Server error / timeout | `ErrorState` in list area, KPI strip shows last values with "stale" label |
| Permission denied | Persona without `queue.read` → `PermissionDenied` |
| Offline | Banner + cached list labelled "Last updated hh:mm" |
| Conflict / success | N/A (read-only) |

## 8. i18n

Namespace `clinical.queue`: `title|subtitle`, `kpi.awaiting|urgent|overdue|assignedToMe|reviewedThisWeek`, `tabs.pending|urgent|overdue|assigned|all`, `filters.facility|assignee.any|me|unassigned|sort.*|search`, `row.status.needsReview|urgentDemo|overdue|inReviewBy`, `row.triggeringReadings|whyReview|openReview|openPatient`, reason text from the shared `domain:reason.<ReasonCode>` keys (FND-02 codes only, e.g. `DEMO_BP_SYSTOLIC_AT_OR_ABOVE_THRESHOLD`, `GLUCOSE_UNIT_MISSING`; no clinical-only codes), `empty.<tab>`, `footer.showing`. Reason-code text and "urgent" copy flagged `needs clinical/linguistic review`; reason text must say "above demo threshold", never a diagnosis. Counts use ICU plurals in both languages.

## 9. Acceptance criteria

- [ ] For each tab, badge count == number of rows across all pages (asserted against repository in test).
- [ ] Changing facility/assignee/search updates counts and rows consistently.
- [ ] Filters persist in URL; reload and back/forward restore them.
- [ ] WF-04 patient never appears for Alpha-1 personas, in any tab or count.
- [ ] `WF01_FLAGGED_REVIEW` appears in Pending and Assigned to me for the clinician persona.
- [ ] Row expand/collapse fully keyboard operable; screen reader announces expanded state.
- [ ] No flag text uses diagnostic wording (lint-style test over EN catalogue for banned words: "diagnosis", "hypertensive", "diabetic").

## 10. Tests

- `packages/domain/src/__tests__/reviewQueuePredicates.test.ts` — derived overdue with pinned clock.
- `src/features/queue/__tests__/ReviewQueuePage.test.tsx` — counts match rows per tab, URL sync, empty states.
- `src/features/queue/__tests__/QueueRow.test.tsx` — expand, keyboard, pill priority.
- `src/features/queue/__tests__/copySafety.test.ts` — banned diagnostic words absent in `clinical.queue` EN.
- `e2e/review-queue.spec.ts` — filter → counts reconcile → open review.

## 11. Verification

```bash
pnpm --filter @laif/domain test
pnpm --filter @laif/clinical-web typecheck && pnpm --filter @laif/clinical-web lint && pnpm --filter @laif/clinical-web test
pnpm --filter @laif/clinical-web test:e2e -- review-queue
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```
Manual: clinician Alpha-1 → lands on queue → KPI strip populated → click `Overdue` tab → count equals rows → expand a row → see triggering readings + demo disclaimer → sort by due → reload (filters kept) → switch persona to coordinator Alpha-1+Alpha-2 → facility filter offers Alpha-1, Alpha-2.

## 12. Commit

`feat(clinical): CLN-05 review work queue with filters, counts and sort`
