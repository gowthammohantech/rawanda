# ADR-0002 — Expo SDK pin, one React version, app shells

- **Status:** Accepted
- **Date:** 2026-10-16
- **Phase:** FND-11 (trace: phases README D1, D2, D3, D5; tech spec §2, §3, §12 W1 exit gate)

## Context

FND-11 turns the ten shared packages into four bootable apps: two Vite web apps
(`@laif/clinical-web`, `@laif/programme-admin`) and two Expo Router apps (`@laif/worker-mobile`,
`@laif/citizen-wallet`). The native apps must run in **Expo Go** on a stakeholder's phone, so the
Expo SDK has to be one that Expo Go ships for today. React must be a single version across the
monorepo (hoisted `node_modules`, ADR-0001), and that version is dictated by the SDK.

## Decision 1 — Expo SDK 58

Checked on 2026-10-16 against `https://api.expo.dev/v2/versions`: SDK 58 (`expo@58.0.12`,
npm `latest`) is published with **Expo Go 58.0.4 for both iOS and Android**
(`iosClientVersion` / `androidClientVersion`), React Native 0.88.0 and React 19.3.0. SDK 58 is
therefore the newest SDK with a store Expo Go, and it matches the versions FND-08 / FND-10 already
assumed (ADR-0001), so no shared package had to be realigned.

Exact versions (from `expo@58.0.12` `bundledNativeModules.json`, written without ranges because
of `save-exact=true`; `npx expo install --check` and `npx expo-doctor` (20/20 checks) pass):

| Package                          | Version | Notes                                                          |
| -------------------------------- | ------- | -------------------------------------------------------------- |
| `expo`                           | 58.0.12 |                                                                |
| `expo-router`                    | 58.0.21 | `main: expo-router/entry`, typed routes on                     |
| `expo-sqlite`                    | 58.0.13 | device store (`laif-<app>.db`) + `expo-sqlite/kv-store`        |
| `expo-crypto`                    | 58.0.6  | runtime UUIDs on device                                        |
| `expo-font`                      | 58.0.8  | `useLaifFonts()` (bundled `@expo-google-fonts/*`, no network)  |
| `expo-constants`                 | 58.0.12 | expo-router peer                                               |
| `expo-linking`                   | 58.0.13 | expo-router peer                                               |
| `expo-status-bar`                | 58.0.3  |                                                                |
| `@expo/metro-runtime`            | 58.0.14 | expo-router peer                                               |
| `expo-notifications`             | 58.1.5  | citizen wallet only (CTZ-05): device test-reminder preview     |
| `react-native`                   | 0.88.0  |                                                                |
| `react-native-web`               | 0.21.4  | Expo web target + Vitest alias                                 |
| `react-native-svg`               | 15.16.0 |                                                                |
| `react-native-safe-area-context` | 5.10.1  |                                                                |
| `react-native-screens`           | 4.30.0  |                                                                |
| `react-native-reanimated`        | 4.7.1   | pinned explicitly (pnpm would auto-install it as a peer of     |
| `react-native-gesture-handler`   | 3.3.0   | expo-router's drawer at `latest`; pinned to the SDK's version) |
| `react-native-worklets`          | 0.13.0  |                                                                |
| `react` / `react-dom`            | 19.3.0  | see Decision 2                                                 |

Both Expo apps also get the same state/form pins as the web apps (FND-11 task 1):
`@tanstack/react-query` 5.90.10, `zustand` 5.0.15, `react-hook-form` 7.90.0,
`@hookform/resolvers` 5.9.1, `zod` 4.6.7.

`expo-sqlite` / `expo-crypto` (in `@laif/repositories`) and `expo-font` (in `@laif/ui-native`)
are now also exact **devDependencies** of those packages, and the FND-08 / FND-10 ambient
declaration files (`src/types/expo-optional-peers.d.ts`) were deleted so the real types are used.
They stay optional peers (`peerDependenciesMeta`) for consumers.

## Decision 2 — one React version repo-wide

Root `package.json`:

```json
"pnpm": { "overrides": { "react": "19.3.0", "react-dom": "19.3.0", "@types/react": "19.3.0" } }
```

The web apps therefore render with the same React 19.3.0 the SDK requires. `@types/react-dom`
stays at 19.3.0 (the SDK template lists `~19.2.3`); the Expo apps list it in
`expo.install.exclude` so `expo install --check` does not flag it. TypeScript stays at 5.9.3
(ADR-0001); the SDK 58 template suggests `~6.0.3`, which is not required to build.

## Decision 3 — web app pins

| Package                 | Version | Notes                                                                     |
| ----------------------- | ------- | ------------------------------------------------------------------------- |
| `vite`                  | 7.3.7   | **deviation:** phase text says Vite 8; see below                          |
| `@vitejs/plugin-react`  | 5.2.0   | matches Vite 7                                                            |
| `@tailwindcss/vite`     | 4.3.3   | with `tailwindcss` 4.3.3 (FND-09)                                         |
| `react-router`          | 7.9.6   | library/data mode (`createBrowserRouter`); same copy as ui-web/test-utils |
| `@tanstack/react-query` | 5.90.10 | same copy as ui-web/test-utils                                            |
| `zustand`               | 5.0.15  |                                                                           |
| `react-hook-form`       | 7.90.0  |                                                                           |
| `@hookform/resolvers`   | 5.9.1   | Zod 4 support                                                             |
| `@playwright/test`      | 1.64.1  | app-local `test:e2e` (`vite preview` + `VITE_LAIF_E2E=1`)                 |
| `@axe-core/playwright`  | 4.14.0  |                                                                           |
| `recharts`              | 3.10.1  | programme-admin only (ADM-02 chart kit); ui-web keeps its SVG charts      |
| `react-is`              | 19.3.1  | programme-admin only: Recharts peer, pinned so no unpinned peer resolves  |

