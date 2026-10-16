# FND-09 — @laif/ui-web: tokens and shared React components (Tailwind v4)

**Status:** Planned

## 1. Header

| Field | Value |
|---|---|
| ID | FND-09 |
| Title | Web design system |
| App | Shared (`packages/ui-web`) — consumed by clinical-web, programme-admin |
| Depends on | FND-04 (and FND-02 for status unions) |
| Trace | Tech spec §7 (tokens, shared components, UX states, a11y); README "Design language" (D4); ref-images; prototype `src/index.css` + `App.tsx` |
| Size | L |

## 2. Goal

Both web apps assemble screens from one accessible, token-driven component kit that reproduces the ref-images layout language (grey canvas, rounded shell, grouped sidebar with count badges, search-topbar, KPI strip with dividers, mono uppercase micro-labels, pill badges, expandable rows, stepper, tabbed tables with counts, soft-blue explanation callouts, thin progress bars) in the clinical teal palette, with the prototype's RwandaMark, loader and DemoBanner — and every component is translatable, keyboard-operable and passes axe.

## 3. Scope

**In scope:** CSS tokens (Tailwind v4 `@theme`), self-hosted fonts, icon set, ~30 components listed below, a gallery page, component tests incl. axe, `@laif/test-utils/web` render helper.

**Out of scope:** domain-specific composites that belong to one app (e.g. `ReviewDecisionPanel`, `ReferralStepper` wiring, `SyncQueuePanel`) — app tracks compose them from these primitives. Charts beyond the simple SVG `TrendChart`/`BarList` (decision: programme-admin pins Recharts 3.x **inside the app** for its line charts, ADM-02; clinical-web uses only `TrendChart`/`BarList`). Shared `ExplainableFlag` and `ReadingDisplay` (tech spec §7 shared components) are delivered here as presentational components taking a `FlagResult` / reading + unit; CLN-04/06 compose them.

## 4. Deliverables

```text
packages/ui-web/
  src/styles/tokens.css    # @theme { --color-* , --font-*, --radius-*, --shadow-* } + semantic aliases
  src/styles/base.css      # body canvas, focus ring, reduced-motion, mono micro-label utility
  src/styles/index.css     # @import "tailwindcss"; @import tokens/base; @source "../components"
  src/tokens.ts            # same values as TS object (consumed by tests and the native parity test)
  src/icons/icon-data.ts   # ported prototype icon paths as data: Record<IconName, IconNode[]> + new: alert, info, filter, globe, lock, clock, wifi-off, refresh, eye, file, chevron-down, external
  src/icons/Icon.tsx
  src/components/*.tsx     # see task 4
  src/a11y/VisuallyHidden.tsx, SkipLink.tsx, useFocusReturn.ts
  src/index.ts             # named exports only
  gallery/index.html, gallery/main.tsx   # `pnpm --filter @laif/ui-web gallery` → Vite dev on port 5179
packages/test-utils/src/web/render.tsx   # renderWithProviders(ui, { language, route, repo? })
```

## 5. Implementation tasks

