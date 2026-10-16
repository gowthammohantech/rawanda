# ADM-07 — Reports and aggregate CSV export with watermark and audit

Status: Not started

## 1. Header

| Field | Value |
|---|---|
| ID | ADM-07 |
| Title | Reports and aggregate CSV export with watermark and audit |
| App | Programme Admin Dashboard |
| Depends on | ADM-03, ADM-04, ADM-05, ADM-06 (report templates reuse their calculators) |
| PRD/FRD trace | PA-07 (de-identified CSV and aggregate report exports), PRD journey 2 / FRD Scenario 2 ("select date range → generate privacy-safe report → export with reason and audit event"), FRD §4 ("permission enforcement … on every export"), FRD §7, FRD T-08/T-04/T-02, WF-04 step 3, spec §2.3 `/admin/reports`, spec §8 "Export", spec §10 ("Synthetic demonstration data" in CSV) |
| Size | L |

## 2. Goal

On `/admin/reports` an authorised user:
1. Chooses a report template and granularity. The period and scope come from the global filter bar.
2. Previews the aggregate table with the same suppression as the dashboard.
3. States a reason for export and confirms the aggregate-only acknowledgement.
4. Downloads a CSV.

The CSV starts with a watermark and scope metadata block. It contains only aggregate rows with suppressed cells blanked, and every export (or denial) writes an `ExportAudit` record and an audit event. Patient-level export does not exist in the prototype. An "Export history" table lists previous exports in scope.

## 3. Scope

**In scope:** report templates, preview, export service (re-validates permission and scope), CSV builder with watermark, idempotent export, ExportAudit entity, history table, denial path.
**Out of scope:** PDF reports; de-identified record-level CSV (pending a data-governance decision; shown as a disabled option with an explanation); scheduled reports.

## 4. Deliverables

```text
packages/contracts/src/exportAudit.ts     # ExportAuditSchema, ExportRequestSchema
packages/analytics/src/reports.ts         # buildReportRows(template, ds, opts) -> ReportRow[]
packages/analytics/src/csv.ts             # EXTEND FND-06 toAggregateCsv: BOM, injection guard, trailer checksum, assertAggregateOnly (single CSV code path)
packages/analytics/src/reports.test.ts
apps/programme-admin/src/
  routes/reports/ReportsPage.tsx
  features/reports/templates.ts           # REPORT_TEMPLATES
  features/reports/ReportBuilder.tsx      # stepper: 1 Template · 2 Preview · 3 Reason · 4 Export (ref image 4 stepper)
  features/reports/ReportPreviewTable.tsx
  features/reports/ExportReasonForm.tsx   # RHF + Zod
  features/reports/exportService.ts       # requestExport(): assertCapability + assertScope + build + audit + download
  features/reports/ExportHistoryTable.tsx
apps/programme-admin/e2e/export.spec.ts
packages/i18n/src/locales/{en,rw}/admin.reports.json
```

## 5. Implementation tasks

1. **Templates** (`REPORT_TEMPLATES`), each listing metric ids from `METRIC_DEFINITIONS`:
   - `programme_summary`: screened, flagged, reviewed, dismissed, referred, completed, median days to review.
   - `funnel_by_facility`: the funnel stages per district/facility.
   - `timeliness`: median, p90, overdue referrals, overdue follow-ups, pending age buckets.
   - `quality`: missing fields by field, identity mismatch signals, overturned proxy, duplicates prevented.
   - `workload_facility`: tasks assigned/completed and minutes per patient-day, **facility level only**; worker-level export is not offered.
   - Granularity: `scope_total | district | facility` (also `week` for summary and timeliness).
2. **Row schema** (fixed column order):
   `period_start,period_end,granularity,district_id,district_label,facility_id,facility_label,week_start,metric_id,metric_label,value,suppressed,numerator,denominator,metric_version`
   - Suppressed cells have `value`, `numerator` and `denominator` empty and `suppressed=true`, with the same complementary suppression as the UI (one shared code path: `buildReportRows` calls the same calculators and `toCells`).
   - Labels follow the current UI language. The `metric_id` values are stable English ids.
