# FND-11 — Four bootable app shells (2 × Vite web, 2 × Expo Router)

**Status:** Done

## 1. Header

| Field | Value |
|---|---|
| ID | FND-11 |
| Title | Empty app shells wired to shared packages |
| App | `apps/clinical-web`, `apps/programme-admin`, `apps/worker-mobile`, `apps/citizen-wallet` |
| Depends on | FND-01 … FND-10 |
| Trace | README D1, D2, D3, D5; tech spec §2 (routes, ports), §3 commands, §12 W1 exit gate ("four apps boot and show role-specific shells; seed reset") |
| Size | L |

## 2. Goal

`pnpm dev:clinical`, `pnpm dev:admin`, `pnpm dev:worker` and `pnpm dev:citizen` each start an app that shows the brand loader, then a shell with the always-visible demo banner, a working EN ⇄ RW switcher that survives reload, a demo-tools menu (Reset demo, offline / slow / error toggles) and a locally seeded dataset — so the four app tracks (CLN, HWM, ADM, CTZ) can start in parallel without touching shared setup.

## 3. Scope

**In scope:** app scaffolds with fixed package names `@laif/clinical-web`, `@laif/programme-admin`, `@laif/worker-mobile`, `@laif/citizen-wallet` (the names FND-01 root scripts and every app-track verification command use), providers, repository bootstrap per platform, persona session bootstrap (default persona per app), routing skeletons with placeholder screens, ports, Expo SDK pin, per-app `test` + `build` scripts, smoke tests.

**Out of scope:** any real feature screen (login/persona picker UX belongs to CLN-01/HWM-01/ADM-01/CTZ-01), E2E (REL-03).

## 4. Deliverables

```text
apps/clinical-web/                         apps/programme-admin/
  index.html, vite.config.ts                 (same structure; base '/admin/', port 5174, Dexie db 'laif-admin')
  src/main.tsx, src/app/App.tsx
  src/app/providers.tsx                    # I18nProvider, QueryClientProvider, RepositoryProvider, PersonaProvider, Router
  src/app/repository.ts                    # createDexieStoreAdapter('laif-clinical') + createCareRepository + withSimulatedTransport
  src/app/routes.tsx                       # /clinical/* route tree with placeholder pages
  src/app/nav.ts                           # sidebar sections for this app (labels i18n keys)
  src/app/App.test.tsx
apps/worker-mobile/                        apps/citizen-wallet/
  app.json, metro.config.js, babel.config.js (only if required by SDK), tsconfig.json
  app/_layout.tsx                          # providers + BrandSplash until fonts/i18n/repo ready
  app/(tabs)/_layout.tsx, app/(tabs)/index.tsx, app/(tabs)/settings.tsx
  src/repository.ts                        # openExpoSqliteExecutor('laif-worker.db') + createSqliteStoreAdapter
  src/providers.tsx, src/__tests__/shell.test.tsx
docs/adr/ADR-0002-expo-sdk.md
```

## 5. Implementation tasks

