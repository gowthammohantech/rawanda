# CTZ-02 — Welcome, demo access, simulated consent and navigation

## 1. Header

| Field | Value |
|---|---|
| ID | CTZ-02 |
| Title | Welcome, synthetic-demo explanation, persona choice, simulated verification, consent grant/withdraw, tab navigation |
| App | Citizen Health Wallet |
| Depends on | CTZ-01 |
| Trace | CW-01, CW-06 (consent/notice), CW-07 (language on first run); FRD Scenario 1 step "enroll through approved verification"; T-01, T-02, T-07, T-09; Tech spec §2.4 "Welcome / consent", §10 "consent withdrawn" |
| Size | L |
| Status | Done |

## 2. Goal

A first-time demo user lands on a calm welcome screen that explains, in plain language, that everything is synthetic and not for clinical use, picks a labelled demo persona, completes a **simulated** identity verification, reads a short privacy notice and grants consent. They then reach a five-tab wallet. Consent can be withdrawn at any time, which immediately hides all health data; the seeded "consent withdrawn" persona demonstrates this state on entry.

## 3. Scope

**In scope:** onboarding stack, persona picker, simulated verification (demo code), safe-recovery stub, consent screen (grant/withdraw/re-grant), route guards, tab layout with placeholder tab screens, session persistence across restart, switch persona/sign out.

**Out of scope:** real NIDA/biometric/OTP (ADR-P09, never fabricate identity); tab content (CTZ-03..08); accessibility settings screen (CTZ-08).

## 4. Deliverables

Routes (`apps/citizen-wallet/app/`):
- `index.tsx` — redirect by session state.
- `(onboarding)/_layout.tsx` (Stack), `welcome.tsx`, `about-demo.tsx`, `persona.tsx`, `verify.tsx`, `recover.tsx`, `consent.tsx`.
- `(app)/_layout.tsx` — guard: no session → `/welcome`; consent ≠ granted → `/(app)/consent-withdrawn`.
- `(app)/consent-withdrawn.tsx`.
- `(app)/(tabs)/_layout.tsx` — Tabs: `health`, `next-steps`, `reminders`, `timeline`, `more` (icons: heart, clipboard, bell, activity, user; labels via i18n).
- `(app)/(tabs)/{health,next-steps,reminders,timeline,more}/index.tsx` — placeholders with `EmptyState` "Coming in CTZ-0x" hidden behind `__DEV__` only.
- `(app)/(tabs)/more/consent.tsx` — manage consent.
- `(app)/(tabs)/more/demo-tools.tsx` — reset demo + fault toggles (task 13).

Components (`apps/citizen-wallet/src/components/`): `PersonaCard`, `SyntheticNotice`, `ConsentSummary`, `PrivacyNoticeSheet`, `CodeInput` (6 digits, numeric, `accessibilityLabel` per box), `WalletHeader` (RwandaMark compact + persona initials + "Demo persona" pill). Reuse from `@laif/ui-native`: `DemoBanner`, `Button`, `Card`, `StatusChip`, `ErrorState`, `ConfirmSheet`, `LanguageSwitcher`.

State: `src/state/session.ts` (Zustand view over FND-06 `createPersonaSession({ appId: 'citizen' })`, persisted via `expo-sqlite/kv-store`) — `{ accountId, personaId, activePatientId }`.

## 5. Implementation tasks

