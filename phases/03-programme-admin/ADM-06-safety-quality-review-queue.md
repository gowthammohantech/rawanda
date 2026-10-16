# ADM-06 — Safety & quality monitor and data-quality review queue

Status: Not started

## 1. Header

| Field | Value |
|---|---|
| ID | ADM-06 |
| Title | Safety & quality monitor and data-quality review queue |
| App | Programme Admin Dashboard |
| Depends on | ADM-02 (ADM-03 for "Send to facility" → programme action) |
| PRD/FRD trace | PA-06 (missing data, false/missed flags after review, identity mismatches), BO-05, BRD §9 risks (false/missed flag, identity mismatch), FRD §4 validation rules (mandatory fields), FRD T-03/T-06, spec §2.3 `/admin/quality` ("missing fields, mismatches, overturned flags, mock review queue"), spec §10 scenarios (missing unit, duplicate submission) |
| Size | L |

## 2. Goal

`/admin/quality` lets a programme user monitor data and safety signals at aggregate level and triage individual **data-quality issues** in a mock review queue, without seeing patient identities:
- KPI strip: screenings with missing mandatory fields, possible identity mismatches, overturned flags (dismissed after review), missed-flag proxy (manual escalations of "no review required"), duplicate submissions prevented.
- Bar list of missing fields by field.
- Weekly trend.
- Queue table of `DataQualityIssue`s with tabs and counts (ref image 4 pattern), status pills and expandable rows. Users can acknowledge, resolve with a note, or send the issue to the facility as a programme action.

Clinical records are never edited from this page. Corrections happen at source through amendment events, and the original is kept (FRD §4).

## 3. Scope

**In scope:** quality calculators; deterministic issue detection with stable ids; persisted triage state; page and queue UI; triage audit.
**Out of scope:** fixing clinical data (the clinician/worker apps own amendments); merging identities (a [DECISION] item); judging clinical accuracy (the overturn and missed proxies are labelled as proxies).

## 4. Deliverables

```text
packages/analytics/src/metrics/quality.ts   # EXTEND FND-06 dataQuality: calculators + detectQualityIssues
packages/analytics/src/quality.test.ts
packages/contracts/src/dataQualityIssue.ts  # DataQualityIssueSchema, TriageInputSchema
packages/repositories/src/...               # upsertDetectedIssues(issues), triageIssue(id, input, expectedVersion, key), listQualityIssues(filter)
apps/programme-admin/src/
  routes/quality/QualityPage.tsx
  features/quality/QualityKpis.tsx
  features/quality/MissingFieldBars.tsx
  features/quality/QualityTrendChart.tsx
  features/quality/IssueQueue.tsx           # tabs: Open {n} · Acknowledged {n} · Resolved {n} · Sent to facility {n}
  features/quality/IssueRow.tsx             # expandable row: what was detected, rule, source app, detectedAt, history
  features/quality/TriageDialog.tsx         # RHF + Zod
  features/quality/mutations.ts
apps/programme-admin/e2e/quality-triage.spec.ts
packages/i18n/src/locales/{en,rw}/admin.quality.json
```

## 5. Implementation tasks

1. **Mandatory-field rules** (`MANDATORY_SCREENING_FIELDS`, from FRD §4 "patient, facility, author, event time, measurement units and source"):
   - `patientId`, `facilityId`, `workerId`, `measuredAt`, `source`, `rulesetVersion`
   - `glucoseUnit` and `glucoseContext` **when** `glucoseValue != null`
   - both `systolic` and `diastolic` when either is present

   `missingFieldsFor(screening)` → field ids. Units are never inferred.
2. **Calculators** (cohort-attributed, `(ds)`):
   - `screeningsWithMissingFields` → `{ n, rate = n / countScreened, byField: Record<field, n> }`.
   - `identityMismatchSignals` → `{ duplicateIdentifier: n, orphanScreening: n }`:
     - (a) more than one patient sharing a `syntheticIdentifier`;
     - (b) a screening whose `patientId` has no patient record in scope.
   - `overturnedFlagRate` = `countDismissed / countReviewed`, with mono label `PROXY · not clinical accuracy`.
   - `missedFlagProxy` = reviews with `origin = 'manual_escalation'` on `no_review_required` screenings.
   - `duplicateSubmissionsPrevented` = count of `sync.duplicate_suppressed` audit events in the period (source: repository idempotency).
   - `completedWithoutEvidence` = referrals `completed` lacking `completedAt` or `completionEvidence`. This must be 0 because of the invariant; it is shown as an invariant check with a check icon.
   - `weeklyQualityTrend` → `{ weekStart, missingFields, mismatches }`.
   - **PDF coverage (LAIF MoH p. 13 "audited for false alarms, missed cases **and fairness**"; "the system learns from every recorded reason"):** `flagReviewOutcomesByGroup(ds)` = flagged / overturned (dismissed) / manual-escalation counts disaggregated by sex and age band (18–39, 40–59, 60+) — aggregate only, `toCells` suppression applied, labelled `PROXY · fairness signal, not a clinical-accuracy measure`; and `dismissalReasonDistribution(ds)` = counts per FND-02 `DISMISS_REASON_CODES` (structured reasons from CLN-07, never free text). Both appear in the "Flag review outcomes" card and the `quality` report template.
