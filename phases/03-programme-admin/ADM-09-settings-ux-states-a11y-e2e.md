# ADM-09 — Settings, UX-state hardening, accessibility, responsive layout and E2E suite

**Status:** Done

## 1. Header

| Field | Value |
|---|---|
| ID | ADM-09 |
| Title | Settings, UX-state hardening, accessibility, responsive layout and E2E suite |
| App | Programme Admin Dashboard |
| Depends on | ADM-01 … ADM-08 |
| PRD/FRD trace | FRD §7 (configurable small-cell policy), Implementation_notes (EN⇄RW P0: saved preference, translated validation, fallback), spec §7 (required UX states, responsive 1440/1280/1024/768/390, AA, keyboard), spec §9 (accessibility, privacy tests), spec §10 (`Reset demo` restores exact baseline), spec §13 DoD, FRD T-07/T-09, PRD §9 "permission-denied and error-state tests for every feature" |
| Size | M |

## 2. Goal

The admin app is demo-ready.
- `/admin/settings` provides: language (EN/RW, persisted); the **small-cell suppression threshold** (demo-configurable, default 5, range 3–20, programme lead only, audited); demo transport fault simulation (latency, server error, timeout, offline, conflict); "Expire session now"; and **Reset demo** (restores the exact baseline dataset, audit baseline and demo clock).
- Every page passes a UX-state inventory, axe checks with zero serious/critical violations, keyboard-only walkthroughs and the responsive breakpoints.
- Charts have table alternatives.
- A consolidated Playwright suite covers the full admin story (WF-03, WF-04, Scenario 1, Scenario 2) in EN and RW.

## 3. Scope

**In scope:** settings page; threshold propagation; reset; fault controls; session expiry; UX-state audit and fixes across pages; responsive layout; a11y; i18n completeness; E2E and axe suite; README section for the app.
**Out of scope:** new metrics; cross-app scenario import/export (REL track).

## 4. Deliverables

```text
apps/programme-admin/src/
  routes/settings/SettingsPage.tsx
  features/settings/LanguageSetting.tsx          # wraps @laif/i18n switcher; shows "saved" state
  features/settings/SuppressionThresholdSetting.tsx
  features/settings/FaultSimulationPanel.tsx     # @laif/repositories fault API
  features/settings/ResetDemoCard.tsx            # ConfirmDialog, type-to-confirm "RESET"
  features/settings/SessionCard.tsx              # persona, grant, "Expire session now"
  features/settings/queries.ts                   # adminKeys.settings()
  app/responsive.css (or Tailwind layer)         # breakpoints, sidebar collapse
apps/programme-admin/e2e/
  admin-story.spec.ts        # end-to-end WF-03/WF-04/Scenario 1/2
  a11y.spec.ts               # @axe-core/playwright on every route × EN/RW
  responsive.spec.ts         # 1440, 1280, 1024, 768, 390 screenshots + no horizontal scroll
  resilience.spec.ts         # fault simulation, offline, session expiry
  i18n.spec.ts               # language persistence + fallback
apps/programme-admin/README.md                   # how to run, personas, scenarios, known limitations
packages/i18n/src/locales/{en,rw}/admin.settings.json, admin.states.json
```

## 5. Implementation tasks

1. **Settings storage:**
   - `AdminSettings { suppressionThreshold: number, updatedBy, updatedAt, version }` is stored in the admin Dexie `meta`/settings table. It is part of the seed baseline (k = 5).
   - Language preference uses the FND `@laif/i18n` persistence (localStorage key owned by i18n), so it survives reload and offline use.
2. **Threshold setting:**
   - Stepper/number input, 3–20, integer, with Zod messages translated.
   - Editable only with `settings.privacy`; others see the value read-only with a note "Set by programme lead (demo policy, not approved for production)".
   - Change requires a justification (10–300 chars) and an expectedVersion write.
   - It emits `admin.settings.suppression_threshold_changed` (before/after, justification) and invalidates `adminKeys.all`.
   - It is included in every query key that uses suppression and in the CSV metadata (ADM-07).
   - The UI shows a live preview: "At k = {k}, {n} cells in the current Overview would be suppressed".
3. **Fault simulation panel:**
   - Toggles map to FND-07 `FaultConfig` via `repo.demo.setFaults`: latency → `latencyMs`, server error → `serverErrorRate`, timeout → `timeoutRate`, offline → `offline`, conflict next write → `conflictOnce`.
   - It shows a persistent `FAULT SIMULATION ON` pill in the top bar while any fault is active, and is cleared by Reset demo.
   - Not audited (demo tooling); a footnote says so.
