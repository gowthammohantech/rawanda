# CTZ-08 — Accessibility settings, language and support escalation

## 1. Header

| Field | Value |
|---|---|
| ID | CTZ-08 |
| Title | Accessibility (text size, high contrast, language, low-data) and Support (contact care team, callback stub, no emergency claims) |
| App | Citizen Health Wallet |
| Depends on | CTZ-07 |
| Trace | CW-07, CW-08; `Implementation_notes.md` (EN⇄RW P0: offline, saved preference, translated validation, fallback); Tech spec §2.4 "Accessibility", "Support", §7 (dynamic font scaling, touch targets); PRD §10 "low literacy, missing translations, shared devices"; T-01, T-04, T-09 |
| Size | M |
| Status | Planned |

## 2. Goal

The citizen can make the app easier to use: choose English or Kinyarwanda (works fully offline and is remembered), make text larger, and turn on high contrast. From **Support**, they can find how to reach their care team, ask for a callback (which creates a task for the care team), and read clear wording that this app does not give medical advice and is not an emergency service, telling them to go to their nearest health facility if they feel very unwell.

## 3. Scope

**In scope:** accessibility settings screen, app-level text-scale multiplier on top of OS dynamic type, high-contrast token set, language selector (reusing FND switcher), low-data statement, support screen, callback request (task), help FAQ (static, plain language), support links from result/next-step/empty states.

**Out of scope:** chat/messaging with clinicians, symptom checker, triage, any emergency number dialing (pending product-owner decision — see INDEX), audio/read-aloud (future; noted).

## 4. Deliverables

- `app/(app)/(tabs)/more/accessibility.tsx`, `app/(app)/(tabs)/more/support/index.tsx`, `support/callback.tsx`, `support/help.tsx`.
- `src/theme/ThemeProvider.tsx` — composes `@laif/ui-native` tokens with `highContrast` variant and `textScale`; `useScaledFont()` hook.
- **Shared-package task (`@laif/ui-native`):** add `highContrast` semantic token set (ink `#000000` on surface `#FFFFFF`, primary-dark `#075D66` for actions, borders `#18252B`, status tones with ≥7:1 text contrast) and `textScale` prop support in `Text`/`Button`/`StatusChip` (respect `allowFontScaling`, `maxFontSizeMultiplier` = 3 only on tab labels).
- `src/features/settings/TextScalePicker.tsx` (Standard / Large / Larger / Largest = 1.0 / 1.15 / 1.3 / 1.5 with live preview card), `ContrastToggle.tsx`, `LanguagePicker.tsx` (wraps FND `LanguageSwitcher`, radio list with each language shown in its own name: "English", "Ikinyarwanda").
- `src/features/support/CareTeamContactCard.tsx`, `NotAnEmergencyCard.tsx`, `NoMedicalAdviceNote.tsx`, `CallbackForm.tsx`, `HelpTopicList.tsx`, `SupportLink.tsx`.

## 5. Implementation tasks

1. Settings persistence: `repo.updateSettings({language, textScale, highContrast}, expectedVersion, key)` → `ctz_settings`; also mirror language to FND i18n preference store so the choice applies **before** persona selection on next launch. Writes audit `citizen.settings.changed` (before/after summary).
2. Language: switching re-renders without restart; all date/number formatting follows; validation messages already on screen re-translate (store error **keys**, not strings, in form state). Missing RW key → EN fallback + dev-only `i18n.fallback` log; use FND-04 `pnpm i18n:check --ns citizen --report` (fails on EN/RW parity gaps; `--report` lists RW keys still marked for review) — no separate citizen script.
3. Text scale: multiplier applied via `useScaledFont()`; combined with OS dynamic type; preview card shows a sample result card. Verify layouts at 1.5 × OS 200% (no clipped text; cards wrap; bottom tab labels stay legible).
4. High contrast: toggles token set; all chips keep icon + text; focus/pressed states visible.
5. Low-data statement (on accessibility screen): "This demo works without internet. It does not download pictures or videos." Confirm no remote assets in app (fonts bundled via `expo-font`).
6. Support home:
   - `CareTeamContactCard` — facility name, hours, synthetic phone (demo sheet, no dial, as CTZ-04), "Who to contact: your care team at Kigali Demo Health Centre".
   - `NotAnEmergencyCard` (warning tone + alert icon): "This app is not for emergencies. If you feel very unwell, go to your nearest health facility now." No number, no claim of monitoring or response time.
   - `NoMedicalAdviceNote`: "This app does not give medical advice. Only your care team can tell you what your results mean for you."
   - `Ask for a callback` → `callback.tsx`; `Help topics` → `help.tsx`.
