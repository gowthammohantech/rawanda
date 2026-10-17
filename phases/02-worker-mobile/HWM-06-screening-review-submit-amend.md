# HWM-06 — Screening review, offline-first submit and amendment

> **Data layer (reconciled):** table, outbox, mock-server and SQL names in this file are logical names — implement them through the FND-07 repository / sync API per the term-mapping table in `02-worker-mobile/INDEX.md`. Tests run under Vitest (FND-10); device flows via `test:maestro`.

## 1. Header

| Field | Value |
|---|---|
| ID | HWM-06 |
| Title | Screening review with illustrative explainable flags, atomic "save on device then sync" submit, submitted-screening detail and amendment with reason |
| App | Health Worker Mobile |
| Depends on | HWM-05 |
| Trace | PRD HW-03, HW-04, HW-05, shared lifecycle · FRD HW-03/04/05, §4 (correction reason, no overwrite), §5 · BRD BR-02, BR-03 · Tech spec §2.2 "Screening review", §5.3, WF-01 steps 2–4, §8 "Save offline screening" · FRD T-01, T-04, T-06, T-10 |
| Size | M |
| Status | Done |

## 2. Goal

Before submitting, the worker sees a read-only summary of every value **with units and context**, the patient, measured-at time (Kigali) and an **illustrative flag preview** computed on-device by the shared demo ruleset — shown as "May need clinician review (demo rule)" with rule version, inputs used and the `DEMO_RULE_NOT_CLINICALLY_VALIDATED` disclaimer, never as a diagnosis or advice. Submitting writes the screening, the outbox op and the audit event in one SQLite transaction and shows **"Saved on this device"**; once the simulated server acknowledges, the screening shows **"Synced"** and the server-assigned review status. Submitted screenings are immutable; corrections are made through an amendment with a mandatory reason that keeps the original.

## 3. Scope

**In scope**: review screen, submit, success screen, submitted screening detail with sync timeline, amendment flow (`screening.amend` op with `base_version`), immediate `drainOnce` attempt after commit when online.

**Out of scope**: clinician review/decision (Clinical app), conflict resolution UI (HWM-09) — an amendment conflict appears as "Needs your decision" linking there.

## 4. Deliverables

```text
apps/worker-mobile/app/(app)/screenings/draft/[draftId]/review.tsx   # ScreeningReviewScreen
apps/worker-mobile/app/(app)/screenings/[screeningId]/index.tsx      # ScreeningDetailScreen
apps/worker-mobile/app/(app)/screenings/[screeningId]/amend.tsx      # AmendScreeningScreen
apps/worker-mobile/src/features/screening/
  ScreeningReviewScreen.tsx, ReadingSummaryCard.tsx
  ExplainableFlagCard.tsx      # soft-blue callout: reason codes → text, inputs, ruleset version, disclaimer
  SubmitSuccess.tsx            # "Saved on this device" / "Synced" live state
  ScreeningDetailScreen.tsx, SyncTimeline.tsx, AmendmentList.tsx
  AmendScreeningForm.tsx, amendSchema.ts
apps/worker-mobile/src/data/screenings.ts    # submitFromDraft(), get(), amend()
packages/ui-native: consume FND-10 `ExplainableFlag` + `ReadingDisplay`
packages/i18n/src/locales/{en,rw}/worker/review.json (reason-code texts come from FND-04 `domain:reason.*`)
```

## 5. Implementation tasks

1. `ScreeningReviewScreen`: re-validate draft (guard against stale draft); render `ReadingSummaryCard` (mono micro-labels `BLOOD PRESSURE`, `GLUCOSE`, `CONTEXT`, `MEASURED AT`, values large, units always adjacent); "Edit" returns to form.
2. Flag preview: `evaluateScreening(input, DEMO_RULESET)` from `@laif/domain` → `ExplainableFlagCard` lists each `reasonCode` translated via `domain:reason.<code>`, the input values it used, `rulesetVersion`, and footer "Illustrative demo rule — not clinically validated. A clinician decides." If `requiresReview=false`: neutral card "No demo rule triggered. A clinician may still review." If context `not_recorded` → reason `GLUCOSE_CONTEXT_NOT_RECORDED` (FND-02) shown as an information item (PO decision pending — see INDEX).
3. `screenings.submitFromDraft(draftId)` in `withTx`:
   - insert `screenings` row (UUID = draft ID for natural idempotency, `status='submitted'`, `version=0`, `sync_state='pending'`, `ruleset_version`, `flag_json` = **local preview, marked `preview: true`**);
   - `outbox.enqueue('screening.submit', {dependsOn: pending patient.register op if any})`;
   - audit `screening.submitted` (summary: values+units, no free-text notes);
   - delete the draft row.
   Only after commit: if online, `engine.drainOnce('after_submit')` (fire-and-forget).
