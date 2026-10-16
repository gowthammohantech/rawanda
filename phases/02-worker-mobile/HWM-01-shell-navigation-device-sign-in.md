# HWM-01 — App shell, navigation and simulated device sign-in

## 1. Header

| Field | Value |
|---|---|
| ID | HWM-01 |
| Title | App shell, tab/stack navigation, simulated device sign-in with district/facility assignment |
| App | Health Worker Mobile (`apps/worker-mobile`, Expo Router) |
| Depends on | FND-11 (worker Expo shell, providers, DemoBanner + language switcher), FND-05/06 (personas incl. `persona-sup-alpha`, `createPersonaSession`), FND-07/08 (repository on SQLite `laif-worker.db`), FND-10 (`ui-native`) |
| Trace | PRD HW-01 · FRD HW-01, §7 Permissions · Tech spec §2.2 "Sign-in / role", "Settings" (partial), ADR-P10 · FRD T-01, T-02 |
| Size | M |
| Status | Planned |

## 2. Goal

A field worker opens the app, sees the always-visible `DEMONSTRATION — SYNTHETIC PATIENT DATA — NOT FOR CLINICAL USE` banner and the EN/RW switcher, picks a **demo worker persona** (clearly labelled "Demo sign-in — not real authentication"), confirms the assigned fictional district and facility, and lands on a five-tab app (Today · Find · Screen · Tasks · Sync) with a header that shows the facility, a network badge and an avatar menu leading to Settings. The device session (persona, facility, device ID) survives app restart; signing out returns to sign-in without destroying unsynced work.

## 3. Scope

**In scope**
- Expo Router route groups `(auth)` and `(app)` with a session guard and redirect logic.
- Persona picker restricted to FND-05 personas with `appIds` containing `worker` (roles `community_health_worker`, `field_supervisor`).
- Scope confirmation screen (district + facility, read-only from persona assignment; supervisors may pick one of their assigned facilities).
- Stable per-install `deviceId` (UUID v4) persisted in store meta; `deviceSessions` record (FND-07 collection).
- Tab bar + header chrome, placeholder tab screens (filled in by later phases), Settings index (language, signed-in context, sign out, about/demo notice).
- Facility scope context (`useScope()`) consumed by every later data hook.

**Out of scope**
- Real authentication, PIN/biometric, MFA (labelled as production requirement only).
- Network simulation, reset demo, device revocation (HWM-02, HWM-10).
- Any patient data on screens (HWM-03+).

## 4. Deliverables

```text
apps/worker-mobile/app/
  _layout.tsx                    # modify FND-11 layout: add <SessionProvider> (FND repository + QueryClient already provided)
  index.tsx                      # redirect: session ? /(app)/(tabs) : /(auth)/sign-in
  (auth)/_layout.tsx             # Stack, no tabs, DemoBanner + LanguageSwitcher visible
  (auth)/sign-in.tsx             # PersonaPicker
  (auth)/scope.tsx               # ScopeConfirm
  (app)/_layout.tsx              # Stack + SessionGuard (redirects to sign-in if no session)
  (app)/(tabs)/_layout.tsx       # Tabs: index, patients, screen, tasks, sync
  (app)/(tabs)/index.tsx         # placeholder "Today" (HWM-03)
  (app)/(tabs)/patients/index.tsx# placeholder (HWM-04)
  (app)/(tabs)/screen.tsx        # placeholder (HWM-05)
  (app)/(tabs)/tasks/index.tsx   # placeholder (HWM-07)
  (app)/(tabs)/sync/index.tsx    # placeholder (HWM-09)
  (app)/settings/index.tsx       # SettingsScreen
  (app)/denied.tsx               # PermissionDenied screen (reused by HWM-04/07/10)
apps/worker-mobile/src/
  session/SessionProvider.tsx, useSession.ts, useScope.ts, sessionRepo.ts
  session/device.ts              # getOrCreateDeviceId()
  components/AppHeader.tsx       # facility name, NetworkBadge slot, avatar menu
  components/NetworkBadge.tsx    # static "Online" until HWM-02 wires the network store
  features/auth/PersonaPicker.tsx, ScopeConfirm.tsx
  features/settings/SettingsScreen.tsx
packages/i18n/src/locales/{en,rw}/worker/{auth,nav,settings}.json
```

## 5. Implementation tasks

1. No migrations (FND-08 single-table store). Session = FND-06 `createPersonaSession({ appId: 'worker' })` plus a `deviceSessions` record `{ personaId, deviceId, facilityId, status }` written through the repository.
2. `device.ts`: `getOrCreateDeviceId()` reads store meta `device_id`, otherwise generates `expo-crypto` `randomUUID()` and persists. Never regenerated except by Reset demo.
3. `sessionRepo.ts`: `signIn(personaId, facilityId)` validates via `@laif/auth-demo` `checkAccess` / `isResourceInScope`; on failure returns `FORBIDDEN` (reason `SCOPE`) and records `access.denied` via `repo.recordAuditEvent`. `signOut()` ends the persona session and marks the `deviceSessions` record ended only.
4. `SessionProvider` loads session on boot (shows branded loader from `@laif/ui-native` while the DB opens), exposes `{session, signIn, signOut, status: 'loading'|'signed_out'|'signed_in'|'revoked'}`.
5. `(app)/_layout.tsx` `SessionGuard`: `<Redirect href="/(auth)/sign-in" />` when signed out; when `revoked` (HWM-10) redirect to `/revoked`.
6. `PersonaPicker`: cards per persona (avatar initials, name, role micro-label `COMMUNITY HEALTH WORKER`, facility, district), `DEMO SIGN-IN` pill, info callout "Role selection is a demonstration only and is not security".
7. `ScopeConfirm`: mono micro-labels `DISTRICT` / `FACILITY`, fictional entities with `DEMO ENTITY` pill; supervisors get a radio list of assigned facilities.
8. Tabs layout: icons from `@laif/ui-native` icon set (home, search, plus, clipboard, sync), labels translated, `tabBarAccessibilityLabel`, badge slot on Sync tab (pending count wired in HWM-02).
9. `AppHeader`: facility name, `NetworkBadge`, avatar initials button → `/settings`. Header sits under the FND DemoBanner; respects safe-area insets.
10. `SettingsScreen`: sections `LANGUAGE` (FND `LanguageSwitcher`), `SIGNED IN AS` (persona, role, facility, device ID short form), `DEMO` (link placeholders for Network simulation / Reset demo added later), `Sign out` with `ConfirmSheet` stating "Unsynced items stay on this device".
11. Add i18n catalogs (see §8) and register namespaces in `@laif/i18n` typed key map.

