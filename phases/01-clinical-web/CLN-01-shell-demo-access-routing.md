# CLN-01 — App shell, demo access, facility scope and routing

## 1. Header

| Field | Value |
|---|---|
| ID | CLN-01 |
| Title | App shell, demo persona sign-in, facility scope, route guards and navigation |
| App | Clinical Web Portal (`apps/clinical-web`, port 5173, routes under `/clinical/*`) |
| Depends on | FND-11 (clinical-web shell, providers, DemoBanner + language switcher, `test:e2e` script), FND-06 (permissions + `createPersonaSession`), FND-09 (`AppShell`, `PermissionDenied`), FND-07 (`recordAuditEvent`) |
| Trace | PRD §4 journey 1 step 1, PRD §5; FRD CL-08 (access), FRD §7 Permissions; spec §2.1 `/clinical/login`; WF-04 (scope); T-02 |
| Size | M |
| Status | Not started |

## 2. Goal

A stakeholder opens `http://localhost:5173/clinical`, lands on a demo-access screen, picks a clinical persona (clinician / authorised nurse reviewer / facility coordinator) and an active facility from the persona's permitted set, and enters a branded shell (ref-images layout: rounded canvas, grouped sidebar with count-badge slots, top bar with search hint, bell, avatar + role chip). Every `/clinical/*` route is guarded: no session → redirect to login; missing capability → an explicit, audited permission-denied state. Role switching is clearly labelled **demo only — not authentication**.

## 3. Scope

**In scope**
- React Router data router with all spec §2.1 routes registered (placeholder pages for routes delivered in later phases) plus `/clinical/settings`.
- Demo session (persona + active facility) persisted per browser via the `@laif/auth-demo` session store; survives reload; "Switch persona" and "Sign out".
- Capability model for the clinical app and `RequireCapability` guard.
- Sidebar navigation, top bar, page header pattern (breadcrumb, title, subtitle, right-aligned actions).
- `access.denied`, `session.started`, `session.ended` audit events.

**Out of scope**
- Real authentication, MFA, OIDC (ADR-P10). Data screens (CLN-03+). Seed scenario loading (CLN-02). ⌘K search behaviour (search box is a link to `/clinical/patients` in this phase).

## 4. Deliverables

| Path (under `apps/clinical-web/src/`) | Purpose |
|---|---|
| `app/router.tsx` | `createBrowserRouter` with `/clinical` layout route, children below, `errorElement` = `RouteErrorPage` |
| `app/routes.ts` | Typed route builders: `routes.queue()`, `routes.patient(id)`, `routes.review(id)`, `routes.decision(id)` … |
| `app/providers.tsx` | `QueryClientProvider`, `I18nProvider`, `SessionProvider`, `RepositoryProvider` (stub until CLN-02) |
| `session/SessionProvider.tsx`, `session/useSession.ts` | Wraps `@laif/auth-demo` `createPersonaSession()`; exposes `persona`, `activeFacilityId`, `permittedFacilityIds`, `can(cap)` |
| `session/capabilities.ts` | `ClinicalCapability` union + persona-role → capability map (below) |
| `session/RequireSession.tsx`, `session/RequireCapability.tsx` | Route guards |
| `features/login/LoginPage.tsx` | `/clinical/login`: persona cards + facility `<select>`, demo-only notice |
| `components/shell/ClinicalShell.tsx` | Composes `@laif/ui-web` `AppShell`, `Sidebar`, `Topbar`, `DemoBanner`, `LanguageSwitcher`, `RoleBanner` |
| `components/shell/navConfig.ts` | Nav sections: `WORKSPACE` (Review queue, Patients, Referrals, Care-team tasks), `GOVERNANCE` (Audit), footer (Settings, Help) |
| `components/PageHeader.tsx` | Breadcrumb + title + subtitle + actions slot |
| `components/PermissionDenied.tsx` | Permission-denied state (icon + text + "Switch persona" link) |
| `features/*/…Page.tsx` | Placeholder pages for queue, patients, patient, review, decision, referrals, tasks, audit, settings |

Routes: `/clinical` → redirect `/clinical/queue`; `/clinical/login`; `/clinical/queue`; `/clinical/patients`; `/clinical/patients/:id`; `/clinical/reviews/:id`; `/clinical/reviews/:id/decision`; `/clinical/referrals`; `/clinical/tasks`; `/clinical/audit`; `/clinical/settings`; `*` → `NotFoundPage`.

## 5. Implementation tasks

