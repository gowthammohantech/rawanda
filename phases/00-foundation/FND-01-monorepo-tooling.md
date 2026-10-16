# FND-01 — Monorepo, toolchain and package skeletons

**Status:** Done

## 1. Header

| Field | Value |
|---|---|
| ID | FND-01 |
| Title | Monorepo, toolchain and package skeletons |
| App | Shared (repo root) |
| Depends on | — |
| Trace | Tech spec ADR-P01, §3, §9; README D5 |
| Size | M |

## 2. Goal

A developer clones the repo, runs `mise install && pnpm install`, and `pnpm typecheck && pnpm lint && pnpm test && pnpm build` all pass across a pnpm + Turborepo workspace that already contains an empty, correctly wired skeleton for every shared package listed in the README. Later FND phases only fill packages in; they never have to touch root tooling again except to add scripts.

## 3. Scope

**In scope**
- Root `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `.mise.toml`, `.npmrc`, `.gitignore`, `.editorconfig`.
- Shared TS config, ESLint flat config, Prettier config, Vitest root config (projects mode).
- Skeleton for the 10 packages: `domain`, `contracts`, `mock-data`, `repositories`, `analytics`, `auth-demo`, `i18n`, `ui-web`, `ui-native`, `test-utils`, each with `package.json`, `tsconfig.json`, `src/index.ts`, one smoke test.
- `docs/adr/ADR-0001-toolchain.md` recording every pinned version below.

**Out of scope**
- Apps (FND-11). Any domain logic. CI provider configuration (a `pnpm verify` script stands in for CI).
- `packages/demo-sync`, `apps/demo-hub` and `pnpm dev:demo-api` from tech spec §3 — excluded by decision D3 (isolated mode).

## 4. Deliverables

```text
.mise.toml                 # node + pnpm pins
.npmrc                     # node-linker=hoisted, strict-peer-dependencies=false, auto-install-peers=true
.gitignore                 # node_modules, dist, .turbo, .expo, web-build, coverage, playwright-report, test-results, *.tsbuildinfo, .env*
.editorconfig
.prettierrc.json, .prettierignore
package.json               # private root, packageManager, engines, scripts
pnpm-workspace.yaml        # apps/*, packages/*
turbo.json
tsconfig.base.json
tsconfig.json              # solution file with references (editor only)
eslint.config.js
vitest.config.ts           # test.projects = ['packages/*', 'apps/*']
docs/adr/ADR-0001-toolchain.md
packages/<name>/{package.json,tsconfig.json,src/index.ts,src/index.test.ts}
```

## 5. Implementation tasks

1. **Pins (decided here; spec leaves them open).** Write `.mise.toml`:
   ```toml
   [tools]
   node = "22"      # resolve to the latest 22.x LTS patch at implementation time and write the exact patch here
   pnpm = "10"      # resolve exact 10.x patch; mirror it in package.json "packageManager"
   ```
   Root `package.json`: `"packageManager": "pnpm@10.<x>.<y>"`, `"engines": { "node": ">=22 <23" }`. Record the resolved patches in ADR-0001.
2. **Library pins** (exact versions resolved at install, carets removed via `pnpm config set save-exact true` in `.npmrc` → `save-exact=true`): TypeScript 5.9.x, Turborepo 2.x, Vitest 3.2.x, ESLint 9.x with `typescript-eslint` 8.x, Prettier 3.x + `prettier-plugin-tailwindcss`, Zod 4.x (used from FND-03). Decision: **Prettier, not oxfmt** — the prototype used `oxfmt@0.2`, which is pre-1.0 and lacks a Tailwind class-sorting plugin; record this in ADR-0001.
3. `.npmrc`: `node-linker=hoisted` (Expo/Metro compatibility in pnpm monorepos — decision, recorded in ADR), `save-exact=true`, `auto-install-peers=true`.
4. `pnpm-workspace.yaml`: `packages: ["apps/*", "packages/*"]`. Do **not** include `PrototypeFourApplications-main` (read-only reference). Add it and `ref-images` to `.prettierignore` and ESLint `ignores`.
5. `tsconfig.base.json`: `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`, `noImplicitOverride: true`, `verbatimModuleSyntax: true`, `moduleResolution: "Bundler"`, `module: "ESNext"`, `target: "ES2022"`, `lib: ["ES2022"]`, `isolatedModules: true`, `skipLibCheck: true`, `declaration: true`. Packages ship TS source directly (`"exports": { ".": "./src/index.ts" }`, `"types"` same) — no package build step; apps compile them. Decision recorded in ADR (keeps the loop fast; `build` for packages = `tsc --noEmit`).
6. `turbo.json` tasks: `typecheck` (dependsOn `^typecheck`), `lint`, `test` (dependsOn `^typecheck`, outputs `coverage/**`), `build` (dependsOn `^build`, outputs `dist/**`), `dev` (`cache: false, persistent: true`), `test:e2e` (cache false). `globalEnv: ["LAIF_DEMO_*"]`.
7. Root scripts:
   ```json
   "dev:clinical": "turbo run dev --filter=@laif/clinical-web",
   "dev:admin":    "turbo run dev --filter=@laif/programme-admin",
   "dev:worker":   "pnpm --filter @laif/worker-mobile start",
   "dev:citizen":  "pnpm --filter @laif/citizen-wallet start",
   "typecheck": "turbo run typecheck", "lint": "turbo run lint && prettier --check .",
   "format": "prettier --write .", "test": "vitest run", "test:watch": "vitest",
   "build": "turbo run build", "test:e2e": "turbo run test:e2e",
   "verify": "pnpm typecheck && pnpm lint && pnpm test && pnpm build"
   ```
   The `dev:*` scripts fail gracefully ("no package matched") until FND-11; acceptable.
8. `eslint.config.js` (flat): `typescript-eslint` `recommendedTypeChecked` with `projectService: true`; rules applied repo-wide:
   - `@typescript-eslint/consistent-type-imports`, `no-console` (allow `warn`, `error`).
   - `no-restricted-properties` banning `Date.now` and `no-restricted-syntax` banning `new Date()` with zero args in `packages/**` except `packages/domain/src/clock/**` (deterministic demo clock rule).
   - `no-restricted-syntax` banning hex colour string literals (`/^#[0-9a-fA-F]{3,8}$/`) in `apps/**/src/**` and `packages/ui-*/src/components/**` (tokens only).
   - `no-restricted-imports`: apps may not import from `apps/*`; packages may not import from `apps/*`; nobody imports `PrototypeFourApplications-main`.
   - Placeholders for `eslint-plugin-react-hooks`, `eslint-plugin-jsx-a11y`, `eslint-plugin-i18next` (`no-literal-string` in JSX, `mode: "jsx-text-only"`) scoped to `apps/**` and `packages/ui-*/**` — installed now so later phases inherit them.
9. `vitest.config.ts` at root with `test.projects: ["packages/*", "apps/*"]`; each package has `vitest.config.ts` (`environment: "node"`; `ui-web` uses `jsdom`). Coverage provider `v8`.
10. Package skeletons: `package.json` (`"name": "@laif/<name>"`, `"private": true`, `"type": "module"`, `"sideEffects": false`, scripts `typecheck: tsc --noEmit`, `lint: eslint .`, `build: tsc --noEmit`), `src/index.ts` exporting `export const PACKAGE = "@laif/<name>" as const;`, `src/index.test.ts` asserting it. Declare the intended internal dependency graph now (workspace protocol):
    `contracts → domain`; `i18n → contracts`; `mock-data → domain, contracts`; `auth-demo → domain, mock-data`; `analytics → domain, mock-data, auth-demo`; `repositories → domain, contracts, auth-demo, analytics, mock-data`; `ui-web → i18n, domain`; `ui-native → i18n, domain`; `test-utils → domain, contracts, mock-data, repositories`.
11. Add `scripts/check-dep-graph.ts` (run by `pnpm lint`) that fails if any package depends on a package later in the order above (prevents cycles). Use `tsx` to run it.
12. Write ADR-0001 with a table of pins and the rationale lines above.

## 6. Data, state and audit

None (tooling only). Invariant enforced by lint: no wall-clock access outside the demo clock module; no raw hex in components; no cross-app imports; acyclic package graph.

## 7. UX states

Not applicable (no UI).

## 8. i18n

No keys. The `eslint-plugin-i18next` rule is wired now so that untranslated JSX text fails lint from FND-09 onward.

## 9. Acceptance criteria

- [ ] `mise install` installs Node 22.x and pnpm 10.x; `node -v` inside the repo reports `v22.*`.
- [ ] `pnpm install` succeeds from a clean clone with no peer-dependency errors.
- [ ] `pnpm verify` passes; Turbo reports 10 packages for `typecheck`.
- [ ] `pnpm test` runs 10 smoke tests, all green.
- [ ] Adding `const x = Date.now()` to `packages/analytics/src/index.ts` makes `pnpm lint` fail (revert after checking).
- [ ] Adding a reverse dependency (e.g. `domain → repositories`) makes `scripts/check-dep-graph.ts` fail.
- [ ] `git status --ignored` shows `node_modules`, `.turbo` ignored; `PrototypeFourApplications-main` untouched.
- [ ] ADR-0001 lists exact resolved versions for Node, pnpm, TypeScript, Turbo, Vitest, ESLint, Prettier.

## 10. Tests

- `packages/*/src/index.test.ts` (10 smoke tests).
- `scripts/check-dep-graph.test.ts` — feeds a fake graph with a back-edge, expects failure.

## 11. Verification

```bash
mise install
pnpm install --frozen-lockfile=false
pnpm verify
pnpm turbo run typecheck --dry=json | grep -c '"package"'   # ≥ 10
node -e "console.log(process.version)"                       # v22.x
```

## 12. Commit

`chore(repo): FND-01 pnpm turborepo workspace, toolchain pins and package skeletons`
