# REL-01 — Scenario export/import JSON bundle (manual cross-app hand-off)

**Status:** Planned

## 1. Header

| Field | Value |
|---|---|
| ID | REL-01 |
| Title | Scenario bundle export/import |
| App | All four apps + `packages/contracts`, `packages/repositories`, `packages/ui-web`, `packages/ui-native` |
| Depends on | FND-11; all P0 phases of CLN-*, HWM-*, ADM-*; CTZ-* phases that create correction requests / show next steps |
| Trace | README D3 ("labelled scenario export/import (JSON)"); tech spec §1 important limitation, §4 Mode A, §6 WF-01 steps 4–9, §10 ("Synthetic demonstration data" on exports) |
| Size | M |

## 2. Goal

A presenter can move demo work between the isolated apps by hand: export the worker's synced screening as a labelled `.laif.json` file, import it into the clinical portal (a new flagged case appears in the queue), export the clinician's decision/referral back to the worker and citizen apps, and import it into the admin dashboard so its funnel recalculates. Every bundle is visibly synthetic, validated, previewed before applying, conflict-aware and audited.

## 3. Scope

**In scope:** bundle schema, export/preview/apply in the repository, UI entry in each app's demo tools, file + clipboard transport on web and native, pre-generated fallback bundles.

**Out of scope:** live sync, network transfer, QR codes, bundle encryption; patient-level export from the admin dashboard (prohibited — admin is import-only).

## 4. Deliverables

```text
packages/contracts/src/scenario-bundle.ts     # ScenarioBundleSchema, BUNDLE_FORMAT, BUNDLE_WATERMARK, ImportPreview, ImportResolution
packages/repositories/src/demo/bundle.ts      # exportBundle, previewImport, applyImport
packages/ui-web/src/components/ScenarioTransferDialog.tsx
packages/ui-native/src/components/ScenarioTransferSheet.tsx
apps/clinical-web, apps/programme-admin       # DemoToolsMenu → "Export scenario…" / "Import scenario…"
apps/worker-mobile, apps/citizen-wallet       # Settings → Demo tools → same
scripts/generate-demo-bundles.ts              # writes docs/demo/bundles/*.laif.json from the seed (deterministic)
docs/demo/bundles/                            # 4 pre-generated fallback bundles (task 7)
```

## 5. Implementation tasks

1. **Schema** (`ScenarioBundleSchema`, Zod):
   ```ts
   { format: z.literal('laif-careconnect-scenario-bundle'), formatVersion: z.literal(1),
     watermark: z.literal('SYNTHETIC DEMONSTRATION DATA — NOT FOR CLINICAL USE'),
     bundleId: uuid, exportedAt: IsoUtc, exportedByPersonaId, sourceApp: AppId,
     seedVersion: z.literal('seed-v1'), demoClockIso, rulesetVersion, note: z.string().max(200),
     records: { patients, screenings, reviews, referrals, followUps, careTasks, careInstructions,
                reminderPreferences, auditEvents },          // arrays of the FND-03 entity schemas
     checksum: z.string() }                                   // fnv1a64Hex(canonicalJson(records))
   ```
   Max 2 MB; every record must have `synthetic: true`.
2. **Export rules per app** (privacy-minimal — decision):
   | App | Can export | Selection UI |
   |---|---|---|
   | worker-mobile | acknowledged (synced) screenings + follow-up updates + newly registered patients | pick patients with recent activity |
   | clinical-web | reviews, referrals, follow-ups, care tasks, **released** care instructions (+ referenced patient and screening records) | pick from queue/patient list |
   | citizen-wallet | only the linked patient's `correction_request` tasks and reminder preference | single button |
   | programme-admin | **nothing** (import only) | export item hidden |
   Audit events included = those whose `entityId` is in the exported set. Pending (unsynced) worker ops are **not** exported — the bundle represents "what the server would have", keeping WF-02 semantics honest.
