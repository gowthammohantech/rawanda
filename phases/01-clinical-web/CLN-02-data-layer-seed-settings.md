# CLN-02 — Clinical data layer, scenario seed and Settings (reset, language, fault simulation)

## 1. Header

| Field | Value |
|---|---|
| ID | CLN-02 |
| Title | Repository wiring, query keys, error mapping, clinical scenario seed, Settings page |
| App | Clinical Web Portal |
| Depends on | CLN-01; FND-05 (`SEED_ANCHORS`), FND-07 (repository, faults, `demo.*`), FND-08 (Dexie adapter) |
| Trace | FRD §6 (idempotency, `If-Match`, error codes), FRD §2 "Exceptions" (all CL-xx), CL-08; spec §4 (Mode A, fault simulation), §10 (seed, `Reset demo`); WF-01..WF-04 (clinical part); D3; Implementation_notes (saved language preference) |
| Size | L |
| Status | Done |

## 2. Goal

The clinical app runs on its **own isolated Dexie database** seeded from a self-contained clinical scenario that exercises WF-01 (from review onward), WF-02 (follow-up version conflict), WF-03 (dismissal) and WF-04 (cross-facility scope). A Settings page lets a presenter reset the demo to the exact baseline, switch language (persisted), and toggle simulated transport faults (latency, timeout, 500, offline, conflict) — so every later phase can demonstrate its error states.

## 3. Scope

**In scope**: repository provider; TanStack Query key factory; typed error mapping; `useIdempotentMutation`; `useAuditedRead`; offline/fault banner; clinical scenario seed + stable scenario IDs; Settings route; "simulate another actor" demo action for WF-02.
**Out of scope**: any feature screen (CLN-03+); cross-app export/import (REL track).

## 4. Deliverables

| Path | Purpose |
|---|---|
| `apps/clinical-web/src/data/repository.ts` | Reuse FND-11 `createAppRepository()` (Dexie `laif-clinical`); no second factory |
| `src/data/RepositoryProvider.tsx`, `useRepository.ts` | Context; tests inject in-memory impl |
| `src/data/queryKeys.ts` | `clinicalKeys` factory (below) |
| `src/data/errors.ts` | `toClinicalError(e)` → `{ code: 'VALIDATION_ERROR'|'FORBIDDEN'|'NOT_FOUND'|'CONFLICT'|'DEPENDENCY_UNAVAILABLE'|'OFFLINE'|'TIMEOUT', fieldErrors?, latest? }` |
| `src/data/useIdempotentMutation.ts` | Wraps `useMutation`; one idempotency key per *form session* (`crypto.randomUUID()` at mount, rotated only after success); blocks re-entry while pending |
| `src/data/useAuditedRead.ts` | Emits a sensitive-read audit event once per entity per mount |
| `src/components/ConnectionBanner.tsx` | Shows `OfflineBanner` / "Simulated faults active" pill when any fault toggle is on |
| `src/features/settings/SettingsPage.tsx` | `/clinical/settings` |
| `src/features/settings/{ResetDemoCard,LanguageCard,FaultSimulationCard,ScenarioCard}.tsx` | Settings sections |
| — | Seed anchors come from FND-05 `SEED_ANCHORS` (no `buildClinicalSeed`) |

`clinicalKeys` (built on FND-07 `queryKeys`; all scoped by facility so a facility switch never shows stale data):
```ts
clinicalKeys = {
  all: (fac) => ['clinical', fac] as const,
  patients: (fac, f) => ['clinical', fac, 'patients', f],
  patient: (fac, id) => ['clinical', fac, 'patient', id],
  screenings: (fac, patientId) => ['clinical', fac, 'screenings', patientId],
  reviews: (fac, f) => ['clinical', fac, 'reviews', f],
  reviewCounts: (fac, f) => ['clinical', fac, 'reviewCounts', f],
  review: (fac, id) => ['clinical', fac, 'review', id],
  referrals: (fac, f) => ['clinical', fac, 'referrals', f],
  followUps: (fac, f) => ['clinical', fac, 'followUps', f],
  workers: (fac) => ['clinical', fac, 'workers'],
  audit: (fac, f) => ['clinical', fac, 'audit', f],
}
```

