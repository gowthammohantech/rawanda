# 00-foundation — Phase index

All FND phases run **sequentially** before any app track (CLN / HWM / ADM / CTZ) starts. Each phase is one commit that leaves `pnpm verify` green.

| ID | File | Goal (one line) | Depends on | Size |
|---|---|---|---|---|
| FND-01 | `FND-01-monorepo-tooling.md` | pnpm + Turborepo workspace, Node 22/pnpm via `.mise.toml`, strict TS, ESLint, Prettier, Vitest, root scripts, 10 empty package skeletons with enforced dependency order | — | M |
| FND-02 | `FND-02-domain-core.md` | `@laif/domain`: entities (§5.1 + extensions), §5.2 state machines with invariants, threshold-free demo rules engine, overdue derivation, pinned demo clock | FND-01 | L |
| FND-03 | `FND-03-contracts-zod.md` | `@laif/contracts`: Zod 4 entity/input/filter schemas, `WriteResult`/error codes, validation messages as i18n keys | FND-02 | M |
| FND-04 | `FND-04-i18n-en-rw.md` | `@laif/i18n`: offline EN + RW catalogues, typed keys, persisted per-app language, EN fallback with dev logging, translated validation, Africa/Kigali formatting for web + RN | FND-03 | M |
| FND-05 | `FND-05-mock-data-seed.md` | `@laif/mock-data`: deterministic seed (48 patients, 3 facilities, 2 districts, 60/20/12/18), personas, external DEMO ruleset config, 12 named scenarios, per-app slices | FND-02, FND-03 | L |
| FND-06 | `FND-06-auth-demo-analytics.md` | `@laif/auth-demo` role/scope checks + `@laif/analytics` metric calculators, small-cell suppression, watermarked aggregate CSV | FND-02, FND-05 | M |
| FND-07 | `FND-07-repositories-core.md` | `@laif/repositories`: `CareRepository` (§4 extended), audit, idempotency, versions/409, simulated faults, sync queue vs simulated remote, reset/scenario load | FND-02, FND-03, FND-05, FND-06 | L |
| FND-08 | `FND-08-persistence-adapters-test-utils.md` | Dexie (web) and expo-sqlite (native) store adapters with restart persistence; `@laif/test-utils` | FND-07 | M |
| FND-09 | `FND-09-ui-web.md` | `@laif/ui-web`: teal tokens, self-hosted fonts, ref-image layout components (AppShell…AccessibleDataTable…Stepper), gallery, axe-clean | FND-04 | L |
| FND-10 | `FND-10-ui-native.md` | `@laif/ui-native`: token-parity native kit, 44 pt targets, dynamic type, sync/offline visuals | FND-04, FND-09 | M |
| FND-11 | `FND-11-app-shells.md` | Four bootable shells (Vite 5173/5174, Expo Router with pinned SDK) with demo banner, EN/RW switcher, demo tools and seeded local data | FND-01…FND-10 | L |

Note: FND-09/FND-10 only need FND-04, so if two builders are available they may run in parallel with FND-05…FND-08; the default is strictly sequential.

## Package dependency order (enforced by `scripts/check-dep-graph.ts`)

`domain` → `contracts` → `i18n` → `mock-data` → `auth-demo` → `analytics` → `repositories` → `test-utils`; `ui-web` (→ i18n, domain) → `ui-native` (→ i18n, domain; ui-web as devDependency for parity test only).

## Decisions pinned in these phases (spec left them open)

