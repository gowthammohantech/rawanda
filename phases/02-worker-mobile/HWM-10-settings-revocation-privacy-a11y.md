# HWM-10 — Settings, reset demo, device revocation, privacy checks, accessibility polish and offline regression suite

> **Data layer (reconciled):** table, outbox, mock-server and SQL names in this file are logical names — implement them through the FND-07 repository / sync API per the term-mapping table in `02-worker-mobile/INDEX.md`. Tests run under Vitest (FND-10); device flows via `test:maestro`.

## 1. Header

| Field | Value |
|---|---|
| ID | HWM-10 |
| Title | Complete Settings (language, offline toggle, fault simulation, reset demo), simulated device revocation / lost-device response, privacy hardening, accessibility pass and Maestro regression suite |
| App | Health Worker Mobile |
| Depends on | HWM-09 |
| Trace | PRD HW-01, HW-08, §6, §8, §10 (lost phone, reassignment offline, clock drift) · FRD HW-01, HW-08, §7 (revocation, lost device), §8 T-02, T-09 · Tech spec §2.2 "Settings", §7 a11y, §9, §10 Reset demo, §13 DoD · Implementation notes (EN⇄RW P0) · README non-negotiables |
| Size | M |
| Status | Planned |

## 2. Goal

Settings becomes the demonstrator's control room: language (EN/RW, persisted offline), an offline toggle and fault simulation shortcuts, an **Activity log** of device audit events, and **Reset demo** that restores the exact seed baseline (worker DB, simulated server DB, audit baseline, demo clock) after an explicit confirmation listing pending items that will be discarded. A **Simulate device revocation** control shows the lost-device response: sync stops with `DEVICE_REVOKED`, patient data is hidden behind a revoked screen, pending items are retained (not sent, not deleted) and the event is audited. The whole app passes an accessibility pass (dynamic type, 44pt targets, screen-reader labels, safe areas) and a Maestro regression suite proves offline save, restart persistence, reconnect sync, duplicate submission and conflict resolution.

## 3. Scope

**In scope**: Settings final layout; Activity log; Reset demo; revocation simulation + revoked screen + "restore device (demo)"; reassignment-while-offline demo scenario; clock-drift indicator; privacy assertions; a11y fixes across HWM-01..09 screens; full `.maestro/` suite and `test:maestro` script; worker section of the demo script.

**Out of scope**: real remote wipe/MDM, real PIN/biometric re-auth, cross-app scenario export/import (REL phase).

## 4. Deliverables

```text
apps/worker-mobile/app/(app)/settings/index.tsx        # final SettingsScreen
apps/worker-mobile/app/(app)/settings/activity.tsx     # ActivityLogScreen
apps/worker-mobile/app/(app)/settings/reset.tsx        # ResetDemoScreen
apps/worker-mobile/app/revoked.tsx                     # RevokedDeviceScreen (outside (app) group)
apps/worker-mobile/src/features/settings/
  SettingsScreen.tsx, LanguageSection.tsx, SimulationSection.tsx, AboutDemoSection.tsx
  ActivityLogScreen.tsx, ResetDemoScreen.tsx
apps/worker-mobile/src/features/revocation/RevokedDeviceScreen.tsx, useRevocation.ts
apps/worker-mobile/src/demo/reset.ts         # wraps repo.demo.resetDemo() (FND-07: reseeds local slice + remote_*, counters, clock) + device-ID regeneration
apps/worker-mobile/src/demo/clockDrift.ts    # compare device clock vs demo clock / server time
apps/worker-mobile/.maestro/                 # suite (see §10) + config.yaml
apps/worker-mobile/package.json              # script "test:maestro" (from FND-11): "maestro test .maestro"
apps/worker-mobile/README.md                 # run, simulation controls, demo click-path (worker part)
packages/i18n/src/locales/{en,rw}/worker/worker.settings.json, worker.revocation.json, worker.a11y.json
```

## 5. Implementation tasks

1. Settings sections (mono micro-labels): `LANGUAGE` (EN/RW segmented + "Saved on this device"; uses FND preference persisted in SQLite, effective offline and before sign-in), `CONNECTION` (Offline (simulated) switch mirrored from network store + link to full Network simulation), `DEMO CONTROLS` (Simulate device revocation, Activity log, Reset demo), `SIGNED IN AS`, `ABOUT` (synthetic data notice, ruleset version, app/SDK version, "Not for clinical use").
2. `ResetDemoScreen`: shows counts "3 waiting to sync, 1 needs decision, 2 drafts will be permanently removed"; requires typing `RESET` (or long-press 2 s) to enable; `repo.demo.resetDemo()` (FND-07) restores the local slice and `remote_*` from the `@laif/mock-data` baseline + pinned demo clock, keeps language preference, signs out, regenerates device ID; writes `demo.reset` into the fresh audit baseline. Deterministic: a snapshot test compares table hashes after reset with a golden baseline.
3. Revocation: "Simulate device revocation" calls `repo.sync.revokeDevice()` (FND-07 `deviceRevoked`); on next sync the remote returns `FORBIDDEN` reason `DEVICE_REVOKED`; engine sets `device_session.revoked_at`, stops all sends, marks waiting ops `blocked_revoked` (new terminal-until-restored status, never deleted). `SessionGuard` redirects to `/revoked`: no patient data rendered, text "This device has been revoked by your supervisor (simulated). {n} items are kept on this device and were not sent.", actions "Restore device (demo only)" (clears revoked flag, ops back to `queued`, audit `device.restored`) and language switch. Audit `device.revoked`.
4. Reassignment-while-offline scenario: Network simulation gains "Simulate task reassignment" (server changes `assigned_worker_id`); outcome sync → `TASK_REASSIGNED` → Not accepted with explanation and retained record (HWM-08/09 paths) — verified here end-to-end.
5. Clock drift: on each ack compare server `updatedAt` vs device time; if |drift| > 5 min show a warning row in Sync center and Settings ("Device clock differs from server by {n} min — times you enter are still saved"); ordering already uses `seq` (HWM-02).
6. Privacy hardening: assert no patient names/identifiers in `console.*` (jest spy + ESLint `no-console` in `src/`), no network calls other than the in-process transport (jest test mocks `fetch` to throw), audit summaries exclude free-text notes, every screen shows the DemoBanner (route-tree test), `/denied` reached for all scoped routes with foreign IDs.
7. Accessibility pass on all screens: `allowFontScaling` respected with layouts tested at font scale 2.0 (no clipped critical text; rows wrap); min hit area 44×44 via `hitSlop` / `minHeight`; every icon-only button has `accessibilityLabel` (translated); status pills expose role + full text ("Status: saved on this device"); forms announce error counts; `SafeAreaView`/insets on headers, tab bar and sticky action bars; contrast of pills verified against tokens (AA); reduced-motion respected for spinners.
8. `ActivityLogScreen`: device + server-mirrored audit events newest first, filter by type (session, patient, screening, follow-up, sync, settings), each row: action label, actor, time (Kigali), entity short ID, correlation ID; read-only.
9. Maestro suite + README demo click-path matching tech spec §14 minutes 2–5 and 8–10 for the worker.

