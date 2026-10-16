# HWM-04 — Find patient (cached search) and register synthetic patient

> **Data layer (reconciled):** table, outbox, mock-server and SQL names in this file are logical names — implement them through the FND-07 repository / sync API per the term-mapping table in `02-worker-mobile/INDEX.md`. Tests run under Vitest (FND-10); device flows via `test:maestro`.

## 1. Header

| Field | Value |
|---|---|
| ID | HWM-04 |
| Title | Cached patient search, patient context screen and offline registration with uncertain-match flagging |
| App | Health Worker Mobile |
| Depends on | HWM-02 (HWM-03 for navigation polish only) |
| Trace | PRD HW-02, §7 (LocalIdentifier) · FRD HW-02, §4, §7 · BRD BR-01 · Tech spec §2.2 "Find patient" · FRD T-01, T-02, T-03, T-07 |
| Size | M |
| Status | Planned |

## 2. Goal

The worker searches patients **cached on the device for their facility** by name or synthetic identifier, opens a patient context screen (identifier, age, sex, last screenings, open follow-ups, sync state) and starts a screening from it. If the patient is not found they register a **synthetic** patient offline; the app checks the local cache for likely duplicates and, when uncertain, makes the worker choose "Use existing" or "Register anyway — flag for review" so a mismatch is never silently merged or silently created. The new patient is usable immediately and is queued for sync.

## 3. Scope

**In scope**: Find tab, search with debounce, recent patients, patient detail, registration form (Zod + RHF), duplicate candidate sheet, outbox op `patient.register`, permission-denied for out-of-scope patient IDs (deep link).

**Out of scope**: NIDA/national ID lookup (simulated as unavailable — T-07), editing demographics, merging patients, server-side search of patients not cached.

## 4. Deliverables

```text
apps/worker-mobile/app/(app)/(tabs)/patients/index.tsx   # FindPatientScreen
apps/worker-mobile/app/(app)/patients/register.tsx       # RegisterPatientScreen
apps/worker-mobile/app/(app)/patients/[patientId].tsx    # PatientContextScreen
apps/worker-mobile/src/features/patients/
  FindPatientScreen.tsx, PatientSearchBar.tsx, PatientRow.tsx, RecentPatients.tsx
  PatientContextScreen.tsx, PatientHeaderCard.tsx, ScreeningHistoryList.tsx
  RegisterPatientForm.tsx, PossibleMatchesSheet.tsx, NationalIdUnavailableNote.tsx
  registerSchema.ts           # wraps @laif/contracts PatientRegistrationInput
apps/worker-mobile/src/data/patients.ts  # search(), get(), register(), findCandidates()
packages/domain: add `scorePatientMatch(a, b)` (normalised name + DOB + sex) if not present, with tests
packages/i18n/src/locales/{en,rw}/worker/worker.patients.json
```

## 5. Implementation tasks

