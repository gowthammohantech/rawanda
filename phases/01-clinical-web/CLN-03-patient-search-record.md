# CLN-03 — Patient search and patient record overview

## 1. Header

| Field | Value |
|---|---|
| ID | CLN-03 |
| Title | Patient search (paginated, scoped) and patient overview with identity provenance and duplicate warnings |
| App | Clinical Web Portal |
| Depends on | CLN-02 |
| Trace | PRD CL-01; FRD CL-01, FRD §7, T-02, T-07; spec §2.1 `/clinical/patients`, `/clinical/patients/:id`; WF-04; BRD BR-01 |
| Size | M |
| Status | Done |

## 2. Goal

A clinician searches synthetic patients by synthetic ID or name **within their permitted facilities only**, pages through results, and opens a patient overview showing demographics, identity provenance (who registered, where, which identifier type), and a visible **possible-duplicate warning** that never auto-merges. Opening a record is an audited sensitive read. A patient from another facility (WF-04) is never listed and a direct URL returns an audited permission-denied state with no data leakage.

## 3. Scope

**In scope**: `/clinical/patients` search + pagination; `/clinical/patients/:id` header + overview tab shell (tabs filled in CLN-04); duplicate warning; identity provenance; "External identity lookup" stub showing `DEPENDENCY_UNAVAILABLE` (T-07); top-bar search box wired to this page.
**Out of scope**: patient registration/merging (worker app / later); screening timeline content (CLN-04).

## 4. Deliverables

| Path (`apps/clinical-web/src/`) | Purpose |
|---|---|
| `features/patients/PatientSearchPage.tsx` | Search form + results table |
| `features/patients/PatientSearchForm.tsx` | RHF + Zod `PatientSearchSchema` |
| `features/patients/PatientResultsTable.tsx` | `AccessibleDataTable` (cols: SYNTHETIC ID, NAME, AGE/SEX, FACILITY, LAST SCREENING, OPEN ITEMS) |
| `features/patients/PatientPage.tsx` | `/clinical/patients/:id` layout, tabs: Overview · Screenings · Reviews · Referrals & tasks |
| `features/patients/PatientHeader.tsx` | Avatar initials, name, synthetic ID, `SYNTHETIC` pill, facility, consent state chip |
| `features/patients/IdentityProvenanceCard.tsx` | Identifier type, issuing source (`Facility-scoped demo ID`), registered by/at, version |
| `features/patients/DuplicateWarning.tsx` | Warning callout listing candidate records (only those in scope) |
| `features/patients/ExternalIdentityStub.tsx` | "Check national ID (not connected in demo)" → `DEPENDENCY_UNAVAILABLE` |
| `features/patients/hooks.ts` | `usePatientSearch`, `usePatient` |
| `packages/contracts` (if missing) | `PatientSearchSchema`, `PatientSummary` |

`PatientSearchSchema = z.object({ q: z.string().trim().max(60).optional(), facilityId: z.string().optional(), page: z.coerce.number().int().min(1).default(1), pageSize: z.literal(20) })` — `q` must be ≥2 chars when present (`validation.minLength`).

## 5. Implementation tasks

1. URL-driven search state (`?q=&facility=&page=`) via `useSearchParams`; parse with Zod, fall back to defaults on invalid params.
2. `usePatientSearch` → `repository.listPatients({ q, facilityIds: permitted ∩ selected, page })` with key `clinicalKeys.patients(fac, filter)`; debounce typing 300 ms; `placeholderData: keepPreviousData`.
3. Facility filter options = persona permitted facilities only (coordinator sees Alpha-1+Alpha-2; clinician sees Alpha-1).
4. Results table: row is a link to `routes.patient(id)`; keyboard Enter opens; caption "Showing X–Y of Z"; pagination with `aria-label`s.
5. Search emits **one** `patient.searched` audit event per submitted query (not per keystroke; fired when debounced query settles) with query length and result count only — never the raw query text (privacy).
6. `PatientPage` uses `usePatient(id)`; repository returns `FORBIDDEN` for out-of-scope → render `PermissionDenied` (no name, no ID echoed except the URL param) and repository appends `access.denied`. `NOT_FOUND` → `EmptyState` "No synthetic patient with this ID in your facilities".
7. On successful load, `useAuditedRead('patient', id)` emits `patient.viewed` once per mount.
8. `DuplicateWarning`: if `patient.possibleDuplicateIds` non-empty, show amber callout with icon + text "Possible duplicate record — verify identity before acting. Records are never merged automatically." Candidates out of scope are counted but not shown ("1 further candidate outside your facilities").
9. `ExternalIdentityStub`: button → simulated adapter rejects with `DEPENDENCY_UNAVAILABLE`; UI shows "National identity service is not connected in this demo. No identity was fetched or created." (T-07; never fabricate identity).
10. Top bar search box: submit navigates to `routes.patients({ q })`; `⌘K`/`Ctrl+K` focuses it.
11. Patient Overview tab (this phase): demographics card, identity provenance card, KPI strip (Screenings · Open reviews · Open referrals · Open tasks) computed from repository counts, "Latest screening" summary; other tabs render placeholders until CLN-04.

