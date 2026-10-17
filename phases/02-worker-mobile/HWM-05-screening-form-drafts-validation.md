# HWM-05 — New screening form with draft autosave and translated local validation

> **Data layer (reconciled):** table, outbox, mock-server and SQL names in this file are logical names — implement them through the FND-07 repository / sync API per the term-mapping table in `02-worker-mobile/INDEX.md`. Tests run under Vitest (FND-10); device flows via `test:maestro`.

## 1. Header

| Field | Value |
|---|---|
| ID | HWM-05 |
| Title | Screening capture (BP, glucose + unit + context, measured-at, observations), SQLite draft autosave/resume, translated validation |
| App | Health Worker Mobile |
| Depends on | HWM-04 |
| Trace | PRD HW-03, HW-04, HW-05 · FRD HW-03, HW-04, HW-05, §4 (units/source mandatory) · BRD BR-02 · Tech spec §2.2 "New screening", §5.1 Screening · Implementation notes (translated validation) · FRD T-03 · PRD §10 "app termination during capture" |
| Size | L |
| Status | Done |

## 2. Goal

From the Screen tab or a patient's context, the worker opens a screening form for a selected patient and records blood pressure (systolic/diastolic, mmHg), blood glucose (value + **required** unit mmol/L or mg/dL + **required** reading context), measured-at time (defaults to now, editable) and optional observation notes. Every change is autosaved as a **draft in SQLite** (survives app kill and restart); the Screen tab lists drafts to resume or discard. Local validation checks required fields, units, context and **data-entry plausibility only** (demo placeholders, never diagnostic), shows field-level messages in EN or RW, and gates the "Review" button.

## 3. Scope

**In scope**: Screen tab (drafts list + choose patient), `/screenings/new` (create-or-resume draft), draft form screen, autosave, discard draft with confirm, validation schema + i18n messages, plausibility ranges as named demo constants in `@laif/domain`.

**Out of scope**: rule evaluation / flags and submit (HWM-06), repeat-reading protocol (PO decision), device sensors/Bluetooth meters, photo capture.

## 4. Deliverables

```text
apps/worker-mobile/app/(app)/(tabs)/screen.tsx                     # ScreenTab: drafts + "Choose patient"
apps/worker-mobile/app/(app)/screenings/new.tsx                    # ?patientId → create/resume → replace to draft
apps/worker-mobile/app/(app)/screenings/draft/[draftId]/index.tsx  # ScreeningFormScreen
apps/worker-mobile/src/features/screening/
  ScreenTab.tsx, DraftRow.tsx
  ScreeningFormScreen.tsx, PatientMiniCard.tsx
  BloodPressureSection.tsx, GlucoseSection.tsx, MeasuredAtField.tsx, ObservationsField.tsx
  DraftStatusLine.tsx           # "Draft saved on this device · 10:42"
  useDraftAutosave.ts           # debounce 600ms + flush on blur/background
  screeningSchema.ts            # Zod: from @laif/contracts ScreeningInput + refinements
  mapZodIssues.ts               # issue → {field, key, params}
apps/worker-mobile/src/data/drafts.ts                              # create, get, save, discard, listForWorker
(no new constants: plausibility = FND-05 `DEMO_PLAUSIBILITY_LIMITS` via FND-03 `createScreeningInputSchema({ limits, now })`)
packages/ui-native: consume FND-10 `NumberField` (unit adornment) and `SegmentedControl`
packages/i18n/src/locales/{en,rw}/worker/worker.screening.json, validation.json (additions)
```

## 5. Implementation tasks

1. `drafts.create(patientId)` → `screening_drafts` row (UUID), `payload_json` = empty form + `measuredAt=now()` (demo clock, UTC); `/screenings/new` resumes the most recent draft for that patient if one exists (prompt: "Resume draft from 09:12?" Resume / Start new).
2. Form with React Hook Form + `zodResolver(screeningSchema)` in `mode: 'onTouched'`; fields:
   - `systolic`, `diastolic` integers, unit fixed **mmHg** shown as adornment (read-only, announced to screen reader).
   - `glucoseValue` decimal (1 dp), `glucoseUnit` segmented `mmol/L | mg/dL` (no default — must be chosen), `glucoseContext` segmented `Fasting | Not fasting | Not recorded` (= FND-02 `fasting | non_fasting | not_recorded`, no default).
   - `measuredAt` date-time picker (Kigali display, stored UTC).
   - `observations` multiline ≤ 500 chars with counter; `source` fixed `worker_device_manual_entry`.
3. Schema rules (all messages are i18n keys with params):
   - At least one of BP pair or glucose present → `validation.screening.atLeastOneReading`.
   - BP: both or neither; integers; `systolic > diastolic`; within FND-05 `DEMO_PLAUSIBILITY_LIMITS` (systolic 60–260, diastolic 30–160 mmHg — PO decision).
   - Glucose: if value present → unit and context required; value within unit-specific plausibility (FND-05: 1.0–35.0 mmol/L, 18–630 mg/dL); decimal separator accepts `,` and `.`.
   - `measuredAt` ≤ now + 5 min (clock-drift tolerance), ≥ now − 30 days (FND-03 ★; the 7-day limit proposed here is a PO decision); older than 24 h shows a **warning** (non-blocking) "Check the date".
   - Each plausibility range is exported with `label: 'DEMO_RULE_NOT_CLINICALLY_VALIDATED'`; error text says "outside the expected entry range — check for typing errors", never "high"/"abnormal".
