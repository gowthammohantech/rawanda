# CTZ-09 — Polish: accessibility pass, all UX states, journeys and E2E

## 1. Header

| Field | Value |
|---|---|
| ID | CTZ-09 |
| Title | Wallet polish — screen-reader/dynamic-type/44pt/safe-area audit, UX-state matrix, Scenario 1 & 2 journeys, Maestro suite, FRD test-case mapping |
| App | Citizen Health Wallet |
| Depends on | CTZ-08 |
| Trace | CW-01..CW-08 (hardening); FRD §3 Scenarios 1–2, §8 T-01..T-10, §9 definition of done; PRD §9 (happy-path, permission-denied and error-state tests per feature); Tech spec §7, §9, §13, §14 minute 12–13 |
| Size | M |
| Status | Done |

## 2. Goal

The wallet feels finished and trustworthy on a real phone: every screen works with TalkBack/VoiceOver, large text, and one hand; every async view shows the right loading, empty, error, denied, conflict and success state; and the two FRD journeys plus the demo-script minute (citizen sees approved next step and changes reminder preference) run end-to-end from a clean `Reset demo`, automated with Maestro.

## 3. Scope

**In scope:** accessibility audit and fixes, UX-state matrix completion, visual polish to the calm citizen variant of the design language, Scenario 1/2 journeys as Maestro flows, FRD T-01..T-10 mapping table in tests, final forbidden-content sweep, README for the app.

**Out of scope:** new features; cross-app scenario import/export (REL); store builds.

## 4. Deliverables

- `apps/citizen-wallet/src/__tests__/a11y/*.test.tsx` — per-screen role/label/hint assertions.
- `apps/citizen-wallet/src/__tests__/states/uxStateMatrix.test.tsx` — parametrised across screens × states via fault injector and seed personas.
- `apps/citizen-wallet/src/__tests__/frd/frdTestCases.test.tsx` — one `describe` per T-01..T-10 (citizen interpretation).
- `apps/citizen-wallet/src/__tests__/safety/forbiddenContent.test.tsx` — all screens × personas × EN/RW.
- `apps/citizen-wallet/.maestro/journey-scenario-1.yaml`, `journey-scenario-2.yaml`, `demo-script-citizen.yaml`, `representative-scope.yaml`, plus existing `consent.yaml`, `reminder-opt-out.yaml`, `correction-request.yaml`; `.maestro/config.yaml` (appId, `clearState`, run order).
- `apps/citizen-wallet/README.md` — run, reset, personas table, fault toggles, known limitations (this is app run documentation required by FRD §9, not a report).
- App script `test:maestro` (FND-11) → `maestro test .maestro`.

## 5. Implementation tasks

1. **Screen reader:** every interactive element has `accessibilityRole`, `accessibilityLabel` (translated), `accessibilityHint` where the outcome isn't obvious, `accessibilityState` (selected/disabled/checked/busy). Status chips read as "Status: Follow-up agreed". Reading values read with full unit names. Headers use `accessibilityRole="header"`. Toasts and inline errors announce via `AccessibilityInfo.announceForAccessibility`. Focus moves to the screen title on navigation.
2. **Dynamic type:** remove fixed heights on text containers; verify at `fontScale` 1, 1.5, 2 and app textScale Largest. Tab bar labels: allow two lines.
3. **Touch targets:** all pressables ≥ 44×44pt (`hitSlop` where visual size is smaller); add a test helper `expectMinTouchTarget()` in `@laif/test-utils` (**shared-package task**).
4. **Safe areas:** `SafeAreaView`/`useSafeAreaInsets` on every route; DemoBanner sits below the status bar and never overlaps notches; bottom tabs respect home indicator; keyboard-avoiding on correction and callback forms.
5. **Reduce motion:** respect `AccessibilityInfo.isReduceMotionEnabled` for loader and sheet animations.
6. **Visual polish (calm citizen variant):** generous spacing, one primary action per screen, white cards 16px radius with hairline borders on `#F7FAFA` canvas, mono uppercase micro-labels (`MY HEALTH`, `YOUR NEXT STEP`), soft-blue info callouts for explanations, pill chips with icon + text; no red unless a genuine error; no dashboards/KPI strips in the citizen app.
7. **UX-state matrix:** for each async screen (persona list, health list/detail, next steps list/detail, reminders, timeline, access history, corrections list/detail/new, settings, callback) assert loading, loaded, empty, server error (fault `error500` = FND-07 `serverErrorRate`), permission denied (cross-scope deep link or consent withdrawn), stale-conflict (where a write exists), success (where a write exists). Offline row documented as N/A (local-only) with a test asserting no network calls are made (`global.fetch` spy never called).
8. **Double-submit protection** audit on every mutation button.
9. **Journeys (Maestro):**
   - Scenario 1: Reset → persona Aline (pending) → verify 246810 → consent → *(seeded switch)* Marie → My health → result → Next steps → acknowledge → Reminders → advance clock → banner → Got it → Timeline shows reminder info row and appointment still `WAITING` → Demo tools "simulate care team confirms attendance" (seeded scenario step, labelled demo) → Timeline `DONE`.
   - Scenario 2: Marie → result → Something wrong? → send → Privacy shows `SUBMITTED` → seeded resolved request shows original + updated in Timeline.
   - Demo script minute 12–13: Marie sees approved next step → turns reminders off.
   - Representative scope: Jean-Paul sees Grace only; deep link to Marie's result → permission denied.
