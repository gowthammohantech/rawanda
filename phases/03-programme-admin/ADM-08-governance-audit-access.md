# ADM-08 — Governance: ruleset history, audit explorer, access simulation and role configuration

**Status:** Done

## 1. Header

| Field | Value |
|---|---|
| ID | ADM-08 |
| Title | Governance: ruleset history, audit explorer, access simulation and role configuration |
| App | Programme Admin Dashboard |
| Depends on | ADM-01 (grants, audit helper), ADM-07 (ExportAudit records to report) |
| PRD/FRD trace | PA-08 (report access and export audits; role configuration by authorised admin), PA-01 (grant enforcement after change), FRD §5 audit fields, FRD §7 ("log record access, change, export and privilege updates"), FRD T-05/T-06/T-10, WF-04 step 2, spec §2.3 `/admin/governance` ("demo ruleset history, event audit, access simulation"), BRD BR-08 |
| Size | L |

## 2. Goal

`/admin/governance` has four tabs, with counts in the tab labels and the tab stored in the URL (`?tab=`):
1. **Rulesets**: the demo ruleset history (versions, status, effective dates, change summary, how many in-scope screenings were evaluated under each version), always badged `DEMO_RULE_NOT_CLINICALLY_VALIDATED`.
2. **Audit log**: a read-only, filterable, paginated explorer over audit events in scope, showing the FRD §5 fields, with correlation-chain filtering.
3. **Access & exports**: aggregate reports of access events (sign-ins, denied access, drill-downs) and the export audit list, plus an **access simulation** tool ("Can persona X see resource Y?") and a one-click cross-district attempt that shows the 403 + audit flow.
4. **Roles & access**: AccessGrant configuration. Only the programme lead (`roles.configure`) can edit, with a required justification, optimistic concurrency and a before/after audit. Everyone else gets a read-only view.

## 3. Scope

**In scope:** four tabs, grant editing with lockout protection, access simulation, governance audit events.
**Out of scope:** editing rulesets (read-only history; rule changes are clinical-governance decisions); tamper-evident audit (the demo states "Demo audit logs show expected behaviour but do not prove tamper resistance", spec §11); real IAM.

## 4. Deliverables

```text
apps/programme-admin/src/
  routes/governance/GovernancePage.tsx      # tab router (?tab=rulesets|audit|access|roles)
  features/governance/RulesetHistory.tsx    # list with expandable rows (reason codes; thresholds never shown as approved)
  features/governance/AuditExplorer.tsx     # AccessibleDataTable + filters + pagination (25/page)
  features/governance/auditFilterSchema.ts  # Zod: action prefix, actorRole, entityType, from/to, correlationId
  features/governance/AccessReport.tsx      # aggregates of access events + export audit list
  features/governance/AccessSimulator.tsx   # persona + resource -> decision + reason
  features/governance/GrantTable.tsx
  features/governance/GrantEditDialog.tsx   # RHF + Zod
  features/governance/mutations.ts
packages/auth-demo/src/evaluateAccess.ts    # pure: (grant, capabilityMatrix, resource) -> { allowed, reasonCode }
packages/repositories/src/...               # listAuditEvents(filter, page) (if FND lacks paging), updateAccessGrant(id, patch, expectedVersion, key), listRulesets()
apps/programme-admin/e2e/governance.spec.ts
packages/i18n/src/locales/{en,rw}/admin.governance.json
```

## 5. Implementation tasks

