# ADM-01 — Admin shell, demo sign-in, scope guard and analytics seed

**Status:** Done

## 1. Header

| Field | Value |
|---|---|
| ID | ADM-01 |
| Title | Admin shell, demo sign-in, scope guard and analytics seed |
| App | Programme Admin Dashboard (`apps/programme-admin`, port 5174, routes under `/admin/*`) |
| Depends on | FND-11 (programme-admin shell, Dexie `laif-admin`, `test:e2e`), FND-05 (admin personas, `SEED_IDS`), FND-06 (permission matrix, `checkAccess`, `createPersonaSession`), FND-07 (`recordAuditEvent`, collections `accessGrants`/`timeEntries`) |
| PRD/FRD trace | PA-01 (scoped sign-in), PA-08 (access audit, partial), FRD §7 permissions/privacy, FRD Scenario 1 step 1–2, WF-04 steps 1–2, spec §8 "Scope enforcement", spec §10 seed |
| Size | L |

## 2. Goal

A reviewer opens `http://localhost:5174/admin`, is sent to a demo sign-in page, chooses one of four labelled demo personas (programme lead, District Alpha analyst, facility manager, auditor) and an authorised reporting scope, and lands in a ref-images style shell (grey canvas, rounded shell, grouped sidebar, top bar, DemoBanner, EN/RW switcher, "Demo role, not authentication" banner). Every `/admin/*` route is protected: without a session it redirects to sign-in; with a session, any district or facility in the URL that the persona's grant does not cover renders a **403 page** (URL kept) and appends a simulated `access.denied` audit event. The app owns its own Dexie database (`laif-admin`), seeded with enough history for every later metric.

## 3. Scope

**In scope**
- Router, providers, `AdminShell` (sidebar groups, top bar, page header slot, scope strip), placeholder pages for every spec §2.3 route plus `/admin/login`, `/admin/forbidden`, `/admin/settings` and a 404 page.
- Admin personas, capabilities, AccessGrants; session store; `RequireSession` + `ScopeGuard`.
- Admin analytics seed overlay and a seed-sufficiency test.
- Admin audit helper `emitAdminAudit()`.

**Out of scope**
- Filter bar UI and metrics (ADM-02). Editing grants (ADM-08). Real authentication, MFA, OIDC (labelled as not provided).

## 4. Deliverables

```text
apps/programme-admin/src/
  app/router.tsx              # createBrowserRouter, lazy route modules
  app/providers.tsx           # QueryClient, I18nProvider, RepositoryProvider(dbName 'laif-admin')
  app/AdminShell.tsx          # Sidebar + Topbar + RoleBanner + ScopeStrip + <Outlet/>
  app/nav.ts                  # nav groups: MONITOR (Overview, Pathway funnel, Timeliness, Workload), ASSURE (Safety & quality, Reports), GOVERN (Governance), bottom: Settings
  auth/personas.ts            # filters FND-05 DEMO_PERSONAS to appIds ∋ 'admin' (no admin-only persona list)
  auth/capabilities.ts        # nav/route → FND-06 permission map (no second matrix)
  auth/sessionStore.ts        # Zustand view over FND-06 createPersonaSession({ appId: 'admin' }) + chosen reporting scope + grantVersion
  auth/RequireSession.tsx     # redirects to /admin/login?next=<encoded path+search>
  auth/ScopeGuard.tsx         # validates URL scope params against grant; renders ForbiddenPage
  auth/scope.ts               # isDistrictInGrant, isFacilityInGrant, resolveScopeFromSearch
  lib/audit.ts                # thin helper over repository.recordAuditEvent (canonical FND-07 actions for session/access/export/reset)
  lib/idempotency.ts          # makeIdempotencyKey(parts: string[]) (stable hash)
  routes/login/LoginPage.tsx
  routes/errors/ForbiddenPage.tsx, NotFoundPage.tsx
  routes/{overview,funnel,timeliness,workload,quality,reports,governance,settings}/*Page.tsx  # placeholders with PageHeader + EmptyState "Coming in ADM-0x"
apps/programme-admin/e2e/scope-denial.spec.ts
packages/mock-data/src/scenarios/adminAnalytics.ts   # new overlay (cross-package task)
packages/mock-data/src/scenarios/adminAnalytics.test.ts
packages/i18n/src/locales/{en,rw}/admin.shell.json, admin.auth.json, admin.errors.json
```

