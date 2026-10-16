# REL-03 — End-to-end tests: Playwright (web), Playwright on Expo web, Maestro on device

**Status:** Planned

## 1. Header

| Field | Value |
|---|---|
| ID | REL-03 |
| Title | Cross-app E2E suites |
| App | All four apps; new `e2e/` workspace package |
| Depends on | REL-01, REL-02; all CLN-*, HWM-*, ADM-*, CTZ-* phases |
| Trace | Tech spec §9 (web E2E: clinician workflow, admin drill-down, permission denial, failed network, scenario reset; mobile E2E: offline save, restart persistence, reconnect sync, duplicate submission, conflict resolution), §8 checklist, §16 traceability test names |
| Size | L |

## 2. Goal

`pnpm test:e2e` proves the P0 workflows work end-to-end in real browsers against production builds, including the mobile apps' flows via their Expo web target; a Maestro suite proves the same mobile flows on a real device/emulator with the SQLite store and a true app restart.

## 3. Scope

**In scope:** `@laif/e2e` package for **cross-app and Expo-web** specs, testID contract, Expo web serving, Maestro runbook, traceability mapping to §16 test names. App-level Playwright suites already live in `apps/clinical-web/e2e/` (CLN-01…11) and `apps/programme-admin/e2e/` (ADM-01…09), and Maestro flows in `apps/*/.maestro/` (HWM-01…10, CTZ-02…09); REL-03 **reuses** them — where a spec below duplicates an app-track spec (e.g. clinician-review, dismiss, admin-scope, export), map the existing spec in the traceability table instead of writing a second one.

**Out of scope:** Detox; cloud device farms; CI provider wiring (commands are CI-ready).

## 4. Deliverables

```text
e2e/package.json                 # @laif/e2e (private), scripts: test:e2e, test:e2e:web, test:e2e:mobile-web
e2e/playwright.config.ts         # projects: clinical (5173), admin (5174), worker-web (8081), citizen-web (8082); chromium + mobile viewport 390×844
e2e/fixtures/app.ts              # resetApp(page), setLanguage(page, 'rw'), setFaults(page, cfg), loadScenario(page, id), importBundle(page, file)
e2e/web/clinician-review.spec.ts        # §16 clinician-review-e2e (WF-01 clinical part)
e2e/web/clinician-dismiss.spec.ts       # WF-03
e2e/web/referral-loop.spec.ts           # §16 referral-loop-e2e (with bundles)
e2e/web/admin-drilldown.spec.ts         # §16 metric-reconciliation
e2e/web/admin-scope.spec.ts             # WF-04 direct-URL denial
e2e/web/privacy-and-export.spec.ts      # §16 privacy-and-export (CSV watermark, suppression)
e2e/web/failed-network.spec.ts          # faults: offline / 500 / timeout + retry without duplicates
e2e/web/scenario-reset.spec.ts
e2e/web/scenario-transfer.spec.ts       # REL-01 round trip
e2e/web/language.spec.ts                # EN⇄RW switch, persistence, translated validation, fallback never shows raw key
e2e/web/demo-script.spec.ts             # REL-02 web minutes
e2e/mobile-web/screening.spec.ts        # §16 screening-e2e
e2e/mobile-web/offline-restart.spec.ts  # §16 offline-restart-e2e (reload = restart on web)
e2e/mobile-web/duplicate-sync.spec.ts
e2e/mobile-web/conflict.spec.ts
e2e/mobile-web/citizen-readonly.spec.ts # §16 citizen-readonly-e2e
e2e/mobile-web/citizen-privacy.spec.ts  # §16 citizen-privacy-e2e (reminder opt-out, correction request)
(Maestro flows: reuse HWM-10 `offline-save-restart`, `reconnect-sync`, `duplicate-submission`, `conflict-resolution`, `language-offline-persist` and CTZ `consent`, `reminder-opt-out`, `correction-request`, `journey-scenario-1/2`; add only missing ones)
docs/qa/E2E_RUNBOOK.md
docs/qa/TESTID_CONTRACT.md
```

## 5. Implementation tasks