4. **Reset demo:**
   - A ConfirmDialog that requires typing `RESET` (translated instruction; the literal token stays `RESET`).
   - It calls FND-07 `repo.demo.resetDemo()` (admin slice = base seed + overlay), which clears all admin collections and restores the baseline dataset, the baseline audit events (session events are discarded), the settings and the demo clock.
   - It clears the TanStack cache and the session, then redirects to `/admin/login`.
   - A test asserts that a post-reset Dexie dump deep-equals the fresh-seed dump.
5. **Session expiry (T-09):**
   - "Expire session now" marks the session expired. The next navigation or query redirects to `/admin/login?next=<current path+search>` with the notice "Your demo session expired".
   - After signing in again, the user lands on the same filtered view.
   - Open dialogs with unsaved input (programme action, triage, export reason, grant) keep a draft in sessionStorage keyed by idempotency key. After re-login the draft is restored and submitting reuses the key, so no duplicate is created.
6. **UX-state inventory.** Add `apps/programme-admin/src/test/uxStates.test.tsx`, a table-driven test that renders each page with each state via `@laif/test-utils` (`renderWithAdmin({ persona, faults, dataset })`) and asserts the expected landmark text:
   - initial
   - loading
   - loaded
   - empty (period with no data)
   - validation error (bad URL filter)
   - server error
   - permission denied (wrong persona / out-of-scope)
   - offline
   - stale/conflict, where it applies
   - success, where it applies

   Fix any gaps found.
7. **Accessibility:**
   - Landmarks: `banner`, `navigation`, `main`, `complementary`.
   - Skip link "Skip to content".
   - Focus is moved to the `h1` on route change, and the page title is announced via `document.title = "{Page} · Programme Dashboard · CareConnect (Demo)"`.
   - Focus is visible on all controls. Dialogs trap and restore focus.
   - Tables use `<th scope>`, `aria-sort` and captions.
   - Status pills combine text and icon. The suppression pill has sr text.
   - Every `ChartFrame` has a `figure`/`figcaption`, a generated summary and a "View as table" toggle. The SVG is `aria-hidden` when the table is shown.
   - `prefers-reduced-motion` disables chart animations.
   - Contrast is AA against the teal tokens, verified by axe and a token contrast unit test.
8. **Responsive layout:**
   - 1440/1280: sidebar + 8/4 grid.
   - 1024: narrower sidebar, KPI strip wraps to 3+2.
   - 768: sidebar collapses to an icon rail with a menu button; cards stack.
   - 390: off-canvas nav; the KPI strip becomes a 2-column grid; tables switch to stacked "label: value" cards (or horizontal scroll inside the card only); the filter bar collapses into a "Filters (n)" sheet.
   - No page-level horizontal scroll at any width (asserted in `responsive.spec.ts` via `document.documentElement.scrollWidth <= innerWidth`).
9. **i18n completeness:**
   - A key parity test across all `admin.*` namespaces (EN ⇄ RW).
   - A lint rule against literal strings.
   - A fallback test: delete a RW key in a test catalogue → the EN string renders and a dev warning is logged.
   - RW copy marked `needs clinical/linguistic review` is listed in `apps/programme-admin/README.md`.
   - Number/date formatting is verified in RW.
10. **Performance budget:** the overview's first meaningful render is < 1 s on the seeded dataset in Playwright (`performance.now()` mark from route start to KPI visible), in line with the PRD §8 design target. Each lazy route chunk stays under 250 kB gzip; recharts stays out of the login chunk (checked by build stats in CI or a manual note).
11. **README** (`apps/programme-admin/README.md`): run commands, port, personas and grants, permission matrix, metric definitions link, seed scenarios list, privacy rules (aggregate-first, k, no patient-level export), known limitations (demo auth, non-tamper-evident audit, unapproved thresholds).

## 6. Data, state and audit

- Writes: AdminSettings, AuditEvent; Reset rewrites all admin tables to the baseline.
- Audit events: `admin.settings.suppression_threshold_changed`, `admin.settings.denied`, `session.expired`, `demo.reset` (written **after** the reset as the first post-baseline event, so the reset itself is visible).
- Invariants: reset is exact and deterministic; the threshold is applied uniformly to UI, drill-downs and CSV; the language preference never affects numeric values.

## 7. UX states

This phase owns the inventory in task 6. Settings itself: loading skeleton; read-only for non-privacy roles; validation errors on threshold/justification; conflict dialog on stale settings; success toast "Threshold updated — dashboards recalculated"; reset success redirects to login with the toast "Demo data restored".

## 8. i18n

Namespaces `admin.settings` and `admin.states` (shared empty/error/offline/stale/session strings for the app).

