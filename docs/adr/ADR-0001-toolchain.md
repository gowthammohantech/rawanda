# ADR-0001 — Toolchain and monorepo layout

- **Status:** Accepted
- **Date:** 2026-10-16
- **Phase:** FND-01 (trace: tech spec ADR-P01, §3, §9; phases README D5)

## Context

LAIF CareConnect is a frontend-only prototype of four apps (two React + Vite web apps, two
Expo apps) sharing ten TypeScript packages. The tech spec leaves the toolchain versions open;
this ADR pins them so every later phase builds on the same baseline.

## Decision — pinned versions

Exact versions were resolved at install time (2026-10-16) and are written without carets
(`save-exact=true`).

| Tool                          | Pinned version   | Where pinned                                                        |
| ----------------------------- | ---------------- | ------------------------------------------------------------------- |
| Node.js                       | 22.23.3 (LTS)    | `.mise.toml`                                                        |
| pnpm                          | 10.34.7          | `.mise.toml`, root `package.json` `packageManager`                  |
| TypeScript                    | 5.9.3            | root `devDependencies`                                              |
| Turborepo (`turbo`)           | 2.11.8           | root `devDependencies`                                              |
| Vitest                        | 3.2.7            | root `devDependencies`                                              |
| `@vitest/coverage-v8`         | 3.2.7            | root `devDependencies`                                              |
| ESLint                        | 9.39.5           | root `devDependencies`                                              |
| `@eslint/js`                  | 9.39.5           | root `devDependencies`                                              |
| `typescript-eslint`           | 8.71.2           | root `devDependencies`                                              |
| Prettier                      | 3.9.10           | root `devDependencies`                                              |
| `prettier-plugin-tailwindcss` | 0.8.1            | root `devDependencies`                                              |
| `tsx`                         | 4.23.15          | root `devDependencies` (runs `scripts/*.ts`)                        |
| `eslint-plugin-react-hooks`   | 7.1.1            | root `devDependencies` (scoped to `apps/**`, `packages/ui-*/**`)    |
| `eslint-plugin-jsx-a11y`      | 6.10.2           | root `devDependencies` (scoped to `apps/**`, `packages/ui-*/**`)    |
| `eslint-plugin-i18next`       | 6.1.5            | root `devDependencies` (`no-literal-string`, `jsx-text-only`)       |
| `globals`                     | 17.13.0          | root `devDependencies`                                              |
| `jsdom`                       | 30.1.3           | root `devDependencies` (`ui-web` test environment)                  |
| `@types/node`                 | 22.20.5          | root `devDependencies` (matches the Node 22 line)                   |
| Zod                           | 4.6.7            | `packages/contracts` `dependencies` (FND-03, one hoisted copy)      |
| i18next                       | 25.10.10         | `packages/i18n` `dependencies` (FND-04)                             |
| react-i18next                 | 15.7.4           | `packages/i18n` `dependencies` (FND-04)                             |
| React (dev/test only)         | 19.3.0           | `packages/i18n` `devDependencies`; FND-11 sets the repo override    |
| `@testing-library/react`      | 16.3.3           | `packages/i18n` `devDependencies` (+ `@testing-library/dom` 10.4.2) |
| Dexie                         | 4.4.6            | `packages/repositories` `dependencies` (FND-08, `./dexie` entry)    |
| `fake-indexeddb`              | 6.2.5            | `packages/repositories` dev, `packages/test-utils` (FND-08)         |
| `better-sqlite3`              | 13.0.3           | `packages/repositories` dev, `packages/test-utils` (Node SQLite)    |
| `@types/better-sqlite3`       | 9.6.0            | next to `better-sqlite3`                                            |
| `expo-sqlite` (optional peer) | 58.0.13 (SDK 58) | not installed; `peerDependenciesMeta` optional, FND-11 installs     |
| `expo-crypto` (optional peer) | 58.0.6 (SDK 58)  | not installed; `peerDependenciesMeta` optional, FND-11 installs     |

## Decisions and rationale

1. **pnpm + Turborepo monorepo at the repo root** (D5 / ADR-P01). Workspace globs are
   `apps/*` and `packages/*`. `PrototypeFourApplications-main/` and `ref-images/` are
   read-only references: not workspace packages, and excluded from ESLint, Prettier,
   TypeScript and Vitest.
2. **Prettier 3, not oxfmt.** The existing prototype used `oxfmt@0.2`, which is pre-1.0 and
   has no Tailwind class-sorting plugin. Prettier 3 + `prettier-plugin-tailwindcss` gives
   stable formatting and class sorting for the Tailwind v4 web apps.
