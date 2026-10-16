# REL-04 — Accessibility pass and privacy assertions

**Status:** Planned

## 1. Header

| Field | Value |
|---|---|
| ID | REL-04 |
| Title | axe + manual a11y pass; automated privacy assertions |
| App | All four apps; `e2e/`; `scripts/` |
| Depends on | REL-03 |
| Trace | Tech spec §7 (AA, keyboard, focus, screen reader, touch targets), §9 accessibility + privacy, §10 watermark, §11 boundaries; BR-07, BR-08; FRD §7; README non-negotiables |
| Size | M |

## 2. Goal

Every screen in all four apps passes automated axe checks with zero serious/critical issues and a documented keyboard and screen-reader walkthrough; and the build mechanically proves the privacy promises: only synthetic data, no third-party network requests or telemetry, no patient names in logs, small cells suppressed, every export and screenshot watermarked.

## 3. Scope

**In scope:** axe Playwright sweep of every route/screen in EN and RW; keyboard-only and focus-order checks; manual VoiceOver/TalkBack checklist with evidence; contrast verification; privacy specs and static scans; fixes for findings.

**Out of scope:** formal WCAG audit by a third party; penetration testing (spec §11 pre-pilot).

## 4. Deliverables

```text
e2e/a11y/routes.ts                     # list of every web route + Expo web screen with setup steps (scenario, persona)
e2e/a11y/axe-sweep.spec.ts             # @axe-core/playwright, tags wcag2a, wcag2aa, wcag21aa, wcag22aa
e2e/a11y/keyboard.spec.ts              # tab order, focus visible, skip link, dialog trap/return, no keyboard traps
e2e/a11y/reflow.spec.ts                # 320 px width / 200% zoom: no horizontal scroll on main content
e2e/privacy/no-external-requests.spec.ts
e2e/privacy/no-phi-in-console.spec.ts
e2e/privacy/watermarks.spec.ts         # banner on every route; CSV + bundle watermark; screenshot contains banner
e2e/privacy/suppression.spec.ts        # SCN-12 across overview, funnel, workload, CSV, drill-down
scripts/privacy-scan.ts                # `pnpm privacy:scan`
docs/qa/A11Y_CHECKLIST.md              # manual walkthrough results (web keyboard + NVDA/VoiceOver; native TalkBack/VoiceOver; large text)
docs/qa/PRIVACY_ASSERTIONS.md          # each assertion → test/scan that proves it
```

## 5. Implementation tasks

1. **axe sweep**: for each entry in `routes.ts` (all tech spec §2 routes/screens + key dialogs open: decision dialog, confirm reset, scenario transfer, conflict card), in EN and RW, at 1280 and 390 widths, run `new AxeBuilder({ page }).withTags([...]).analyze()`; fail on `serious`/`critical`; `moderate` written to `docs/qa/evidence/axe-moderate.json` for triage. Expo web screens included (RN-web output approximates native semantics; native-only checks are manual).
2. **Keyboard spec**: skip link moves focus to `#main`; every interactive element reachable in DOM order; focus ring visible (computed outline ≠ none); Escape closes dialogs and returns focus; queue row open via Enter; tabs via arrow keys; no element with positive `tabindex`.
3. **Non-colour cues**: test that every `[data-testid^="status."]` chip has non-empty text and an svg icon; urgency/overdue rows include text, not colour only.
4. **Contrast**: re-run `tokens.contrast.test.ts` (FND-09) and native parity; axe covers rendered pairs.
5. **Manual checklist** (`A11Y_CHECKLIST.md`): web with keyboard + NVDA (Windows) or VoiceOver (macOS) on clinical review → decision and admin overview; native with TalkBack + VoiceOver on worker screening form, sync center, citizen next steps; largest system font size; RW language with screen reader (note pronunciation limitation). Record pass/fail + screenshots in `docs/qa/evidence/`.
6. **No external requests**: in every Playwright project, `context.route('**/*', …)` records requests; fail on any host other than `localhost`/`127.0.0.1` (catches Google Fonts, CDNs, analytics). Expo web build checked the same way.
7. **No telemetry**: `privacy:scan` fails if the lockfile contains known analytics/telemetry SDKs (`@sentry/*`, `posthog-*`, `mixpanel*`, `@segment/*`, `@amplitude/*`, `firebase`, `@datadog/*`, `expo-insights`); all Expo scripts export `EXPO_NO_TELEMETRY=1`.
8. **No PHI in logs**: `no-phi-in-console.spec.ts` collects `console.*` and `pageerror` output through the main workflows and fails if any seeded `displayName`, `syntheticIdentifier` or `dateOfBirth` appears. Unit-level: repositories/analytics never log entities (grep test for `console.` in `packages/*/src` outside i18n dev missing-key logger).
9. **Synthetic-only scan** (`privacy:scan`): scans seed output, `docs/demo/bundles/*.json`, and built `dist/` assets for 16-digit national-ID-like numbers, `+250 7xx` / `07xx xxx xxx` phone patterns, emails not ending `@example.org`, and the realistic names present in `PrototypeFourApplications-main/src/App.tsx` (ensures they were not ported); every bundled entity has `synthetic: true`.
10. **Watermarks**: banner text present on every route (loop over `routes.ts`); CSV first line and bundle `watermark` field asserted; `page.screenshot()` of each main screen followed by DOM assertion that banner is within the captured viewport (sticky top).
11. **Suppression**: SCN-12 cell shows "Suppressed (<5)" in KPI strip, funnel, workload table, drill-down and CSV; complementary suppression prevents deriving it from totals (assert the complementary cell is also suppressed).
12. Fix all findings in the owning app/package; list fixes in the commit body with the affected phase IDs (CLN-*, HWM-*, ADM-*, CTZ-*, FND-09/10).

## 6. Data, state and audit

Read-only checks plus fixes. Export assertions also verify an `export.generated` audit event with persona, scope and reason.

## 7. UX states

axe sweep explicitly renders: empty, validation error, server error, permission denied, offline, conflict and success states (via scenarios/fault toggles) — not only the happy path.

## 8. i18n

Sweep runs in RW too (long strings, `lang="rw"` on `<html>`); checks no missing `lang` attribute and no raw keys. Missing a11y labels found here get EN + RW keys.

## 9. Acceptance criteria

- [ ] axe: 0 serious/critical violations across all routes/screens, EN + RW, 1280 + 390.
- [ ] Keyboard spec green; manual checklist completed with evidence for web and both native apps.
- [ ] Zero non-localhost requests in all E2E projects.
- [ ] `pnpm privacy:scan` exits 0; deliberately adding a fake `+250 78…` number to a fixture makes it fail.
- [ ] No seeded patient identifier appears in captured console output.
- [ ] SCN-12 value never rendered as a number anywhere in admin UI or CSV.
- [ ] Every route shows the DEMONSTRATION banner; every CSV/bundle carries the watermark.

## 10. Tests

All files in Deliverables, plus `scripts/privacy-scan.test.ts`.

## 11. Verification

```bash
pnpm verify
pnpm test:e2e -- e2e/a11y e2e/privacy
pnpm privacy:scan
# Manual: complete docs/qa/A11Y_CHECKLIST.md on a phone with TalkBack/VoiceOver and largest font
```

## 12. Commit

`test(release): REL-04 axe and keyboard accessibility pass with automated privacy and watermark assertions`
