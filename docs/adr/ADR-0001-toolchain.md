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

| Tool                          | Pinned version | Where pinned                                                     |
| ----------------------------- | -------------- | ---------------------------------------------------------------- |
| Node.js                       | 22.23.3 (LTS)  | `.mise.toml`                                                     |
| pnpm                          | 10.34.7        | `.mise.toml`, root `package.json` `packageManager`               |
| TypeScript                    | 5.9.3          | root `devDependencies`                                           |
| Turborepo (`turbo`)           | 2.11.8         | root `devDependencies`                                           |
| Vitest                        | 3.2.7          | root `devDependencies`                                           |
| `@vitest/coverage-v8`         | 3.2.7          | root `devDependencies`                                           |
| ESLint                        | 9.39.5         | root `devDependencies`                                           |
| `@eslint/js`                  | 9.39.5         | root `devDependencies`                                           |
| `typescript-eslint`           | 8.71.2         | root `devDependencies`                                           |
| Prettier                      | 3.9.10         | root `devDependencies`                                           |
| `prettier-plugin-tailwindcss` | 0.8.1          | root `devDependencies`                                           |
| `tsx`                         | 4.23.15        | root `devDependencies` (runs `scripts/*.ts`)                     |
| `eslint-plugin-react-hooks`   | 7.1.1          | root `devDependencies` (scoped to `apps/**`, `packages/ui-*/**`) |
| `eslint-plugin-jsx-a11y`      | 6.10.2         | root `devDependencies` (scoped to `apps/**`, `packages/ui-*/**`) |
| `eslint-plugin-i18next`       | 6.1.5          | root `devDependencies` (`no-literal-string`, `jsx-text-only`)    |
| `globals`                     | 17.13.0        | root `devDependencies`                                           |
| `jsdom`                       | 30.1.3         | root `devDependencies` (`ui-web` test environment)               |
| `@types/node`                 | 22.20.5        | root `devDependencies` (matches the Node 22 line)                |
| Zod                           | 4.x            | Line pinned here; installed with an exact patch by FND-03        |

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

## Consequences

- Later FND phases fill packages without touching root tooling except to add scripts.
- Adding a package means adding it to `PACKAGE_ORDER` in `scripts/check-dep-graph.ts`.
- If the team standardises on Node 24 / pnpm 11 (open item 4 in `phases/00-foundation/INDEX.md`),
  update `.mise.toml`, `packageManager` and this ADR together.
