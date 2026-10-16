# FND-10 — @laif/ui-native: native tokens and shared React Native components

**Status:** Done

## 1. Header

| Field | Value |
|---|---|
| ID | FND-10 |
| Title | Native design system |
| App | Shared (`packages/ui-native`) — consumed by worker-mobile, citizen-wallet |
| Depends on | FND-04, FND-09 (token/icon parity source) |
| Trace | Tech spec §7 (native: safe areas, dynamic type, touch targets), ADR-P03; README design language; prototype phone frame + mobile classes (`.mobile-task`, `.offline-strip`, `.local-save-note`, `.next-step-card`, `.reminder-card`, `.bottom-nav`) |
| Size | M |

## 2. Goal

The two Expo apps share a native component kit that looks like the web system (same teal tokens, mono micro-labels, pill chips, cards) and is built for the field: ≥ 44 pt targets, dynamic type, safe areas, screen-reader labels, persistent demo banner and EN/RW switcher, plus offline/sync-specific visuals.

## 3. Scope

**In scope:** `tokens.ts` (parity with ui-web), fonts via `expo-font`, icons via `react-native-svg`, ~30 components, native render helper in test-utils, Jest-free testing approach (see tests). CTZ-08 later adds a `highContrast` token set and `textScale` support to this package (additive; parity test extended).

