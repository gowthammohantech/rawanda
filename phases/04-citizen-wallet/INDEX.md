# 04 — Citizen Health Wallet (CTZ) — Phase index

App: `apps/citizen-wallet` — Expo (React Native) + Expo Router, `expo-sqlite` persistence, pinned Expo SDK, isolated own dataset (D2, D3). Release priority **P1 in prototype mode**. All phases follow the 12-section template in `phases/README.md` and require FND-01 … FND-11 (CTZ-01 builds on the FND-11 citizen shell). Reconciled conventions (see `phases/CONSISTENCY_REVIEW.md`): package `@laif/citizen-wallet`; personas CTZ-P1…P5 = `persona-citizen-1`, `persona-citizen-2`, `persona-citizen-withdrawn`, `persona-citizen-rep`, `persona-citizen-pending` (FND-05; names such as "Marie U." are placeholders); demo clock `2026-10-14T06:00:00.000Z`; data via the `createCitizenRepository` facade over the FND-07 store (the `ctz_*` names in CTZ-02…09 are logical names — mapping table in CTZ-01 task 2); "approved" instruction = FND `CareInstruction.status: 'released'`; Vitest + Maestro (`test:maestro`).

## Phases (build strictly in order; one phase = one commit, repo green)

| Phase | Title | Goal (user-visible outcome) | Depends on | Size |
|---|---|---|---|---|
| [CTZ-01](CTZ-01-citizen-data-layer-and-seed.md) | Citizen data layer and seed | `CitizenRepository` facade over the FND store, approved-only visibility selectors, citizen overlay for 5 FND personas, audit/access writer | FND-11 (+ FND-05, FND-07, FND-08) | L |
| [CTZ-02](CTZ-02-welcome-access-consent-navigation.md) | Welcome, access, consent, navigation | Synthetic-demo welcome, persona choice, simulated verification, consent grant/withdraw, 5-tab shell, demo tools | CTZ-01 | L |
| [CTZ-03](CTZ-03-my-health-results.md) | My health | Released results in plain language with reviewer provenance; pending shown without values; dismissed flag never a finding; no score | CTZ-02 | M |
| [CTZ-04](CTZ-04-next-steps.md) | Next steps | Only clinician-approved appointment/referral/follow-up, contact card, idempotent "I have read this" | CTZ-03 | M |
| [CTZ-05](CTZ-05-reminders.md) | Reminders | Opt in/out, timing preference, safe content, simulated schedule + history; opt-out cancels all scheduling | CTZ-04 | L |
| [CTZ-06](CTZ-06-progress-timeline.md) | Timeline | Done vs waiting vs changed, record amendments with original retained | CTZ-05 | M |
| [CTZ-07](CTZ-07-privacy-and-corrections.md) | Privacy and corrections | Privacy notice, demo access history, correction request → care-team task, record unchanged | CTZ-06 | L |
| [CTZ-08](CTZ-08-accessibility-language-and-support.md) | Accessibility, language, support | EN⇄RW offline + persisted, text scale, high contrast, support/callback stub, no emergency or advice claims | CTZ-07 | M |
| [CTZ-09](CTZ-09-polish-a11y-states-and-e2e.md) | Polish and E2E | Screen reader/dynamic type/44pt/safe-area pass, full UX-state matrix, Scenario 1 & 2 Maestro journeys, T-01..T-10 mapping | CTZ-08 | M |

Nine phases (one above the ~6–8 target) because accessibility/support and the polish/E2E pass were each too large to share one commit safely.

## Explicit shared-package tasks raised by this track

| Package | Phase | Addition |
|---|---|---|
| `@laif/contracts` | CTZ-01 | `citizen/*` Zod schemas (8 FRD objects + consent, access event, care task, ack, settings) |
| `@laif/repositories` | CTZ-01 | `CitizenRepository` interface + `createCitizenRepository` facade (no SQL, no migration) |
| `@laif/domain` | CTZ-01 | `citizen/visibility.ts` selectors (`deriveDatePassed`, `deriveInstructionProgress` come from FND-02) |
| `@laif/mock-data` | CTZ-01, 06, 07 | `overlays/citizen.ts` (`buildCitizenOverlay`) on FND-05 anchors; amended observation (FND-05 `AMENDED_SCREENING` pattern); resolved correction requests |
| `@laif/test-utils` | CTZ-01, 09 | citizen factories, `makeCitizenRepo`, `expectMinTouchTarget`, `walkAllRoutes` |
| `@laif/ui-native` | CTZ-08 | high-contrast token set, `textScale` support |
| `@laif/i18n` | CTZ-01..09 | `citizen.*` EN+RW catalogues; keys checked by FND-04 `pnpm i18n:check --ns citizen` |

## Seed personas (isolated, D3)

| Persona | Demonstrates |
|---|---|
| CTZ-P1 Marie U. (self) | Released follow-up result, approved appointment, **unapproved draft referral (hidden)**, completed follow-up with evidence, reminder history, amended observation, resolved-amended correction |
| CTZ-P2 Noël H. (self) | **Dismissed flag** shown as reviewed/no action, awaiting-review screening (no values), withdrawn instruction (hidden), reminders opted out, resolved-no-change correction |
| CTZ-P3 Mireille I. | **Consent withdrawn** — no data reachable |
| CTZ-P4 Jean-Paul K. → Grace K. | Legally authorised representative; scope limited to Grace (T-02) |
| CTZ-P5 Aline M. | Enrollment pending; simulated verification code; verification-unavailable fault (T-07) |

