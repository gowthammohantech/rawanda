# LAIF CareConnect — MVP Prototype Implementation Phases

Frontend-only, fully functional prototype of the four LAIF CareConnect applications. No backend: every app runs on synthetic, seeded, locally persisted data.

## Source documents (in priority order)

1. `docs/BRD_LAIF_CareConnect.md`
2. `docs/PRD_*.md` and `docs/FRD_*.md` (one pair per app)
3. `docs/TECHNICAL_IMPLEMENTATION_FRONTEND_PROTOTYPE.md` (architecture, routes, domain model, state machines, seed requirements)
4. `Implementation_notes.md`: **English ⇄ Kinyarwanda switching is P0 in all four apps**, including offline support, saved language preference, translated validation messages and fallback behaviour.
5. Visual references: `ref-images/*.jpeg` (layout language) and `PrototypeFourApplications-main/` (existing static shell: tokens, fonts, RwandaMark, loader, DemoBanner, phone frame).

## Locked decisions (confirmed with product owner 2026-10-16)

| # | Decision | Consequence |
|---|---|---|
| D1 | **Clinical Web Portal** and **Programme Admin Dashboard** are React 19 + Vite + TypeScript + Tailwind CSS v4 web apps | Dexie (IndexedDB) persistence, React Router, TanStack Query over a repository facade, Zustand for UI state, Zod + React Hook Form |
| D2 | **Health Worker Mobile** and **Citizen Health Wallet** are **Expo (React Native) + Expo Router** apps | `expo-sqlite` persistence, pinned Expo SDK, runs on Android/iOS via Expo Go; Expo web target is used for automated verification where feasible |
| D3 | **Isolated per app**: each app seeds and owns its own local dataset from the shared `@laif/mock-data` seed. No server, no cross-app live sync | Every app must ship a self-contained scenario seed that demonstrates its part of WF-01..WF-04. A labelled **scenario export/import (JSON)** is provided in the release phase so a demo can move a record between apps manually |
| D4 | **Visual direction = ref-images layout + clinical teal palette + existing prototype elements** | See "Design language" below |
| D5 | pnpm + Turborepo monorepo at the repository root | `apps/*`, `packages/*` per technical spec §3. `PrototypeFourApplications-main/` and `ref-images/` stay as read-only references |

## Repository layout (target)

```text
rawanda/
├── apps/
│   ├── clinical-web/        # React + Vite, port 5173, routes under /clinical/*
│   ├── programme-admin/     # React + Vite, port 5174, routes under /admin/*
│   ├── worker-mobile/       # Expo Router
│   └── citizen-wallet/      # Expo Router
├── packages/
│   ├── domain/              # entities, state machines, invariants, demo rules engine, demo clock
│   ├── contracts/           # Zod schemas + inferred types, error codes
│   ├── mock-data/           # deterministic seed (≥40 patients, 3 facilities, 2 districts, 60 screenings, 20 reviews, 12 referrals, 18 follow-ups) + named scenarios
│   ├── repositories/        # CareRepository interface, in-memory impl, Dexie impl (web), SQLite impl (native), simulated transport faults
│   ├── analytics/           # deterministic metric calculators, small-cell suppression
│   ├── auth-demo/           # personas, roles, scope checks (demo only — not security)
│   ├── i18n/                # en + rw catalogues, typed keys, fallback, formatting (Africa/Kigali), validation-message translation
│   ├── ui-web/              # web tokens + shared React components (Tailwind v4)
│   ├── ui-native/           # native tokens + shared RN components
│   └── test-utils/          # fixtures, factories, render helpers
├── phases/                  # this plan
├── pnpm-workspace.yaml
├── turbo.json
└── package.json
```

Package scope: `@laif/<name>`. Root scripts: `pnpm dev:clinical`, `pnpm dev:admin`, `pnpm dev:worker`, `pnpm dev:citizen`, `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build`.

## Design language

- **Layout (from ref-images):** light grey app canvas (`#E9ECEC`-ish) with a rounded shell; left sidebar with grouped nav sections (small uppercase section labels), count badges; top bar with search (⌘K hint), notification bell, avatar; page header with breadcrumb, title, subtitle, and right-aligned secondary + primary actions; KPI strip as one white card split by vertical dividers; white cards with 12–16px radius and hairline borders; **monospace uppercase micro-labels** (e.g. `PRIMARY CONSTRAINT`, `NEEDS YOU`); **pill status badges** in mono caps (`APPROVED`, `CONFLICT`, `NEEDS REVIEW`); expandable list rows; stepper; tabbed tables with counts; soft-blue "info/explanation" callout cards; thin horizontal progress bars.
- **Palette (clinical teal, from tech spec §7 / existing prototype):** primary `#087F8C`, primary-dark `#075D66`, positive `#1B7653`, warning `#A15D00`, danger `#B42318`, ink `#18252B`, muted `#5B6870`, background `#F7FAFA`, surface `#FFFFFF`, border `#D9E2E4`, plus soft tints already in `PrototypeFourApplications-main/src/index.css`. Use semantic tokens (`--color-risk-warning`), never raw hex in components. Urgency is never colour-only (icon + text).
- **Reuse from existing prototype:** DM Sans / Manrope fonts, `RwandaMark`, branded loader, `DemoBanner`, `Status` chip, phone frame idea, app-switcher concept, icon set.
- **Always visible:** `DEMONSTRATION — SYNTHETIC PATIENT DATA — NOT FOR CLINICAL USE` banner, language switcher (EN / RW).
- **Accessibility:** WCAG AA contrast, visible focus rings, keyboard nav on web, screen-reader labels, ≥44pt touch targets and dynamic type on native.

## Phase index