1. Dependencies (pinned): `tailwindcss` 4.x + `@tailwindcss/vite`, `@radix-ui/react-dialog`, `@radix-ui/react-tabs`, `@radix-ui/react-dropdown-menu`, `@radix-ui/react-tooltip`, `clsx`, `@fontsource/dm-sans`, `@fontsource/manrope`, `@fontsource/jetbrains-mono` (decision: mono family for micro-labels/badges). Peer: `react`, `react-dom` only — `Sidebar`/`Breadcrumb` accept an injected `LinkComponent` (apps pass React Router's `NavLink`) so the kit stays router-agnostic. **Fonts are self-hosted** — the prototype's Google Fonts `@import` is not ported (offline + no third-party requests; REL-04 asserts this).
2. **Tokens** (from README palette + prototype soft tints): `--color-primary #087F8C`, `--color-primary-dark #075D66`, `--color-primary-soft #E8F5F5`, `--color-positive #1B7653` / soft `#EAF6F0`, `--color-warning #A15D00` / soft `#FFF4DF`, `--color-danger #B42318` / soft `#FFF0EE`, `--color-info #2463A0` / soft `#EDF5FC`, `--color-ink #18252B`, `--color-muted #5B6870`, `--color-subtle #7B898F`, `--color-background #F7FAFA`, `--color-canvas #E9ECEC`, `--color-surface #FFFFFF`, `--color-border #D9E2E4`, `--color-border-soft #E8EDEF`, `--color-demo-banner-bg #FFF7E7`, `--color-demo-banner-fg #79500C`. Semantic aliases: `--color-risk-warning`, `--color-risk-danger`, `--color-state-success`, `--color-state-info`, `--color-sync-pending`, `--color-sync-conflict`. Radii 8/12/16/24; shell radius 24. Verify AA contrast of each fg/bg pair in a unit test (`tokens.contrast.test.ts`, WCAG ratio ≥ 4.5 for text pairs); adjust `subtle` if it fails on white.
3. Port from prototype: `RwandaMark` (CareConnect sun mark), `BrandLoader` (radial teal loader; respects `prefers-reduced-motion`), `DemoBanner`, `Status` → `StatusChip`, `Button` variants, metric grid → `KpiStrip`. Do **not** port the prototype's demo data/names.
4. **Components** (all props typed, all visible text via props or `useT`; none hardcode English):
   - Shell: `AppShell` (canvas + rounded shell + sidebar + topbar + `<main id="main">` + slots for banners), `Sidebar` (`sections: { labelKey, items: { to, labelKey, icon, count?, countTone? }[] }[]`, footer slot for facility/scope card), `Topbar` (search with ⌘K hint, notifications button with dot, avatar/persona menu, `LanguageSwitcher`), `PageHeader` (breadcrumb, title, subtitle, `secondaryActions`, `primaryAction`), `SubNav` (indented child nav, ref image 4).
   - Banners: `DemoBanner` (fixed text key `demo:banner` = "DEMONSTRATION — SYNTHETIC PATIENT DATA — NOT FOR CLINICAL USE", always rendered by `AppShell`, cannot be hidden by props), `RoleBanner` (persona + scope + "Demo role switch — not authentication"), `OfflineBanner`, `RuleDisclaimer` (`DEMO_RULE_NOT_CLINICALLY_VALIDATED` with translated explanation), `InfoCallout` (soft-blue explanation card), `PrivacyNotice`.
   - Data display: `StatusChip` (`tone: neutral|info|positive|warning|danger`, mono caps, **always icon + text**, never colour only), `MicroLabel` (mono uppercase), `MetricCard`, `KpiStrip` (one card, vertical dividers, `items: { label, value: number | SuppressedNumber, hint?, tone? }[]` — renders `common:suppressed` for suppressed), `ProgressBar`, `SegmentedProgress`, `BarList` (labelled horizontal bars), `TrendChart` (dependency-free SVG line chart with `<title>`/`<desc>` and a visually hidden data table), `Timeline` (date rail, ref image 5) used for audit/follow-up timelines, `ExpandableRow` (`aria-expanded`, ref image 3/6 conflict row), `KeyValueList`, `Avatar` (initials only, no photos), `ReadingDisplay` (value + unit always, `UNIT MISSING` chip when unit null), `ExplainableFlag` (reason codes via `domain:reason.*`, ruleset version, inputs, `RuleDisclaimer`).
   - Tables: `AccessibleDataTable<T>` (`columns`, `rows`, `getRowId`, caption, sortable headers with `aria-sort`, row action, pagination footer "Showing x of y", empty slot), `Tabs` (Radix; tab labels with count badges), `FilterBar` (chips/segmented filters + selects; emits typed filter state; `aria-live` result count), `SearchInput`, `Pagination`.
   - Forms: `Field` (label, hint, error rendered via `useFieldErrorText` → translated validation), `TextInput`, `NumberInput` (with unit suffix slot), `Select`, `Textarea` (char counter), `RadioCardGroup`, `DateTimeInput` (Kigali wall-time in/UTC out), `Checkbox`, `Stepper` (numbered steps, done/current/upcoming, ref image 6).
   - Feedback: `ConfirmDialog` (Radix Dialog; destructive variant; required-reason variant with textarea that blocks confirm until valid), `Drawer`, `Toast`/`useToast` (`aria-live="polite"`), `EmptyState`, `ErrorState` (retry button; shows error code), `PermissionDenied`, `ConflictNotice` (shows "your version" vs "latest" columns, `changedBy`/`changedAt`, and the two actions `reapply_on_latest` / `keep_latest` — the one conflict UI for both web apps: CLN's `ConflictPanel`/`ConflictResolutionDialog` and ADM's `ConflictDialog` compose it inside a `Drawer`/`ConfirmDialog` rather than re-implementing it), `LoadingSkeleton`, `AsyncBoundary` (renders the right one of the 10 UX states from a `{ status, error }` prop using `RepositoryError.code`).
   - Controls: `Button` (primary/secondary/ghost/danger; `loading` disables + `aria-busy`, prevents double submit), `IconButton` (requires `labelKey`), `LanguageSwitcher` (EN / RW segmented control; calls `useLanguage().setLanguage`; `aria-pressed`), `PersonaSwitcher` (dropdown; labelled demo-only), `DemoToolsMenu` (Reset demo, fault toggles: offline / slow / errors, scenario loader; reset uses `ConfirmDialog`).
5. Tailwind in apps: apps import `@laif/ui-web/styles.css`; the package's `index.css` declares `@source "../components"` so classes used inside the package are generated.
6. Responsive: shell collapses sidebar into a drawer < 1024 px; tables become stacked cards < 768 px; verified at 1440/1280/1024/768/390 in the gallery.
7. a11y: visible focus ring token (`3px` teal 24% + offset), `SkipLink` to `#main`, every icon-only control labelled, dialogs trap and return focus, min target 32×32 on web (44 on touch breakpoints).
8. `renderWithProviders` (test-utils/web) wraps `I18nProvider` (test i18n), `MemoryRouter`, `QueryClientProvider` (retry off), optional repository context.

## 6. Data, state and audit

UI-only. No repository access except via props/callbacks. `DemoToolsMenu` calls handlers passed in by apps.

## 7. UX states

`AsyncBoundary` implements all ten: initial (nothing requested yet: neutral prompt), loading (skeleton, `aria-busy`), loaded, empty (`EmptyState` with clear-filters action), validation error (field-level via `Field`), server error (`ErrorState` + retry), permission denied (`PermissionDenied`, no data rendered), offline (`OfflineBanner` + cached data marker), stale/conflict (`ConflictNotice`), success (`Toast`).

## 8. i18n

New keys: `shell:*` (nav sections, search placeholder, skip link, notifications, profile menu), `common:state.*`, `common:table.*` (showing x of y, sort asc/desc, no results), `common:dialog.*`, `demo:tools.*` (reset, offline, slow network, server errors, load scenario). RW for all. Gallery has a language toggle to eyeball RW overflow (long Kinyarwanda strings must not break layouts — test with 1.4× EN length).

## 9. Acceptance criteria

- [ ] Gallery renders every component at 1440 and 390 widths in EN and RW without overflow.
- [ ] axe (via `vitest-axe`) reports zero violations for every component test render.
- [ ] `StatusChip` always renders an icon and text; a test fails if `children` is empty.
- [ ] `AppShell` always contains the DemoBanner text and a `LanguageSwitcher`.
- [ ] Clicking a `loading` Button twice fires `onClick` once.
- [ ] `ConfirmDialog` reason variant keeps Confirm disabled until reason ≥ 10 chars; Escape closes and focus returns to trigger.
- [ ] `KpiStrip` renders "Suppressed (<5)" for suppressed values.
- [ ] Lint: no hex literals in `src/components/**`; no literal JSX text.
- [ ] Network log of the gallery shows no request to `fonts.googleapis.com` or any non-localhost host.

## 10. Tests

`src/components/*.test.tsx` (one per component; keyboard interaction for Tabs, Dialog, ExpandableRow, LanguageSwitcher, AccessibleDataTable sort), `src/components/a11y.axe.test.tsx` (renders all components, runs axe), `src/tokens.contrast.test.ts`, `src/icons/icon-data.test.ts`.

## 11. Verification

```bash
pnpm --filter @laif/ui-web typecheck && pnpm --filter @laif/ui-web lint
pnpm vitest run --project @laif/ui-web
pnpm --filter @laif/ui-web gallery     # open http://localhost:5179, toggle EN/RW, resize to 390px, Tab through all controls
pnpm verify
```

## 12. Commit

`feat(ui-web): FND-09 teal design tokens and accessible shared web components with gallery`