## FRD coverage matrix

| FRD req | Primary phase(s) | Supporting | Key evidence |
|---|---|---|---|
| CW-01 Account access | CTZ-02 | CTZ-01, 09 | Persona + simulated verification, lockout/recovery stub, guard, session persistence, unavailable-service path |
| CW-02 Results view | CTZ-03 | CTZ-01, 06 | Released-only, plain-language labels, reviewer provenance, no score/forecast guard |
| CW-03 Next steps | CTZ-04 | CTZ-01, 03 | Approved-only instructions, contacts, idempotent acknowledgement, date-passed (never "overdue") |
| CW-04 Reminders | CTZ-05 | CTZ-02 (consent hook) | Opt in/out, timing, safe content, simulated schedule, cancel on opt-out/consent withdrawal |
| CW-05 Progress timeline | CTZ-06 | CTZ-07, 09 | Done requires evidence; reminders never "done"; amendments show original |
| CW-06 Corrections and privacy | CTZ-07, CTZ-02 (consent/notice) | CTZ-06 | Access history, notice, correction → task, record hash unchanged |
| CW-07 Languages and access | CTZ-08 | CTZ-02, 09 | EN⇄RW offline + persisted, translated validation, fallback, text scale, high contrast, low-data |
| CW-08 Support escalation | CTZ-08 | CTZ-04 | Contact card, callback task, not-an-emergency + no-advice notices |

| FRD scenario / test | Phase(s) |
|---|---|
| Scenario 1 (enroll → result → next step → reminder → attend → updated status) | CTZ-02..06, journey in CTZ-09 |
| Scenario 2 (spot error → correction → staff review → audited change) | CTZ-07 (request), CTZ-06 (amended view), journey in CTZ-09 |
| T-01 happy path + audit | every write phase |
| T-02 cross-scope | CTZ-01, 03, 04, 09 |
| T-03 field-level errors | CTZ-02, 07, 08 |
| T-04 duplicate submission | CTZ-01, 02, 04, 05, 07, 08 |
| T-05 concurrent update | CTZ-01, 04, 05, 07 |
| T-06 correction keeps original | CTZ-06, 07 |
| T-07 unavailable integration | CTZ-02 |
| T-08 export | N/A for wallet (asserted in CTZ-09); REL track |
| T-09 interrupted / retry | CTZ-02, 04, 05, 07, 08 |
| T-10 flag explanation | Citizen variant: review status + responsible professional (CTZ-03); rule detail stays reviewer-only |

Tech spec §8 citizen checks: next-step display → CTZ-04; reminder opt-out → CTZ-05; correction request → CTZ-07. WF-01 step 9 → CTZ-04; WF-03 step 5 → CTZ-03/06; WF-04 step 4 → CTZ-07. §11 wellness scoring exclusion → CTZ-03 + CTZ-09 forbidden-content tests.

## Maestro flows

`consent.yaml` (CTZ-02), `reminder-opt-out.yaml` (CTZ-05), `correction-request.yaml` (CTZ-07), `journey-scenario-1.yaml`, `journey-scenario-2.yaml`, `demo-script-citizen.yaml`, `representative-scope.yaml` (CTZ-09).

## Open decisions for the product owner (defaults used in the plans)

Consolidated with the other tracks in `phases/CONSISTENCY_REVIEW.md` §3 (authoritative).

1. **Unreleased results** — default: show a value-less "waiting for your care team" card. Alternative: hide entirely.
2. **Dismissed flags** — default: show the reading as "Reviewed — no extra visit needed" with no mention of the earlier flag. Confirm wording with clinical lead.
3. **Emergency guidance** — default: "go to your nearest health facility", no phone number. Should a national emergency number be shown?
4. **Reminder timing** — default: day before 09:00 or morning-of 07:00 Kigali (notification preferences, not clinical intervals). Confirm.
5. **Re-consent and reminders** — default: re-granting consent does not re-schedule reminders until the person opts in again. Confirm.
6. **Representative scope** — default: a representative can view and request corrections for the linked person only, and cannot withdraw that person's consent on their behalf. Needs legal input.
7. **Access history visibility** — default: show staff role + synthetic display name + facility. Real deployment may need role-only.
8. **Correction for personal details** — included as a target type; confirm it belongs in the wallet rather than at the facility.
9. **Scenario 1 "attend review"** — isolated app (D3) uses a labelled Demo-tools "simulate care-team confirmation" action. Acceptable, or should it rely only on REL scenario import?
10. **Kinyarwanda copy** — all RW strings in these plans are drafts needing linguistic review, and clinical/legal strings (not-a-diagnosis, not-an-emergency, notice, consent) need clinical/legal sign-off. Who signs off (tech spec §15 Q3/Q6)?
11. **Notification channel** — in-app simulation with an optional on-device preview only; no SMS. Confirm SMS stays out of the prototype.