## 6. Data, state and audit

- Session: `signed_in → revoked → restored(signed_in)`; ops: `queued → blocked_revoked → queued`.
- Audit: `settings.language_changed`, `settings.network_sim_changed`, `device.revoked`, `device.restored`, `demo.reset`, `sync.clock_drift_detected`.
- Invariants: reset is the only path that discards pending work and requires explicit confirmation with counts; revocation never deletes local data in the demo (production policy is a PO decision); language preference survives reset.

## 7. UX states

| State | Behaviour |
|---|---|
| Permission denied | Revoked screen (no data) |
| Offline | Settings fully usable; reset works offline |
| Validation error | Reset confirm field mismatch keeps button disabled |
| Success | Reset → branded loader → sign-in with toast "Demo data restored" |
| Loading | Reset progress indicator (DB recreate) |
| Empty | Activity log with no events after reset shows the baseline `demo.reset` only |

## 8. i18n

Namespaces `worker.settings`, `worker.revocation`, `worker.a11y` (screen-reader-only strings). Full catalogue parity test for every `worker.*` key; RW fallback to EN never shows raw keys; language switch works on revoked and sign-in screens.

| Key | EN | RW (draft, needs review) |
|---|---|---|
| `worker.settings.language` | Language | Ururimi |
| `worker.settings.resetDemo` | Reset demo | Subiza igerageza ku ntangiriro |
| `worker.settings.resetWarning` | {count} items not yet synced will be permanently removed | Ibintu {count} bitarahuzwa bizasibwa burundu |
| `worker.revocation.title` | This device has been revoked (simulated) | Iki gikoresho cyahagaritswe (kwigana) |
| `worker.revocation.kept` | {count} items are kept on this device and were not sent | Ibintu {count} bigumye kuri iki gikoresho kandi ntibyoherejwe |
| `worker.a11y.statusPill` | Status: {status} | Uko bihagaze: {status} |

## 9. Acceptance criteria

- [ ] Reset demo restores byte-identical baseline table hashes (excluding device ID) and requires explicit confirmation with counts.
- [ ] Revocation: no patient data visible, no sends, pending ops retained as `blocked_revoked`, `device.revoked` audited; restore resumes sync with no duplicates.
- [ ] Reassignment-while-offline outcome ends in Not accepted with retained record and explanation.
- [ ] Every screen passes the font-scale-2.0 render test and has labels on icon-only controls; all touch targets ≥44pt.
- [ ] Catalogue parity: 100% `worker.*` and `validation.*` keys present in EN and RW.
- [ ] `pnpm --filter @laif/worker-mobile test:maestro` passes all flows listed in §10 on an Android emulator with Expo Go or a dev client.
- [ ] No outbound network requests and no patient identifiers in logs (tests).

## 10. Tests

- `src/demo/__tests__/reset.test.ts` (golden baseline), `src/features/revocation/__tests__/revocation.test.ts`, `src/demo/__tests__/clockDrift.test.ts`.
- `src/__tests__/privacy.test.ts` (no fetch, no PHI logs, banner on all routes), `src/__tests__/a11y.fontScale.test.tsx`, `packages/i18n/src/__tests__/workerParity.test.ts`.
- `.maestro/`: `offline-save-restart.yaml`, `reconnect-sync.yaml`, `duplicate-submission.yaml`, `conflict-resolution.yaml`, `language-offline-persist.yaml`, `revocation.yaml`, `reset-demo.yaml` (plus earlier per-phase flows).

## 11. Verification

```bash
pnpm --filter @laif/worker-mobile typecheck && pnpm --filter @laif/worker-mobile lint
pnpm --filter @laif/worker-mobile test
pnpm --filter @laif/i18n test
pnpm --filter @laif/worker-mobile exec expo-doctor
pnpm --filter @laif/worker-mobile exec expo export --platform android --output-dir .expo-export-check
pnpm --filter @laif/worker-mobile test:maestro
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

Manual (Expo Go, device font size set to largest + TalkBack/VoiceOver on): navigate all tabs by screen reader → every control announced in the active language → Settings → RW → Offline → record screening → Simulate device revocation → go Online → Sync now → revoked screen, no data → Restore device → synced once → Reset demo → type RESET → sign-in in RW with baseline data.

## 12. Commit

`feat(worker): HWM-10 settings, reset demo, simulated device revocation, a11y pass and maestro suite`