4. `mapZodIssues` converts issues to `{key, params}`; `FieldError` component resolves via `t()` at render time so switching EN⇄RW re-translates visible errors without revalidating or losing values. Unit-aware params (`{min} {unit}`) are formatted in the active locale.
5. `useDraftAutosave`: on `watch()` change debounce 600ms → `drafts.save(id, values)` (no validation required to save); flush immediately on `AppState` → `background`, on blur of any field and on back navigation. `DraftStatusLine` shows "Saving…" / "Draft saved on this device · {time}".
6. Back/close: no data loss — draft is kept; header menu offers "Discard draft" (ConfirmSheet, audit `screening.draft_discarded`).
7. "Review" button: runs full validation; on errors shows error summary banner ("2 fields need attention") with tap-to-focus links; on success navigates to `/screenings/draft/[draftId]/review` (HWM-06; stub route returns to form until then).
8. ScreenTab: mono label `DRAFTS ON THIS DEVICE`, each `DraftRow` shows patient, last edited time, completeness (e.g. thin progress bar "3 of 5 fields"), Resume; "Choose patient" opens Find tab in picker mode (`?mode=pick`).
9. Accessibility: each numeric field has `accessibilityLabel` including unit ("Systolic, millimetres of mercury"), `keyboardType` numeric/decimal-pad, error linked via `accessibilityHint`; keyboard avoidance with `KeyboardAvoidingView` + scroll to focused field.

## 6. Data, state and audit

- `Screening` lifecycle: `draft` (this phase, `screening_drafts`) → `submitted` (HWM-06). Drafts are not synced and not visible to clinicians (device-local by design).
- Writes: `screening_drafts`; audit `screening.draft_created`, `screening.draft_discarded` (not every autosave — avoid audit noise).
- Invariants: author = session worker; facility = session facility; patient must be in scope (re-checked on load → `/denied`); units are never implied.

## 7. UX states

| State | Behaviour |
|---|---|
| Initial | Empty form, `measuredAt` = now, unit/context unselected |
| Loading | Draft load skeleton (< 1 frame typical) |
| Validation error | Field messages + summary banner; Review disabled until resolved |
| Offline | Identical behaviour; status line always says "on this device" |
| Permission denied | Patient out of scope → `/denied` |
| Empty | Screen tab with no drafts → "No drafts. Choose a patient to start." |
| Success | "Draft saved on this device" status line updates |
| Interrupted | Kill app mid-entry → reopen → Screen tab shows the draft with last values |

## 8. i18n

Namespaces `worker.screening`, shared `validation.screening.*`. All RW strings flagged `needs clinical/linguistic review` (clinical terms).

| Key | EN | RW (draft) |
|---|---|---|
| `worker.screening.bp` | Blood pressure | Umuvuduko w'amaraso |
| `worker.screening.glucose` | Blood glucose | Isukari mu maraso |
| `worker.screening.context.fasting` | Fasting | Atariye |
| `worker.screening.context.notFasting` | Not fasting | Yariye |
| `worker.screening.context.notRecorded` | Not recorded | Ntibyanditswe |
| `worker.screening.draftSaved` | Draft saved on this device · {time} | Umushinga wabitswe kuri iki gikoresho · {time} |
| `validation.screening.unitRequired` | Choose the glucose unit | Hitamo igipimo cy'isukari |
| `validation.screening.contextRequired` | Choose the reading context | Hitamo uko igipimo cyafashwe |
| `validation.screening.outOfEntryRange` | Outside the expected entry range ({min}–{max} {unit}). Check for typing errors. | Kiri hanze y'urugero ruteganyijwe ({min}–{max} {unit}). Reba niba nta kosa ryo kwandika. |
| `validation.screening.systolicGtDiastolic` | Systolic must be higher than diastolic | Umubare wo hejuru ugomba kurenza uwo hasi |

Fallback: missing RW validation key → EN message (never the raw key); parity test asserts every `validation.screening.*` key exists in both catalogues.

## 9. Acceptance criteria

- [ ] Glucose value without unit or context blocks Review with field-level errors (T-03).
- [ ] Systolic ≤ diastolic and out-of-range entries show the "check for typing errors" wording; no wording implies diagnosis.
- [ ] Switching language while errors are visible re-translates them; field values are unchanged.
- [ ] Killing the app 1 s after typing a value and relaunching restores that value in the draft.
- [ ] Discarding a draft requires confirmation and writes `screening.draft_discarded`.
- [ ] Drafts never appear in `outbox_ops`.
- [ ] All plausibility limits come from FND-05 `DEMO_PLAUSIBILITY_LIMITS` (via `@laif/contracts`) with the `DEMO_RULE_NOT_CLINICALLY_VALIDATED` label and are covered by tests.

## 10. Tests

- `src/features/screening/__tests__/screeningSchema.test.ts` — every rule, both units, comma decimal, clock-drift tolerance.
- `src/features/screening/__tests__/ScreeningFormScreen.test.tsx` — errors EN/RW, re-translation on switch, summary focus.
- `src/features/screening/__tests__/useDraftAutosave.test.ts` — debounce, flush on background (mock `AppState`).
- `packages/i18n/src/__tests__/validationParity.test.ts` (extend).
- `.maestro/hwm05-draft-survives-kill.yaml` — enter values, `killApp`, `launchApp`, resume draft, assert values.

## 11. Verification

```bash
pnpm --filter @laif/worker-mobile typecheck && pnpm --filter @laif/worker-mobile lint
pnpm --filter @laif/worker-mobile test -- src/features/screening
pnpm --filter @laif/domain test && pnpm --filter @laif/i18n test
pnpm --filter @laif/worker-mobile exec expo export --platform android --output-dir .expo-export-check
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

Manual (Expo Go): Screen tab → Choose patient → form → enter glucose 7.8 only → Review → errors for unit and context → switch RW → errors in RW → pick mmol/L + Not fasting → swipe app away → relaunch → Screen tab shows draft → Resume → values intact.

## 12. Commit

`feat(worker): HWM-05 screening form with sqlite draft autosave and translated validation`
