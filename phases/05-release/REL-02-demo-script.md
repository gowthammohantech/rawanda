# REL-02 — Cross-app 15-minute demo script (isolated mode)

**Status:** Planned

## 1. Header

| Field | Value |
|---|---|
| ID | REL-02 |
| Title | Reproducible stakeholder demo script |
| App | All four apps; `docs/demo/` |
| Depends on | REL-01; all CLN-*, HWM-*, ADM-*, CTZ-* phases |
| Trace | Tech spec §14 (15-minute script), §6 WF-01..WF-04, §9 release gate "complete demo script reproducible from a clean seed", §10 reset; BRD §10 Gate 0 |
| Size | S |

## 2. Goal

Any team member can run the §14 demonstration in 15 minutes from a clean seed, on one laptop plus one phone (or the Expo web target), with every step either carried by a REL-01 bundle hand-off (Path A) or by a pre-seeded scenario in the target app (Path B, zero-transfer fallback), and with a scripted narration that never overstates clinical validation or live synchronisation.

## 3. Scope

**In scope:** `docs/demo/DEMO_SCRIPT.md`, presenter checklist, preflight script, scenario preset `demo-15` that sets each app's starting state, narration guardrails, troubleshooting.

**Out of scope:** recording a video; slides; live LAN sync (excluded by D3).

## 4. Deliverables

```text
docs/demo/DEMO_SCRIPT.md          # minute-by-minute script, both paths
docs/demo/PRESENTER_CHECKLIST.md  # T-30 min / T-5 min / after-demo reset
docs/demo/NARRATION_GUARDRAILS.md # allowed / forbidden phrases
scripts/demo-preflight.ts         # `pnpm demo:preflight`
packages/mock-data/src/scenarios/demo-15.ts   # DEMO_15 preset: per-app scenario + clock
```

## 5. Implementation tasks

1. Add `DEMO_15` preset in mock-data: `{ clockIso: '2026-10-14T06:00:00.000Z', perApp: { worker: 'SCN-08-offline-sync', clinical: 'SCN-02-flagged-screening', admin: 'SCN-12-suppressed-small-aggregate', citizen: 'SCN-05-completed-follow-up' } }`; each app's Demo tools gains "Load demo-15 starting state" (calls `loadScenario` with that app's entry). Test asserts every referenced scenario exists and supports that app.
2. Write `DEMO_SCRIPT.md` with this structure (adapted from §14):
   | Min | Step | App / persona | Path A (hand-off) | Path B (pre-seeded) | Proof point |
   |---|---|---|---|---|---|
   | 0–2 | Four shells, DEMONSTRATION banner, EN⇄RW switch, demo-only role switcher | all | — | — | Synthetic data, no auth claim |
   | 2–5 | Offline screening, restart app, reconnect, sync; tap sync twice | worker `persona-chw-alpha1-a` | then export bundle (REL-01) | use SCN-08 queued items | *Saved on this device* vs *Synced*; one record per idempotency key |
   | 5–8 | New flagged case → evidence + `DEMO_RULE_NOT_CLINICALLY_VALIDATED` explanation → decision → referral + follow-up assigned | clinical `persona-clin-alpha1` | import worker bundle; export decision bundle | SCN-02 case | Attributable decision, audit entry |
   | 8–10 | Worker records contact + outcome; clinician confirms completion with evidence | worker → clinical | import/export bundles 02/03 | SCN-05 / SCN-04 | Completion needs evidence, not a reminder |
   | 10–12 | Funnel, timeliness, audit changes; dismissal counted separately | admin `persona-analyst-alpha` | import clinical bundle → counts move | baseline seed | Numbers derived from records |
   | 12–13 | Citizen sees only the approved next step; turns reminders off | citizen `persona-citizen-1` | import bundle 02 | SCN-05 | No score, no diagnosis |
   | 13–15 | District Beta URL as Alpha analyst → 403 + audit; conflict resolution (SCN-09); suppressed cell (SCN-12); Reset demo | admin + worker | — | SCN-11/09/12 | Scope, no silent overwrite, reset reproducible |
   Each row lists exact click paths (route or screen + button labels in EN and RW) and the expected on-screen evidence; click paths reference the app phase IDs that built them (CLN-*, HWM-*, ADM-*, CTZ-*) for maintenance.
3. Include "If it fails" per step: switch to Path B; use fallback bundles in `docs/demo/bundles/`; toggle off fault injection; Reset demo.
4. `NARRATION_GUARDRAILS.md`: never say "approved", "diagnosis", "AI decides", "live sync", "real patient"; always say "illustrative demo rule", "clinician decides", "manual hand-off between isolated apps", "synthetic". Mirrors BRD §8 and tech spec §0/§11.
5. `PRESENTER_CHECKLIST.md`: T-30 run `pnpm demo:preflight`; build/launch apps; phone on same Wi-Fi with Expo Go; set phone language display; disable notifications; faults all off; load demo-15 in each app; T-5 verify banners and EN; after demo: Reset demo in every app.
6. `scripts/demo-preflight.ts` (`pnpm demo:preflight`): checks Node/pnpm versions, ports 5173/5174/8081 free, `createSeed()` hash equals snapshot, fallback bundles validate against `ScenarioBundleSchema`, `pnpm i18n:check` passes, prints the LAN IP and the four start commands.
7. Do a timed dry-run (two people) and record actual timings per step in the script's appendix; trim narration until ≤ 15:00 with Path A.

## 6. Data, state and audit

Uses scenarios and bundles only; no new entities. The script calls out the audit entries visible at each step (decision, referral, access denied, conflict resolved, reset).

## 7. UX states

The script deliberately demonstrates: offline, success, permission denied (WF-04), stale/conflict (WF-02), validation error (dismiss without reason, minute 5–8 optional aside), empty (filter to zero), suppressed values.

## 8. i18n

Add `demo:preset.demo15.title|description` (EN + RW). The script shows RW at minute 0–2 and notes "Kinyarwanda copy pending clinical/linguistic review".

## 9. Acceptance criteria

- [ ] From a clean clone, following only `DEMO_SCRIPT.md` + checklist, a new team member completes Path A in ≤ 15 minutes (dry-run log in appendix).
- [ ] Path B works with zero bundle transfers.
- [ ] `pnpm demo:preflight` exits 0 on a ready machine and non-zero with an actionable message when a port is busy.
- [ ] Every step's "proof point" is observable on screen (validated in dry-run).
- [ ] After "Reset demo" in all four apps, `getDemoState().datasetHash` equals the seed slice hash.

## 10. Tests

`packages/mock-data/src/scenarios/demo-15.test.ts`, `scripts/demo-preflight.test.ts` (port-busy and hash-mismatch branches). The scripted flow is automated where possible in REL-03 (`e2e/web/demo-script.spec.ts` covers the web minutes).

## 11. Verification

```bash
pnpm verify
pnpm demo:preflight
# Manual: run the full script with a stopwatch; record timings in docs/demo/DEMO_SCRIPT.md appendix
```

## 12. Commit

`docs(release): REL-02 15-minute cross-app demo script for isolated mode with preflight and demo-15 preset`