3. **Aggregate-only guard** `assertAggregateOnly(rows)`:
   - Throws if any row key is outside the allowed column set, or if a value matches a patient-identifier pattern (the seed's synthetic id regex, uuid v4, or a seeded patient display name; the test injects these).
   - Runs on every export and in unit tests. This is how "no patient-level export" is enforced in code, not just in UI.
4. **Watermark/metadata block.** These are the first lines of the file, each prefixed with `#`:
   - `DEMONSTRATION — SYNTHETIC PATIENT DATA — NOT FOR CLINICAL USE`
   - `Synthetic demonstration data`
   - `export_id=<uuid>`
   - `generated_at=<ISO with +02:00> (Africa/Kigali)`
   - `generated_by_persona=<personaId> role=<role>`
   - `scope_districts=<ids> scope_facilities=<ids|ALL_IN_DISTRICTS>`
   - `period=<from>..<to>`
   - `template=<id> granularity=<g>`
   - `suppression_threshold=<k> suppression_policy=DEMO_NOT_APPROVED`
   - `ruleset_versions=<list> metric_version=demo-metrics-1`
   - `reason_code=<code>`

   Then the header row and the data rows, followed by the trailer `# END rows=<n> suppressed_cells=<m> sha256=<hex of data rows>`. The file name is `laif-demo_<template>_<scope>_<from>_<to>_<exportId8>.csv`.
5. **CSV safety:** RFC 4180 quoting; cells starting with `= + - @ \t \r` are prefixed with `'` (CSV-injection guard); UTF-8 with BOM so Excel shows Kinyarwanda diacritics correctly; `\r\n` line endings.
6. **Reason form** (Scenario 2 "export with reason"):
   - `reasonCode` (required): `programme_review | district_meeting | data_quality_followup | evaluation_reporting | other`.
   - `reasonText`: required when `other`, 10–300 chars.
   - `acknowledgeAggregateOnly`: a checkbox that must be true.
   - All validation messages are translated.
7. **Export service** `requestExport({ template, granularity, filters, reason, idempotencyKey })`:
   1. `assertCapability('export.aggregate')`. If missing → `export.denied` and FORBIDDEN.
   2. `assertScope(grant, filters)`. If outside → `export.denied` and FORBIDDEN; this covers a tampered client state where the URL check was bypassed.
   3. If `idempotencyKey` was already used, return the existing ExportAudit and re-download the same bytes (stored `csvText` in the demo db). No new audit is written.
   4. Load the dataset, `buildReportRows`, `assertAggregateOnly`, `toCsv`.
   5. Persist via FND-07 `recordExport(input, key)` (extended to also store the ExportAudit record in collection `exportAudits`) — ExportAudit `{ id, idempotencyKey, actorId, role, grantId, scope, period, template, granularity, reasonCode, reasonText?, rowCount, suppressedCells, sha256, fileName, createdAt, status: 'generated' }` and emit `export.generated`.
   6. Trigger the download through a Blob + temporary anchor (`URL.revokeObjectURL` after the click).

   The key is created when step 4 of the stepper mounts. The Export button is disabled while pending.
8. **Capability UI:**
   - The facility manager and auditor see the builder in preview-only mode: the Export button is disabled with the reason "Your role cannot export".
   - The record-level option is shown disabled with "Not available: record-level export requires data-governance approval".
9. **Export history:** `ExportHistoryTable` (persona scope only; the auditor sees all in grant) with columns time, persona/role, template, scope, period, reason, rows, suppressed cells, checksum (first 12 chars) and status pill (`GENERATED`, `DENIED`). Denied attempts also get an ExportAudit row with `status: 'denied'`, so access reports include failures.
10. **Overview hook:** the Overview "Export aggregate" secondary action links to `/admin/reports?template=programme_summary&<filters>`.
11. **Query keys:** `adminKeys.reportPreview(scopeKey, template, granularity, filters)`, `adminKeys.exports(scopeKey)`.

## 6. Data, state and audit

- Reads: the metrics dataset. Writes: ExportAudit, AuditEvent.
- Audit events: `export.requested` (on submit, includes the key), `export.generated` (export id, row counts, checksum, reason code), `export.denied` (reason `capability|scope`, requested scope). All carry actor, role, correlationId and justification = reason text/code.
- Invariants: aggregate-only (guard); suppression identical to UI; one ExportAudit per idempotency key; the watermark is always present (test parses the first line); no export without a reason.

## 7. UX states

| State | Behaviour |
|---|---|
| initial | Stepper at step 1, template cards |
| loading | Preview table skeleton |
| loaded | Preview with suppressed cells shown as `<k` + legend, row count, suppressed count |
| empty | No rows (zero data) → preview shows "No data for this period"; export still allowed (a file with metadata and zero rows) |
| validation error | Reason/ack errors inline; focus on the first error |
| server error | Export failure → error banner "Export not generated — nothing was downloaded"; retry reuses the key |
| permission denied | Disabled export with reason; direct service call → FORBIDDEN toast + denied audit |
| offline | Export is local so it works; banner shown |
| success | Toast "Export generated · {fileName}" + new history row |

## 8. i18n

Namespace `admin.reports`. Template names, column labels (CSV label columns use the current language), reason codes, acknowledgement text and watermark explanation. The watermark lines themselves stay in English for machine checks, and an RW translation line is added: `# IGERAGEZA — AMAKURU Y'IMPIMBANO — NTIBIKORESHWA MU BUVUZI` (needs linguistic review).

| Key | EN | RW (needs linguistic review) |
|---|---|---|
| `admin.reports.title` | Reports | Raporo |
| `admin.reports.reason.label` | Reason for export | Impamvu yo gukura raporo |
| `admin.reports.ack` | I confirm this export contains aggregate figures only | Nemeza ko iyi raporo irimo imibare rusange gusa |
| `admin.reports.validation.reasonText` | Describe the reason in 10 to 300 characters | Sobanura impamvu mu nyuguti 10 kugeza 300 |
| `admin.reports.denied.role` | Your role cannot export | Uruhare rwawe ntirwemerewe gukura raporo |
| `admin.reports.recordLevelUnavailable` | Record-level export requires data-governance approval | Gukura amakuru y'umuntu ku giti cye bisaba uruhushya rw'abashinzwe imicungire y'amakuru |

## 9. Acceptance criteria

- [ ] The downloaded CSV's first line is the DEMONSTRATION watermark, and it contains the `scope_*`, `period`, `suppression_threshold` and `export_id` lines.
- [ ] Data values equal the dashboard values for the same filters. Suppressed cells are empty with `suppressed=true`.
- [ ] `assertAggregateOnly` rejects a row containing a seeded synthetic identifier (unit test).
- [ ] Double-clicking Export (or a timeout + retry) produces one ExportAudit and one `export.generated`.
- [ ] The facility manager cannot export. Calling `requestExport` directly as that persona yields FORBIDDEN and a `denied` history row.
- [ ] A District Alpha analyst forcing District Beta in state → FORBIDDEN and no file.
- [ ] A cell starting with `=` is neutralised; Kinyarwanda labels open correctly (BOM present).

## 10. Tests

- `packages/analytics/src/reports.test.ts` — rows per template/granularity on the fixture; suppression parity with the UI selectors.
- `apps/programme-admin/src/features/reports/csv.test.ts` — quoting, injection guard, BOM, metadata order, trailer checksum, `assertAggregateOnly`.
- `apps/programme-admin/src/features/reports/exportService.test.ts` — capability denial, scope denial, idempotency, audit payloads.
- `apps/programme-admin/src/features/reports/ReportBuilder.test.tsx` — stepper keyboard flow, validation EN/RW, disabled states.
- `apps/programme-admin/e2e/export.spec.ts` (Playwright):
  1. As the District Alpha analyst, generate the summary.
  2. `page.waitForEvent('download')` and read the file.
  3. Assert the watermark, scope District Alpha only, no District Beta ids, and the suppressed rows.
  4. Check the history row.
  5. As the facility manager, the button is disabled.

## 11. Verification

```bash
pnpm --filter @laif/analytics test -- reports
pnpm --filter @laif/programme-admin typecheck && pnpm --filter @laif/programme-admin lint && pnpm --filter @laif/programme-admin test
pnpm --filter @laif/programme-admin test:e2e -- export.spec.ts
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

Manual:
1. District Alpha analyst → Reports → "Programme summary", granularity Facility → Preview (`<5` cells shown).
2. Next → submit without a reason → error. Pick "District meeting" and tick the acknowledgement → Export.
3. Open the CSV: watermark, scope and threshold lines. The history row appears with a checksum.
4. Switch to the facility manager: export is disabled.

## 12. Commit

`feat(admin): ADM-07 aggregate report builder and audited CSV export`