3. **Preview** `repo.demo.previewImport(bundle) → ImportPreview`: validate schema + checksum + `seedVersion`; classify each record `new`, `newer` (incoming version > local), `identical`, `older`, or `conflict` (same version with different hash, or local newer with different content); counts per collection; in citizen-wallet drop everything not about the linked patient and all unreleased instructions (reported as `filtered`).
4. **Apply** `repo.demo.applyImport(bundle, resolutions: Record<recordId, 'take_incoming' | 'keep_local'>, idempotencyKey)` in one transaction: write `new`/`newer`, apply conflict resolutions (default `keep_local`), never write `older`; in the worker app also mirror into `remote_*` so the next sync reports no false conflicts; append imported audit events (dedupe by ID) plus one `demo.bundle_imported` event (`changeSummary` = counts, `justification` = bundle note). Idempotent on `bundleId`. Export emits `demo.bundle_exported`. Requires `demo.scenario.transfer`.
5. **Integrity on import:** records are imported as stored states (not replayed), but every status must be a member of its FND-02 machine and every reference must resolve (screening → patient, review → screening, …); otherwise the record is rejected and the reason shown in the preview.
6. **UI.** Web `ScenarioTransferDialog` (Radix dialog with `Stepper`: 1 Choose → 2 Preview → 3 Done): export = selection + optional note → download `careconnect-<sourceApp>-<YYYYMMDD-HHmm>.laif.json` and "Copy JSON"; import = file input or paste → preview `AccessibleDataTable` with per-record conflict `ExpandableRow` (local vs incoming, ref image 6) → Apply. Native `ScenarioTransferSheet`: export via `expo-file-system` + `expo-sharing`; import via `expo-document-picker` or paste (`expo-clipboard`). Both show the watermark and a "manual hand-off — not live sync" explainer.
7. **Fallback bundles** (`pnpm demo:bundles` → `scripts/generate-demo-bundles.ts`), deterministic from seed + scenario setups so the demo survives a misbehaving device: `01-worker-new-flagged-screening.laif.json`, `02-clinical-referral-created.laif.json` (decision + referral + follow-up assigned to `persona-chw-alpha1-a` + released instruction for `persona-citizen-1`'s patient), `03-worker-follow-up-completed.laif.json` (contact + outcome + completion evidence), `04-citizen-correction-request.laif.json`. Committed; a test regenerates and diffs.

## 6. Data, state and audit

Reads/writes all pathway collections; audit `demo.bundle_exported`, `demo.bundle_imported` (category `demo`). Invariants: no import lowers a version; no unreleased instruction reaches the citizen app; admin never exports records; imported data passes contracts schemas.

## 7. UX states

Initial (choose export/import), loading (parsing/applying), loaded (preview), empty (nothing selectable / nothing new), validation error (bad JSON, wrong format, checksum mismatch, other seed version — each translated), permission denied (no `demo.scenario.transfer`), stale/conflict (per-record resolution), success (toast with counts + link to affected screen), server error (storage failure).

## 8. i18n

Namespace `demo:bundle.*`: titles, steps, classification labels, errors (`invalidFormat`, `checksumMismatch`, `seedMismatch`, `tooLarge`, `filteredForCitizen`), watermark and hand-off explainers. EN + RW (RW flagged for review).

## 9. Acceptance criteria

- [ ] Worker export → clinical import: the screening appears in `/clinical/queue` as pending with its demo flag explanation.
- [ ] Clinical export → worker import: the assigned follow-up appears in worker *My tasks*; the next worker sync reports no conflict.
- [ ] Clinical export → admin import: funnel `flagged`/`referred` counts rise by the imported amounts.
- [ ] Clinical export → citizen import: only the linked patient's released instruction appears; preview shows the filtered count.
- [ ] Re-importing the same bundle changes nothing and reports all `identical`.
- [ ] Tampered checksum, wrong `seedVersion`, or `synthetic: false` → rejected, nothing written.
- [ ] Admin dashboard exposes no record-export action.
- [ ] Fallback bundles are byte-identical across two generator runs.

## 10. Tests

`packages/contracts/src/scenario-bundle.test.ts`, `packages/repositories/src/demo/bundle.test.ts` (export rules per app, preview classes, apply idempotency, citizen filter, remote mirror), `packages/ui-web/src/components/ScenarioTransferDialog.test.tsx`, `packages/ui-native/src/components/ScenarioTransferSheet.test.tsx`, `scripts/generate-demo-bundles.test.ts`. The cross-app E2E lives in REL-03 (`e2e/web/scenario-transfer.spec.ts`).

## 11. Verification

```bash
pnpm verify
pnpm demo:bundles && git diff --exit-code docs/demo/bundles
pnpm dev:clinical   # Demo tools → Import → docs/demo/bundles/01-worker-new-flagged-screening.laif.json → preview → apply → queue shows new case
pnpm dev:admin      # import 02-… → overview funnel changes; no export-records action
```

## 12. Commit

`feat(release): REL-01 watermarked scenario bundle export/import for manual cross-app hand-off`