4. Double-submit protection: button disabled on press; `submitFromDraft` is a no-op returning the existing screening if a `screenings` row with that ID exists (second tap → same result, T-04).
5. `SubmitSuccess`: big check icon, title bound to live `sync_state` — "Saved on this device" (`pending`) with copy "Will sync when a connection is available", switching to "Synced" with server event time; actions "Back to today", "View screening".
6. On ack (engine, HWM-02) the server-returned `entityStatus` (`review_required` | `no_review_required`) and authoritative flag replace the preview (`preview: false`); detail screen shows `REVIEW REQUIRED` or `NO REVIEW REQUIRED` pill plus "Sent to clinician queue" (simulated — Clinical app is isolated per D3).
7. `ScreeningDetailScreen`: reading card, flag card, `SyncTimeline` (Saved on device {time} → Sent {attempts} → Synced {time} | Needs decision), amendments list (field, before → after, reason, author, time). Header action "Correct a value".
8. Amendment: choose field (systolic, diastolic, glucose value, glucose unit, context, measuredAt), new value validated with the same schema refinements, **reason required** (min 10 chars; presets "Typing error", "Wrong unit selected", "Wrong time" + free text). Transaction: insert `screening_amendments`, enqueue `screening.amend` with `base_version = screenings.version`, audit `screening.amended` (before/after summary, justification). Original row untouched; detail view shows "Amended" pill and effective values computed from original + amendments.

## 6. Data, state and audit

- Screening: `draft → submitted → review_required | no_review_required` (server-derived on ack).
- Writes: `screenings`, `screening_amendments`, `outbox_ops`, `audit_events`; delete `screening_drafts` row on submit.
- Audit: `screening.submitted`, `screening.amended`, server-mirrored `screening.recorded`, `screening.flag_evaluated` (ruleset version, reason codes — T-10).
- Invariants: no update statement ever touches `screenings` value columns after insert (enforced by data-layer API + test); every amendment has reason + author; flag never rendered without disclaimer.

## 7. UX states

| State | Behaviour |
|---|---|
| Loaded | Review summary + flag card |
| Validation error | Stale/invalid draft → back to form with summary banner |
| Offline | Submit succeeds; success says "Saved on this device" |
| Server error | Retryable failure → detail timeline "Will retry"; still "Saved on this device" |
| Stale/conflict | Amendment 409 → `NEEDS DECISION` pill linking to Sync center |
| Permission denied | Server `FORBIDDEN` → `NOT ACCEPTED` pill + explanation, record retained |
| Success | Live switch to "Synced" with announced change (`accessibilityLiveRegion="polite"`) |

## 8. i18n

Namespaces `worker:review`, `domain:reason` (reason codes; RW flagged `needs clinical/linguistic review`).