10. Add Demo tools action `Simulate care-team confirmation` that applies a pre-defined seeded transition on the **linked follow-up/referral** (via `repo.demo.simulateExternalUpdate`, evidence type `clinician_confirmation`, actor `persona-clin-alpha1` as simulated actor) so the instruction's derived progress becomes `completed` to make Scenario 1's "see updated status" demonstrable in an isolated app (D3). Labelled `DEMO — represents an action in the Clinical Portal`. Audit `demo.simulated_staff_action`.
11. FRD test-case mapping (citizen interpretation): T-01 consent/ack/correction happy path + audit; T-02 representative cross-scope & cross-patient deep links; T-03 correction/callback field errors; T-04 double submit ack/prefs/correction/callback; T-05 conflict on ack/prefs/correction; T-06 correction keeps original (hash) & amended timeline; T-07 verification service unavailable → no identity fabricated; T-08 N/A for wallet (no export) — asserted by absence of export routes; T-09 error500 then retry same key; T-10 citizen sees review status + responsible professional + ruleset version hidden from citizen (assert not rendered) — reviewer-facing explanation lives in Clinical portal.
12. Final sweep: forbidden-content test (no score/forecast/diagnosis/insurance/credit/eligibility wording; no unapproved instruction IDs in render trees); DemoBanner present on every route (route-walk test).

## 6. Data, state and audit

- No new collections. The demo action goes through FND-07 `demo.simulateExternalUpdate` on the linked follow-up/referral (instruction progress is derived, never written directly), audited as `demo.simulated_staff_action` with the simulated actor.
- Invariants re-asserted by tests: all CTZ-01 invariants; every route shows DemoBanner; no fetch calls.

## 7. UX states

Completes the matrix for all screens (task 7). Offline: N/A for this local-only app, stated in README and About demo screen ("Works without internet").

## 8. i18n

- Add any missing a11y label/hint keys under `citizen:a11y.*` (e.g. `citizen.a11y.statusPrefix` EN "Status" / RW "Uko bihagaze" — draft).
- `citizen.demo.simulateConfirmation` EN "Simulate care-team confirmation (demo)" / RW draft "Gerageza kwemeza kw'itsinda rikwitaho (igerageza)".
- Run `pnpm i18n:check --ns citizen --report`; produce list of RW strings flagged `needs linguistic review` / `needs clinical review` in README "Translation review" section.

## 9. Acceptance criteria

- [ ] All Maestro flows pass from `clearState` on Android emulator via Expo Go (or dev build) and on iOS simulator.
- [ ] UX-state matrix test green for every listed screen; no network calls.
- [ ] Every pressable ≥ 44pt; no clipped text at fontScale 2 + Largest.
- [ ] TalkBack manual walkthrough of Scenario 1 completes without sighted help (recorded checklist in README).
- [ ] FRD T-01..T-10 each have at least one passing test or an explicit N/A assertion.
- [ ] Forbidden-content and DemoBanner route-walk tests pass in EN and RW.
- [ ] README documents personas, reset, fault toggles, limitations, translation-review list.

## 10. Tests

Files listed in §4 Deliverables plus updates to `@laif/test-utils` (`expectMinTouchTarget`, `walkAllRoutes`).

## 11. Verification

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
pnpm i18n:check --ns citizen --report
pnpm dev:citizen   # then in another terminal, with emulator/simulator running Expo Go:
pnpm --filter @laif/citizen-wallet test:maestro
```
Manual (Expo Go, TalkBack on): Demo tools → Reset → follow Scenario 1 click-path in task 9 → Scenario 2 → switch to RW and repeat Scenario 1 headline steps → Jean-Paul representative check.

## 12. Commit

`feat(citizen): CTZ-09 accessibility polish, UX states and end-to-end journeys`