## 6. Data, state and audit

- Reads: personas, facilities, districts from `@laif/auth-demo` / `@laif/mock-data`.
- Writes: `deviceSessions`, store meta `device_id`.
- Audit via the FND repository (available from FND-11, no buffering needed): `session.started`, `session.ended`, `access.denied` (canonical FND-07 actions). Fields: event ID, actor ID, role, action, facility, device ID, occurredAt (UTC), correlation ID.
- Invariants: no tab route renders without a session; facility scope always comes from the session, never from route params.

## 7. UX states

| State | Behaviour |
|---|---|
| Initial/loading | Branded loader while DB opens and session loads (no flash of sign-in) |
| Loaded | Persona list; tabs after sign-in |
| Empty | No eligible personas → `EmptyState` "No demo worker personas in seed" (developer error) |
| Validation error | Supervisor must pick a facility before Continue (button disabled + inline hint) |
| Permission denied | Forced scope mismatch → `/denied` screen with mono label `ACCESS DENIED`, Back to sign-in |
| Offline | Sign-in works fully offline (local only) |
| Success | Toast "Signed in to {facility}" announced to screen reader |

## 8. i18n

Namespaces: `worker.auth`, `worker.nav`, `worker.settings`. RW copy below is draft and flagged `needs linguistic review`.

| Key | EN | RW (draft) |
|---|---|---|
| `worker.auth.title` | Choose your demo profile | Hitamo umwirondoro w'igerageza |
| `worker.auth.demoNotice` | Demo sign-in — not real authentication | Kwinjira by'igerageza — si umutekano nyawo |
| `worker.auth.continue` | Continue | Komeza |
| `worker.nav.today` | Today | Uyu munsi |
| `worker.nav.find` | Find | Shakisha |
| `worker.nav.screen` | Screen | Suzuma |
| `worker.nav.tasks` | Tasks | Imirimo |
| `worker.nav.sync` | Sync | Guhuza |
| `worker.settings.signOut` | Sign out | Sohoka |
| `worker.settings.signOutKeepsData` | Unsynced items stay on this device. | Ibitarahujwe bigumye kuri iki gikoresho. |

Fallback: missing RW key renders EN and logs `i18n.missing_key` in dev; language change re-renders tabs and header immediately and persists offline.

## 9. Acceptance criteria

- [ ] Cold start with no session shows sign-in; with a session shows Today tab, both after restart.
- [ ] Only CHW/supervisor personas are listed; each shows a `DEMO SIGN-IN` label.
- [ ] Device ID is identical across restarts and shown (short form) in Settings.
- [ ] Forcing a facility outside the persona's assignment (test hook) yields `FORBIDDEN`, the denied screen and an `access.denied` audit record.
- [ ] Sign out returns to sign-in and does not delete any record other than ending the device session.
- [ ] DemoBanner and language switcher visible on sign-in, scope, every tab and Settings.
- [ ] All tab targets ≥44pt; tabs have accessibility labels in the active language.

## 10. Tests

- `src/session/__tests__/sessionRepo.test.ts` — sign-in success, scope denied, sign-out preserves other tables.
- `src/session/__tests__/device.test.ts` — device ID stable across provider remounts.
- `src/session/__tests__/sessionGuard.test.ts` — pure redirect decision (`signed_out → /sign-in`, `revoked → /revoked`, `signed_in → tabs`) under Vitest (FND-10 single runner; full routing proven by Maestro + REL-03 Expo-web).
- `src/features/auth/__tests__/PersonaPicker.test.tsx` — renders personas, EN→RW switch changes labels.
- `.maestro/hwm01-sign-in.yaml` — launch, pick persona, confirm scope, see Today tab, restart app, still signed in.

## 11. Verification

```bash
pnpm --filter @laif/worker-mobile typecheck
pnpm --filter @laif/worker-mobile lint
pnpm --filter @laif/worker-mobile test
pnpm --filter @laif/worker-mobile exec expo-doctor
pnpm --filter @laif/worker-mobile exec expo export --platform android --output-dir .expo-export-check
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

Manual (Expo Go, `pnpm dev:worker`): open app → see banner → pick the `persona-chw-alpha1-a` card (invented demo name) → Continue → confirm facility → land on Today → switch to RW → tab labels change → kill app → reopen → still on Today in RW → avatar → Settings → Sign out → sign-in screen.

## 12. Commit

`feat(worker): HWM-01 app shell, tab navigation and simulated device sign-in`