1. **Version pins (decisions).**
   - Web: React 19.x, Vite 8.x (matches the prototype's `vite@^8`), `@vitejs/plugin-react` matching, `react-router` 7.x (library/data mode, `createBrowserRouter`), `@tanstack/react-query` 5.x, `zustand` 5.x, `react-hook-form` 7.x, `@hookform/resolvers` 5.x (Zod 4 support), `@playwright/test` 1.x + `@axe-core/playwright` (dev).
   - Native apps **also** get `@tanstack/react-query` 5.x, `zustand` 5.x, `react-hook-form` 7.x + `@hookform/resolvers` (same pins), so HWM/CTZ hooks use TanStack Query (CTZ-01's `useAsyncResource` fallback is not needed).
   - Native: **pin one Expo SDK** — use the newest stable SDK whose Expo Go is in the Play/App Store on the build date (expected SDK 54 or later), created via `pnpm create expo-app --template tabs` then trimmed; run `npx expo install --fix` so `react-native`, `expo-router`, `expo-sqlite`, `expo-crypto`, `expo-font`, `react-native-svg`, `react-native-safe-area-context`, `react-native-web`, `react-dom` match the SDK. Record exact versions in ADR-0002.
   - **One React version repo-wide**: set root `pnpm.overrides` for `react`/`react-dom` (and `@types/react`) to the version the pinned Expo SDK requires, so web apps use the same React. Document in ADR-0002.
2. **Web apps.** `vite.config.ts`: `server: { port: 5173, strictPort: true }` (admin 5174), `base: '/'`, plugins react + `@tailwindcss/vite`. Routes: clinical `/` → redirect `/clinical/login`; placeholders for every route in tech spec §2.1 (`/clinical/login`, `queue`, `patients`, `patients/:id`, `reviews/:id`, `reviews/:id/decision`, `referrals`, `tasks`, `audit`) rendering `EmptyState` "Built in CLN-xx". Admin same for §2.3 routes under `/admin/*`. `*` → NotFound page. Sidebar sections from `nav.ts` use ref-image grouping (e.g. clinical: WORK — Queue (count), Patients, Referrals, Tasks; OVERSIGHT — Audit).
3. **Repository bootstrap (web).** `createAppRepository()` → Dexie adapter + `createDemoClock({ pinnedIso: meta.demoClockIso ?? DEMO_CLOCK_DEFAULT_ISO, mode: 'ticking' })` + `createWebIdGenerator()` + `getActor` from persona session + `withSimulatedTransport(repo, faults)`. On startup: `await repo.demo.ensureSeeded()`; show `BrandLoader` until resolved; if seeding fails show `ErrorState` with "Reset demo".
4. **Default personas** (until app tracks add pickers): clinical `persona-clin-alpha1`, admin `persona-analyst-alpha`, worker `persona-chw-alpha1-a`, citizen `persona-citizen-1`. Persona stored via `createPersonaSession` (web: localStorage adapter; native: `expo-sqlite/kv-store`).
5. **Shell chrome (web):** `AppShell` with `DemoBanner`, `RoleBanner`, Topbar (search placeholder, `LanguageSwitcher`, `PersonaSwitcher` limited to that app's personas, `DemoToolsMenu`). Demo tools: Reset demo (ConfirmDialog → `repo.demo.resetDemo()` → `queryClient.clear()` → toast), Offline/Slow/Errors toggles → `repo.demo.setFaults`, Load scenario (lists `SCENARIOS` filtered by `apps` includes this app).
6. **Native apps.** `app.json`: names "CareConnect Worker (Demo)" / "CareConnect Wallet (Demo)", slugs `laif-worker-mobile` / `laif-citizen-wallet`, schemes `laifworker` / `laifwallet`, `experiments.typedRoutes: true`, plugins `expo-router`, `expo-sqlite`, `expo-font`; `web.bundler: "metro"`, `web.output: "single"`. `metro.config.js` uses `getDefaultConfig(__dirname)` (SDK monorepo auto-config) — add `watchFolders`/`nodeModulesPaths` only if the pinned SDK requires. Tabs: worker `Home`, `Settings`; citizen `My health`, `Settings` (placeholders). Settings screen: LanguageSwitcher, PersonaSwitcher, DemoToolsSheet. Repository: `createSqliteStoreAdapter(await openExpoSqliteExecutor('laif-worker.db'))` (citizen `laif-citizen.db`) + native ID generator; on Expo **web** target use the Dexie adapter instead (`Platform.OS === 'web'`) so automated web checks run (REL-03).
7. **i18n per app:** `createI18n({ appId, storage })` with the web or native storage; `<html lang>` updates on web.
8. **Scripts per app:** web — `dev: vite`, `build: tsc --noEmit && vite build`, `preview`, `test: vitest run`, `test:e2e: playwright test` (app-local `playwright.config.ts` with `webServer` = `vite preview` on the app's port and `VITE_LAIF_E2E=1`; specs in `apps/<app>/e2e/`), `typecheck`, `lint`. Native — `start: expo start`, `android`, `ios`, `web: expo start --web`, `build: expo export --platform web --output-dir dist` (bundling proof in CI-less env), `typecheck`, `lint`, `test` (Vitest, FND-10), `test:maestro: maestro test .maestro` (device gate, not part of `verify`; replaces HWM's `e2e:maestro` and CTZ's `e2e` script names). Root: `pnpm test:e2e` = `turbo run test:e2e` (app suites + REL-03 `@laif/e2e`), `pnpm test:maestro` = `turbo run test:maestro`.
9. Smoke tests: web `App.test.tsx` renders the app with a memory-adapter repository injected via `RepositoryProvider` override, asserts banner text, switches to RW and asserts a known RW string, asserts `document.documentElement.lang === 'rw'`. Native `shell.test.tsx` (react-native-web alias, see FND-10) renders the tab layout with memory adapter, asserts banner + switcher.
10. Write ADR-0002 (Expo SDK, React override, metro config notes, how to run on device: Expo Go on same LAN, `expo start --lan`).

## 6. Data, state and audit

Each app owns its local dataset (D3): Dexie `laif-clinical` / `laif-admin`, SQLite `laif-worker.db` / `laif-citizen.db` (one file per app; the worker's simulated remote lives in `remote_*` collections of the same file), seeded with `sliceForApp`. Reset emits `demo.reset` audit. Persona and language keys: `laif.<appId>.persona`, `laif.<appId>.language`.

## 7. UX states

Initial (BrandLoader), loading (seeding), loaded (shell), server error (seed failure → ErrorState + Reset), offline (fault toggle → OfflineBanner visible in shell), success (reset toast). Others arrive with feature phases.

## 8. i18n

Add `clinical:nav.*`, `admin:nav.*`, `worker:tabs.*`, `citizen:tabs.*`, `*:placeholder.comingSoon`, `*:appName` (EN + RW). No literal strings in app code (lint).

## 9. Acceptance criteria

- [x] `pnpm dev:clinical` serves `http://localhost:5173/clinical/login`; `pnpm dev:admin` serves `http://localhost:5174/admin/overview`; both fail fast if the port is taken.
- [x] `pnpm dev:worker` and `pnpm dev:citizen` start Metro; both apps open in Expo Go (Android or iOS) and on `expo start --web`. (Metro start, web target and Android/iOS bundles verified; opening in Expo Go on a physical device is a manual check — no device in the build environment.)
- [x] All four show the DEMONSTRATION banner on every route/screen and a working EN/RW switcher; the language survives reload/app restart.
- [x] Reset demo restores the seed (`getDemoState().datasetHash` equals the seed slice hash) in all four.
- [x] Offline toggle shows OfflineBanner within one render.
- [x] `pnpm verify` (incl. `vite build` ×2 and `expo export --platform web` ×2) green; ADR-0002 lists exact SDK and React versions.

## 10. Tests

`apps/clinical-web/src/app/App.test.tsx`, `apps/programme-admin/src/app/App.test.tsx`, `apps/worker-mobile/src/__tests__/shell.test.tsx`, `apps/citizen-wallet/src/__tests__/shell.test.tsx`.

## 11. Verification

```bash
pnpm install && pnpm verify
pnpm dev:clinical   # open http://localhost:5173 → banner, switch RW, reload → still RW, Demo tools → Reset
pnpm dev:admin      # open http://localhost:5174/admin/overview
pnpm dev:worker     # scan QR in Expo Go; Settings → RW; kill app; reopen → RW
pnpm dev:citizen    # same on the wallet
```

## 12. Commit

`feat(apps): FND-11 bootable clinical, admin, worker and citizen shells with demo banner, language switch and seeded local data`
