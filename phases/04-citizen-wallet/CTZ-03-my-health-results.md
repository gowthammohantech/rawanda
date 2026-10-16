# CTZ-03 — My health: released results in plain language

## 1. Header

| Field | Value |
|---|---|
| ID | CTZ-03 |
| Title | My health — read-only, clinician-released screening results with plain-language labels |
| App | Citizen Health Wallet |
| Depends on | CTZ-02 |
| Trace | CW-02; WF-03 step 5; Tech spec §2.4 "My health", §2.4 exclusion (no wellness score/forecast/recommendation), §11 deferred wellness scoring; PRD §6 "avoid presenting clinical flags as diagnoses; show review status and responsible professional"; T-01, T-02, T-10 (citizen variant) |
| Size | M |
| Status | Planned |

## 2. Goal

The citizen opens **My health** and sees their screening results that a clinician has released, each with the measured values and units, the date and facility, who reviewed it, and one calm plain-language sentence about what it means for them ("Your care team wants to see you again" / "No action needed right now"). A result still waiting for review is shown only as "A recent check is waiting for your care team" without values. A dismissed flag is never shown as a problem. There is no score, forecast, trend judgement or advice.

## 3. Scope

**In scope:** results list, result detail, pending-review placeholder, "Understand my result" explainer sheet (generic, non-clinical), access-event logging, representative view (CTZ-P4 sees Grace's results with a "Viewing for Grace K." banner).

**Out of scope:** charts/trends (deliberately excluded to avoid implied interpretation), numerical wellness score, risk forecast, reference ranges or thresholds (not approved — FRD §4), any free-text clinician notes.

## 4. Deliverables

- `app/(app)/(tabs)/health/index.tsx` — list.
- `app/(app)/(tabs)/health/[observationId].tsx` — detail.
- `src/features/health/ResultCard.tsx`, `ResultDetail.tsx`, `PendingReviewCard.tsx`, `ReviewProvenance.tsx` (reviewer name, role, released date), `ReadingValue.tsx` (value + unit, large type, `accessibilityLabel` "Blood pressure 152 over 96 millimetres of mercury"), `UnderstandResultSheet.tsx`, `RepresentativeBanner.tsx`.
- `src/features/health/useResults.ts` (query hooks over `repo.listReleasedObservations` / `getObservation`).
- `src/features/health/__guards__/noScore.ts` — lint-style unit helper used by tests to assert no forbidden copy keys.

## 5. Implementation tasks

1. List header: eyebrow `MY HEALTH` (mono micro-label), title "Muraho, {firstName}" (RW greeting kept in both languages per prototype — confirm in i18n review), subtitle "Results your care team has shared with you".
2. `ResultCard`: icon (activity), kind label, date (Africa/Kigali), `StatusChip` from `toCitizenResultLabel` with **icon + text** (never colour-only): `FOLLOW-UP AGREED` (warning tone, calendar icon), `NO ACTION NEEDED` (positive tone, check icon), `REVIEWED` (neutral, check icon for dismissed flags). Provenance line "Reviewed by Dr. Diane N. · 13 Oct, 11:20".
3. `PendingReviewCard`: neutral card "A recent check is waiting for your care team. You will see it here after they review it." — no values, no flag, no reason codes, no date-of-flag urgency.
4. Detail screen: `ReadingValue`s with units; measurement context (fasting/non-fasting/not recorded); facility; reviewer + release time; plain-language block keyed by label:
   - followUpAgreed: "Your care team wants to see you again about this result. See Next steps."
   - noActionNeeded / reviewedNoActionNeeded: "Your care team looked at this result. No extra visit is needed for it right now."
   - Always followed by fixed line: "This result is not a diagnosis. Talk to your care team if you have questions." + link to Support.
5. Link to Next steps only when an **approved** instruction is linked (`review_id` match); otherwise no CTA.
6. `UnderstandResultSheet`: generic explanation of what a blood pressure / glucose check measures and that only a clinician decides what it means. Content keys flagged `needs clinical review`. No thresholds, no "high/low/normal" words.
7. Log `citizen.result.list_viewed` once per focus and `citizen.result.viewed` per detail open (debounced, one per mount) to `ctz_access_events` with actor = current persona.
8. Deep link to an observation of another patient (e.g. CTZ-P4 → Marie's ID) → `PermissionDenied` screen + `access.denied`; no partial render (T-02).
9. Representative: `RepresentativeBanner` on every health screen when link relationship = `legal_representative`.
10. Add a test-only guard that renders all seeded results in both languages and fails if any rendered string matches `/score|risk of|forecast|diagnos(is|ed) with|you have (hypertension|diabetes)|%/i` (EN) or listed RW equivalents.

## 6. Data, state and audit

- Reads: `ctz_released_observations` via `selectReleasedObservations`; `ctz_care_instructions` (approved only, for link).
- Writes: `ctz_access_events` only.
- Events: `citizen.result.list_viewed`, `citizen.result.viewed`, `access.denied`.
- Invariants: `awaiting_review` values never leave the repository; `dismissed_with_reason` never renders the original flag reason; no derived numeric indicators.

## 7. UX states

| State | Presentation |
|---|---|
| initial/loading | 2 skeleton `ResultCard`s, `accessibilityState busy` |
| loaded | cards sorted newest first; pending placeholder pinned top |
| empty | "No results shared with you yet. Your care team shares results after they review them." |
| validation error | n/a (read-only) |
| server error | `ErrorState` + Retry (fault injector `error500` = FND-07 `serverErrorRate`) |
| permission denied | `PermissionDenied` (cross-patient deep link) |
| consent withdrawn | guard redirect (CTZ-02) |
| offline | n/a — local data; no offline banner needed |
| stale | pull-to-refresh re-queries; no write conflicts in this screen |
| success | n/a |

## 8. i18n

Namespace `citizen.health`: `title`, `subtitle`, `chip.followUpAgreed`, `chip.noActionNeeded`, `chip.reviewed`, `pending.body`, `meaning.followUpAgreed`, `meaning.noAction`, `notDiagnosis`, `reviewedBy`, `context.fasting|nonFasting|notRecorded`, `units.mmHg`, `units.mmolL`, `understand.*`, `representative.viewingFor`.

| Key | EN | RW (draft — clinical + linguistic review) |
|---|---|---|
| `notDiagnosis` | This result is not a diagnosis. | Iki gisubizo si isuzuma rya muganga. |
| `chip.noActionNeeded` | No action needed | Nta gikorwa gikenewe |
| `pending.body` | A recent check is waiting for your care team. | Igipimo giheruka gitegereje itsinda rikwitaho. |

Units are formatted via `@laif/i18n` number formatting; unit symbols identical in both languages. All plain-language meaning strings carry `entry in FND-04 `locales/rw/_review.json`.

## 9. Acceptance criteria

- [ ] CTZ-P1 sees one reviewed result with `FOLLOW-UP AGREED` chip, values with units, reviewer and a link to Next steps.
- [ ] CTZ-P2 sees the dismissed screening as `REVIEWED` / "No extra visit is needed" and a value-less pending card; the original flag reason is not in the render tree.
- [ ] No rendered string in EN or RW matches the forbidden-copy guard (score, forecast, diagnosis claim, percentages).
- [ ] Opening a detail writes exactly one `citizen.result.viewed` access event.
- [ ] Cross-patient deep link shows permission denied and writes `access.denied`.
- [ ] CTZ-P4 sees Grace's results with the representative banner and nothing of Jean-Paul's own record.
- [ ] Values are announced with full unit names by TalkBack/VoiceOver.

## 10. Tests

- `src/features/health/__tests__/ResultCard.test.tsx` (chip text+icon per label).
- `.../__tests__/healthList.test.tsx` (pending placeholder has no values; empty state).
- `.../__tests__/noForbiddenCopy.test.tsx` (all seeded personas × EN/RW).
- `.../__tests__/resultAccess.test.tsx` (access event once; cross-patient denied).

## 11. Verification

```bash
pnpm --filter @laif/citizen-wallet typecheck && pnpm --filter @laif/citizen-wallet lint && pnpm --filter @laif/citizen-wallet test
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```
Manual (Expo Go): persona Marie → My health → open result → check provenance + "not a diagnosis" → tap "Understand my result". Switch to Noël → see `REVIEWED` and pending card without numbers. Switch to RW → copy changes, units unchanged. Enable fault `error500` in demo tools → pull to refresh → error + Retry.

## 12. Commit

`feat(citizen): CTZ-03 my health released results with plain-language labels`