3. **Issue detection** `detectQualityIssues(ds)` → `DataQualityIssue[]` with
   - `id = 'dqi_' + stableHash(type + ':' + subjectRef)`, so detection is idempotent and re-running never duplicates.
   - `type ∈ { missing_field, duplicate_identifier, orphan_screening, overturned_flag, manual_escalation }`.
   - `subjectRef` = opaque record ref (`SCR-` + first 8 chars of the uuid). Never a name or synthetic identifier.
   - `facilityId`, `districtId`, `detectedAt`, `details` (field ids / rule code / ruleset version).

   Triage state is stored separately: `{ status: 'open'|'acknowledged'|'resolved_with_note'|'sent_to_facility', note?, programmeActionId?, version, updatedBy, updatedAt, history[] }`. `upsertDetectedIssues` inserts new ids and never resets the triage of existing ids. It runs in the query function and invalidates `adminKeys.qualityIssues`.
4. **Queue UI** (requires `quality.triage` to act; `metrics.read` roles can view the counts only):
   - Tabs with counts, filter chips by type, and pagination of 20.
   - Columns: type pill (mono caps: `MISSING FIELD`, `DUPLICATE ID`, `OVERTURNED`, `MANUAL ESCALATION`, `ORPHAN`), facility, detected (Kigali date), age in days, status pill, actions.
   - The expanded row (ref image 4 "CONFLICT" card) shows "What was detected", the rule and ruleset version (T-10 explanation), the triage history and "Correct at source" guidance (no edit control).
   - Auditor: the queue is read-only and the actions are hidden **and** rejected by the repository (FORBIDDEN).
5. **Triage actions:**
   - *Acknowledge*: no input.
   - *Resolve with note*: `note` is required, 10–500 chars, with translated validation.
   - *Send to facility*: opens `ProgrammeActionDialog` (ADM-03) prefilled with category `data_completeness_check` and title "Review {type} issue {subjectRef}", then links `programmeActionId`. This needs `programme_action.write`; a facility manager can resolve but not send.
   - All triage writes use an idempotency key plus `expectedVersion`. On conflict the `ConflictNotice` shows the latest triage state.
   - Triage changes only the issue state, never the underlying screening (T-06: the original is kept and the reason and author are logged).
6. **Page layout:**
   - Eyebrow `SAFETY & QUALITY`, filter bar.
   - KpiStrip (5 cells).
   - Left (8 cols): `IssueQueue`.
   - Right (4 cols): `MissingFieldBars`, a "Flag review outcomes" card (overturned rate + missed proxy + `PROXY` pill), the "Invariant checks" card (completed without evidence = 0, duplicates prevented), and `QualityTrendChart`.
   - Soft-blue callout: "Issues are corrected at source by the facility through amendment events. Triage here tracks follow-up; it never edits clinical records."
7. **Suppression:** KPI and breakdown counts use `toCells`. Queue rows are individual issues but carry no patient data. The total open count per facility is suppressed in the breakdown when below k. The row list is still shown to `quality.triage` roles because each row is an operational record, not a disclosure. This choice is recorded as a product-owner decision.
8. **Query keys:** `adminKeys.quality(scopeKey, filters)`, `adminKeys.qualityIssues(scopeKey, filters, tab, page)`.

## 6. Data, state and audit

- Reads: the metrics dataset, AuditEvent (`sync.duplicate_suppressed`), DataQualityIssue. Writes: DataQualityIssue (detection upsert + triage), ProgrammeAction (via ADM-03), AuditEvent.
- Issue state machine: `open → acknowledged → resolved_with_note`; `open|acknowledged → sent_to_facility → resolved_with_note`. Resolved issues are terminal unless re-detected under a new id.
- Audit events: `admin.quality_issue.triaged` (before/after status, note length rather than note text, actor, role, facilityId, correlationId), `admin.quality_issue.conflict`, `admin.quality_issue.denied`. Detection upserts are system events `system.quality_issue.detected` (actor `system`), one per new id.
- Invariants: detection is idempotent (running it twice gives the same count); no clinical entity is modified (a test snapshots the screenings table before/after triage); `subjectRef` never contains PII.