1. `welcome.tsx`: hero (RwandaMark, "Your care information, in one place"), `SyntheticNotice` card (soft-blue info callout from ref-images: "Everything here is made-up demonstration data. It is not your real health record and not for medical use."), language switcher prominent, `Continue` primary button, `What is this demo?` secondary → `about-demo.tsx`.
2. `about-demo.tsx`: three short plain-language points: what the wallet shows (only results and next steps your care team released), what it never does (no diagnosis, no treatment advice, no health score, no insurance or credit use), who to contact. Mono micro-label `PROTOTYPE`.
3. `persona.tsx`: list from `repo.listPersonas()`; each `PersonaCard` shows synthetic name, relationship (`Self` / `Representative for Grace K.`), state chip (`CONSENT GIVEN`, `CONSENT WITHDRAWN`, `NOT VERIFIED`), and the label `Demo persona — role switching is not real sign-in`. Selecting writes `citizen.persona.selected`.
4. `verify.tsx` (for `pending_verification` accounts): `CodeInput` with Zod schema `^\d{6}$`; demo hint card shows code `246810` (explicitly labelled demo). Outcomes: verified → `consent`; wrong code → field error, attempt count (lock after 5 → `recover`); simulated `DEPENDENCY_UNAVAILABLE` (toggle via FND fault injector) → `ErrorState` "Verification service is not available right now. Nothing was changed. Try again later." — never auto-verify (T-07). Retry reuses idempotency key (T-09).
5. `recover.tsx`: stub explaining recovery happens with the care team at the facility (synthetic contact); `Back to start`.
6. `consent.tsx`: `ConsentSummary` (what is shown, who can see it, how to withdraw), `PrivacyNoticeSheet` (notice version `demo-notice-v0.1`), checkbox "I have read this" (required; validation message translated), `Give consent` → `repo.recordConsent({action:'granted'})` → tabs. `Not now` → back to persona list without data access.
7. Route guard in `(app)/_layout.tsx` uses `useConsent()`; on `CONSENT_REQUIRED` from any query, redirect to `consent-withdrawn`.
8. `consent-withdrawn.tsx`: calm explanation "You stopped sharing. Your care team still has your record; this app no longer shows it." Actions: `Give consent again` → `consent.tsx`; `Switch persona`. No health data or counts rendered.
9. `more/consent.tsx`: current state + date; `Withdraw consent` → `ConfirmSheet` (destructive style, explains effect and that clinical records are not deleted) → `recordConsent({action:'withdrawn'})` → cancel scheduled reminders hook (no-op stub until CTZ-05 registers it; define `onConsentWithdrawn` event bus in `src/state/events.ts`) → redirect.
10. `(tabs)/_layout.tsx`: bottom tabs, 5 items, `tabBarAccessibilityLabel`s, safe-area aware, min height 56, labels never truncated at 200% font scale (wrap to icon + short label keys).
11. `WalletHeader` with "Switch persona" in an overflow → clears session (writes `session.ended`).
12. Session persistence: relaunch restores persona and last tab; if consent changed (e.g. reset) guard re-evaluates.
13. `(app)/(tabs)/more/demo-tools.tsx` (the same `DemoToolsScreen` component is re-exported at `(onboarding)/demo-tools.tsx` so it is reachable from the welcome footer link "Demo tools" before a persona is chosen): `Reset demo` (FND hook, `ConfirmSheet`), pinned demo clock display with `Advance +1 day` / `+7 days` / `Back to baseline` (`repo.demo.advanceClock(ms)` / `resetClock()`, FND-07), and toggles for the FND-07 `FaultConfig` (`latencyMs`, `serverErrorRate` ("error500"), `dependencyUnavailableRate` ("unavailable"), `conflictOnce` ("conflict-next-write")). Reuses FND-10 `DemoToolsSheet`. Labelled `DEMO ONLY`. Later phases use these toggles in their manual click-paths.

## 6. Data, state and audit

- Reads: `ctz_citizen_accounts`, `ctz_patient_links`, `ctz_consent_records`, `ctz_identity_verifications`.
- Writes: `ctz_identity_verifications` (attempt rows), `ctz_consent_records` (append), `ctz_access_events`.
- Audit: `citizen.persona.selected`, `session.started`, `session.ended`, `citizen.identity.verification_attempted`, `citizen.identity.verified`, `citizen.identity.verification_failed`, `citizen.identity.verification_unavailable`, `citizen.consent.granted`, `citizen.consent.withdrawn`, `access.denied` (guard hit).
- Invariants: no health data query executes before consent = granted; withdrawal never deletes clinical rows; verification never succeeds without the demo code.

## 7. UX states