| Key | EN | RW (needs linguistic review) |
|---|---|---|
| `admin.settings.title` | Settings | Igenamiterere |
| `admin.settings.language` | Language | Ururimi |
| `admin.settings.threshold.label` | Small-number suppression threshold (demo) | Umubare muto uhishwa (igerageza) |
| `admin.settings.threshold.validation.range` | Enter a whole number from 3 to 20 | Andika umubare wuzuye kuva kuri 3 kugeza kuri 20 |
| `admin.settings.reset.confirm` | Type RESET to restore the demo data | Andika RESET kugira ngo usubize amakuru y'igerageza |
| `admin.states.offline` | You are offline. Showing data stored on this device. | Nta murandasi. Turerekana amakuru abitswe kuri iki gikoresho. |
| `admin.states.sessionExpired` | Your demo session expired. Sign in again to continue. | Igihe cyawe cy'igerageza cyarangiye. Ongera winjire ukomeze. |
| `admin.states.retry` | Retry | Ongera ugerageze |

## 9. Acceptance criteria

- [ ] Changing the threshold from 5 to 10 increases the suppressed cell count on the Overview, Funnel drill-down and the CSV (metadata shows `suppression_threshold=10`). The change is audited with a justification.
- [ ] A district analyst sees the threshold read-only, and a direct repository call is rejected (`admin.settings.denied`).
- [ ] Reset demo restores a dataset deep-equal to a fresh seed, returns to login, and clears the fault pill.
- [ ] Session expiry → re-login returns to the same URL with filters. A restored programme-action draft submits exactly once.
- [ ] axe: zero serious/critical violations on every route in EN and RW.
- [ ] No horizontal page scroll at 1440/1280/1024/768/390. Nav is reachable by keyboard at every width.
- [ ] The language choice survives a reload, and browser offline mode (Playwright `context.setOffline(true)`) still renders the dashboards.
- [ ] `admin-story.spec.ts` passes end to end.

## 10. Tests

- `apps/programme-admin/src/features/settings/*.test.tsx` — threshold validation, permission, conflict; reset determinism (Dexie dump equality with `fake-indexeddb`).
- `apps/programme-admin/src/test/uxStates.test.tsx` — the state matrix.
- `apps/programme-admin/e2e/admin-story.spec.ts`:
  1. District Alpha analyst → Overview.
  2. Funnel drill-down to Reviewed; the dismissed branch is visible (WF-03).
  3. Assign a programme action (Scenario 1).
  4. Reports export with reason, and assert the CSV watermark and scope (Scenario 2).
  5. Edit the URL to District Beta → 403 (WF-04).
  6. Programme lead → Governance audit shows the denied, export and action events.
  7. Switch to RW and repeat the key assertions.
- `a11y.spec.ts`, `responsive.spec.ts`, `resilience.spec.ts` (server_error → ErrorState with no numbers; timeout + retry → single programme action; conflict), `i18n.spec.ts`.

## 11. Verification

```bash
pnpm --filter @laif/programme-admin typecheck && pnpm --filter @laif/programme-admin lint && pnpm --filter @laif/programme-admin test
pnpm --filter @laif/programme-admin test:e2e
pnpm typecheck && pnpm lint && pnpm test && pnpm build
pnpm dev:admin
```

Manual:
1. Programme lead → Settings → threshold 10 (justification) → Overview shows more `<10` cells. Reports → export → check the CSV metadata.
2. Settings → fault "server error" → Overview shows ErrorState with Retry → clear the fault.
3. Expire the session → re-login returns to the same view.
4. Switch to RW → reload: still RW.
5. Resize to 390 px: off-canvas nav, filter sheet, stacked tables.
6. Reset demo → type RESET → login screen; the dataset is back to baseline.

## 12. Commit

`feat(admin): ADM-09 settings, suppression threshold, reset, a11y, responsive and admin E2E suite`

## 13. Implementation notes (builder)

- **Settings storage:** `AdminSettings` lives in store meta `admin.settings` (no new collection,
  no Dexie version bump); an absent key IS the seed baseline (k = 5, version 1, `updatedBy`
  null), so `resetDemo()` (`clearAll`) restores it exactly. Repository: `getAdminSettings()`
  (`metrics.read`) and `updateAdminSettings(input, key)` (`settings.privacy`; idempotent;
  `expectedVersion` → `CONFLICT` + `conflict.detected`; `demo conflictOnce` on
  `audit_event`/`admin-settings`). Contracts: `AdminSettingsSchema`,
  `AdminSettingsUpdateInputSchema`, `ADMIN_THRESHOLD_MIN = 3` (governance floor, never lower) /
  `ADMIN_THRESHOLD_MAX = 20`. Audit entity type `audit_event` (as the repository's other system
  configuration events, `faults` / `clock`).
- **Audit actions registered:** `admin.settings.suppression_threshold_changed` (change) and
  `admin.settings.denied` (access; phase name kept, written as the `denyAction` of the
  permission check) with EN + RW `domain:audit.*` labels. `session.expired` already existed.
