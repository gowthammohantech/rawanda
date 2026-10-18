# CLN-11 — UX-state sweep, accessibility, responsive layouts, Kinyarwanda completeness and full E2E

## 1. Header

| Field | Value |
|---|---|
| ID | CLN-11 |
| Title | Polish and hardening: every async view has all 10 UX states, WCAG AA, 1440/1280/1024/768 layouts, RW catalogue complete, end-to-end suites |
| App | Clinical Web Portal |
| Depends on | CLN-10 |
| Trace | PRD §6, §8, §9 (happy-path, permission-denied and error-state tests per feature); FRD §3 Scenarios 1–2, §8 T-01..T-10, §9 DoD; spec §7 (required UX states, responsive, a11y), §9 (axe, Playwright), §13 DoD per feature; Implementation_notes (EN⇄RW P0, fallback, translated validation); README Non-negotiables |
| Size | M |
| Status | Done |

## 2. Goal

The clinical portal is stakeholder-ready: every route renders correct initial / loading / loaded / empty / validation / server-error / permission-denied / offline / stale-conflict / success states; it passes automated axe checks and a manual keyboard walkthrough; it is usable at 1440, 1280, 1024 and 768 px; every visible string exists in EN and RW with documented fallback; and Playwright suites prove FRD Scenario 1, Scenario 2, WF-02 (clinical half), WF-04 and T-01..T-10 from a clean `Reset demo`.

## 3. Scope

**In scope**: state matrix audit + fixes; `AsyncBoundary` consolidation; responsive layout rules; a11y fixes; i18n completeness + pseudo-locale check; copy-safety checks; full E2E; `apps/clinical-web/README.md` section "Demo script" (allowed: app runbook, not a report).
**Out of scope**: new features; cross-app scenario export/import (REL); mobile (390/360) layouts for clinical (not required by spec for this app; 768 is the minimum).

## 4. Deliverables

| Path | Purpose |
|---|---|
| `apps/clinical-web/src/components/AsyncBoundary.tsx` | Single component mapping query status + `ClinicalError.code` → `Skeleton` / `EmptyState` / `ErrorState` / `PermissionDenied` / offline-stale label |
| `apps/clinical-web/src/components/shell/ResponsiveSidebar.tsx` | ≥1280 full sidebar; 1024 collapsible icon rail with tooltips; 768 off-canvas drawer with hamburger + focus trap |
| `apps/clinical-web/src/styles/responsive.css` (or Tailwind config) | Breakpoints `md 768`, `lg 1024`, `xl 1280`, `2xl 1440`; tables → stacked cards < 1024 |
| `apps/clinical-web/e2e/a11y.spec.ts` | `@axe-core/playwright` scan of every route (EN and RW) |
| `apps/clinical-web/e2e/responsive.spec.ts` | Viewport matrix screenshots + no horizontal scroll assertions |
| `apps/clinical-web/e2e/full-pathway.spec.ts` | Scenario 1 end to end |
| `apps/clinical-web/e2e/frd-test-cases.spec.ts` | T-01..T-10 mapped one test each |
| `apps/clinical-web/src/__tests__/stateMatrix.test.tsx` | Parametrised: each page × each state renders expected landmark/text |
| — | Catalogue check = FND-04 `pnpm i18n:check --ns clinical --unused --report` (no new script) |
| `apps/clinical-web/README.md` | Run, reset, personas, demo click-path, known limitations |

## 5. Implementation tasks