## 5. Implementation tasks

1. **Repository surface check.** FND-07 already delivers every method this track uses: `listPatients`, `getPatient`, `listScreenings({ patientId })`, `amendScreening`, `listReviews`, `countReviews`, `getReview`, `startReview`, `decideReview`, `createReferral`, `listReferrals`, `countReferrals`, `transitionReferral`, `listFollowUps`, `countFollowUps`, `createFollowUp`, `updateFollowUp`, `listWorkers(facilityId)`, `recordAuditEvent`, `listAuditEvents`, `demo.resetDemo()`, `demo.setFaults(cfg)`, `demo.simulateExternalUpdate(entityType, id, patch, actorPersonaId)`. Every mutation is `method(input, idempotencyKey)` with `expectedVersion` **inside** the input; the actor comes from `deps.getActor()` (never a parameter); scope is enforced inside the repository; the result is FND-03 `WriteResult<T>` (`data`, `eventId`, `entityVersion`, `updatedAt`, `auditEventId`, `replayed`). Only if a method is genuinely missing, add it to FND-07's services with contract tests (and note it in the commit).
2. **Clinical seed** = FND-05 `sliceForApp(seed, 'clinical')` (full base seed, pinned clock `2026-10-14T06:00:00.000Z`). The clinical scenarios below are FND-05 `SEED_ANCHORS` (already delivered; if one is missing, add it in `packages/mock-data/src/anchors.ts`, not in a clinical-only seed):
   - `WF01_FLAGGED_REVIEW` — Facility Alpha-1, submitted flagged screening (BP + glucose, units present), review `pending`, assigned to the clinician persona (WF-01 steps 5–7).
   - `WF01_WORKER_COMPLETED_FU` — follow-up already `completed` by worker with outcome, awaiting clinician confirmation (WF-01 step 7).
   - `WF02_FOLLOWUP_CONFLICT` — open follow-up (version 3) the demo action bumps to version 4 as `worker-persona (simulated)`.
   - `WF03_DISMISSABLE_FLAG` — flagged review whose evidence includes a reading repeated after rest (good candidate for dismissal).
   - `WF04_OTHER_FACILITY_PATIENT` — patient + review in Facility Beta-1 (District Beta), invisible to Alpha-1 personas.
   - `MISSING_UNIT_SCREENING` — glucose value without unit → completeness `INCOMPLETE`, rule not evaluated.
   - `DUPLICATE_IDENTITY_PAIR` — two patients with similar name + DOB, `possibleDuplicateOf` link.
   - `AMENDED_SCREENING` — screening with one amendment (original retained, reason, author).
   - `OVERDUE_REFERRAL`, `CANCELLED_REFERRAL`, `COMPLETED_REFERRAL_WITH_EVIDENCE`, `OVERDUE_FOLLOWUP`, `UNABLE_TO_REACH_FOLLOWUP`.
   - Seed baseline audit events so the audit explorer is non-empty.
   Every rule-flag fixture carries `rulesetVersion: 'demo-ruleset-2026.10-v1'` and `displayDisclaimer: 'DEMO_RULE_NOT_CLINICALLY_VALIDATED'` (FND-05 guarantees this).
3. App bootstrap: FND-11 `repo.demo.ensureSeeded()` (seeds when `seedVersion` absent or mismatched).
4. `useIdempotentMutation({ mutationFn, invalidate })`: passes `idempotencyKey` + `expectedVersion`; on `CONFLICT` does **not** retry and surfaces `error.latest`; on `TIMEOUT`/`OFFLINE`/`DEPENDENCY_UNAVAILABLE` retries with the **same** key (manual retry button; no auto-retry for mutations); exposes `isSubmitting` for button disabling.
5. Query client defaults: `retry: 1` for reads (not for `FORBIDDEN`/`NOT_FOUND`), `staleTime: 15s`, `refetchOnWindowFocus: true`.
6. Settings page (`demo.reset` for reset/faults — every role has it per FND-06; language card for everyone):
   - **Reset demo**: `ConfirmDialog` ("This restores the synthetic baseline, audit log and demo clock") → `resetDemo` → `queryClient.clear()` → session cleared if persona/facility no longer valid → toast. Emits `demo.reset` *after* reset as first new event.
   - **Language**: EN / RW radio, persisted through `@laif/i18n` preference store (localStorage), survives reload and reset.
   - **Fault simulation**: toggles + latency slider (0–3000 ms) → `repository.demo.setFaults()` (FND-07 `FaultConfig`; persisted by FND in store meta, not sessionStorage); emits `demo.fault_toggled`.
   - **Scenario actions**: "Simulate worker updating follow-up (WF-02)" → `repository.demo.simulateExternalUpdate('followUp', SEED_ANCHORS.WF02_FOLLOWUP_CONFLICT, …, 'persona-chw-alpha1-a')`; emits `demo.concurrent_update_simulated` labelled *simulated actor*.
