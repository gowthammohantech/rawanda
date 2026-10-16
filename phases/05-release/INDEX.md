# 05-release — Phase index

REL phases run **last**, after the four app tracks (CLN-*, HWM-*, ADM-*, CTZ-*) have completed their P0 phases (CTZ: the phases covering next steps, reminders and correction requests). Run them sequentially; each is one commit that leaves `pnpm verify` green.

| ID | File | Goal (one line) | Depends on | Size |
|---|---|---|---|---|
| REL-01 | `REL-01-scenario-export-import.md` | Watermarked, validated, previewed, conflict-aware JSON bundle export/import so a presenter can move records between the isolated apps (D3), plus 4 deterministic fallback bundles | FND-11, CLN-11, HWM-10, ADM-09, CTZ-07 (minimum; CTZ-09 for full journeys) | M |
| REL-02 | `REL-02-demo-script.md` | Spec §14 15-minute script adapted to isolated mode (Path A bundle hand-off / Path B pre-seeded), `demo-15` preset, narration guardrails, `pnpm demo:preflight` | REL-01 | S |
| REL-03 | `REL-03-e2e-web-mobile.md` | Playwright suites for both web apps and for the Expo apps' web target, Maestro device flows for SQLite restart/conflict, testID contract, §8/§16 traceability | REL-01, REL-02 | L |
| REL-04 | `REL-04-accessibility-privacy.md` | axe + keyboard + manual screen-reader pass; automated assertions for no external requests/telemetry, no PHI in logs, synthetic-only data, small-cell suppression, watermarks | REL-03 | M |
| REL-05 | `REL-05-release-gates-readme.md` | `pnpm verify:release`, spec §9 release-gate checklist with evidence, generated permissions matrix / data dictionary / traceability, known limitations, top-level README | REL-01…REL-04 | S |

## Cross-track expectations REL phases rely on

App-track phases should already provide (REL phases add them if missing and say so in the commit body):

- Package names / scripts fixed by FND-11 (`test:e2e` on web apps, `test:maestro` on Expo apps); app-level Playwright specs in `apps/<web-app>/e2e/` are reused, not duplicated.
- `data-testid` / `testID` values following `docs/qa/TESTID_CONTRACT.md` (created in REL-03; naming `<area>.<element>[.<id>]`).
- Demo tools in every app wired to `repo.demo.*` (shell from FND-11).
- Routes exactly as tech spec §2.1 / §2.3, so the axe sweep and scope tests can deep-link.
- Admin dashboard: aggregate-only CSV built with `@laif/analytics` `toAggregateCsv` (watermark + scope lines).
- Citizen wallet: renders only `CareInstruction` records with `status: 'released'`.

## Decisions pinned in these phases

| Topic | Pinned choice | Phase |
|---|---|---|
| Admin bundle export | Disabled (import only) — no patient-level export from the dashboard | REL-01 |
| Unsynced worker ops in bundles | Not exported; only acknowledged records | REL-01 |
| Mobile automation | Playwright on Expo web export (in `pnpm test:e2e`) + Maestro on device (`pnpm test:maestro`, manual gate); Detox not used | REL-03 |
| Debug handle for E2E | `window.__laifDemo` only when `VITE_LAIF_E2E=1` / `EXPO_PUBLIC_LAIF_E2E=1` | REL-03 |
| Release docs language | English; RW review backlog is reported, not blocking | REL-05 |