## 5. Implementation tasks

1. **Routes.** `/admin` → redirect `/admin/overview`. Public: `/admin/login`. Protected (inside `RequireSession` → `AdminShell` → `ScopeGuard`): `/admin/overview`, `/admin/funnel`, `/admin/funnel/:stage`, `/admin/timeliness`, `/admin/workload`, `/admin/quality`, `/admin/reports`, `/admin/governance`, `/admin/settings`, `/admin/forbidden`. `*` → NotFoundPage. Route modules are `lazy()` so chart code is split per page.
2. **Personas** = FND-05 admin personas, all labelled "DEMO PERSONA":
   - `persona-lead-programme` — role `programme_lead`, grant: all districts in seed.
   - `persona-analyst-alpha` — role `district_analyst`, grant: District Alpha only (`SEED_IDS.districts.alpha`).
   - `persona-fmgr-alpha1` — role `facility_manager`, grant: one District Alpha facility.
   - `persona-auditor-programme` — role `auditor`, grant: all districts, governance read only.
3. **Capabilities** = FND-06 `ROLE_PERMISSIONS` for the admin roles (this table is a view of it; `roles.configure` replaces the former `governance.manage`); `auth/capabilities.ts` only maps routes/nav items to permissions:

   | Capability | programme_lead | district_analyst | facility_manager | auditor |
   |---|---|---|---|---|
   | `metrics.read` | Y | Y | Y | Y |
   | `metrics.drilldown` | Y | Y | Y | N |
   | `programme_action.write` | Y | Y | N | N |
   | `quality.triage` | Y | Y | Y | N |
   | `export.aggregate` | Y | Y | N | N |
   | `audit.read` | Y | N (own scope only: `audit.read_scoped`) | N | Y |
   | `roles.configure` | Y | N | N | N |
   | `settings.privacy` | Y | N | N | N |

   Nav items whose capability is missing are rendered disabled with a lock icon and tooltip, **and** the route itself checks the capability (`<RequireCapability cap>` → ForbiddenPage). Hidden menus are not the control (PRD §5).