55 phases. Cross-track conventions were reconciled on 2026-10-16 — see `phases/CONSISTENCY_REVIEW.md` (what changed, consolidated product-owner decisions, LAIF MoH PDF coverage).

| Dir | Prefix | Phases | Scope |
|---|---|---|---|
| `00-foundation/` | `FND-01…11` | 11 | Monorepo, tooling, shared packages (domain, contracts, mock-data, repositories incl. the single sync design, i18n, analytics, auth-demo, ui-web, ui-native, test-utils), four bootable app shells |
| `01-clinical-web/` | `CLN-01…11` | 11 | Clinical Web Portal (CL-01..CL-08) |
| `02-worker-mobile/` | `HWM-01…10` | 10 | Health Worker Mobile (HW-01..HW-08) |
| `03-programme-admin/` | `ADM-01…09` | 9 | Programme Admin Dashboard (PA-01..PA-08) |
| `04-citizen-wallet/` | `CTZ-01…09` | 9 | Citizen Health Wallet (CW-01..CW-08), P1 in prototype mode |
| `05-release/` | `REL-01…05` | 5 | Scenario export/import, cross-app demo script, E2E, accessibility, privacy and release gates |

**Recommended global build order**

1. **Foundation, strictly sequential:** FND-01 → 02 → 03 → 04 → 05 → 06 → 07 → 08 → 09 → 10 → 11. (Optional: FND-09/10 may run beside FND-05…08 with two builders.) FND-11 is the gate: four shells boot, seeded, with EN/RW and Reset demo.
2. **App tracks, in parallel (D3), one phase at a time per track:**
   - CLN: 01 → 02 → … → 11 (strict).
   - HWM: 01 → 02 → {03 → 07 → 08} and {04 → 05 → 06} interleaved → 09 → 10.
   - ADM: 01 → 02 → {03, 04, 05} → 06 → 07 → 08 → 09.
   - CTZ: 01 → 02 → … → 09 (strict; P1 — if capacity is short, finish CLN/HWM/ADM first).
   Shared-package changes made by an app phase (e.g. a missing repository method, a new collection, a new validation key) go into the owning FND package with tests in the same commit; two tracks touching the same shared file should be serialised by the orchestrator.
3. **Release, sequential, after CLN-11, HWM-10, ADM-09 and at least CTZ-07:** REL-01 → 02 → 03 → 04 → 05.

## Cross-track conventions (binding)

- Every "Depends on" names concrete phase IDs (app tracks start from FND-11). FND is the source of truth for shared vocabulary: roles/personas (FND-05), permissions (FND-06), status/decision/evidence enums (FND-02), input schemas, error codes + reasons (FND-03), repository API, sync, faults, audit action registry (FND-07), storage (FND-08), components (FND-09/10), scripts (FND-01/11).
- i18n key notation `clinical.queue.title` in app phases means `clinical:queue.title` (FND-04 convention). Zod 4 primitives (`IsoUtcString`) replace the Zod 3 `z.string().datetime()` form in app snippets.
- Names written in phase prose such as "Marie U.", "Aline", "Dr. Diane N.", "Facility A1", "District B" are placeholders for FND-05 invented names and Alpha/Beta reference data.

## Phase file template

Every phase file is `phases/<dir>/<PREFIX>-<NN>-<kebab-title>.md` and contains, in this order:

1. **Header**: ID, title, app, depends on (phase IDs), PRD/FRD trace IDs, estimated size (S/M/L)
2. **Goal**: one paragraph, user-visible outcome
3. **Scope**: in scope / explicitly out of scope
4. **Deliverables**: files, routes/screens, components, packages touched
5. **Implementation tasks**: numbered, concrete, ordered
6. **Data, state and audit**: entities read/written, state transitions, audit events emitted, invariants enforced
7. **UX states**: which of initial / loading / loaded / empty / validation error / server error / permission denied / offline / stale-conflict / success apply and how each looks
8. **i18n**: new key namespaces, EN + RW copy requirements, translated validation messages, fallback behaviour
9. **Acceptance criteria**: checkbox list, each objectively verifiable
10. **Tests**: unit / component / E2E files to add
11. **Verification**: exact commands a reviewer runs (typecheck, lint, test, build, manual click-path)
12. **Commit**: conventional commit message, e.g. `feat(clinical): CLN-03 review queue with filters`

Sizing rule: one phase = one focused subagent build session = one commit that leaves the repo green (`pnpm typecheck && pnpm lint && pnpm test && pnpm build` pass).

## Execution protocol (for the build stage)

1. A build subagent implements exactly one phase file.
2. A separate verification subagent checks it against the phase's acceptance criteria and the verification commands, and reports gaps.
3. Fix gaps, then commit with the phase's commit message. Mark the phase `Status: Done` in its file.
4. Note: this repo has untracked-file display turned off in `git status`; always `git add` explicit paths.

## Non-negotiables (every phase)

- Synthetic data only; no real names/IDs from Rwanda systems; fictional facilities and districts clearly labelled.
- No AI diagnosis, treatment advice, dose change or eligibility decision. Rule thresholds are **illustrative demo placeholders** labelled `DEMO_RULE_NOT_CLINICALLY_VALIDATED`.
- Every review decision is attributable; dismissals need a reason; completed referrals need evidence; submitted screenings are immutable except via amendment; `overdue` is derived; stale writes raise conflicts.
- Role switching is demo-only and labelled as such.
- All strings externalised in `@laif/i18n` with EN and RW; Kinyarwanda copy marked `needs clinical/linguistic review` where clinical.
- Time stored UTC, displayed `Africa/Kigali`; pinned demo clock for deterministic seeds; `Reset demo` restores the exact baseline.
