# REL-05 — Release-gate checklist, release docs and top-level README

**Status:** Planned

## 1. Header

| Field | Value |
|---|---|
| ID | REL-05 |
| Title | Release gates + README |
| App | Repository root, `docs/release/`, `scripts/` |
| Depends on | REL-01 … REL-04 |
| Trace | Tech spec §9 release gates, §8 acceptance checklist, §13 definition of done, §11 limitations, §16 traceability; FRD §9 DoD (runbook, permissions matrix, data dictionary, known limitations); BRD §10 Gate 0 |
| Size | S |

## 2. Goal

One command (`pnpm verify:release`) and one checklist decide whether the prototype is demo-ready (BRD Gate 0), and a newcomer can clone the repo and run all four apps from the top-level README in under 15 minutes, understanding exactly what the prototype is and is not.

## 3. Scope

**In scope:** release-gate checklist with evidence links, aggregate verification script, generated permissions matrix and data dictionary, known-limitations doc, runbook, root `README.md` (currently a one-line placeholder), marking phases Done.

**Out of scope:** Gate 1/Gate 2 activities (protocol approval, DPIA, hosting) — listed as not-started, never claimed.

## 4. Deliverables

```text
README.md                               # replaces "# rawanda"
docs/release/RELEASE_GATES.md           # checklist with evidence
docs/release/KNOWN_LIMITATIONS.md
docs/release/RUNBOOK.md                 # setup, run, reset, troubleshoot, device demo
docs/release/PERMISSIONS_MATRIX.md      # generated
docs/release/DATA_DICTIONARY.md         # generated
docs/release/TRACEABILITY.md            # FRD IDs → phase IDs → tests
scripts/gen-permissions-matrix.ts       # from @laif/auth-demo ROLE_PERMISSIONS
scripts/gen-data-dictionary.ts          # from @laif/contracts via z.toJSONSchema
scripts/gen-traceability.ts             # parses phases/**/*.md headers + test titles containing trace IDs
package.json                            # scripts: verify:release, docs:gen, demo:preflight, privacy:scan, i18n:check
```

## 5. Implementation tasks

1. `pnpm verify:release` = `pnpm verify && pnpm i18n:check && pnpm privacy:scan && pnpm docs:gen --check && pnpm test:e2e && pnpm demo:preflight`. `docs:gen --check` fails if generated docs are stale.
2. **RELEASE_GATES.md** — one row per gate with *evidence* (command, test file, or checklist link) and a status box:
   - Spec §9 gates: 0 critical flow blockers; all P0 scenarios pass (12 scenarios × owning app); offline queue survives restart (Maestro evidence + `persistence-reopen.test.ts`); no unreviewed clinical recommendation (citizen-readonly spec + rules engine no-diagnosis test); no real personal data (`privacy:scan`); export suppression works (suppression spec); complete demo script reproducible from a clean seed (REL-02 dry-run log).
   - Spec §8 checklist: 12 rows, each → spec file/test title.
   - Spec §13 DoD per feature: reachable from nav, persistent synthetic records, happy + failure states, permissions + audit tested, accessible + responsive, ≥ 1 automated test, traced to PRD/FRD ID, no implied clinical validation — evaluated per app track using `TRACEABILITY.md`.
   - Cross-cutting P0: EN⇄RW in all four apps incl. offline, persisted preference, translated validation, fallback (`language.spec.ts`, `coverage.test.ts`); `DEMO_RULE_NOT_CLINICALLY_VALIDATED` visible wherever a flag is shown; demo banner on every screen; Reset demo restores exact baseline in all four apps.
   - BRD Gate 0 statement: "synthetic records, validated workflows, security tests (simulated)". Gate 1/2 rows listed as **Not started — requires Ministry/clinical/legal approval**.
