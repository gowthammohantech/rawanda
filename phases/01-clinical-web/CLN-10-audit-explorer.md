# CLN-10 — Audit explorer and audited export

## 1. Header

| Field | Value |
|---|---|
| ID | CLN-10 |
| Title | Read-only, facility-scoped audit explorer with correlation trails and an audited, watermarked CSV export |
| App | Clinical Web Portal |
| Depends on | CLN-09 |
| Trace | PRD CL-08, PRD §9 ("every clinically significant change and sensitive read is auditable"); FRD CL-08, FRD §5 (audit fields), §7 (log access, change, export, privilege updates), T-01, T-02, T-08; spec §2.1 `/clinical/audit`, WF-01 step 10, WF-04 step 2–3; BRD BR-08 |
| Size | M |
| Status | Not started |

## 2. Goal

An authorised user opens `/clinical/audit` and sees an append-only, read-only event history **limited to their permitted facilities**: filter by action family, actor, role, entity type/ID, patient synthetic ID, date range (Kigali) and correlation ID; open an event to see before/after summary and justification; follow a **correlation trail** that shows the whole WF-01 chain (review started → decided → referral created → follow-up completed). A coordinator can export the filtered view as CSV carrying `Synthetic demonstration data` watermark and scope metadata; the export itself is audited and patient names are excluded.

## 3. Scope

**In scope**: audit table + filters + detail drawer + correlation trail; CSV export (`audit.export` capability); "Denied access attempts" quick filter (WF-04 evidence); audit of viewing the audit log.
**Out of scope**: tamper-evidence/hash chains (spec §11: demo logs do not prove tamper resistance — stated in UI), cross-facility programme audit (admin app).

## 4. Deliverables

| Path (`apps/clinical-web/src/`) | Purpose |
|---|---|
| `features/audit/AuditExplorerPage.tsx` | Header (`Export CSV` action), notice callout, filters, table, pagination |
| `features/audit/AuditFilters.tsx` | RHF + Zod `AuditFilterSchema`; quick chips: `Decisions`, `Dismissals`, `Referrals`, `Tasks`, `Sensitive reads`, `Denied access`, `Conflicts`, `Demo controls` |
| `features/audit/AuditTable.tsx` | TIME (Kigali), ACTION (mono pill), ACTOR · ROLE, ENTITY, FACILITY, CORRELATION (short id, link) |
| `features/audit/AuditEventDrawer.tsx` | All FRD §5 fields: event ID, actor, role, resource, action, change summary (before → after), timestamp UTC + Kigali, facility, correlationId, justification |
| `features/audit/CorrelationTrail.tsx` | Vertical timeline of events sharing a correlationId or linked entity chain |
| `features/audit/exportAuditCsv.ts` | Builds CSV client-side with `@laif/analytics` `CSV_WATERMARK`, `toCsvRows`, `escapeCsvCell` (FND-06) |
| `features/audit/hooks.ts` | `useAuditEvents(filter)`, `useExportAudit()` |
| `packages/contracts` | Extend FND-03 `AuditFilterSchema` with the fields below; `AuditEventSchema` from FND-03 |

```ts
AuditFilterSchema = z.object({
  actionFamily: z.enum(['all','auth','access','patient','screening','review','referral','followup','conflict','audit','demo']).default('all'),
  actorId: z.string().optional(), role: z.string().optional(),
  entityType: z.enum(['Patient','Screening','Review','Referral','FollowUp','Session','Demo']).optional(),
  entityId: z.string().optional(), correlationId: z.string().optional(),
  from: z.string().date().optional(), to: z.string().date().optional(),   // Kigali local dates
  page: z.coerce.number().int().min(1).default(1),
}).refine(f => !f.from || !f.to || f.from <= f.to, { path: ['to'], message: 'validation.dateRangeOrder' });
```

## 5. Implementation tasks