7. `ConnectionBanner` mounted in shell under `RoleBanner`.

## 6. Data, state and audit

- Writes: whole DB on reset; fault config; audit.
- Audit: `demo.reset`, `demo.fault_toggled`, `demo.concurrent_update_simulated`.
- Invariants: reset is byte-for-byte deterministic (same IDs, timestamps, audit baseline); no real names/IDs; seeded facilities labelled "(demo)"; repository rejects any mutation without idempotency key.

## 7. UX states

Loading: settings skeleton. Success: toast `Demo reset to baseline`. Server error: reset failure → `ErrorState` with retry, DB untouched (transactional). Permission denied: N/A for reset (all roles); language card always available. Offline: banner "Simulated offline — changes cannot be saved". Empty/conflict: N/A.

## 8. i18n

Namespaces: `clinical.settings`, `clinical.errors` (extended), `validation` (shared, FND).
Keys: `clinical.settings.reset.title|body|confirm|success`, `clinical.settings.language.title|en|rw|savedNotice`, `clinical.settings.faults.latency|timeout|serverError|offline|conflict|activeBadge`, `clinical.settings.scenario.simulateWf02`, `clinical.errors.CONFLICT|FORBIDDEN|NOT_FOUND|VALIDATION_ERROR|DEPENDENCY_UNAVAILABLE|OFFLINE|TIMEOUT` (title + body + action). RW drafts flagged `needs linguistic review`. Error-code copy must never expose internal stack text.

## 9. Acceptance criteria

- [ ] Fresh browser → DB `laif-clinical` seeded; all clinical `SEED_ANCHORS` resolvable via repository.
- [ ] Two consecutive resets produce identical DB snapshots (`hashDb()` equal).
- [ ] Language choice survives reload and demo reset.
- [ ] With "Server 500" on, a read shows `ErrorState`; toggling off + retry recovers.
- [ ] Mutation helper with the same idempotency key called twice → one entity, one change audit event (plus one `sync.duplicate_suppressed`), second result `replayed: true`.
- [ ] Cross-facility repository call returns `FORBIDDEN` and appends `access.denied` (repository-level, T-02).
- [ ] Every clinical persona can reset (FND-06: demo tooling, not a privilege); the reset is audited with the actor.

## 10. Tests

- `src/data/__tests__/anchors.test.ts` — every clinical `SEED_ANCHORS` entry is reachable through the clinical repository with the expected state.
- (FND-07 contract suite already covers idempotency, `CONFLICT` and scope `FORBIDDEN`; extend it only for methods added here.)
- `src/data/__tests__/useIdempotentMutation.test.tsx` — key stability, double click → one call, same-key retry after timeout.
- `src/data/__tests__/errors.test.ts` — mapping.
- `src/features/settings/__tests__/SettingsPage.test.tsx` — reset confirm, fault toggles, permission split.
- `e2e/settings-reset.spec.ts` — reset restores baseline counts.

## 11. Verification

```bash
pnpm --filter @laif/mock-data test && pnpm --filter @laif/repositories test
pnpm --filter @laif/clinical-web typecheck && pnpm --filter @laif/clinical-web lint && pnpm --filter @laif/clinical-web test
pnpm --filter @laif/clinical-web test:e2e -- settings-reset
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```
Manual: sign in as coordinator → Settings → toggle "Simulated offline" → banner appears → toggle off → Reset demo → confirm → toast → switch to RW → reload → still RW.

## 12. Commit

`feat(clinical): CLN-02 clinical data layer, scenario seed and settings`