1. **Tab access:**
   - Rulesets: all roles with `metrics.read`.
   - Audit log: `audit.read` (all events in grant) or `audit.read_scoped` (district analyst: only events whose facility/district is in grant, excluding other personas' governance events).
   - Access & exports: `audit.read` or `audit.read_scoped`.
   - Roles & access: visible to all, editable only with `roles.configure`.
   - The facility manager's nav item is locked (ADM-01) and the route returns 403 (capability check).
2. **Ruleset history:**
   - `listRulesets()` gives `[{ version, status: 'active'|'retired', effectiveFrom, effectiveTo?, changedBy, changeSummaryKey, reasonCodes[] }]`.
   - Each row shows `screeningsEvaluated` = in-scope cohort screenings with that `rulesetVersion` (aggregate, suppressed when < k) and `flaggedShare`.
   - Thresholds are never shown as approved values. The row shows the reason codes and the label "Illustrative demo placeholder — requires clinical approval" (T-10).
3. **Audit explorer:**
   - Columns: time (Kigali), action, actor (persona id + role), resource (entityType + opaque id), facility/district, change summary (before → after for grant/status changes), justification, correlation id (button that filters to the chain).
   - Filters are in the URL (`aaction`, `arole`, `afrom`, `ato`, `acorr`) and validated with Zod, with translated messages.
   - Sorting is by time, newest first. Pagination is 25 per page.
   - Patient-linked events show only opaque ids (`SCR-…`).
   - Opening the audit log emits `admin.audit.viewed` once per session + filter key (an access audit of the audit log).
4. **Access report** (aggregate):
   - Counts by action in the period: sessions started, access denied, drill-downs viewed, exports generated, exports denied, grant changes.
   - "Denied access by requested district" bar list.
   - Then `ExportHistoryTable` from ADM-07.
5. **Access simulator:**
   - Form: persona, resource type (`district`, `facility`, `page`, `export`, `drilldown`), resource id (select limited to seed entities).
   - Submit calls `evaluateAccess(grant, matrix, resource)` and shows ALLOWED/DENIED with the reason code (`OUT_OF_SCOPE_DISTRICT`, `OUT_OF_SCOPE_FACILITY`, `MISSING_CAPABILITY`, `GRANT_EXPIRED`, `OK`) and the rule text. It emits `admin.access_simulation.run`.
   - The same `evaluateAccess` function is used by ScopeGuard, `RequireCapability` and `assertScope`. Refactor ADM-01 code to call it, so the simulator cannot drift from enforcement.
   - Button "Try as {persona}: open District Beta overview" switches the demo session to that persona, navigates to the forbidden URL, and shows the real 403 + `access.denied`. A banner offers "Return to {original persona}".
6. **Grant editing** (PA-08 "role configuration by authorized admin"):
   - `GrantEditDialog` fields: role, districtIds (multi), facilityIds (multi limited to selected districts, or "All facilities in selected districts"), validTo (optional, ≥ today), and `justification` (required, 10–300 chars).
   - Rules, enforced in the repository and also checked in the UI:
     - (a) The editor cannot remove `roles.configure` from their own grant or leave the system with no `roles.configure` holder (lockout prevention, code `LAST_ADMIN`).
     - (b) The scope must be non-empty.
     - (c) The role must be one of the four demo roles.
   - Update is an idempotency key + `expectedVersion` write. On CONFLICT the `ConflictNotice` shows the latest grant diff.
   - Grants are never deleted; "Revoke now" sets `validTo` and requires a justification.
   - Effect is immediate: if the edited grant belongs to the active session persona, the `grantVersion` mismatch makes ScopeGuard re-evaluate on the next navigation. A toast says "Your access changed — view refreshed", and `adminKeys.all` is invalidated.
7. **Grant history:** each row expands to show its version history from `admin.access_grant.changed` before/after summaries. Older versions are kept (T-06).
8. **Query keys:**
   - `adminKeys.rulesets(scopeKey)`
   - `adminKeys.audit(scopeKey, auditFilters, page)`
   - `adminKeys.accessReport(scopeKey, filters)`
   - `adminKeys.grants()`

## 6. Data, state and audit

- Reads: Ruleset, AuditEvent, ExportAudit, AccessGrant, the metrics dataset (ruleset counts). Writes: AccessGrant, AuditEvent.
- Audit events: `admin.audit.viewed`, `admin.access_simulation.run` (persona, resource, decision), `admin.access_grant.changed` (before/after: role, districts, facilities, validTo; justification; version n → n+1), `admin.access_grant.revoked`, `admin.access_grant.conflict`, `admin.access_grant.denied` (non-admin or `LAST_ADMIN`). All carry the FRD §5 fields: eventId, actorId, actorRole, entity ref, action, change summary, occurredAt, facility/district, correlationId, justification.
- Invariants: audit events are append-only (the repository exposes no update/delete for audit; a test asserts this); there is always ≥1 active `roles.configure` grant; enforcement and the simulator share `evaluateAccess`.

## 7. UX states

| State | Behaviour |
|---|---|
| loading | Tab content skeletons; tab counts appear when loaded |
| loaded | As above |
| empty | Audit filter with no matches → "No events match these filters" + Clear filters; no exports → "No exports yet" |
| validation error | Grant justification / scope errors; audit filter date-order error |
| server error | ErrorState + Retry; a failed grant save keeps the dialog |
| permission denied | Facility manager 403; non-admin sees the Roles tab read-only with a lock note; `LAST_ADMIN` → inline error explaining the rule |
| stale/conflict | Grant ConflictNotice; session grant-change toast |
| offline | Banner |
| success | Toast + highlighted row; the audit tab count increments |

## 8. i18n

Namespace `admin.governance` covers the tab names, column headers, a label for every `admin.*` audit action (`admin.governance.action.<action>`), reason codes, simulator results, grant form fields and validation messages. A test fails if any emitted audit action lacks EN/RW labels.

| Key | EN | RW (needs linguistic review) |
|---|---|---|
| `admin.governance.tab.rulesets` | Rulesets | Amategeko y'isuzuma |
| `admin.governance.tab.audit` | Audit log | Igitabo cy'igenzura |
| `admin.governance.tab.roles` | Roles & access | Inshingano n'uburenganzira |
| `admin.governance.demoRule` | Illustrative demo placeholder — requires clinical approval | Urugero rw'igerageza — rusaba kwemezwa n'abaganga |
| `admin.governance.sim.denied.outOfScope` | Denied: district is outside this persona's scope | Byanzwe: akarere kari hanze y'ububasha bw'uyu mukoresha |
| `admin.governance.validation.lastAdmin` | At least one active administrator must remain | Hagomba gusigara nibura umuyobozi umwe ukora |
| `admin.governance.validation.justification` | Give a justification of 10 to 300 characters | Tanga impamvu ifite inyuguti 10 kugeza 300 |

## 9. Acceptance criteria

- [ ] The Rulesets tab lists `demo-ruleset-2026.07-v0` (retired) and `demo-ruleset-2026.10-v1` (active) with in-scope evaluated counts and the demo badge.
- [ ] Audit log as the programme lead shows the seeded baseline (≥30) plus events from this session. Filtering by correlation id shows only that chain. Pagination works with the keyboard.
- [ ] The district analyst's audit view excludes District Beta events (test with a seeded B event).
- [ ] Simulator: District Alpha analyst + District Beta gives DENIED `OUT_OF_SCOPE_DISTRICT`. The "Try it" flow produces a real 403 and exactly one `access.denied`.
- [ ] As the programme lead, narrowing `persona-analyst-alpha` to one facility (with justification) takes effect on that persona's next navigation, and the removed facility URL gives 403.
- [ ] Removing own `roles.configure` is blocked with `LAST_ADMIN`. A simulated stale version shows the conflict dialog.
- [ ] The repository API has no audit update/delete method.

## 10. Tests

- `packages/auth-demo/src/evaluateAccess.test.ts` — the full persona × resource × capability matrix, expired grant.
- `packages/repositories/src/accessGrant.test.ts` — versioned update, conflict, LAST_ADMIN, idempotency, append-only audit.
- `apps/programme-admin/src/features/governance/AuditExplorer.test.tsx` — URL filters, scoped visibility, correlation filter, empty state, RW action labels.
- `apps/programme-admin/src/features/governance/GrantEditDialog.test.tsx` — validation EN/RW, lockout, read-only for non-admin.
- `apps/programme-admin/e2e/governance.spec.ts`:
  1. Programme lead edits the District Alpha analyst grant → switch persona → removed facility URL gives 403.
  2. Simulator "Try it" → 403.
  3. The audit tab shows `access_grant.changed` with before/after.

## 11. Verification

```bash
pnpm --filter @laif/auth-demo test && pnpm --filter @laif/repositories test
pnpm --filter @laif/programme-admin typecheck && pnpm --filter @laif/programme-admin lint && pnpm --filter @laif/programme-admin test
pnpm --filter @laif/programme-admin test:e2e -- governance.spec.ts
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

Manual:
1. Programme lead → Governance → Rulesets (expand demo-ruleset-2026.10-v1).
2. Audit log → filter action "Access denied" → click a correlation id.
3. Access & exports → simulator (District Alpha analyst, District Beta) → "Try it" → 403 → return.
4. Roles → edit the District Alpha analyst (no justification → error) → save.
5. Try to remove your own admin capability → `LAST_ADMIN` error.

## 12. Commit

`feat(admin): ADM-08 governance tabs, audit explorer, access simulation and grant configuration`