| Key | EN | RW (draft) |
|---|---|---|
| `worker.review.title` | Check before saving | Genzura mbere yo kubika |
| `worker.review.submit` | Save screening | Bika isuzuma |
| `worker.review.savedOnDevice` | Saved on this device | Byabitswe kuri iki gikoresho |
| `worker.review.willSync` | Will sync when a connection is available | Bizahuzwa igihe hazaboneka umurongo |
| `worker.review.mayNeedReview` | May need clinician review (demo rule) | Bishobora gusuzumwa na muganga (itegeko ry'igerageza) |
| `worker.review.disclaimer` | Illustrative demo rule — not clinically validated. A clinician decides. | Itegeko ry'urugero gusa — ntiryemejwe n'abaganga. Muganga ni we ufata icyemezo. |
| `worker.review.amend.reasonRequired` | Give a reason for the correction | Tanga impamvu y'ikosora |

## 9. Acceptance criteria

- [ ] Review screen shows every value with unit and context and the ruleset version.
- [ ] Flag card always shows the disclaimer and never uses diagnostic words (lint-style test scanning EN/RW flag strings for a deny-list).
- [ ] Offline submit → one `screenings` row, one `screening.submit` op, draft deleted, UI "Saved on this device"; survives restart (tech spec §8).
- [ ] Double-tapping Save yields one screening and one op (T-04).
- [ ] After going online and syncing, status changes to "Synced" and server-derived review status appears.
- [ ] Amendment without reason is blocked; with reason, original values remain and amendment shows before/after/author (T-06).

## 10. Tests

- `src/data/__tests__/screenings.submit.test.ts` — atomicity, idempotent resubmit, dependency on pending patient op.
- `src/data/__tests__/screenings.amend.test.ts` — original immutable, base_version, audit justification.
- `src/features/screening/__tests__/ExplainableFlagCard.test.tsx` — reason codes, disclaimer, deny-list.
- `src/features/screening/__tests__/SubmitSuccess.test.tsx` — pending → synced live update.
- `.maestro/hwm06-offline-submit-restart-sync.yaml` — offline, submit, kill, relaunch, pending visible, go online, Sync, "Synced".

## 11. Verification

```bash
pnpm --filter @laif/worker-mobile typecheck && pnpm --filter @laif/worker-mobile lint
pnpm --filter @laif/worker-mobile test -- src/features/screening src/data
pnpm --filter @laif/worker-mobile exec expo export --platform android --output-dir .expo-export-check
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

Manual (Expo Go): Settings → Network simulation → Offline → Screen → patient → enter BP + glucose → Review → see demo flag card + disclaimer → Save (tap twice) → "Saved on this device" → kill & relaunch → Today strip shows 1 pending → go Online → Network simulation "Run one sync pass" → screening detail shows "Synced" + `REVIEW REQUIRED` → Correct a value → no reason → blocked → add reason → Amended pill.

## 12. Commit

`feat(worker): HWM-06 screening review with demo flags, offline-first submit and amendments`

## 13. Implementation notes (deviations, recorded at build)

- **Atomic submit = `repo.createScreening(input, key, { fromDraftId })`** (additive FND-07 option): in ONE store transaction the author's draft row is removed, the screening is created with the draft's id, the `screening.submit` op (`dependsOnOpId` = pending `patient.register` op, FND-07 rule) and the `screening.submitted` audit are written. `fromDraftId` is never part of the synced payload; the simulated remote keeps the id via `presetId`. The idempotency key is the draft id (UUID on device; a deterministic UUID-shaped hash for non-UUID test ids, `submitKeyFor`). A screening already present with that id → returned as-is (task 4); concurrent calls share one promise.
- **Flag preview** uses the ruleset STORED with the dataset via the new read `repo.getActiveRuleset()` (additive, `screening.create`), not a code constant. `preview: true/false` is derived, not stored: the flag shown is the device preview until the create op is acknowledged, then the acknowledged server snapshot (status + flag) is authoritative (`screeningSyncView`). The local row's status is the device evaluation; the UI shows `SUBMITTED` + "waiting for the server" until ack.
- **Audit mapping**: `screening.flag_evaluated` (T-10) = the `screening.submitted` change summary (`rulesetVersion`, `reasonCodes`, `requiresReview`, `evaluable`; values + units, never notes); server-mirrored `screening.recorded` = the remote's `screening.submitted` + device `sync.op_acknowledged`. No new registry names.
- **Drain after submit**: FND-07 `SyncTrigger` has no `after_submit`; the post-commit fire-and-forget pass uses `auto` and runs only when the simulated network is online (also after an amendment).
- **Flag card** is the app's `ExplainableFlagCard` (soft-blue callout built from ui-native `ReadingDisplay`, `KeyValueList`, `RuleDisclaimer`): the FND-10 `ExplainableFlag` has no neutral "No demo rule triggered" copy, no informational split for an explicit `not_recorded` context (still reason `GLUCOSE_CONTEXT_NOT_RECORDED` with `requiresReview=false`) and no generic text for `requiresReview` with empty `reasonCodes` (missing required inputs).
- **Stale draft**: review re-validates with the form schema + stored ruleset limits; invalid → banner → form opened with `revalidate=1` (error summary shown).
- **Amend reason presets**: "Wrong time" is "Wrong time entered" (EN; 9 non-space characters would not pass the FND-02 10-character minimum on its own). The reason error under the field is `validation:reasonTooShort`; the banner is `worker:review.amend.reasonRequired`.
- **Needs decision** links to the Sync tab (`/sync`; the conflict screen is HWM-09). Patient history rows now open the screening detail (needed for the manual / Maestro path).
- Phase `review.json` area is `packages/i18n/src/locales/{en,rw}/worker/review.json` (wired in `resources/worker.ts`); the HWM-05 `worker:screening.reviewStub.*` keys were removed. RW flagged `needs clinical/linguistic review`.