| Topic | Pinned choice | Phase |
|---|---|---|
| Formatter | Prettier 3 (+ tailwind plugin), not oxfmt | FND-01 |
| pnpm linker | `node-linker=hoisted` for Expo/Metro | FND-01 |
| Packages | Ship TS source, no per-package build | FND-01 |
| Status vocabulary | Per-entity lowercase machines of spec §5.2 are authoritative; FRD uppercase lifecycle is a derived `PathwayStage` | FND-02 |
| Demo clock | `2026-10-14T06:00:00.000Z` (08:00 Kigali) | FND-02 |
| Dismissal/amend reason minimum | 10 non-whitespace characters | FND-02/03 |
| Missing glucose unit | Not evaluable → `requiresReview: true` with `GLUCOSE_UNIT_MISSING` | FND-02 |
| Error codes | FRD 5 codes + `TIMEOUT`, `OFFLINE`, `INTERNAL` | FND-03 |
| i18n library | i18next + react-i18next, bundled JSON, no device-locale detection | FND-04 |
| Write results | `WriteResult<T>` envelope; actor injected via deps, §4 method names kept | FND-07 |
| Storage | Document store: one Dexie table per collection; one SQLite `records` table (JSON) | FND-07/08 |
| Sync target in isolated mode | In-app *simulated remote* (`remote_*` collections) | FND-07 |
| Fonts | Self-hosted (`@fontsource`, `@expo-google-fonts`) — no Google Fonts CDN | FND-09/10 |
| Native component tests | Vitest + react-native-web alias (single runner) | FND-10 |
| React version | One version repo-wide via `pnpm.overrides`, set by pinned Expo SDK | FND-11 |
| Roles / personas | 10 roles incl. `field_supervisor`, `programme_lead`, `district_analyst`, `facility_manager`, `auditor` (PRD/FRD actor lists); 18 personas incl. 5 citizen personas CTZ-P1…P5 | FND-02/05 |
| Permissions | One `PERMISSIONS` vocabulary + matrix for all four apps (dot names) | FND-06 |
| Decision kinds | 4 action kinds + `dismiss` input kind; CLN-07's five UI options map 1:1 | FND-02/03 |
| Glucose context | `fasting`, `non_fasting`, `not_recorded` (app consensus) | FND-02 |
| Evidence types | One list of 7, with referral and worker subsets | FND-02 |
| Error reasons | App-specific causes are `reason`s on the 8 FND codes, never new codes; conflict payload field `latest` | FND-03 |
| Sync | One design: FND-07 sync queue + simulated remote in the same store; HWM consumes it | FND-07 |
| Collections | Registry incl. admin + citizen collections; no app-local SQL or migrations | FND-07/08 |
| Fault API | One `FaultConfig` for all apps | FND-07 |
| Seed anchors | `SEED_ANCHORS` + admin/citizen overlays via `sliceForApp` | FND-05 |
| App scripts | Package names fixed; web `test:e2e` (Playwright per app), native `test:maestro` | FND-11 |
| Charts | Recharts 3.x pinned inside programme-admin only; ui-web keeps SVG `TrendChart`/`BarList` | FND-09 / ADM-02 |
| i18n files | `locales/<lng>/<ns>/<area>.json` merged per namespace; single `pnpm i18n:check [--ns]` | FND-04 |

## Open items for the product owner

Consolidated with all app tracks in `phases/CONSISTENCY_REVIEW.md` §3 (authoritative list). Item 5 is resolved there (decision kinds aligned with CLN-07).

1. **DEMO threshold values.** The spec forbids hardcoding clinical thresholds yet the demo engine needs numbers. Proposed illustrative placeholders (to be confirmed or replaced, all labelled `DEMO_RULE_NOT_CLINICALLY_VALIDATED`): `DEMO_SYSTOLIC_REVIEW_AT_OR_ABOVE = 145`, `DEMO_DIASTOLIC_REVIEW_AT_OR_ABOVE = 95`, `DEMO_GLUCOSE_REVIEW_AT_OR_ABOVE_MMOL = { fasting: 7.5, non_fasting: 11.5, not_recorded: 11.5 }`. Data-entry plausibility limits: systolic 60–260, diastolic 30–160 mmHg, glucose 1.0–35.0 mmol/L (18–630 mg/dL).
2. **Encrypt locally (HW-05).** expo-sqlite SQLCipher is possible but complicates Expo Go use; plan shows a labelled "not encrypted in demo" limitation. Confirm.
3. **Kinyarwanda authorship.** Who writes and who validates RW copy? Plan has builders write drafts flagged `needs clinical/linguistic review`.
4. **Toolchain.** The local machine has Node 24 / pnpm 11; the plan pins Node 22 / pnpm 10 via mise as instructed. Confirm pnpm 10 vs 11.
5. **Review decision kinds** (`refer`, `plan_follow_up`, `request_repeat_screening`, `no_further_action`) and cancel-from-any-state for referrals are interpretations of spec §2.1/§5.2.
6. **Small-cell rule.** Threshold 5 with primary + complementary suppression; zero shown unsuppressed. Needs data-governance confirmation.