3. **KNOWN_LIMITATIONS.md**: isolated apps, no live sync (D3) and manual bundles; Rwanda Law No. 058/2021 obligations named in the LAIF MoH proposal p. 12 are **not** implemented by the prototype (in-country hosting, DPO, 48 h breach notification to NCSA, data portability, erasure, encryption at rest/in transit) — listed as Gate 1/2 dependencies; LAIF proposal features deliberately not built (predictive/forecast indices, wallet risk indicators and nudges, medication-conflict detection, NIDA e-ID handshake, FHIR/EHR/lab/pharmacy ingest, national heatmap, public safety dashboard, citizen reporting of medicines/allergies/symptoms — BRD BR-11/BR-12 "Later", tech spec §11 exclusions); role switch is not authentication; browser/SQLite storage not encrypted and not for real data; audit log not tamper-proof (FNV hash, not cryptographic); demo thresholds are illustrative; Kinyarwanda copy unvalidated; Expo web uses IndexedDB not SQLite; no NIDA/EHR/SMS/FHIR; reminder delivery simulated; device revocation simulated; small-cell threshold not policy-approved.
4. **Generated docs**: permissions matrix (roles × permissions + scope kinds); data dictionary (every entity: field, type, required, enum values, description from `.describe()` — add `.describe()` calls to contracts where missing); traceability (CL/HW/PA/CW IDs → phase files → test files).
5. **README.md** (root) sections: what this is (one paragraph + safety banner text), the four apps table (stack, port/how to open, primary persona), prerequisites (mise, Node 22, pnpm 10, Expo Go on phone, same Wi-Fi), quick start (`mise install`, `pnpm install`, `pnpm dev:clinical` → `http://localhost:5173/clinical/login`, `pnpm dev:admin` → `http://localhost:5174/admin/overview`, `pnpm dev:worker` / `pnpm dev:citizen` → scan QR or press `w` for web), demo tools (reset, faults, scenarios, bundle hand-off), running tests (`pnpm verify`, `pnpm test:e2e`, `pnpm verify:release`), repo layout, links to `phases/README.md`, demo script, release gates, limitations, ADRs. No claims of approval or compliance.
6. **RUNBOOK.md**: clean install, clearing IndexedDB / Expo app data, port conflicts, Metro cache (`expo start -c`), LAN issues, resetting a broken demo, regenerating bundles.
7. Fill every gate's status by running the evidence; any failing gate blocks the commit and is fixed in the owning phase's area (record which).
8. Set `Status: Done` in every completed phase file across `phases/` (FND, CLN, HWM, ADM, CTZ, REL) after confirming its acceptance criteria; leave unfinished ones explicitly `Blocked` with reason.

## 6. Data, state and audit

No product data changes. Generated docs derive from code (single source of truth).

## 7. UX states

Not applicable (documentation and scripts). The README screenshots (optional) must show the demo banner.

## 8. i18n

README and release docs are English. `i18n:check` is part of `verify:release`; the gate table includes the count of RW keys still marked `needs clinical/linguistic review` (reported, not blocking — it is an approval dependency).

## 9. Acceptance criteria

- [ ] `pnpm verify:release` exits 0 on a clean clone.
- [ ] Every row in `RELEASE_GATES.md` has evidence and a status; no §9 gate is unchecked.
- [ ] Following only `README.md`, a new developer runs all four apps (two in browser, two in Expo Go or Expo web) within 15 minutes.
- [ ] `pnpm docs:gen --check` passes; changing a role permission without regenerating fails it.
- [ ] README and docs contain none of the forbidden claims from REL-02 `NARRATION_GUARDRAILS.md` (grep test).
- [ ] All phase files carry a final status.

## 10. Tests

`scripts/gen-permissions-matrix.test.ts`, `scripts/gen-data-dictionary.test.ts`, `scripts/gen-traceability.test.ts`, `scripts/docs-claims.test.ts` (forbidden-phrase grep over `README.md` and `docs/release/*`).

## 11. Verification

```bash
rm -rf node_modules && pnpm install
pnpm verify:release
pnpm docs:gen --check
# Manual: fresh-clone walkthrough of README.md with a stopwatch
```

## 12. Commit

`docs(release): REL-05 release-gate checklist, generated permissions/data docs and top-level README`