## 6. Data, state and audit

- Reads: Patient, Identifier, Facility, counts of Screening/Review/Referral/FollowUp.
- Audit: `patient.searched` (resultCount, filter keys), `patient.viewed` (patientId, facilityId), `access.denied` (repository-side, on out-of-scope get).
- Invariants: no cross-facility rows ever returned; analytics/audit never contain patient names (spec §5.1); duplicate candidates never merged.

## 7. UX states

| State | Behaviour |
|---|---|
| Initial | Search page shows recent-in-facility list (page 1, empty `q`) |
| Loading | Table skeleton rows; patient page header skeleton |
| Loaded | Results / overview |
| Empty | "No synthetic patients match '…'" + clear-filters button |
| Validation error | `q` of 1 char → inline "Enter at least 2 characters" (translated) |
| Server error / timeout | `ErrorState` with retry (fault toggles) |
| Permission denied | Out-of-scope patient URL → `PermissionDenied`, no PHI |
| Offline | Banner; cached results remain readable, marked "Last updated hh:mm" |
| Conflict / success | N/A (read-only) |

## 8. i18n

Namespace `clinical.patients`: `search.title|placeholder|facilityFilter|results.caption|empty|clear`, `table.syntheticId|name|ageSex|facility|lastScreening|openItems`, `record.tabs.overview|screenings|reviews|referralsTasks`, `record.provenance.*`, `record.duplicate.title|body|outOfScopeCount`, `record.externalId.button|unavailable`, `record.consent.*`. Ages/dates formatted with `@laif/i18n` formatters (`Africa/Kigali`). RW drafts flagged; duplicate/consent copy flagged `needs clinical/linguistic review`.

## 9. Acceptance criteria

- [ ] Clinician Alpha-1 searching the WF-04 patient's name gets 0 rows.
- [ ] Direct URL `/clinical/patients/<WF04_OTHER_FACILITY_PATIENT>` shows permission denied, no patient name in DOM, and one `access.denied` audit event.
- [ ] Coordinator (Alpha-1+Alpha-2) can filter by Alpha-2 and sees only Alpha-2 patients.
- [ ] Opening a patient appends exactly one `patient.viewed` (StrictMode double-mount safe).
- [ ] `DUPLICATE_IDENTITY_PAIR` shows duplicate warning with icon + text.
- [ ] External identity button shows `DEPENDENCY_UNAVAILABLE` message and creates no data.
- [ ] Pagination: 20 per page, URL reflects page, back button restores.

## 10. Tests

- `src/features/patients/__tests__/PatientSearchPage.test.tsx` — validation, empty, pagination, facility filter scoping.
- `src/features/patients/__tests__/PatientPage.test.tsx` — forbidden, not found, duplicate warning, audited read once.
- `src/features/patients/__tests__/ExternalIdentityStub.test.tsx` — T-07.
- `e2e/patient-scope.spec.ts` — WF-04: search excludes Beta-1 patient; direct URL denied; audit explorer later asserts event (CLN-10 extends).

## 11. Verification

```bash
pnpm --filter @laif/clinical-web typecheck && pnpm --filter @laif/clinical-web lint && pnpm --filter @laif/clinical-web test
pnpm --filter @laif/clinical-web test:e2e -- patient-scope
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```
Manual: sign in as clinician Alpha-1 → ⌘K → type 2 letters → open a patient → see provenance + KPI strip → open duplicate-pair patient → warning → paste Beta-1 patient URL → permission denied → switch to RW → labels translated.

## 12. Commit

`feat(clinical): CLN-03 scoped patient search and patient record overview`
