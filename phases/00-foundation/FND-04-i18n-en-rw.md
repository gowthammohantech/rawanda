# FND-04 — @laif/i18n: English ⇄ Kinyarwanda (P0) for web and React Native

**Status:** Done

## 1. Header

| Field | Value |
|---|---|
| ID | FND-04 |
| Title | i18n EN + RW |
| App | Shared (`packages/i18n`) |
| Depends on | FND-03 |
| Trace | `Implementation_notes.md` (EN⇄RW P0, offline, saved preference, translated validation, fallback); tech spec §7 Localization; CW-07; FRD shared non-negotiable 6 |
| Size | M |

## 2. Goal

Every app can switch between English and Kinyarwanda instantly, offline, with the choice remembered per app across restarts; validation messages appear in the selected language; any missing Kinyarwanda string falls back to English (logged in dev, never a blank or a raw key); dates and times always display in `Africa/Kigali`.

## 3. Scope

**In scope:** i18next setup shared by web and RN; bundled JSON catalogues (no network loading); typed keys; language preference persistence via an injected storage adapter; React provider + hooks usable in both React DOM and React Native; Zod message translation; date/number/measurement formatting; catalogue parity tooling; review-flag metadata for clinical Kinyarwanda.

**Out of scope:** app-specific copy (each app track adds keys to its own namespace); the visual `LanguageSwitcher` component (FND-09 web / FND-10 native).

## 4. Deliverables

```text
packages/i18n/src/
  locales/en/{common,validation,domain,demo,shell,clinical,worker,admin,citizen}.json
  locales/rw/{same files}.json
  locales/rw/_review.json          # { "<ns>:<key>": "needs clinical/linguistic review" | "draft" }
  resources.ts                     # static imports of all JSON → `resources` object (bundled, offline)
  types.ts                         # declare module 'i18next' { interface CustomTypeOptions { defaultNS:'common'; resources: typeof enResources } }
  create-i18n.ts                   # createI18n({ appId, storage, initialLanguage?, isDev }): Promise<I18nInstance>
  storage.ts                       # LanguageStorage interface + createMemoryLanguageStorage(); web + native adapters below
  storage.web.ts                   # createWebLanguageStorage() → localStorage key `laif.<appId>.language`
  storage.native.ts                # createNativeLanguageStorage() → `expo-sqlite/kv-store` (peer dep, optional)
  react.tsx                        # <I18nProvider i18n>, useT(ns?), useLanguage() → { language, setLanguage, languages }
  validation.ts                    # translateValidationMessage(t, msg) ; useFieldErrorText()
  format.ts                        # formatDateTime, formatDate, formatTime, formatRelativeToNow, formatNumber, formatMeasurement
  missing.ts                       # dev missing-key logger + getMissingKeyReport()
  index.ts
scripts/i18n-check.ts              # root script: parity + unused + review report
```

## 5. Implementation tasks

1. Pin `i18next` 25.x and `react-i18next` 15.x (both run on React DOM and React Native — decision). No `i18next-http-backend`; catalogues are statically imported so they ship inside each bundle and work offline.
2. Languages: `SUPPORTED_LANGUAGES = ['en','rw'] as const`, `DEFAULT_LANGUAGE = 'en'`. Decision: initial language = stored preference → else `'en'` (no device-locale auto-detect, to keep demos predictable).
3. `createI18n`: `fallbackLng: 'en'`, `supportedLngs`, `ns` = all namespaces, `defaultNS: 'common'`, `returnNull: false`, `returnEmptyString: false` (empty RW strings fall back), `interpolation.escapeValue: false` (React escapes). In dev: `saveMissing: true`, `missingKeyHandler` → `console.warn('[i18n] missing', lng, ns, key)` once per key and records it in `getMissingKeyReport()`. In prod builds: silent fallback.
4. **Persistence**: `interface LanguageStorage { get(): Promise<Language|null>; set(l: Language): Promise<void> }`. `setLanguage` writes storage **before** changing language; on web also sets `document.documentElement.lang` (`rw` / `en`). Storage failures are caught; language still changes in memory.
5. **Typed keys**: augment `CustomTypeOptions` with EN resources so `t('clinical:queue.title')` is checked; misspelt keys fail `typecheck`.
   **Key/file convention (binding for all app tracks):** a key is written `<ns>:<area>.<key>`; app phases that write `clinical.queue.title`, `worker.auth.title`, `admin.shell.nav.overview` or `citizen.health.title` mean `clinical:queue.title`, `worker:auth.title`, `admin:shell.nav.overview`, `citizen:health.title`. App namespaces may be split into area files `locales/<lng>/<ns>/<area>.json` (e.g. `locales/rw/worker/auth.json`, `locales/en/admin/shell.json`, `locales/en/citizen/health.json`); `resources.ts` merges them into namespace `<ns>` under key `<area>`. Validation keys added by app phases (e.g. `validation.screening.unitRequired`, `validation.followup.evidenceRequired`) live in the shared `validation` namespace and must also be appended to `VALIDATION_KEYS` in `@laif/contracts`. There is no `catalogs/` or `catalogues/` directory and no per-file `_review` / `needsReview` metadata — review flags live only in `locales/rw/_review.json` (task 7).