1. Add `e2e` to `pnpm-workspace.yaml` packages and to the root Vitest `projects` exclusion list (Playwright, not Vitest, runs it). `@playwright/test` is already pinned by FND-11 (Chromium only by default, `--project=webkit` optional). `webServer` entries: `pnpm --filter @laif/clinical-web preview --port 5173 --strictPort`, admin 5174, and for Expo apps `pnpm --filter @laif/worker-mobile build` then `npx serve apps/worker-mobile/dist -l 8081 -s` (citizen 8082). `reuseExistingServer: !process.env.CI`. Env `EXPO_NO_TELEMETRY=1`.
2. **testID contract** (`docs/qa/TESTID_CONTRACT.md`): web `data-testid`, native `testID` (renders as `data-testid` on Expo web), naming `<area>.<element>[.<id>]`, e.g. `shell.demoBanner`, `shell.languageSwitcher.rw`, `demoTools.reset`, `demoTools.offline`, `queue.row.<reviewId>`, `review.decision.dismiss`, `review.reason`, `referral.create`, `worker.screening.submit`, `worker.sync.now`, `worker.sync.status`, `conflict.reapplyOnLatest`, `conflict.keepLatest`, `citizen.nextStep`, `citizen.reminders.toggle`. Add any missing IDs to app code in this phase (small, mechanical edits — list each in the commit body).
3. Shared fixture `resetApp(page)`: open app, Demo tools → Reset → wait for `getDemoState` via a `window.__laifDemo` debug handle that is **only** exposed when `import.meta.env.MODE !== 'production' || VITE_LAIF_E2E === '1'` (preview builds for E2E set `VITE_LAIF_E2E=1`; Expo web uses `EXPO_PUBLIC_LAIF_E2E=1`).
4. Web specs — key assertions:
   - clinician-review: queue filter counts equal rows (§8); open SCN-02 case; flag shows ruleset version + inputs + disclaimer; decide `refer` → referral linked to patient/review, assigned worker, audit row visible in `/clinical/audit`.
   - clinician-dismiss: Confirm disabled with < 10 chars; after dismiss no referral exists; admin import shows dismissed counted separately.
   - admin-scope: as `persona-analyst-alpha`, `page.goto('/admin/overview?district=<BETA>')` and Beta facility drill-down URL → permission-denied screen, no Beta numbers in DOM, governance audit shows `access.denied`.
   - privacy-and-export: download CSV → first line is the watermark, scope line present, SCN-12 cell is `<5`, no patient-identifying column headers.
   - failed-network: offline toggle → error/offline states, retry after re-enable creates exactly one record (assert via repository count through debug handle); 500 → ErrorState with code; timeout-after-commit → retry shows success with no duplicate.
   - language: switch RW, reload, still RW; submit invalid form → RW validation text (compare to catalogue); no element text matches `/^[a-z]+:[a-zA-Z.]+$/` (raw key leak).
5. Mobile-web specs: offline screening → status *Saved on this device* → reload page → still pending → offline off → sync → *Synced*; tap sync twice quickly → one screening (`duplicate-sync`); SCN-09 → conflict card shows mine vs latest → "Re-apply my update on the latest version" (`reapply_on_latest`) → audit `sync.conflict_resolved`; citizen shows only released instructions, no numeric score anywhere (regex for `/score/i` absent), reminder opt-out persists across reload, correction request creates task and leaves screening unchanged.
6. **Maestro** (pin Maestro CLI 1.x; manual/optional gate): flows launch the app via `appId` from Expo Go dev build or a local `expo run:android` build; `offline-restart.yaml` uses `setAirplaneMode`/in-app offline toggle, `stopApp` + `launchApp` for a true restart against SQLite. Runbook documents emulator setup and that Maestro is the evidence for "survives app restart" on SQLite (Expo web uses Dexie).
7. Root `pnpm test:e2e` → `turbo run test:e2e` (FND-01/11: app suites + `@laif/e2e` web + mobile-web projects); `pnpm test:maestro` → `turbo run test:maestro` (each Expo app's `maestro test .maestro`; not part of `verify`).
8. Traceability table in `E2E_RUNBOOK.md`: §8 checklist rows and §16 test names → spec file + test title.

## 6. Data, state and audit

Tests start from `resetApp` (clean seed) and assert audit events for decisions, denials, exports, conflict resolution and resets. No production data.

## 7. UX states

E2E covers: loading, loaded, empty (filter to zero), validation error, server error, permission denied, offline, stale/conflict, success — a matrix in the runbook maps each state to at least one spec.

## 8. i18n

`language.spec.ts` covers persistence, RW validation messages and fallback (temporarily removes an RW key via debug handle → EN text shown, no raw key).

## 9. Acceptance criteria

- [ ] `pnpm test:e2e` passes locally from a clean clone (after `pnpm install`), headless, < 10 minutes.
- [ ] Every §8 checklist row and every §16 test name maps to at least one passing spec.
- [ ] No spec relies on arbitrary sleeps (`waitForTimeout` banned by lint rule in `e2e/`).
- [ ] Maestro flows pass on an Android emulator for worker offline-restart and conflict resolution (evidence: `maestro test --format junit` output saved to `docs/qa/evidence/`).
- [ ] Debug handle absent from a normal production build (`grep -L __laifDemo apps/clinical-web/dist/assets/*.js` when built without `VITE_LAIF_E2E`).

## 10. Tests

All files listed in Deliverables.

## 11. Verification

```bash
pnpm verify
pnpm exec playwright install chromium
pnpm test:e2e
pnpm test:e2e -- --project=admin --grep "scope"
pnpm test:maestro           # optional, needs emulator + Maestro
```

## 12. Commit

`test(e2e): REL-03 playwright web and expo-web suites plus maestro device flows for P0 workflows`