1. `patients.search(db, {facilityId, query, limit: 25, offset})`: case/diacritic-insensitive `LIKE` on `display_name` normalised column and prefix match on `synthetic_identifier`; always `WHERE facility_id = ?`. Debounce 250ms; minimum 2 characters; empty query shows "Recent" (last 10 patients touched on this device).
2. `PatientRow`: initials, name, `DEMO-…` identifier in mono, age (from DOB at demo date), sex, `MATCH REVIEW` pill when `identityStatus === 'needs_match_review'` (FND-02), sync pill when pending.
3. `PatientContextScreen`: header card; micro-labels `IDENTIFIER`, `AGE`, `FACILITY`; sections "Recent screenings" (value + units + date + status pill, read-only) and "Open follow-ups" (link to task detail); primary button "New screening" → `/screenings/new?patientId=`. Loading by ID re-checks facility scope → if mismatch or absent, `router.replace('/denied')` and audit `access.denied` (no name/ID echoed on screen).
4. Registration fields: given name, family name (synthetic), date of birth **or** estimated age (years) with "estimated" flag, sex (female/male/not recorded), village/cell label (free text, optional, fictional), phone (optional, masked format `07X XXX XXXX`, labelled "synthetic"). Identifier is generated locally: `DEMO-{facilityCode}-{deviceShort}-{seq}` (unique, clearly synthetic; server keeps it).
5. Validation (Zod, messages are i18n keys): names required 1–60 chars, letters/space/hyphen/apostrophe; DOB not in the future and age ≤ 120; estimated age 0–120 integer; phone optional pattern. Pilot-scope note (LAIF MoH proposal p. 14: \"adults screened\"): if the derived age is < 18, show a **non-blocking** warning \"The pilot screens adults — check the date of birth\" (`validation.patient.underPilotAge`); this is a data-entry scope prompt, not an eligibility decision (PO decision in CONSISTENCY_REVIEW). Errors shown per field, focus moves to first error, screen reader announces count.
6. Before save, `findCandidates()` returns local patients with `scorePatientMatch ≥ 0.75` (demo threshold constant `DEMO_MATCH_THRESHOLD`, labelled not validated). If any: `PossibleMatchesSheet` lists them with the reason ("same date of birth, similar name"); choices: **Use this patient** (navigate, no write) or **Register anyway** (sets `identityStatus: 'needs_match_review'` via `RegisterPatientInput.matchDecision`).
7. `patients.register()` in one transaction: insert patient (`origin='device'`, `version=0`, `sync_state='pending'`), `outbox.enqueue('patient.register')`, audit `patient.registered` (+ `patient.match_flagged` when flagged). Then navigate to patient context with toast "Saved on this device".
8. `NationalIdUnavailableNote`: a disabled "Look up national ID" row with caption "National identity service not connected in this demo" (T-07 graceful failure, no fabricated identity).
9. Double-submit guard: Save button disabled while the transaction is in flight; idempotent by draft UUID created when the form mounts.

## 6. Data, state and audit

- Reads `patients`, `screenings`, `follow_ups`; writes `patients`, `outbox_ops`, `audit_events`.
- Patient registration op carries `entity_id` = patient UUID; HWM-05 screenings for this patient set `depends_on_op_id` to this op.
- Audit: `patient.viewed` (on context screen open, sensitive read — FRD §7), `patient.registered`, `patient.match_flagged`, `access.denied`. Fields include actor, role, facility, patient ref, correlation ID.
- Invariants: no cross-facility rows rendered; no automatic merge; generated identifier never reused.

## 7. UX states

| State | Behaviour |
|---|---|
| Initial | Recent patients + "Register new patient" button |
| Loading | Row skeletons during search |
| Empty | "No patient matches '{query}' on this device" + Register CTA prefilled with the name |
| Validation error | Field-level messages, error summary at top, first field focused |
| Permission denied | `/denied` with `ACCESS DENIED`, no patient details |
| Offline | Fully functional; banner note "Search covers patients saved on this device" |
| Success | Toast "Saved on this device"; patient shows `SAVED ON THIS DEVICE` pill until synced |
| Server error/conflict | Shown via sync pill (resolution in HWM-09); server `VALIDATION_ERROR` marks patient `rejected` with link to Sync center |

## 8. i18n

Namespace `worker.patients`; validation keys from shared `validation.*` (`validation.required`, `validation.maxLength`, `validation.dateInFuture`, `validation.ageRange`) — add any missing to `@laif/i18n` with EN + RW.

| Key | EN | RW (draft, needs review) |
|---|---|---|
| `worker.patients.searchPlaceholder` | Search name or ID | Shakisha izina cyangwa nimero |
| `worker.patients.register` | Register new patient | Andika umurwayi mushya |
| `worker.patients.possibleMatch` | This patient may already exist | Uyu murwayi ashobora kuba asanzwe yanditswe |
| `worker.patients.useExisting` | Use this patient | Koresha uyu murwayi |
| `worker.patients.registerAnyway` | Register anyway and flag for review | Andika uko byagenda kandi bisuzumwe |
| `worker.patients.nationalIdUnavailable` | National identity service not connected in this demo | Serivisi y'indangamuntu ntihujwe muri iri gerageza |
| `validation.required` | {field} is required | {field} birakenewe |

## 9. Acceptance criteria

- [ ] Search returns only the session facility's patients; query "dem" matches identifiers by prefix.
- [ ] Opening `/patients/<other-facility-id>` shows denied screen, writes `access.denied`, renders no patient data.
- [ ] Missing family name → field error in the active language; switching language re-translates the visible error without losing input.
- [ ] Registering a near-duplicate shows the matches sheet; "Register anyway" stores `needs_match_review` and a `patient.match_flagged` audit.
- [ ] Registration while offline creates exactly one patient row + one `patient.register` op; after going online and syncing, server has one patient (double-tap Save produces one).
- [ ] National ID lookup is disabled with explanatory text; no identity is fabricated.

## 10. Tests

- `src/data/__tests__/patients.test.ts` — search scoping, candidates, atomic register.
- `packages/domain/src/__tests__/scorePatientMatch.test.ts`.
- `src/features/patients/__tests__/RegisterPatientForm.test.tsx` — validation EN/RW, double-submit, match sheet.
- `src/features/patients/__tests__/PatientContextScreen.test.tsx` — denied path, audit written.
- `.maestro/hwm04-register-offline.yaml` — offline → register → restart → patient still listed with `SAVED ON THIS DEVICE`.

## 11. Verification

```bash
pnpm --filter @laif/worker-mobile typecheck && pnpm --filter @laif/worker-mobile lint
pnpm --filter @laif/worker-mobile test -- src/features/patients src/data
pnpm --filter @laif/domain test
pnpm --filter @laif/worker-mobile exec expo export --platform android --output-dir .expo-export-check
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

Manual (Expo Go): Find tab → type "Uwi" → open patient → see history → back → Register new → submit empty → errors → switch RW → errors in RW → fill a name/DOB matching an existing patient → matches sheet → Register anyway → patient context shows `MATCH REVIEW` and `SAVED ON THIS DEVICE`.

## 12. Commit

`feat(worker): HWM-04 cached patient search and offline synthetic registration`