1. Build a state matrix table (in the PR description, not a repo file) of 11 routes × 10 states; fix every gap using `AsyncBoundary`. Required specifics: stale data label "Last updated hh:mm" when showing cached data offline; conflict states only where mutations exist; success toasts announced via `aria-live="polite"`.
2. Accessibility: landmarks (`header`, `nav`, `main`, `aside`), skip link, heading order, `aria-current="page"` in nav, table captions + `scope`, dialogs trap focus and return focus to trigger, status pills include text, colour contrast AA against tokens (verify primary `#087F8C` on white for small text; use primary-dark where needed), focus ring visible on all interactive elements, reduced-motion respects `prefers-reduced-motion`.
3. Responsive: KPI strip wraps 2×N below 1024; review detail switches two-column → single column below 1280 with evidence first; drawers become full-screen below 1024; decision page sidebar collapses into an "Evidence" disclosure at 768.
4. i18n: run catalogue check; fill RW gaps; verify RW strings that are ~30% longer do not truncate (Playwright RW screenshots); validation messages in RW for every Zod schema used; fallback: missing RW key renders EN and records a dev-console warning, never a raw key; language persisted and applied before first paint (no EN flash).
5. Copy safety: test that EN catalogue for `clinical.*` contains no banned diagnostic/treatment terms; every flag/rule surface shows `DEMO_RULE_NOT_CLINICALLY_VALIDATED` label; DemoBanner present on every route (E2E assertion).
6. Privacy: assert no patient display names in audit `changeSummary`, query keys logged in dev tools, analytics events (`@laif/analytics` not called with names) or CSV.
7. Performance sanity (demo): queue and patient search render < 1 s with seed on a mid laptop (Playwright `performance.now` budget, warn-only).
8. E2E from clean state: each spec starts with `resetDemo` via the `window.__laifDemo` handle (REL-03 contract, `VITE_LAIF_E2E=1`) or Settings; specs stay in `apps/clinical-web/e2e/` and REL-03 references them instead of duplicating.
9. `full-pathway.spec.ts` (Scenario 1): login clinician Alpha-1 → queue → open WF-01 → evidence visible (ruleset) → start → refer → referral created → switch to coordinator → referrals: accept/schedule/complete with evidence → tasks: confirm worker-completed follow-up → audit: correlation trail complete.
10. `frd-test-cases.spec.ts`: T-01 decision saved + audit; T-02 Beta-1 patient URL denied + no name; T-03 missing reason field errors; T-04 double-click one decision; T-05 conflict fault → conflict panel; T-06 amendment keeps original; T-07 external identity unavailable; T-08 audit export watermark + audited; T-09 reload mid-decision → draft/idempotent; T-10 rule version + inputs visible.

## 6. Data, state and audit

No new entities. Verifies every audit event from CLN-01..10 still fires exactly once per action under React StrictMode and in production build (`pnpm --filter @laif/clinical-web preview` E2E run).

## 7. UX states

This phase owns the full matrix; acceptance requires all 10 states demonstrable on: queue, patient search, patient record, review detail, decision, referrals, tasks, audit, settings (states not applicable are documented as N/A with reason).

## 8. i18n

No new namespaces; completes `clinical.*` RW coverage to 100% of keys, review flags recorded only in FND-04 `locales/rw/_review.json`, ready for the external reviewer. Add `clinical.common.languageFallbackNotice` (shown in Settings when any RW key fell back during the session).

## 9. Acceptance criteria

- [ ] `e2e/a11y.spec.ts`: 0 serious/critical axe violations on all routes in EN and RW.
- [ ] Manual keyboard walkthrough of Scenario 1 completes without a mouse (documented in PR).
- [ ] No horizontal scroll at 1440/1280/1024/768 on any route; RW screenshots show no clipped labels.
- [ ] Catalogue check: 0 missing RW keys, 0 raw keys rendered.
- [ ] `full-pathway`, `dismiss-with-reason`, `followup-conflict`, `patient-scope`, `frd-test-cases` all green against `vite preview` build.
- [ ] DemoBanner + language switcher visible on every route; role switcher labelled demo-only.
- [ ] Every CL-01..CL-08 feature has passing happy-path, permission-denied and error-state tests (PRD §9) — listed in INDEX coverage matrix.

## 10. Tests

Listed in §4; plus updates to any earlier component tests that change due to `AsyncBoundary` consolidation.

## 11. Verification

```bash
pnpm install
pnpm i18n:check --ns clinical
pnpm --filter @laif/clinical-web typecheck && pnpm --filter @laif/clinical-web lint && pnpm --filter @laif/clinical-web test
pnpm --filter @laif/clinical-web build && pnpm --filter @laif/clinical-web test:e2e
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```
Manual: Settings → Reset demo → follow `apps/clinical-web/README.md` demo script in EN, then again in RW at 1024 px width; toggle offline and server-error faults on queue, review and decision pages; confirm each state message.

## 12. Commit

`feat(clinical): CLN-11 UX-state, accessibility, responsive and Kinyarwanda hardening with full E2E`