4. **AccessGrant model.** Add `AccessGrantSchema` to `@laif/contracts` (collection `accessGrants` is pre-registered in FND-07; FND-06 `scopeForPersona(persona, grant)` derives the actor scope from it) `{ id, personaId, role, districtIds[], facilityIds[] | 'ALL_IN_DISTRICTS', validFrom, validTo?, version, updatedBy, updatedAt }` and seed one grant per persona. Grants live in the repository so ADM-08 can edit them.
5. **Sign-in page** (Scenario 1 steps 1–2): persona cards (role, scope summary, capability chips). After choosing, if the grant covers more than one district, a second step "Choose reporting scope" offers "All districts in my scope" or a single district. Submit writes the session `{ personaId, grantId, grantVersion, startedAt, correlationId }`, emits `session.started`, navigates to `next` or `/admin/overview?district=<chosen>`.
6. **ScopeGuard.** Reads `district` and `facility` search params (and `:stage` route param where relevant). For an unknown id it renders the 404 page. For a known id outside the grant it renders `ForbiddenPage` in place (status-code styled "403 · Outside your authorised scope", requested resource label, persona scope, buttons "Back to my scope" and "Switch demo persona"). It emits `access.denied` **once** per `makeIdempotencyKey([personaId, pathname, search, location.key])`, so StrictMode double-render and back/forward do not duplicate events. No metric query runs before the guard passes: guarded children are not mounted.
7. **Repository defence in depth.** Add `assertScope(grant, filter)` in `src/auth/scope.ts`. All admin query functions (from ADM-02 on) call it and throw `RepositoryError('FORBIDDEN')` (from `@laif/contracts`). This covers manipulated in-memory state as well as URLs.
8. **Shell.** Sidebar groups (mono uppercase labels), active state, count badges reserved (filled in by later phases). Top bar: search placeholder (disabled, "Search coming later" tooltip), language switcher, persona menu ("Switch demo persona", "End session" → `session.ended`). RoleBanner: "Demo role: {role} · {scope} · Not authentication". Scope strip under the page header: shield icon + "Viewing aggregate data" + scope label.
9. **Analytics seed overlay** (`@laif/mock-data`, cross-package): `buildAdminAnalyticsOverlay(baseline, clock)` is deterministic (FND seeded PRNG, pinned clock `2026-10-14T06:00:00.000Z`) and is registered in FND-05 `sliceForApp(seed, 'admin')`, so FND-07 `ensureSeeded` / `resetDemo` include it. It adds records on top of the base seed (base counts stay as asserted in FND-05). It must yield:
   - 2 districts (A with 2 facilities, B with 1); 12 Kigali ISO weeks of history before `DEMO_NOW`; ≥150 submitted screenings in total (BP-only, glucose-only, both).
   - ≥5 `dismissed_with_reason` reviews in District Alpha and exactly 1 in District Beta (WF-03, suppressed in B).
   - One designated small cell: District Beta facility has 1–4 completed follow-ups in the default 90-day window (`suppressed-small-aggregate`).
   - Overdue referrals (≥5) and follow-ups (≥5) by `dueAt` before `DEMO_NOW`; completed referrals all with `completionEvidence`; ≥2 `unable_to_reach`.
   - ≥2 screenings with a missing glucose unit, 1 duplicate synthetic identifier pair (identity mismatch), 1 collapsed duplicate submission (same `clientMutationId`), ≥1 manual escalation of a `no_review_required` screening (`review.origin = 'manual_escalation'`), 1 consent-withdrawn patient.
   - 2 rulesets (`demo-ruleset-2026.07-v0` retired, `demo-ruleset-2026.10-v1` active), each with screenings evaluated under it.
   - 4–6 workers (FND-05 CHW personas + overlay workers, each with a `workerCode`) with `TimeEntry` rows (ADM-05 consumes them; `TimeEntrySchema` added to `@laif/contracts` here, collection pre-registered in FND-07: `{ id, workerId, facilityId, date, minutes, activity: 'screening'|'follow_up'|'travel'|'admin', source: 'self_reported_demo' }`).
   - ≥30 baseline audit events, including one prior export and one prior denied access.
10. **App seeding.** On first boot (or `Reset demo`) the FND-11 bootstrap runs `repo.demo.ensureSeeded()` / `repo.demo.resetDemo()` with the admin slice (base + overlay) into `laif-admin`; idempotent via `meta.seedVersion`. No app-local `seedAdminDatabase`.

## 6. Data, state and audit

- Reads: `AccessGrant`, `DemoPersona`, `District`, `Facility`. Writes: `AuditEvent` only.
- Session state is Zustand UI state; it is not stored in the repository. Grant changes bump `grant.version`, and the session re-validates on every navigation.
- Audit events (canonical FND-07 names): `session.started`, `session.ended`, `access.denied` (fields: eventId, actorId, actorRole, action, entityType `route`, entityId `<pathname>`, changeSummary `{ requested: {district, facility}, grant: grantId }`, occurredAt UTC, facilityId null, correlationId = session.correlationId).
- Invariants: no protected component mounts outside the grant; persona switching is labelled demo-only.

## 7. UX states