6. **Namespaces & seed keys** (EN + RW written now): `common` (actions: save, cancel, confirm, retry, back, next, search, filter, reset, close; states: loading, empty, error, offline, permissionDenied, conflict, success; `languageName.en` = "English", `languageName.rw` = "Ikinyarwanda"), `demo` (banner text, `syntheticData`, `resetDemo`, `resetConfirm`, `demoRoleSwitcher`, `notForClinicalUse`, `ruleDisclaimer` for `DEMO_RULE_NOT_CLINICALLY_VALIDATED`, 12 scenario titles `scenario.SCN-01`…), `shell` (nav section labels, topbar search placeholder, notifications, profile, skip-to-content), `domain` (every enum value from FND-02 — status/decision/evidence/reason/role/consent/identity/channel), `validation` (every `VALIDATION_KEYS` entry, with ICU-style `{{min}}` params). App namespaces `clinical`, `worker`, `admin`, `citizen` start with only `{ "appName": … }`.
7. **Kinyarwanda copy**: builders write draft RW strings; every key in `domain`, `validation` and anything clinical is listed in `rw/_review.json` as `"needs clinical/linguistic review"`. `useT` never shows this marker in UI; the admin governance page and REL-05 checklist read the report.
8. **Validation translation**: `translateValidationMessage(t, message)` uses `parseValidationMessage` from contracts; unknown messages render `t('validation:invalid')` and log in dev. `useFieldErrorText(error?: FieldError)` for RHF and native forms.
9. **Formatting (`format.ts`)** — all inputs are ISO UTC strings, output always in `Africa/Kigali` (`KIGALI_TZ` constant):
   - Prefer `Intl.DateTimeFormat(locale, { timeZone: 'Africa/Kigali', ... })` with locale `en-GB` for `en` and `rw-RW` for `rw`.
   - Feature-detect `Intl.DateTimeFormat.supportedLocalesOf(['rw'])` and time-zone support (Hermes may lack either). Fallback: Kigali is a fixed UTC+02:00 with no DST, so compute wall time by adding 2 h and format manually using `common:months.short.1..12` / `common:weekdays.*` catalogue entries. Both paths must produce identical output for EN (tested).
   - `formatMeasurement(value, unit)` always prints the unit (`"7.8 mmol/L"`, `"148/92 mmHg"`); `formatRelativeToNow(iso, clock)` uses the demo clock, not wall time.
10. **Tooling**: root script `pnpm i18n:check` (`tsx scripts/i18n-check.ts`) fails if any EN key is missing in RW, any RW key is not in EN, or any `domain`/`validation` enum key is absent. Hooked into `pnpm lint`. Options: `--ns <name>` limits the check to one namespace (replaces the per-track `check-catalogue` / `check:citizen` scripts proposed in CLN-11 and CTZ-08), `--report` prints the `_review.json` backlog (keys still marked `needs clinical/linguistic review`) per namespace, `--unused` lists keys not referenced in source. This is the only catalogue-check script in the repo.
11. Export a test helper `createTestI18n(language = 'en')` (memory storage, sync init) for component tests; re-exported from `@laif/test-utils` later.

## 6. Data, state and audit

Persists only `laif.<appId>.language`. No patient data. Changing language emits no audit event (UI preference) — decision.

## 7. UX states

Provides strings for all ten standard UX states in `common:state.*`. Fallback behaviour: missing RW → EN text (never key, never blank).

## 8. i18n

This phase *is* the i18n foundation. Namespaces created: `common, validation, domain, demo, shell, clinical, worker, admin, citizen`. Key naming: `camelCase` segments, dot-nested, no sentences as keys. Kinyarwanda clinical copy carries `needs clinical/linguistic review` in `_review.json`.

## 9. Acceptance criteria

- [x] `setLanguage('rw')` then re-creating the instance with the same storage starts in `rw` (persisted preference).
- [x] With all network APIs stubbed to throw, `createI18n` resolves and translates (offline bundles).
- [x] Deleting one RW key at runtime renders the EN string and records one dev warning; `getMissingKeyReport()` lists it.
- [x] `translateValidationMessage(t_rw, 'validation:reasonTooShort|{"min":10}')` returns the RW string with `10` interpolated.
- [x] `formatDateTime('2026-10-14T06:00:00.000Z','en')` contains `08:00`; the manual fallback path yields the same string.
- [x] `pnpm i18n:check` passes; removing an RW key makes it fail.
- [x] Using `t('common:doesNotExist')` is a TypeScript error.
- [x] Package imports no DOM-only or RN-only module at top level (native storage lives in a separate entry `@laif/i18n/native`, web in `@laif/i18n/web`).

## 10. Tests

`src/create-i18n.test.ts`, `src/storage.test.ts`, `src/validation.test.ts`, `src/format.test.ts` (Intl path + forced fallback path, midnight-boundary: `2026-10-13T22:30Z` → 14 Oct 00:30 Kigali), `src/coverage.test.ts` (every FND-02 enum and `VALIDATION_KEYS` has EN+RW), `src/react.test.tsx` (switch language re-renders; jsdom), `scripts/i18n-check.test.ts`.

## 11. Verification

```bash
pnpm --filter @laif/i18n typecheck
pnpm vitest run --project @laif/i18n
pnpm i18n:check
pnpm verify
```

## 12. Commit

`feat(i18n): FND-04 offline EN/RW catalogues, persisted language, translated validation and Kigali formatting`