**Out of scope:** navigation structure (each app's Expo Router layout), app-specific screens, haptics.

## 4. Deliverables

```text
packages/ui-native/src/
  tokens.ts                    # colors, spacing, radii, typography scale, minTouchTarget = 44
  fonts.ts                     # useLaifFonts() → expo-font load of @expo-google-fonts/dm-sans, manrope, jetbrains-mono (bundled, offline)
  icons/icon-data.ts, Icon.tsx # same IconName set as ui-web, rendered with react-native-svg
  components/*.tsx             # see task 3
  index.ts
packages/ui-native/src/tokens.parity.test.ts   # compares against @laif/ui-web/src/tokens.ts (devDependency)
packages/test-utils/src/native/render.tsx      # renderNative(ui, { language }) using @testing-library/react-native
```

## 5. Implementation tasks

1. Peer dependencies: `react`, `react-native`, `react-native-svg`, `react-native-safe-area-context`, `expo-font`; versions come from the Expo SDK pinned in FND-11 (`npx expo install` resolves them). Dev: `@testing-library/react-native`, `react-test-renderer`.
2. **Tokens**: identical colour values and names to `@laif/ui-web` `tokens.ts` (parity test fails on drift); spacing 4-pt scale; type scale `caption 12, body 15, bodyLarge 17, title 20, display 26` all multiplied by `PixelRatio.getFontScale()` only via `allowFontScaling` (never disabled); `maxFontSizeMultiplier` 1.6 on dense rows only.
3. **Components** (all text via props or `useT`, all pressables with `accessibilityRole`, `accessibilityLabel`, `accessibilityState`, `hitSlop` to reach 44 pt):
   - Layout: `Screen` (SafeAreaView + DemoBanner + optional OfflineBanner + scroll/keyboard-avoiding), `AppHeader` (title, back, right actions incl. `LanguageSwitcher`), `Section` (MicroLabel heading), `Card`, `ListRow` (title, subtitle, trailing chip/chevron — HWM's `ListRowCard`), `BottomTabBar` styles helper for Expo Router `Tabs` (`tabBarStyle`, icons).
   - Banners: `DemoBanner` (always first child of `Screen`; not dismissible), `RoleBanner` (persona + "Demo role switch — not authentication"), `OfflineBanner` ("Offline — changes are saved on this device"), `SyncStatusPill` (`saved_locally | syncing | synced | conflict | failed` — icon + text), `RuleDisclaimer`, `InfoCallout`, `PrivacyNotice`.
   - Display: `StatusChip` (icon + mono caps text), `MicroLabel`, `MetricTile`, `ReadingDisplay` (value + unit always shown, e.g. `148/92 mmHg`, `7.8 mmol/L`), `Timeline`, `EmptyState`, `ErrorState` (retry), `PermissionDenied`, `ConflictCard` (mine vs latest compare table with changed rows marked by icon + text, + the two actions `reapply_on_latest` / `keep_latest` — HWM-09 `CompareTable`/`VersionCompareTable` and CTZ `ConflictNotice` use it), `ExplainableFlag` (native twin of ui-web), `SummaryStrip` (one card split by dividers — native `KpiStrip`), `TabbedFilter` (tabs with count badges), `LoadingState` (`ActivityIndicator` + accessible label).
   - Forms: `Field`, `TextField`, `NumberField` (numeric keyboard, unit adornment, decimal handling for `,` and `.` — HWM's `NumericUnitField`), `CheckboxField`, `RadioCardGroup`, `SegmentedControl` (unit and context pickers), `SelectSheet` (modal list), `DateTimeField` (Kigali wall time), `Toggle`, `Stepper` (compact numbered progress for multi-step forms), `ReasonField` (min 10 chars counter).
   - Actions: `Button` (primary/secondary/ghost/danger, `loading` prevents double submit), `IconButton` (label required), `ConfirmSheet` (Modal; destructive + reason variants), `LanguageSwitcher` (EN / RW segmented; persists via i18n), `PersonaSwitcher`, `DemoToolsSheet` (Reset demo, Offline toggle, Slow network, Server errors, Load scenario — handlers injected).
   - `AsyncView`: same ten-state contract as web `AsyncBoundary`.
4. Typography: DM Sans body, Manrope headings, JetBrains Mono micro-labels/chips — loaded from bundled font packages (no network). Show `BrandSplash` (port of prototype loader) until fonts + i18n + repository are ready.
5. Accessibility: `accessibilityLiveRegion="polite"` on SyncStatusPill and toasts (Android), `AccessibilityInfo.announceForAccessibility` on save/sync results (iOS); all chips include text so state is not colour-only. Decision: no animation library (no Reanimated); the splash/loader checks `AccessibilityInfo.isReduceMotionEnabled()` and renders statically when true.
6. `renderNative` helper in `@laif/test-utils/native` wraps `I18nProvider` + `SafeAreaProvider` (initial metrics mocked).

## 6. Data, state and audit

UI-only; no repository access. `SyncStatusPill` maps `SyncOperation.status` (FND-02) to visuals: queued/sending → `saved_locally`/`syncing`, acknowledged → `synced`, conflict/needs_resolution → `conflict`, retryable_failure → `failed` (with retry note), rejected → `failed` ("Not accepted"), blocked_revoked → `failed` ("Kept on device — device revoked"), superseded → hidden. Mapping lives in `deriveSyncState` (FND-02), not in the component.

## 7. UX states

`AsyncView` covers initial, loading, loaded, empty, validation error (`Field`), server error, permission denied, offline (OfflineBanner + "saved on this device"), stale/conflict (`ConflictCard`), success (toast + accessibility announcement).

## 8. i18n

Adds `worker`/`citizen`-agnostic shared keys under `common:sync.*` (`savedOnDevice`, `syncing`, `synced`, `conflict`, `failedWillRetry`), `common:a11y.*` (button hints), reusing `shell`/`demo` keys from FND-09. RW required for all.

## 9. Acceptance criteria

- [x] Parity test: every colour token in ui-native equals ui-web.
- [x] Every pressable component test asserts `accessibilityRole` and a label, and computed hit area ≥ 44×44.
- [x] `Screen` always renders DemoBanner text; `AppHeader` renders LanguageSwitcher by default.
- [x] `ReadingDisplay` never renders a value without its unit (test with missing unit shows "Unit missing" chip).
- [x] `SyncStatusPill` renders icon + text for all five states in EN and RW.
- [x] No component sets `allowFontScaling={false}`.
- [x] Lint: no hex literals in `src/components/**`; no literal JSX text.

## 10. Tests

Run under Vitest with `@testing-library/react-native` via the `react-native` Vitest preset decision: use `vitest` + `react-native-web` alias for component logic tests (`resolve.alias: { 'react-native': 'react-native-web' }`, jsdom) — decision for a single test runner across the repo; true device behaviour is covered by REL-03 Maestro/Expo-web checks. Files: `src/components/*.test.tsx`, `src/tokens.parity.test.ts`, `src/a11y.targets.test.tsx`.

## 11. Verification

```bash
pnpm --filter @laif/ui-native typecheck && pnpm --filter @laif/ui-native lint
pnpm vitest run --project @laif/ui-native
pnpm verify
```
Manual (after FND-11): open worker-mobile in Expo Go, set device font size to largest, toggle EN/RW, enable TalkBack/VoiceOver and swipe through the shell.

## 12. Commit

`feat(ui-native): FND-10 native tokens and accessible shared react-native components`