| State | Behaviour |
|---|---|
| initial/loading | Branded loader (RwandaMark) while the Dexie seed check runs; skeleton sidebar |
| loaded | Shell with placeholder page content |
| empty | Placeholder pages use `EmptyState` with an i18n "Coming soon" message (removed in later phases) |
| permission denied | 403 page in place, with an audit event; disabled nav items with a lock icon |
| server error | Seed failure → `ErrorState` with "Reset demo data" button |
| offline | `OfflineBanner` from `@laif/ui-web` when `navigator.onLine === false` (data is local, so pages still work) |
| validation error | Sign-in submit without a persona/scope → inline field error |

## 8. i18n

Namespaces: `admin.shell`, `admin.auth`, `admin.errors`. Example keys (RW copy is a draft and is marked `needs linguistic review`):

| Key | EN | RW |
|---|---|---|
| `admin.shell.nav.overview` | Overview | Incamake |
| `admin.shell.nav.funnel` | Pathway funnel | Inzira y'ubuvuzi |
| `admin.shell.scopeStrip` | Viewing aggregate data | Urareba imibare rusange |
| `admin.auth.chooseScope` | Choose reporting scope | Hitamo aho raporo igarukira |
| `admin.auth.demoRoleBanner` | Demo role — not authentication | Uruhare rw'igerageza — si ukwinjira nyakuri |
| `admin.errors.forbidden.title` | Outside your authorised scope | Ntabwo wemerewe kubona aya makuru |
| `admin.auth.validation.personaRequired` | Choose a demo persona to continue | Hitamo umukoresha w'igerageza kugira ngo ukomeze |

A missing RW key falls back to EN and logs a console warning in dev only. The i18n parity test (FND) must include the new files.

## 9. Acceptance criteria

- [ ] `/admin/overview` without a session redirects to `/admin/login?next=%2Fadmin%2Foverview`.
- [ ] All four personas can sign in. The programme lead gets the scope-choice step and the others skip it.
- [ ] As `persona-analyst-alpha`, opening `/admin/overview?district=<District Beta id>` shows the 403 page and the URL is unchanged.
- [ ] Exactly one `access.denied` event is appended per denied navigation, including under React StrictMode.
- [ ] `/admin/governance` as `persona-fmgr-alpha1` shows 403 (capability check); the nav item is disabled with a lock icon.
- [ ] The seed-sufficiency test passes for every overlay bullet in task 9.
- [ ] DemoBanner, RoleBanner and the EN/RW switcher are visible on every route, including login and 403.

## 10. Tests

- `apps/programme-admin/src/auth/scope.test.ts` — grant/district/facility matrix, unknown id → not-found.
- `apps/programme-admin/src/auth/ScopeGuard.test.tsx` (Testing Library) — 403 render, single audit emit, children not mounted.
- `apps/programme-admin/src/routes/login/LoginPage.test.tsx` — persona choice, scope step, validation message in EN and RW.
- `packages/mock-data/src/scenarios/adminAnalytics.test.ts` — seed sufficiency and determinism (two builds deep-equal).
- `apps/programme-admin/e2e/scope-denial.spec.ts` (Playwright) — sign in as District Alpha, go to the District Beta URL, assert 403 heading, open the audit table in the IndexedDB snapshot helper (`@laif/test-utils` `readStoreCollection`) and assert one denied event.

## 11. Verification

```bash
pnpm --filter @laif/mock-data test
pnpm --filter @laif/programme-admin typecheck && pnpm --filter @laif/programme-admin lint
pnpm --filter @laif/programme-admin test
pnpm --filter @laif/programme-admin test:e2e -- scope-denial.spec.ts
pnpm typecheck && pnpm lint && pnpm test && pnpm build
pnpm dev:admin
```

Manual: open `localhost:5174/admin` → login → "District analyst — Demo District Alpha" → Overview. Edit the URL to `?district=<B id>` → 403 page. Switch to RW → 403 copy is in Kinyarwanda. "Switch demo persona" → Programme lead → choose "All districts" → shell shows the full scope.

## 12. Commit

`feat(admin): ADM-01 shell, demo sign-in, scope guard and analytics seed`