**Vite 7 instead of 8:** Vitest 3.2.7 (ADR-0001) is built on Vite 7, and the FND-09 gallery
already uses Vite 7.3.7 + plugin-react 5.2.0. Two Vite majors in one hoisted tree would give the
app builds and their tests different transform pipelines. Move both to Vite 8 together with a
Vitest major upgrade.

## Decision 4 — Metro, platform files, storage

- `metro.config.js` is just `getDefaultConfig(__dirname)`: SDK 58 auto-detects the pnpm workspace
  (watch folders, hoisted `node_modules`), follows the packages' `exports` to their `.ts`
  source and resolves the explicit `.ts` import extensions used in `packages/*`. Verified with
  `expo export --platform web` (part of `pnpm build`), `--platform android` and `--platform ios`.
  No `babel.config.js` is needed (babel-preset-expo default).
- Platform storage is chosen by **Metro platform files**, not a runtime `Platform.OS` check, so
  each bundle only contains its own storage stack: `src/platform.native.ts` (expo-sqlite, kv-store,
  expo-crypto) and `src/platform.web.ts` (Dexie, localStorage, `crypto.randomUUID`). Code imports
  `./platform` without an extension; `src/platform.ts` exists only for TypeScript. The Expo web
  bundle was checked to contain Dexie and no expo-sqlite (whose `withExclusiveTransactionAsync`
  does not work on web).

| App      | Device store             | Web / Expo web store              | Language + persona keys                                 |
| -------- | ------------------------ | --------------------------------- | ------------------------------------------------------- |
| clinical | —                        | IndexedDB `laif-clinical` (Dexie) | localStorage `laif.clinical.language` / `.persona`      |
| admin    | —                        | IndexedDB `laif-admin` (Dexie)    | localStorage `laif.admin.language` / `.persona`         |
| worker   | SQLite `laif-worker.db`  | IndexedDB `laif-worker` (Dexie)   | kv-store (device) / localStorage (web) `laif.worker.*`  |
| citizen  | SQLite `laif-citizen.db` | IndexedDB `laif-citizen` (Dexie)  | kv-store (device) / localStorage (web) `laif.citizen.*` |

The worker's simulated remote lives in the `remote_*` collections of the same database (FND-07).
Default personas until the app tracks add pickers: clinical `persona-clin-alpha1`, admin
`persona-analyst-alpha`, worker `persona-chw-alpha1-a`, citizen `persona-citizen-1`.

## Decision 5 — shell behaviour shared by all four apps

- Boot: i18n is created (`await createI18n`, stored language first) before the first real render;
  the BrandLoader / BrandSplash shows until fonts (native), the database and
  `repo.demo.ensureSeeded()` are ready. A seed or storage failure shows an `ErrorState` with
  "Try again" and "Reset demo" (`common:error.storageUnavailable` for storage errors).
- Demo tools: one mapping for all apps in `@laif/repositories`
  (`faultPatchForToggle` / `faultTogglesFromConfig`): Offline → `offline`, Slow network →
  `latencyMs` 1500–3000 ms, Server errors → `serverErrorRate` 0.25. Switches update the UI
  optimistically (OfflineBanner in the same render). Reset demo → `repo.demo.resetDemo()` →
  `queryClient.clear()` → toast (the web shells also remount the routed content so mounted
  queries refetch). Load scenario lists `SCENARIOS` whose `apps` include
  the app.
- The web DemoBanner is now `sticky top-0` (ui-web), so it stays visible while scrolling; native
  `Screen` always renders it first.
- Test/E2E builds skip the simulated 150–450 ms latency: `VITE_LAIF_E2E=1` (web) and
  `EXPO_PUBLIC_LAIF_E2E=1` (Expo).
- Native component tests use the shared preset `@laif/test-utils/native/vitest` (extracted from
  ui-native's FND-10 config). Expo Router's `Tabs` needs Metro's route context, so the shell test
  stubs `expo-router` and renders the real tab layout and screens; on-device flows are the
  `test:maestro` gate (not part of `pnpm verify`).

## How to run

| Command             | Result                                                                                |
| ------------------- | ------------------------------------------------------------------------------------- |
| `pnpm dev:clinical` | http://localhost:5173 → `/clinical/login` (fails fast if 5173 is taken: `strictPort`) |
| `pnpm dev:admin`    | http://localhost:5174 → `/admin/overview` (`strictPort`)                              |
| `pnpm dev:worker`   | Metro for the worker app; scan the QR code with Expo Go (SDK 58)                      |
| `pnpm dev:citizen`  | Metro for the wallet app; scan the QR code with Expo Go (SDK 58)                      |

On a device: install **Expo Go for SDK 58** from the App Store / Play Store, put the phone on the
same Wi-Fi as the laptop and run `pnpm dev:worker` (LAN is the default; add `-- --lan` to force
it, or `-- --tunnel` when the network isolates clients). Phones reach Metro by the laptop's LAN
address, never `localhost`. `pnpm --filter @laif/worker-mobile web` (or `… citizen-wallet web`)
opens the Expo web target in a browser. `pnpm build` runs `expo export --platform web` for both
Expo apps (bundling proof without a device).

## Consequences

- Upgrading the SDK means: `npx expo install expo@<sdk> --fix` in both Expo apps, update the
  React override, the dev pins in `packages/ui-native`, `packages/test-utils`,
  `packages/repositories`, and this ADR together.
- `expo start` writes `expo-env.d.ts` (git-ignored) and `.expo/types` (typed routes); both are
  already in the apps' `tsconfig.json` `include`, and `src/types/expo.d.ts` references
  `expo/types` so a fresh clone typechecks without running Expo first.