## 7. UX states

| State | Behaviour |
|---|---|
| loading | KPI/queue skeletons |
| loaded | KPIs, queue with tab counts |
| empty | Tab with no issues → `EmptyState` "No open issues in this period" with a check icon |
| validation error | Resolve note too short → field error (EN/RW), focus is moved to it |
| server error | Triage failure keeps the dialog open with input; ErrorState for loads |
| permission denied | Auditor sees read-only rows with a lock note; out-of-scope filter → 403 |
| offline/timeout | "Not saved — retry"; the retry reuses the key |
| stale/conflict | ConflictNotice with the latest status, owner and time |
| success | Toast; the row moves to the next tab and counts update |

## 8. i18n

Namespace `admin.quality`:

| Key | EN | RW (needs linguistic review) |
|---|---|---|
| `admin.quality.title` | Safety & quality | Umutekano n'ubuziranenge |
| `admin.quality.kpi.missingFields` | Screenings with missing required fields | Ibipimo bibura amakuru ya ngombwa |
| `admin.quality.kpi.identity` | Possible identity mismatches | Amakuru y'umwirondoro ashobora kuba atavuguruzanya |
| `admin.quality.type.missing_field` | MISSING FIELD | AMAKURU ABURA |
| `admin.quality.correctAtSource` | Corrected at source by the facility; this page never edits clinical records. | Bikosorerwa aho byanditswe n'ikigo; iyi paji ntihindura inyandiko z'ubuvuzi. |
| `admin.quality.validation.noteLength` | Add a note of 10 to 500 characters | Andika icyitonderwa gifite inyuguti 10 kugeza 500 |
| `admin.quality.field.glucoseUnit` | Glucose unit | Igipimo cy'isukari |

The field names used in `byField` map to `admin.quality.field.*` keys. A unit test fails if a `MANDATORY_SCREENING_FIELDS` entry lacks an EN or RW key.

## 9. Acceptance criteria

- [ ] The seeded missing-unit screenings appear in "Missing fields" under "Glucose unit", and the KPI equals the number of queue rows of type `MISSING FIELD` for the same filters.
- [ ] The seeded duplicate identifier pair produces one `DUPLICATE ID` issue. Reloading does not create a second.
- [ ] The overturned-flag rate equals the dismissed / reviewed values from the funnel (ADM-03) for the same filters.
- [ ] Resolving with a 3-character note shows a field error. A valid note moves the issue to Resolved, and its history lists actor, role and time.
- [ ] Triage never changes any screening (a test compares table snapshots).
- [ ] The auditor cannot triage via the UI or the repository (FORBIDDEN + audit `admin.quality_issue.denied`).
- [ ] No patient name or synthetic identifier appears anywhere on the page.

## 10. Tests

- `packages/analytics/src/quality.test.ts` — mandatory-field matrix, conditional glucose rules, mismatch detection, stable ids, idempotent detection, invariant check.
- `packages/repositories/src/qualityIssue.test.ts` — upsert preserves triage, version conflict, idempotency, FORBIDDEN.
- `apps/programme-admin/src/features/quality/TriageDialog.test.tsx` — validation EN/RW, disabled while pending.
- `apps/programme-admin/src/features/quality/IssueQueue.test.tsx` — tabs/counts, keyboard expand, read-only auditor.
- `apps/programme-admin/e2e/quality-triage.spec.ts` — District Alpha analyst: open a missing-unit issue → resolve with note → Resolved tab count +1 → reload persists → send another issue to facility → programme action visible on Funnel side card.

## 11. Verification

```bash
pnpm --filter @laif/analytics test -- quality && pnpm --filter @laif/repositories test
pnpm --filter @laif/programme-admin typecheck && pnpm --filter @laif/programme-admin lint && pnpm --filter @laif/programme-admin test
pnpm --filter @laif/programme-admin test:e2e -- quality-triage.spec.ts
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

Manual:
1. Programme lead → Safety & quality: KPIs, then the queue "Open" tab. Expand a `MISSING FIELD` row to see the rule and ruleset version.
2. Resolve with a short note → error. Fix the note → Resolved.
3. Switch to the auditor: the rows are read-only. Switch language to RW: the pills and messages are translated.

## 12. Commit

`feat(admin): ADM-06 safety and quality monitor with data-quality triage queue`