7. Callback form: topic (radio: appointment question, result question, app problem, other), preferred time window (morning/afternoon), optional note ≤ 300 chars; Zod schema with translated messages. Submit → `repo.createCallbackRequest(input, key)` → `careTasks` record `kind: 'callback_request'`, status `open` (FND-02) + audit `citizen.support.callback_requested`. Success copy: "Your care team will try to call you. This is a demo — no one will actually call." Idempotent on double tap / retry.
8. Help topics (static, keys): "What does 'Reviewed' mean?", "Why can't I see my latest check?", "How do I stop reminders?", "What is a demo persona?", "How do I ask for a correction?" — each links to the relevant screen. No clinical content.
9. Add `SupportLink` ("Questions? Contact your care team") to result detail, next-step detail, timeline empty state and consent-withdrawn screen.
10. Access events: `citizen.support.viewed`, `citizen.help.viewed`.
11. Settings + Support must be reachable **without** consent (links on the consent-withdrawn screen and the welcome footer), because language and help are needed to decide on consent; callback is disabled without consent ("Give consent to send requests"). Implement by extending the CTZ-02 guard in `app/(app)/_layout.tsx` with an allow-list of consent-free segments: `more/accessibility`, `more/support/*`, `more/consent`, `more/demo-tools` (these routes never query health data; covered by a guard unit test).

## 6. Data, state and audit

- Reads/writes: `ctz_settings`, `ctz_care_tasks` (callback), audit, access events.
- Audit: `citizen.settings.changed` (fields: language/textScale/highContrast), `citizen.support.callback_requested`, `task.created`; access: `citizen.support.viewed`, `citizen.help.viewed`.
- Invariants: language preference survives restart and `Reset demo` restores baseline `en`; support never renders clinical advice or emergency service claims; callback creates exactly one task per idempotency key.

## 7. UX states

| State | Presentation |
|---|---|
| initial/loaded | settings with current values; support cards |
| loading | settings skeleton; callback submit spinner, disabled |
| empty | help list never empty (static) |
| validation error | callback topic required; note length — inline, translated |
| server error | settings change reverts with inline error + Retry; callback error banner + Retry same key |
| permission denied | without consent: settings/support visible, callback disabled with explanation (task 11) |
| offline | n/a — explicitly stated as working offline |
| stale-conflict | settings conflict → reload saved values, toast |
| success | toast "Saved"; callback success screen |


## 8. i18n

Namespaces `citizen.accessibility`, `citizen.support`, `citizen.help`, `citizen.validation.callback`.

| Key | EN | RW (draft — linguistic review) |
|---|---|---|
| `citizen.accessibility.textSize` | Text size | Ingano y'inyandiko |
| `citizen.accessibility.highContrast` | High contrast | Itandukaniro ry'amabara rikomeye |
| `citizen.support.notEmergency` | This app is not for emergencies. If you feel very unwell, go to your nearest health facility now. | Iyi porogaramu si iy'ibihe byihutirwa. Niba wumva urembye cyane, jya ku kigo nderabuzima kikwegereye ubu. |
| `citizen.support.noAdvice` | This app does not give medical advice. | Iyi porogaramu ntitanga inama z'ubuvuzi. |
| `citizen.validation.callback.topicRequired` | Please choose what your question is about. | Hitamo icyo ikibazo cyawe kivugaho. |

`notEmergency` and `noAdvice` flagged **clinical + legal review**.

## 9. Acceptance criteria

- [ ] Language switch to RW updates every visible string including active validation errors, persists across app kill/relaunch, and works in airplane mode.
- [ ] `pnpm i18n:check --ns citizen` reports zero missing EN keys; RW gaps listed (and render EN fallback, never raw keys).
- [ ] Text size Largest + OS 200%: no clipped text on Health, Next steps, Reminders, Timeline, Privacy, Support (verified by snapshot at `fontScale=2` in tests).
- [ ] High contrast passes contrast check (≥ 7:1 body text) in token unit test.
- [ ] Support shows not-an-emergency and no-medical-advice notices; no phone number dials.
- [ ] Callback double-tap creates one task + one audit event.
- [ ] Settings/Support reachable from consent-withdrawn screen; callback disabled there.

## 10. Tests

- `src/features/settings/__tests__/accessibilitySettings.test.tsx` (persist, revert on error, conflict reload).
- `.../__tests__/languageSwitch.test.tsx` (re-translate validation keys; fallback to EN).
- `src/theme/__tests__/highContrastTokens.test.ts` (contrast ratios).
- `src/features/support/__tests__/support.test.tsx` (notices present; no forbidden phrases like "call 112", "we will monitor", "diagnos").
- `.../__tests__/callback.test.tsx` (validation, idempotent submit).

## 11. Verification

```bash
pnpm --filter @laif/ui-native test
pnpm i18n:check --ns citizen --report
pnpm --filter @laif/citizen-wallet typecheck && pnpm --filter @laif/citizen-wallet lint && pnpm --filter @laif/citizen-wallet test
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```
Manual (Expo Go): enable airplane mode → More → Accessibility → Ikinyarwanda → kill app → relaunch (still RW) → Largest text + device font at max → browse all tabs → High contrast on. More → Support → Ask for a callback → submit with no topic (RW error) → choose topic → send twice → one success. Switch to Mireille (consent withdrawn) → Support reachable, callback disabled.

## 12. Commit

`feat(citizen): CTZ-08 accessibility, language settings and support escalation`