3. **`node-linker=hoisted`** in `.npmrc`. Expo/Metro do not reliably resolve pnpm's
   symlinked, isolated `node_modules`; a hoisted layout is the documented compatible mode for
   Expo in pnpm monorepos. Also `save-exact=true`, `auto-install-peers=true`,
   `strict-peer-dependencies=false`.
4. **Packages ship TypeScript source, no per-package build.** Each package exports
   `./src/index.ts` (`exports` and `types`). Apps compile packages through their bundlers
   (Vite / Metro). A package `build` is `tsc --noEmit`, which keeps the loop fast and avoids
   stale `dist/` artefacts. (Turbo warns "no output files found" for package `build` tasks;
   that is expected because packages produce no `dist/`.)
5. **Strict TypeScript baseline** (`tsconfig.base.json`): `strict`, `noUncheckedIndexedAccess`,
   `exactOptionalPropertyTypes`, `noImplicitOverride`, `verbatimModuleSyntax`,
   `moduleResolution: Bundler`, `module: ESNext`, `target/lib: ES2022`, `isolatedModules`,
   `skipLibCheck`, `declaration`. Additionally `noEmit` and `allowImportingTsExtensions`
   (source-only packages, explicit `.ts` relative imports).
6. **Lint-enforced invariants** (`eslint.config.js`, typed linting via `projectService`):
   - no `Date.now()` / zero-argument `new Date()` in `packages/**` except
     `packages/domain/src/clock/**` (deterministic demo clock);
   - no raw hex colour literals in `apps/**/src/**` and `packages/ui-*/src/components/**`;
   - nothing imports from `apps/*` and nobody imports `PrototypeFourApplications-main`;
   - `@typescript-eslint/consistent-type-imports`; `no-console` (allows `warn`, `error`);
   - react-hooks, jsx-a11y and i18next (`no-literal-string`, `jsx-text-only`) wired for
     `apps/**` and `packages/ui-*/**` JSX so later phases inherit them.
7. **Acyclic package graph** enforced by `scripts/check-dep-graph.ts` (run in `pnpm lint`):
   order `domain → contracts → i18n → mock-data → auth-demo → analytics → repositories →
test-utils`, then `ui-web → ui-native`; a package may only depend on earlier packages.
8. **Vitest projects mode**: the root `vitest.config.ts` runs `packages/*`, `apps/*` and
   `scripts`; coverage provider `v8`; `ui-web` uses `jsdom`, all others `node`.
9. **No CI provider yet**: `pnpm verify` (`typecheck && lint && test && build`) stands in.

## Deviations from the FND-01 phase text (and why)

| Phase text                                                    | Implemented                                                                                                                                                   | Reason                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `"engines": { "node": ">=22 <23" }`                           | `"engines": { "node": ">=22" }`                                                                                                                               | The development machine has Node 24.21.0 and `mise` is not installed. pnpm enforces the root project's `engines.node`, so `<23` blocked `pnpm install` locally. Node 22.23.3 remains the pinned, supported runtime via `.mise.toml`; Node 24 is tolerated for local work. Revisit if Expo SDK pinning (FND-11) requires Node 22 only. |
| `packageManager: pnpm@10.x` with a pnpm 11 global             | Kept `pnpm@10.34.7`                                                                                                                                           | No deviation needed: the globally installed pnpm 11.9.0 honours `packageManager` and switches to 10.34.7 automatically (installs report "using pnpm v10.34.7").                                                                                                                                                                       |
| `"lint": "turbo run lint && prettier --check ."`              | `turbo run lint && pnpm lint:root && prettier --check .` with `lint:root` = ESLint on root config files and `scripts/`, then `tsx scripts/check-dep-graph.ts` | Task 11 requires `check-dep-graph` to run as part of `pnpm lint`, and root files are not inside any package.                                                                                                                                                                                                                          |
| `"typecheck": "turbo run typecheck"`                          | `turbo run typecheck && tsc -p scripts`                                                                                                                       | Typechecks the repo scripts (they live outside the 10 packages). Turbo still reports 10 packages.                                                                                                                                                                                                                                     |
| `vitest.config.ts` `test.projects = ['packages/*', 'apps/*']` | Adds `scripts`                                                                                                                                                | So `scripts/check-dep-graph.test.ts` runs under `pnpm test`.                                                                                                                                                                                                                                                                          |
| —                                                             | `onlyBuiltDependencies: [esbuild]` in `pnpm-workspace.yaml`                                                                                                   | pnpm 10 blocks dependency build scripts by default; esbuild (used by tsx/Vite/Vitest) is explicitly allowed.                                                                                                                                                                                                                          |
| `.prettierignore` lists the read-only references              | Also ignores the hand-authored source documents (`docs/*.md`, `docs/ref/`, `phases/`, `Implementation_notes.md`) and `pnpm-lock.yaml`                         | Source documents and phase plans are kept verbatim; reformatting them is out of scope. ADRs under `docs/adr/` are formatted.                                                                                                                                                                                                          |
| Package `scripts`: `typecheck`, `lint`, `build`               | Also `test: vitest run`, plus a per-package `vitest.config.ts`                                                                                                | Lets `turbo run test` work per package; the root `pnpm test` still runs everything via projects mode.                                                                                                                                                                                                                                 |