1. Reuse the FND-11 router/providers (React Router, TanStack Query, Zustand, Zod, RHF already pinned there); replace the FND-11 placeholder routes rather than creating a second router.
2. Create `app/routes.ts` typed builders; never hand-write `/clinical/...` strings elsewhere (lint rule or code review note).
3. Capabilities are the FND-06 `PERMISSIONS` (no clinical-only names): queue → `review.read`; patient → `patient.read`; amend → `screening.amend`; decide → `review.decide`; referrals → `referral.manage` / `referral.complete`; tasks → `task.assign`; audit → `audit.read` / `audit.export`; settings reset/faults → `demo.reset`. `session/capabilities.ts` only maps nav items/routes to these permissions.
4. Role map = FND-06 `ROLE_PERMISSIONS` (clinician, nurse_reviewer, facility_coordinator); personas = FND-05 `persona-clin-alpha1`, `persona-nurse-alpha2`, `persona-coord-alpha` (Alpha-1+Alpha-2), `persona-clin-beta1` (WF-04). Do not add personas or an `authorisedReviewer` flag in this phase.
5. `LoginPage`: persona cards (name, role, permitted facilities, `DEMO PERSONA` mono pill); facility select limited to `permittedFacilityIds`; submit starts session, emits `session.started` via `repository.recordAuditEvent` (actor, role, facility, correlationId) and navigates to `?redirect=` or queue. Default focus on first persona card; Enter selects.
6. `RequireSession`: redirect to `/clinical/login?redirect=<path>`; preserve query string.
7. `RequireCapability cap="…"`: renders `PermissionDenied` and records `access.denied` (route, capability, persona, facility) **once per mount** (StrictMode-safe ref guard).
8. `ClinicalShell`: sidebar with grouped sections and badge slots (`badgeCount` prop wired in CLN-05/08/09); top bar shows persona name, role chip, active facility, `Switch persona` menu (also facility switch among permitted facilities, which clears the query cache), `Sign out` (emits `session.ended`).
9. `RoleBanner` under the top bar: `Demo role: Clinician · Facility Alpha-1 — role switching is not authentication`.
10. `RouteErrorPage` and `NotFoundPage` using `ErrorState` / `EmptyState` from `@laif/ui-web`.
11. Set `document.title` per route via `useDocumentTitle(t('…'))`; `<html lang>` follows active language (`en`/`rw`).

## 6. Data, state and audit

- Reads: personas + facilities from `@laif/auth-demo` / `@laif/mock-data`. Writes: session (auth-demo store), audit events via `repository.recordAuditEvent()`.
- Audit events: `session.started`, `session.ended`, `access.denied` (fields per FRD §5: id, actorId, actorRole, action, resource=route, facilityId, occurredAt UTC, correlationId).
- Invariant: active facility ∈ persona.permittedFacilityIds; if a stored session violates this (e.g. after reset), the session is cleared and the user is sent to login.

## 7. UX states

| State | Behaviour |
|---|---|
| Initial | Login page with persona cards, nothing preselected |
| Loading | Branded loader (from prototype `Loader`) while personas load |
| Loaded | Shell with nav; placeholder pages show `EmptyState` "Delivered in CLN-xx" (dev only) |
| Validation error | Submitting without persona/facility → inline field error, focus moves to first error |
| Permission denied | `PermissionDenied` card, route still in URL, nav item visibly disabled with tooltip |
| Server error | `RouteErrorPage` with retry |
| Empty/offline/conflict/success | N/A this phase (offline banner component mounted, driven in CLN-02) |

## 8. i18n

Namespaces (in `packages/i18n/src/locales/{en,rw}/`): `clinical.common`, `clinical.nav`, `clinical.login`, `clinical.errors`.
Keys (sample): `clinical.nav.queue` ("Review queue" / RW draft "Urutonde rwo gusuzuma"), `clinical.nav.patients` ("Patients" / "Abarwayi"), `clinical.nav.settings` ("Settings" / "Igenamiterere"), `clinical.login.title`, `clinical.login.demoOnlyNotice`, `clinical.login.selectPersona`, `clinical.login.selectFacility`, `clinical.common.roleBanner`, `clinical.errors.permissionDenied.title|body`, `clinical.errors.notFound`.
All RW strings are drafts flagged `needs linguistic review`; role names flagged `needs clinical/linguistic review`. Missing RW key → falls back to EN and logs a dev-only warning (FND fallback). Language switch updates without reload.

## 9. Acceptance criteria

- [ ] `pnpm dev:clinical` → `/clinical` redirects to `/clinical/login` with no session.
- [ ] All 9 spec §2.1 routes + `/clinical/settings` resolve (placeholder allowed) once signed in.
- [ ] Facility select only lists the persona's permitted facilities.
- [ ] Reload keeps the session; Sign out returns to login and emits `session.ended`.
- [ ] Coordinator visiting `/clinical/reviews/x/decision` sees `PermissionDenied`; exactly one `access.denied` event recorded.
- [ ] DemoBanner, RoleBanner and EN/RW switcher visible on every route including login.
- [ ] Keyboard-only: tab order logical, visible focus ring, skip-to-content link.

## 10. Tests

- `src/session/__tests__/capabilities.test.ts` — role→capability matrix, `authorisedReviewer` flag.
- `src/session/__tests__/RequireCapability.test.tsx` — denied render + single audit event.
- `src/features/login/__tests__/LoginPage.test.tsx` — persona/facility selection, validation error, redirect param.
- `src/components/shell/__tests__/ClinicalShell.test.tsx` — nav items, language switch changes labels to RW.
- `e2e/login-and-guard.spec.ts` (Playwright) — unauthenticated redirect, sign-in, deep link with `?redirect=`.

## 11. Verification

```bash
pnpm install
pnpm --filter @laif/clinical-web typecheck && pnpm --filter @laif/clinical-web lint
pnpm --filter @laif/clinical-web test
pnpm --filter @laif/clinical-web test:e2e -- login-and-guard
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```
Manual: `pnpm dev:clinical` → open `/clinical/patients` → redirected to login → pick "Facility coordinator", facility Alpha-1 → lands on Patients placeholder → visit `/clinical/reviews/any/decision` → permission denied → switch language to RW → labels change → Sign out.

## 12. Commit

`feat(clinical): CLN-01 app shell, demo persona access, facility scope and route guards`