1. Guard route with `audit.read`. Repository `listAuditEvents(filter)` (actor from `deps.getActor()`) filters to `facilityId ∈ permitted` (plus the actor's own session events) — enforced inside the repository; out-of-scope filter values ignored (and `access.denied` logged if an entity ID belongs to another facility).
2. URL-synced filters; date inputs interpreted in Africa/Kigali and converted to UTC ranges via `@laif/i18n` helpers.
3. Table sorted `occurredAt desc`, 50/page; action pills grouped by family colour token + text.
4. Drawer: render `changeSummary` as a two-column before/after list; never render full free-text clinical rationale for `access.*` events; for `review.dismissed` show rationale (needed for accountability).
5. `CorrelationTrail`: `listAuditEvents({ correlationId })` and, for entity events, also linked chain (`review → referral → followUp`) to demonstrate WF-01 step 10.
6. Persistent notice callout: "Demonstration audit log. It shows expected behaviour but does not prove tamper resistance." (spec §11).
7. Export (FND-06 `audit.export`, coordinator only): `ConfirmDialog` summarising scope + row count → CSV with header lines `# Synthetic demonstration data — NOT FOR CLINICAL USE`, `# Scope: Facility Alpha-1 (demo), Alpha-2 (demo)`, `# Exported by <persona> <role> at <Kigali time>`, `# Filters: …`; columns: eventId, occurredAtUtc, action, actorId, actorRole, entityType, entityId, patientSyntheticId, facilityId, correlationId — **no patient names, no free-text rationale**. Append `export.generated` (canonical FND-07 action; `entityType: 'audit_log'`, row count, filter summary) **before** download is triggered; if the append fails, no file is produced.
8. Viewing the explorer emits `audit.viewed` once per mount (filters summary).
9. Extend `e2e/patient-scope.spec.ts` (from CLN-03) to assert the `access.denied` event appears under the `Denied access` chip.

## 6. Data, state and audit

- Reads: AuditEvent (append-only). Writes: `audit.viewed`, `export.generated`.
- Invariants: read-only UI (no edit/delete affordance anywhere); scope enforced in repository and on export (FRD §4 last bullet); exports carry watermark + scope; no names in exports.

## 7. UX states

Loading: table skeleton. Empty: "No audit events match these filters". Validation: date range order error (translated). Server error: `ErrorState` + retry; export failure → toast, no file. Permission denied: nurse reviewer can read but sees no Export button with text "Export requires coordinator role"; persona without `audit.read` → `PermissionDenied`. Offline: cached page readable; export disabled. Conflict: N/A. Success: export toast "CSV exported · event recorded".

## 8. i18n

Namespace `clinical.audit`: `title|subtitle|notice`, `filters.*`, `chips.*`, `table.*`, `action.<event.name>` (human label for every audit event emitted in CLN-01..09), `drawer.*`, `trail.title`, `export.button|confirmTitle|confirmBody|success|failure|watermark`. CSV header lines are **always English + Kinyarwanda** (both lines) so files are interpretable regardless of UI language — flag for PO confirmation. RW drafts flagged `needs linguistic review`.

## 9. Acceptance criteria

- [ ] After the WF-01 E2E path, filtering by its correlationId shows review.started → review.decided → referral.created → … in order.
- [ ] Alpha-1 clinician never sees Facility Beta-1 events; WF-04 denied attempt visible under `Denied access`.
- [ ] Every audit event name emitted by CLN-01..09 has an EN and RW label (catalogue completeness test).
- [ ] Export CSV contains watermark + scope lines, no patient display names, and one `export.generated` event per export (T-08).
- [ ] Nurse reviewer cannot export (UI + repository).
- [ ] No mutation controls exist on the page.

## 10. Tests

- `src/features/audit/__tests__/AuditExplorerPage.test.tsx` — filters, scope, read-only.
- `src/features/audit/__tests__/exportAuditCsv.test.ts` — watermark, columns, no names, export audited first.
- `src/features/audit/__tests__/auditLabels.test.ts` — every emitted event name has EN+RW label.
- `packages/repositories/src/__tests__/auditScope.test.ts` — facility scoping incl. export path.
- `e2e/audit-trail.spec.ts` — run decision then trace correlation; export file assertions (Playwright download).

## 11. Verification

```bash
pnpm --filter @laif/repositories test
pnpm --filter @laif/clinical-web typecheck && pnpm --filter @laif/clinical-web lint && pnpm --filter @laif/clinical-web test
pnpm --filter @laif/clinical-web test:e2e -- audit-trail patient-scope
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```
Manual: coordinator Alpha-1 → make a decision as clinician first (switch persona) → Audit → `Decisions` chip → open event → `View trail` → chain visible → `Denied access` chip → WF-04 attempt → Export CSV → confirm → open file: watermark, scope, no names → new `export.generated` row at top.

## 12. Commit

`feat(clinical): CLN-10 audit explorer with correlation trails and audited export`