## FND-08 additions (storage adapters)

- **Optional native peers without a version range.** `@laif/repositories` declares `expo-sqlite`
  and `expo-crypto` only in `peerDependenciesMeta` (`optional: true`), not in `peerDependencies`.
  With `auto-install-peers=true`, pnpm installs even _optional_ peers that carry a range, which
  pulled `expo`, `react-native` and ~400 packages into the lockfile before the SDK pin (FND-11).
  The versions matching Expo SDK 58 are `expo-sqlite@58.0.13` and `expo-crypto@58.0.6`; FND-11
  adds them (via `npx expo install`) to the native apps. Until then
  `packages/repositories/src/types/expo-optional-peers.d.ts` declares the few members the
  `./expo-sqlite` and `./ids/native` entries use; FND-11 may delete it to use the real types.
- **`onlyBuiltDependencies` += `better-sqlite3`** (native addon; Node-side SQLite for tests only).
- Platform entries are subpath exports (`./dexie`, `./sqlite`, `./expo-sqlite`, `./ids/web`,
  `./ids/native`); the root entry imports none of them (tested by `src/entry-isolation.test.ts`).

## FND-10 additions (native kit)

Versions are those of Expo SDK 58 (`expo@58.0.11` `bundledNativeModules.json`), pinned exactly:

| Package                             | Pinned version | Where                                                                  |
| ----------------------------------- | -------------- | ---------------------------------------------------------------------- |
| `react-native`                      | 0.88.0         | `packages/ui-native` + `packages/test-utils` `devDependencies` (types) |
| `react-native-web`                  | 0.21.4         | `packages/ui-native` `devDependencies` (Vitest alias target)           |
| `react-native-svg`                  | 15.16.0        | `packages/ui-native` `devDependencies`; optional peer (no range)       |
| `react-native-safe-area-context`    | 5.10.1         | `packages/ui-native` + `packages/test-utils` dev; optional peer        |
| `@expo-google-fonts/dm-sans`        | 0.4.2          | `packages/ui-native` `dependencies` (bundled TTFs, no deps/peers)      |
| `@expo-google-fonts/manrope`        | 0.4.2          | `packages/ui-native` `dependencies`                                    |
| `@expo-google-fonts/jetbrains-mono` | 0.4.1          | `packages/ui-native` `dependencies`                                    |
| `expo-font` (optional peer)         | 58.0.8 (SDK)   | not installed; `src/types/expo-optional-peers.d.ts`, FND-11 installs   |

- **No Expo SDK in the lockfile yet.** All native libraries are exact `devDependencies` (for
  types and tests) plus optional peers declared only in `peerDependenciesMeta` (no ranges), so
  `auto-install-peers=true` does not pull `expo`. `react-native@0.88.0` brings ~100 transitive
  packages (`@react-native/*`, `metro-runtime`, …) — the same set FND-11's Expo install needs.
  `expo-font` is declared locally like FND-08's optional peers; FND-11 adds it with
  `npx expo install` and may delete the declaration file.
- **Single test runner** (FND-10 §10): Vitest + jsdom with `react-native` aliased to
  `react-native-web`, `.web.*` files preferred, rendered with `@testing-library/react`
  (`renderNative` in `@laif/test-utils/native`). `@testing-library/react-native` /
  `react-test-renderer` were **not** added: they need the real RN renderer (Jest preset) and
  `react-test-renderer` is deprecated in React 19. In `packages/ui-native/vitest.config.ts`
  `react-native-svg` / `react-native-safe-area-context` are aliased to their ESM builds (their
  CJS `main` requires the Flow-typed real `react-native`), `expo-font` and
  `@react-native/assets-registry/registry` (imported by react-native-svg's web build, absent in
  RN 0.88) to small stubs.
- `@laif/ui-web` gained a `./icon-data` export (additive) so the native icon parity test can
  import the web icon set without loading the web components.

## Consequences

- Later FND phases fill packages without touching root tooling except to add scripts.
- Adding a package means adding it to `PACKAGE_ORDER` in `scripts/check-dep-graph.ts`.
- If the team standardises on Node 24 / pnpm 11 (open item 4 in `phases/00-foundation/INDEX.md`),
  update `.mise.toml`, `packageManager` and this ADR together.