| State | Where | Presentation |
|---|---|---|
| initial | welcome | hero + synthetic notice |
| loading | persona list, consent submit | skeleton cards; button spinner + disabled (no double submit) |
| loaded | persona list | cards |
| empty | persona list (seed missing) | `EmptyState` + `Reset demo` |
| validation error | verify code, consent checkbox | inline field error, `accessibilityLiveRegion="polite"` |
| server error | verify/consent write fault | `ErrorState` with retry |
| permission denied | guard | consent-withdrawn screen / `PermissionDenied` |
| offline | n/a (all local) — show nothing alarming; the app is local-only |
| stale-conflict | consent write with stale version | `ConflictNotice` "Your consent was changed elsewhere. Here is the latest." |
| success | consent granted | toast "Consent saved" then tabs |

## 8. i18n

Namespaces: `citizen.onboarding`, `citizen.consent`, `citizen.nav`, `citizen.validation`.

| Key | EN | RW (draft — needs linguistic review) |
|---|---|---|
| `citizen.onboarding.title` | Your care information, in one place | Amakuru yawe yo kwivuza, ahantu hamwe |
| `citizen.onboarding.synthetic` | Everything here is made-up demonstration data. It is not your real health record. | Ibiri hano byose ni amakuru y'igerageza. Si amakuru nyayo y'ubuzima bwawe. |
| `citizen.nav.health` | My health | Ubuzima bwanjye |
| `citizen.nav.nextSteps` | Next steps | Intambwe zikurikira |
| `citizen.nav.reminders` | Reminders | Kwibutsa |
| `citizen.nav.timeline` | Timeline | Uko byagenze |
| `citizen.nav.more` | More | Ibindi |
| `citizen.consent.give` | Give consent | Tanga uburenganzira |
| `citizen.consent.withdraw` | Stop sharing | Hagarika gusangiza |
| `citizen.validation.codeSixDigits` | Enter the 6 numbers | Andika imibare 6 |
| `citizen.validation.mustConfirmRead` | Please confirm you have read this | Emeza ko wabisomye |

Fallback: missing RW key renders EN and logs `i18n.fallback` in dev; never render raw keys. Language choice on welcome persists before any persona is chosen.

## 9. Acceptance criteria

- [ ] Fresh install → welcome shows DemoBanner, synthetic notice and EN/RW switcher; switching to RW re-renders all onboarding copy and persists across restart.
- [ ] CTZ-P5 cannot proceed without code `246810`; wrong code shows translated inline error; fault-injected unavailable path shows error and **does not** verify.
- [ ] Granting consent writes exactly one `ctz_consent_records` row and one `citizen.consent.granted` audit event, even on double-tap.
- [ ] CTZ-P3 lands on consent-withdrawn; no health value, count or name of a result is rendered; deep link `citizen-wallet://health` redirects there.
- [ ] Withdrawing consent from More immediately blocks every tab; re-granting restores access.
- [ ] Persona switch clears session; relaunch restores last persona.
- [ ] All touch targets ≥ 44pt; screen reader announces persona cards with name, relationship, state.

## 10. Tests

- `apps/citizen-wallet/src/__tests__/onboarding/welcome.test.tsx` (RNTL: notice present, language toggle).
- `.../onboarding/verify.test.tsx` (validation, lockout, unavailable fault, idempotent retry).
- `.../onboarding/consent.test.tsx` (grant once on double press; audit emitted).
- `.../navigation/guard.test.tsx` (CTZ-P3 redirect; deep link blocked).
- Maestro: `apps/citizen-wallet/.maestro/consent.yaml` — choose CTZ-P1 → withdraw → assert no "My health" content → re-grant → assert results tab visible.

## 11. Verification

```bash
pnpm --filter @laif/citizen-wallet typecheck
pnpm --filter @laif/citizen-wallet lint
pnpm --filter @laif/citizen-wallet test
pnpm typecheck && pnpm lint && pnpm test && pnpm build
maestro test apps/citizen-wallet/.maestro/consent.yaml
```
Manual (Expo Go, `pnpm dev:citizen`): Welcome → switch to RW → back to EN → Continue → choose "Aline M." → enter 111111 (error) → 246810 → read notice, tick, Give consent → tabs visible. More → Consent → Stop sharing → confirm → consent-withdrawn screen. Switch persona → "Mireille I." → consent-withdrawn on entry.

## 12. Commit

`feat(citizen): CTZ-02 welcome, simulated verification, consent and tab navigation`
