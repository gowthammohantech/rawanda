# Clinical Web Portal (`@laif/clinical-web`)

Demonstration portal for clinicians, authorised nurse reviewers and facility coordinators.
**All patient data is synthetic. Not for clinical use.** Flags come from illustrative demo rules
(`DEMO_RULE_NOT_CLINICALLY_VALIDATED`) and are never a diagnosis or a treatment recommendation.

## Run

```bash
pnpm install
pnpm --filter @laif/clinical-web dev        # http://localhost:5173/clinical (simulated latency)
pnpm --filter @laif/clinical-web build      # production bundle in dist/
pnpm --filter @laif/clinical-web preview    # serves dist/ on 5173
pnpm --filter @laif/clinical-web test       # Vitest (jsdom)
pnpm --filter @laif/clinical-web test:e2e   # Playwright: E2E build (VITE_LAIF_E2E=1) + vite preview
```

Data lives in this browser only (IndexedDB `laif-clinical`); the language preference is kept in
`localStorage` (`laif.clinical.language`) and applied before the first render.

## Reset

- **Settings › Reset demo** (or **Demo tools › Reset demo** in the top bar) restores the synthetic
  baseline, the audit log and the demo clock (`2026-10-14T06:00Z`, shown in Africa/Kigali time).
  The language preference survives a reset.
- E2E builds (`VITE_LAIF_E2E=1`) expose `window.__laifDemo` (`reset()`, `setFaults(patch)`,
  `getDemoState()`) for Playwright. A normal production build does not contain it.

## Personas (demo role switch — not authentication)

| Persona         | Role                      | Facilities       | Use it for                              |
| --------------- | ------------------------- | ---------------- | --------------------------------------- |
| Zorvel Quorandi | Clinician                 | Alpha-1          | Queue, review, decisions (Scenario 1/2) |
| Quilra Xabezo   | Authorised nurse reviewer | Alpha-2          | Screening amendments (T-06)             |
| Vexqa Zelqiqua  | Facility coordinator      | Alpha-1, Alpha-2 | Referrals, tasks, audit CSV export      |
| Tezrix Vorxoxe  | Clinician                 | Beta-1           | WF-04 counterpart, duplicate identity   |

Switch with the persona menu in the top bar (labelled "Demo role switch — not authentication").

## Demo script (FRD Scenario 1, ~8 minutes)

Start from **Settings › Reset demo**. Everything works with the keyboard only: `Tab` to the
"Skip to main content" link first, `Ctrl/⌘ + K` focuses patient search, `Enter`/`Space` activate,
`Escape` closes dialogs and drawers (focus returns to the control that opened them).

1. **Sign in** as _Zorvel Quorandi_, facility _Demo Health Centre Alpha-1_ → **Review queue**.
   Point out the KPI strip, the tab counts that equal the rows, and "Urgent (demo protocol)".
2. Expand **Xellequ Varqoxe (DEMO-P-0003)** → **Open review**. Show the explainable flag: the
   ruleset chip "Demo ruleset … · not clinically validated", the evidence table (value,
   threshold, status), completeness and provenance.
3. **Start review** → **Record decision** → **Refer**: destination _Alpha-2 (demo)_, reason,
   priority, due date → **Save** → the confirmation names who records it → **Confirm and save**.
   (Double-clicking records one decision only; reload shows "already recorded".)
4. **Persona menu → Vexqa Zelqiqua** (coordinator) → **Referrals** → open the new referral →
   **Accept** → **Schedule** → **Complete**: an empty submit shows field errors; completion
   needs an outcome **and** evidence ("a reminder sent is not evidence").
5. **Persona menu → Zorvel Quorandi** → **Care-team tasks › Awaiting confirmation** → open the
   worker-reported follow-up → **Confirm completion**.
6. **Audit** → _Decisions_ chip → open `review.decided` → **View trail**: review started →
   decided → referral created, in order. As the coordinator, **Export CSV**: the file carries the
   watermark and ids only (no names), and the export itself appears in the log.
7. **Scenario 2 (WF-03)**: open the second pending review → Start → **Dismiss flag with reason**
   → an empty save lists the missing fields (switch to **Ikinyarwanda** to show the translated
   errors) → reason + rationale ≥ 10 characters → confirm: nothing else is created.
8. **WF-04**: paste `/clinical/patients/6ff7ed2e-0175-5c3f-afe9-eb2e0169bb7d` → permission
   denied with no patient data; the attempt is under Audit › _Denied access_.

**Fault simulation** (Settings): _Offline_ — screens keep the last loaded data with "Last updated
hh:mm" and writes are disabled (the decision form keeps a local draft); _Server error 500_ — each
screen shows an error with its code and **Try again**; _Conflict on next write_ — Start review on
WF-01/WF-03 shows the conflict panel; _WF-02_ — "Simulate worker updating follow-up" then reassign
the task to see the conflict dialog.

Repeat the script in **Kinyarwanda** at **1024 px** width: the sidebar becomes an icon rail with
tooltips; below 1024 px it is a drawer behind the menu button, tables become cards and the
decision evidence moves into an "Evidence" disclosure.

## Automated checks

- `e2e/full-pathway.spec.ts` — Scenario 1 end to end, audit-once and privacy checks.
- `e2e/frd-test-cases.spec.ts` — FRD T-01 … T-10, one test each.
- `e2e/a11y.spec.ts` — axe on every route in EN and RW, raw-key and DEMO_RULE checks.
- `e2e/responsive.spec.ts` — 1440 / 1280 / 1024 / 768 (+390 smoke): no horizontal scroll,
  navigation mode, RW clipping; screenshots are attached to the Playwright report.
- `src/__tests__/stateMatrix.test.tsx` — the ten UX states per screen (`AsyncBoundary`).

## Known limitations

- Demo only: no real authentication, no backend; data never leaves the browser.
- Kinyarwanda copy is a draft awaiting clinical/linguistic review (`locales/rw/_review.json`).
  In dev builds a missing RW string falls back to English, is logged once in the console and
  Settings › Language shows a notice; release catalogues are complete (`pnpm i18n:check`).
- The national identity check is a stub ("not connected in this demo").
- Layouts below 768 px are a smoke check only (the spec's minimum for this app is 768 px).
- A typed search text is part of that search's in-memory query key; audit events record only
  its length.