- **Threshold in force:** `useSuppressionThreshold()` reads `adminKeys.settings()`; every figure
  page is mounted behind `ThresholdGate`, so nothing renders at the baseline k while a different
  k is in force (a failing refetch keeps the known value). Update → `setQueryData` +
  invalidate `adminKeys.all`; every derived key and the CSV metadata already carried k.
- **Joint Overview + Funnel suppression (open item):** both pages now pick their cells from ONE
  pass (`features/metrics/programmeSuppression.ts`): the shared figures (recorded = screened,
  flagged, reviewed, dismissed, referred, weekly recorded / flagged) are the same nodes;
  page-only measures are extra nodes of the same pass. `programmeSuppression.test.ts` proves
  identical definitions and identical hidden cells in every view at k = 3, 5, 10, 20. The
  attention measures stay a separate connected group (Timeliness reconciliation unchanged).
- **`dataQualityIssues` stays hashed (open item):** triage state is real, user-changed data and
  belongs in the dataset fingerprint; reset clears it. Tests that compare hashes avoid
  `/admin/quality` (which upserts detected issues) — unchanged, documented in `App.test.tsx`.
- **Reset demo** (Settings card with type-`RESET` and the topbar menu): `resetDemo()` → cache
  cleared, drafts cleared, session signed out WITHOUT `session.ended` (audit = baseline + one
  `demo.reset`) → `/admin/login` with "Demo data restored". Deviation: the topbar reset now
  also ends the session (previously kept it); `shell.spec.ts` / `App.test.tsx` updated.
- **Faults:** the full `FaultConfig` is held by `DemoToolsProvider` (optimistic; re-read after
  every mutation because a write can consume `conflictOnce`). Panel: slow network, server error
  and timeout (off / 1 in 4 / always), offline, conflict on the next threshold write, "Clear all
  faults". "Fault simulation on" pill (links to Settings). The repository logs each toggle as
  `demo.fault_toggled` (FND-07 behaviour, kept) — the footnote says they are demo tooling
  outside the governance trail rather than "not audited".
- **Session expiry (T-09):** `expireAdminSession` records `session.expired`, then marks the
  session expired (actor → null; other tabs follow via `storage` events). The next navigation,
  or a query / mutation failing because of it (QueryCache / MutationCache `onError` →
  `noticeExpiry`), redirects to `/admin/login?next=<path+search>&persona=<id>&expired=1`; the
  sign-in page ends the expired session and shows "Your demo session expired…". Drafts:
  `lib/drafts.ts` (sessionStorage, keyed by idempotency key, one per dialog slot) for the
  programme-action dialog (funnel drill-down and quality "Send to facility"), the triage
  dialog, the grant editor and the export reason step (with the export attempt key). Drafts are
  offered back only right after a re-login from an expired session (armed by the sign-in page,
  disarmed by the next navigation); any other sign-in drops them; Reset demo clears them.
- **A11y / responsive:** focus moves to the page `h1` on navigation; titles
  "{Page} · Programme Dashboard · CareConnect (Demo)"; skip link text stays the shared "Skip to
  main content". Shared additive ui-web changes: `AccessibleDataTable scrollable` (table scrolls
  in a focusable, labelled region with the caption above — fixes the ADM-05 worker table / RW
  caption clipping, the audit explorer and the report preview at 1024 / 768), `AppShell rail` +
  `compactSidebar` (768 icon rail, 208 px sidebar until 1280), `Tabs panelId` (tabs without
  content control a shared panel: axe `aria-valid-attr-value` on the quality queue). KPI labels
  wrap instead of truncating. Funnel stage links keep their visible text as accessible name
  (axe `label-content-name-mismatch`). 390 px: "Filters (n)" disclosure. RW "Correlation id"
  translated ("Kode y'ihuza"). Charts already render no SVG while the table is shown and never
  animate; `app/responsive.css` adds `prefers-reduced-motion`.
- **Offline:** the shell prefetches every page chunk after sign-in (`app/pageChunks.ts`) so a
  browser that goes offline can still open every dashboard.
- **E2E seam:** `VITE_LAIF_E2E=1` builds expose `window.__laifAdminE2E.setFaults` (used to arm a
  timeout while the modal dialog is open).
- **Tests:** `uxStates.test.tsx` (9 pages × initial/loading/loaded, empty, validation, server
  error, permission denied, offline + stale overview and settings conflict/success),
  `features/settings/*.test.tsx` (validation, permission, conflict, reset Dexie-dump equality,
  session expiry + draft restore exactly once), `i18n.test.ts`, `contrast.test.ts`; E2E
  `admin-story`, `a11y`, `responsive`, `resilience`, `i18n` (+ updated `shell`).
