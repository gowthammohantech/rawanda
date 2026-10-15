# LAIF CareConnect — Technical Architecture & Frontend Prototype Implementation Specification

**Version:** 1.0 | **Date:** 2026-10-16 | **Status:** Implementation-ready prototype specification (not a deployed application)

## 0. Purpose and source of truth

Build a **fully interactive, frontend-first, synthetic-data prototype** of four connected LAIF CareConnect applications: (1) Clinical Web Portal, (2) Health Worker Mobile, (3) Programme Admin Dashboard, and (4) Citizen Health Wallet. All core interactions must work without a production backend. Demonstrate the complete patient journey: **identify → understand → review → act → follow up → learn**. The first three applications are P0; the citizen wallet is P1 but included in prototype mode.

**Source hierarchy:** (1) LAIF Rwanda MoH proposal, especially pp. 5–6, 10–14, 17 and 20; (2) `BRD_LAIF_CareConnect.md`; (3) application PRDs and FRDs in this folder; (4) explicit assumptions in this document. Where approval-dependent matters are unresolved, implement simulated adapters and label them clearly. This document adds engineering recommendations; it is not a statement of Ministry approval.

**Prototype-only safety banner, visible on every screen:** `DEMONSTRATION — SYNTHETIC PATIENT DATA — NOT FOR CLINICAL USE`. Never show fake records as real Ministry or patient data. No AI diagnosis, autonomous prescription, treatment denial, dose changes, or clinical advice. Rules and thresholds are **illustrative placeholders only**, require clinician approval, and must not be presented as Rwanda-approved guidelines.

## 1. Architecture decisions

| ADR | Decision | Rationale | Upgrade path |
|---|---|---|---|
| ADR-P01 | TypeScript monorepo (pnpm + Turborepo) | Share types, components, mock data and workflows | Retain packages for production |
| ADR-P02 | React 19 + Vite for three web surfaces | Fast browser demo and reusable design system | Separate web deployments |
| ADR-P03 | React Native + Expo for worker mobile and citizen wallet | Offline UX and device-ready navigation | Production mobile builds |
| ADR-P04 | Browser IndexedDB via Dexie for web demo; Expo SQLite for mobile | Persistence without server | Replace repository adapters with APIs |
| ADR-P05 | Shared deterministic domain engine | Same status transitions across apps | Move authoritative decisions server-side |
| ADR-P06 | MSW + typed repository abstraction | Demonstrate realistic async API/error behavior | NestJS/Fastify REST API |
| ADR-P07 | TanStack Query for server-state facade; Zustand for UI state | Clean boundaries and predictable invalidation | Replace mock transport |
| ADR-P08 | Zod for validation; React Hook Form for forms | Typed and testable forms | Share schemas with backend |
| ADR-P09 | No actual NIDA, EHR, SMS or FHIR endpoints in prototype | No approved credentials or live PHI | Authorized adapters and agreements |
| ADR-P10 | Role-switcher is demo-only, not authentication | Rapid stakeholder walkthrough | OIDC and scoped RBAC |

**Important limitation:** Browser tabs and Expo devices do not automatically share one IndexedDB. For a coherent multi-app demo, run a **local-only mock coordination server** (see §4) or use an explicitly labeled scenario import/export. This local server is not a production backend. Without it, each application can run standalone against the same seed scenario but changes do not synchronize across devices.

## 2. Application inventory and routes

### 2.1 Clinical Web Portal (`apps/clinical-web`)

| Route | Screen | Working behaviors | FRD trace |
|---|---|---|---|
| `/clinical/login` | Demo access | Select clinician/reviewer role and facility | CL-08 |
| `/clinical/queue` | Review queue | Filter by pending, overdue, flagged, facility; sort; open case | CL-03 |
| `/clinical/patients` | Patient search | Search synthetic ID/name, paginate, empty states | CL-01 |
| `/clinical/patients/:id` | Patient overview | Demographics, screening history, follow-up timeline | CL-01/02 |
| `/clinical/reviews/:id` | Review detail | Show flag reason, inputs, ruleset version, prior records | CL-04 |
| `/clinical/reviews/:id/decision` | Decision | Record review outcome, refer, request repeat test, or dismiss with reason | CL-05 |
| `/clinical/referrals` | Referral tracking | Create, assign, update, complete and overdue states | CL-06 |
| `/clinical/tasks` | Care-team tasks | Assign/reassign, due date, status, note, audit | CL-07 |
| `/clinical/audit` | Audit explorer | Read-only event history scoped to demo facility | CL-08 |

**Workflow:** Open pending screening → inspect evidence → record clinician decision → create referral/follow-up → complete or dismiss with reason → observe admin metrics update. Do not permit a decision without actor, timestamp and reason where required.

### 2.2 Health Worker Mobile (`apps/worker-mobile`)

| Screen | Working behaviors | FRD trace |
|---|---|---|
| Sign-in / role | Simulated device login, assigned district/facility | HW-01 |
| Home | Today’s visits, overdue follow-ups, sync status | HW-06 |
| Find patient | Search cached patients; register synthetic patient | HW-02 |
| New screening | BP, glucose, date, context, validation, save draft | HW-03/04 |
| Screening review | Preview entered values and illustrative flags | HW-03/04 |
| My tasks | Filter due/overdue/completed; view patient context | HW-06 |
| Follow-up outcome | Record attempted contact, attended, referred, unable to reach | HW-07 |
| Sync center | Pending queue, retries, conflicts, manual sync | HW-05/08 |
| Settings | Demo data reset, language placeholder, offline toggle | HW-01/08 |

**Offline requirement:** All forms must save to SQLite before network attempt. Queue mutations with stable UUIDs, idempotency keys and monotonic local sequence. Never silently discard pending work. Clearly distinguish **saved locally** from **synced**.

### 2.3 Programme Admin Dashboard (`apps/programme-admin`)

| Route | Screen | Working behaviors | FRD trace |
|---|---|---|---|
| `/admin/overview` | KPI overview | Screened, flagged, reviewed, followed up; date/facility/district filters | PA-01/02 |
| `/admin/funnel` | Pathway funnel | Drill into stage counts; calculate completion from records | PA-03 |
| `/admin/timeliness` | Timeliness | Median days to review, overdue trends | PA-04 |
| `/admin/workload` | Worker burden | Assigned/completed tasks, time-entry summaries | PA-05 |
| `/admin/quality` | Safety & quality | Missing fields, mismatches, overturned flags, mock review queue | PA-06 |
| `/admin/reports` | Exports | CSV of aggregate statistics, demo watermark | PA-07 |
| `/admin/governance` | Governance | Demo ruleset history, event audit, access simulation | PA-08 |

**Privacy:** Dashboard is aggregate-first. Suppress small cells using a configurable demonstration threshold (e.g., 5; policy must be approved for production). No unrestricted patient-level export.

### 2.4 Citizen Health Wallet (`apps/citizen-wallet`, P1 prototype)

| Screen | Working behaviors | FRD trace |
|---|---|---|
| Welcome / consent | Explain synthetic demo, choose persona, simulate consent | CW-01/06 |
| My health | Read-only screening results with plain-language labels | CW-02 |
| Next steps | Clinician-approved plan, appointment and contact details | CW-03 |
| Reminders | Opt in/out; view simulated scheduled notifications | CW-04 |
| Timeline | Completed/pending follow-ups and changes | CW-05 |
| Privacy | View demo access history; request correction | CW-06 |
| Accessibility | Text scale and language selector placeholders | CW-07 |
| Support | Contact/help escalation stub, no emergency claims | CW-08 |

Do not display a numerical wellness score, future disease forecast or clinical recommendation. No insurance/credit decisions.

## 3. Monorepo structure

```text
laif-careconnect/
├── apps/
│   ├── clinical-web/             # React + Vite
│   ├── programme-admin/          # React + Vite
│   ├── worker-mobile/            # Expo Router
│   ├── citizen-wallet/           # Expo Router, P1
│   └── demo-hub/                 # Optional local scenario switcher
├── packages/
│   ├── domain/                   # Entities, state machine, rule engine
│   ├── contracts/                # Zod schemas, API types
│   ├── repositories/             # Repository interfaces and implementations
│   ├── mock-data/                # Seeded synthetic patients and scenarios
│   ├── demo-sync/                # Local mock API and event stream
│   ├── ui-web/                   # Tokens, components, patterns
│   ├── ui-native/                # Native tokens/components
│   ├── auth-demo/                # Persona/role simulation
│   ├── analytics/                # Deterministic metric calculators
│   ├── i18n/                     # Translation keys
│   └── test-utils/               # Fixtures and mocks
├── docs/                         # ADR, workflows, threat model, runbooks
├── pnpm-workspace.yaml
├── turbo.json
└── package.json
```

**Commands (target scripts to implement):** `pnpm install`, `pnpm dev:demo-api`, `pnpm dev:clinical`, `pnpm dev:admin`, `pnpm dev:worker`, `pnpm dev:citizen`, `pnpm test`, `pnpm test:e2e`, `pnpm lint`, `pnpm typecheck`. Set up Expo SDK and dependency versions using compatible, pinned versions at implementation time. Web dev ports: 5173 clinical, 5174 admin; mock server 4010. Mobile devices connect to the developer machine's LAN address, not `localhost`.

## 4. Data access and multi-application demo synchronization

**Mode A — Standalone frontend:** Each web app uses Dexie and seeded local data; mobile apps use Expo SQLite. Suitable for isolated screen demonstrations. Each app can reset to a known scenario. Not cross-device synchronized.

**Mode B — Recommended connected prototype:** A tiny local Node mock API stores synthetic records in a SQLite file and emits changes via SSE/WebSocket. Frontends still contain the complete user experience and domain workflows, but shared state is coordinated for realistic multi-app demos. MSW can intercept APIs in browser-only tests. This is a mock coordination service, not a real clinical backend.

**Repository interface:**

```ts
interface CareRepository {
  listPatients(filter: PatientFilter): Promise<Patient[]>;
  getPatient(id: string): Promise<Patient | null>;
  createScreening(input: ScreeningInput, key: string): Promise<Screening>;
  listReviews(filter: ReviewFilter): Promise<Review[]>;
  decideReview(input: ReviewDecisionInput, key: string): Promise<Review>;
  createReferral(input: ReferralInput, key: string): Promise<Referral>;
  updateFollowUp(input: FollowUpInput, key: string): Promise<FollowUp>;
  getAggregateMetrics(filter: MetricsFilter): Promise<ProgrammeMetrics>;
  listAuditEvents(filter: AuditFilter): Promise<AuditEvent[]>;
}
```

**Suggested mock endpoints:** `GET /v1/patients`, `GET /v1/patients/:id`, `POST /v1/screenings`, `GET /v1/reviews`, `POST /v1/reviews/:id/decisions`, `POST /v1/referrals`, `PATCH /v1/follow-ups/:id`, `GET /v1/metrics`, `GET /v1/audit`, `GET /v1/events`, `POST /demo/reset`, `POST /demo/scenarios/:id/load`.

Each write returns `eventId`, `entityVersion`, `updatedAt` and `auditEventId`. HTTP 409 indicates a stale entity version. Demo transport supports latency, timeout, 500 error, offline and conflict simulation. No production data or external telemetry.

## 5. Domain model and lifecycle

### 5.1 Entities

- `Patient`: id, syntheticIdentifier, displayName, dateOfBirth, sexOptional, facilityId, districtId, consentState, createdAt, version.
- `Screening`: id, patientId, workerId, facilityId, measuredAt, systolic, diastolic, glucoseValue, glucoseUnit, glucoseContext, observations, source, rulesetVersion, status.
- `Review`: id, screeningId, assignedClinicianId, status, flagReasons[], evidenceSnapshot, decision, decisionReason, reviewedAt.
- `Referral`: id, patientId, reviewId, destination, requestedAt, dueAt, status, completedAt, completionEvidence.
- `FollowUp`: id, patientId, referralId?, assignedWorkerId, dueAt, status, attempts[], completedAt, outcome.
- `Reminder`: id, patientId, followUpId, channel, consentBasis, scheduledAt, deliveryStatus (simulated).
- `AuditEvent`: id, actorId, actorRole, action, entityType, entityId, beforeHash?, afterHash?, occurredAt, correlationId.
- `Facility`, `District`, `DemoPersona`, `Ruleset`, `AccessEvent`, `SyncOperation`.

Use opaque UUIDs, ISO timestamps with timezone, explicit units, nullable fields where appropriate, and stable referential links. Do not put patient names into analytics event properties.

### 5.2 State machines

```text
Screening: draft -> submitted -> review_required | no_review_required
Review: pending -> in_review -> action_recorded | dismissed_with_reason
Referral: created -> accepted -> scheduled -> completed
                           \-> cancelled_with_reason
FollowUp: assigned -> contacted -> completed
                    \-> unable_to_reach -> reassigned
                    \-> overdue (derived from dueAt and incomplete status)
SyncOperation: queued -> sending -> acknowledged
                        \-> retryable_failure -> queued
                        \-> conflict -> needs_resolution
```

**Invariants:** Every review decision is attributable; dismissals require a reason; completed referrals need completion evidence; submitted screenings are immutable except through an amendment event; no UI may claim a referral is complete merely because a reminder was sent; stale writes produce conflicts; `overdue` is a derived indicator, not a destructive state transition.

### 5.3 Illustrative rules engine

```ts
type FlagResult = {
  requiresReview: boolean;
  reasonCodes: string[];
  rulesetVersion: string;
  displayDisclaimer: 'DEMO_RULE_NOT_CLINICALLY_VALIDATED';
};

function evaluateScreening(input: ScreeningInput, rules: DemoRuleset): FlagResult {
  // Validate units and required context before any rule evaluation.
  // Compare values only against externally configured DEMO thresholds.
  // Return explainable reason codes, never diagnosis or treatment advice.
  // A clinician reviews all flagged results before clinical action.
  throw new Error('Implement using an explicitly labeled synthetic demo ruleset');
}
```

Do **not** hardcode clinical thresholds from general internet sources. Demo fixtures may contain pre-labeled flags to avoid accidental clinical interpretation.

## 6. Detailed cross-application workflows

### WF-01 — Screening through completion

1. Worker signs into demo persona and finds a synthetic patient.
2. Worker enters BP/glucose, reviews units and measurement context, saves locally.
3. Worker submits; if offline, operation stays queued and UI shows `Saved on this device`.
4. After sync, ruleset attaches explanatory demo flag; clinician queue updates.
5. Clinician opens evidence and records a decision or dismissal with reason.
6. If action is required, clinician creates referral/follow-up and assigns a worker.
7. Worker records contact and appointment outcome; clinician confirms completion where policy requires.
8. Admin funnel and median-time metrics recalculate from events.
9. Citizen wallet (if enabled) shows only patient-visible, clinician-approved next steps.
10. Audit trail links each transition by correlation ID.

### WF-02 — Offline duplicate/conflict

1. Worker creates a screening offline; app stores `clientMutationId` and device timestamp.
2. Worker taps sync twice; server processes once by idempotency key.
3. Another actor updates the same follow-up; worker's stale version receives 409.
4. UI displays local vs latest values, blocks silent overwrite, and offers retry after explicit resolution.
5. Audit records resolution and original operation ID.

### WF-03 — Clinician dismisses flag

1. Clinician opens flagged case with visible evidence and demo ruleset version.
2. Clinician chooses `Dismiss with reason`, supplies mandatory explanation.
3. Review closes; no referral is automatically created.
4. Admin metrics count dismissal separately from completed clinical follow-up.
5. Citizen wallet never presents the initial flag as a confirmed diagnosis.

### WF-04 — Privacy and scope

1. Admin persona scoped to District A sees only District A aggregates.
2. Attempted District B route/API access returns 403 and a simulated audit event.
3. Small aggregate cells are suppressed; CSV export carries watermark and scope metadata.
4. A citizen correction request creates a task, not an automatic rewrite of clinical history.

## 7. UX and design system

**Visual direction:** Calm clinical utility, high legibility, restrained color, distinct urgency without color-only cues. Responsive layouts: desktop clinical/admin (1440/1280/1024), tablet (768), mobile (390/360). Native apps respect safe areas, dynamic font scaling and accessible touch targets.

**Tokens (proposal, not an extracted approved brand system):** primary `#087F8C`, primary-dark `#075D66`, positive `#1B7653`, warning `#A15D00`, danger `#B42318`, ink `#18252B`, muted `#5B6870`, background `#F7FAFA`, surface `#FFFFFF`, border `#D9E2E4`. Use semantic variables (`--color-risk-warning`) rather than hardcoded status colors. AA text contrast, keyboard navigation, visible focus rings and screen-reader labels are mandatory.

**Shared components:** AppShell, Sidebar, Topbar, RoleBanner, DemoBanner, PatientSummaryCard, ScreeningForm, ReadingDisplay, ExplainableFlag, ReviewDecisionPanel, ReferralStepper, FollowUpTimeline, StatusChip, FilterBar, MetricCard, TrendChart, AuditTimeline, EmptyState, ErrorState, OfflineBanner, SyncQueuePanel, ConfirmDialog, AccessibleDataTable, PrivacyNotice.

**Required UX states for every async view:** initial, loading, loaded, empty, validation error, server error, permission denied, offline, stale/conflict, success. Prevent accidental double-submit. Confirmation before irreversible actions; undo where safe. Use clear timestamps and measurement units.

**Localization:** externalize all strings; English first, prepare Kinyarwanda translations for clinical validation. Never machine-translate clinical instructions into production without expert review. Store time in UTC and display with `Africa/Kigali` timezone.

## 8. Screen-level acceptance checklist

| App | Critical interaction | Acceptance evidence |
|---|---|---|
| Clinical | Filter review queue | Filter counts and rows match repository |
| Clinical | Review with reason | Required reason, immutable audit event, updated queue |
| Clinical | Create referral | Linked patient/review, status timeline, assigned worker |
| Worker | Save offline screening | Survives app restart; pending count visible |
| Worker | Sync after reconnect | Exactly one screening created per idempotency key |
| Worker | Conflict | No lost data; manual resolution logged |
| Admin | Funnel drill-down | Counts derived from same records; no fabricated KPIs |
| Admin | Scope enforcement | Cross-district access blocked even via direct URL |
| Admin | Export | Aggregate-only CSV with demo watermark |
| Citizen | Next-step display | Only clinician-approved information appears |
| Citizen | Reminder opt-out | Changes local preference and stops simulated scheduling |
| Citizen | Correction request | Task created; source clinical record unchanged |

## 9. Test plan

- **Unit:** Zod validation, metric calculations, ruleset explanation, state transitions, idempotency, timezones.
- **Component:** form errors, keyboard interactions, dialogs, role-appropriate actions, responsive states.
- **Integration:** repositories, MSW, mock API, audit events, patient-to-referral linking.
- **Web E2E (Playwright):** full clinician workflow, admin drill-down, permission denial, failed network, scenario reset.
- **Mobile E2E (Maestro or Detox):** offline save, restart persistence, reconnect sync, duplicate submission, conflict resolution.
- **Accessibility:** axe checks plus manual keyboard and screen-reader walkthroughs.
- **Privacy:** synthetic-data assertion, no PHI in logs, no external analytics, role/scope checks.

**Release gates:** 0 critical flow blockers; all P0 scenarios pass; offline queue survives restart; no unreviewed clinical recommendation; no real personal data; export suppression works; complete demo script reproducible from a clean seed.

## 10. Demo scenarios and seed data

Create **at least 40 entirely fictional patients**, 3 fictional facilities across 2 fictional districts (clearly marked as demonstration entities), 60 screenings, 20 reviews, 12 referrals and 18 follow-ups. Seed fixed timestamps relative to a pinned demo clock to make KPI results deterministic. Include scenarios: normal screening, flagged screening, clinician dismissal, overdue referral, completed follow-up, missing unit, duplicate submission, offline sync, version conflict, consent withdrawn, unauthorized district access, suppressed small aggregate.

A `Reset demo` action must restore the exact dataset, audit baseline and scenario clock. Display `Synthetic demonstration data` in UI, exported CSV and screenshots.

## 11. Security and clinical governance boundaries

**Prototype:** No real national ID, biometric, EHR, laboratory, pharmacy, SMS, payment or insurer connection. No production PHI. Role switching is not security. Browser local storage is not a safe place for real patient records. Demo audit logs show expected behavior but do not prove tamper resistance.

**Before clinical pilot:** Ministry and clinical owner approve screening protocols, follow-up actions and safety review; privacy impact assessment and Rwanda legal review; NCSA-related approvals and Rwanda data residency verification; OIDC, MFA, backend-enforced RBAC/ABAC and facility scope; encrypted storage/transit; audited access; retention/deletion policy; consent and lawful basis; incident response; accessibility and localization validation; approved interoperability contracts; penetration testing; disaster recovery; monitored rollout. The LAIF proposal cites Rwanda Law No. 058/2021, but this specification does not assert legal compliance without independent verification.

**Potentially sensitive feature deferred:** The proposal discusses wellness scoring for insurance, microfinance and public services. Exclude this entirely from MVP and pilot until separate ethical, legal, fairness and human-rights review; never make eligibility or credit decisions from health metrics in the prototype.

## 12. Implementation backlog (suggested 8-week prototype)

| Sprint | Scope | Deliverable | Exit gate |
|---|---|---|---|
| W1 | Repo, tokens, navigation, domain types, seeds | Four apps boot and show role-specific shells | Typecheck, seed reset |
| W2 | Mock coordination API, repositories, audit | Shared scenario data across web apps | Deterministic CRUD and events |
| W3 | Worker patient lookup and screening | End-to-end local screening entry | Validations and drafts |
| W4 | Offline SQLite and sync | Reconnect, retry, conflict UI | Restart/idempotency tests |
| W5 | Clinical queue, review and referral | Closed-loop clinician actions | Decision/audit tests |
| W6 | Admin KPIs, filtering, CSV | Live pathway dashboard | Reconciled aggregates |
| W7 | Citizen wallet, notifications simulation | Read-only next steps, opt-in | No unapproved content |
| W8 | E2E, accessibility, security review, demo script | Stakeholder-ready prototype | All release gates met |

**Recommended team:** 1 tech lead/architect, 2 React developers, 1 React Native developer, 1 QA automation engineer, part-time UX designer, and a designated clinical reviewer. Estimates assume existing design and clinical review availability; not a commitment for production readiness.

## 13. Definition of done per feature

A feature is complete only if: (1) it is reachable from navigation; (2) it operates on synthetic persistent records, not static screenshots; (3) its happy and failure states work; (4) its permissions and audit behavior are simulated and tested; (5) it has accessible labels and mobile/responsive support where relevant; (6) it has at least one automated test; (7) it is traceable to the PRD/FRD ID; (8) it does not imply clinical validation or Ministry approval.

## 14. Prototype demonstration script (15 minutes)

1. **Minute 0–2:** Show four application shells and explain demo-only roles and synthetic data.
2. **Minute 2–5:** Worker records a screening offline, restarts app, reconnects and syncs.
3. **Minute 5–8:** Clinician sees the new flagged case, inspects explainability, creates referral.
4. **Minute 8–10:** Worker records contact and follow-up outcome; clinician confirms.
5. **Minute 10–12:** Admin dashboard shows funnel, timeliness and audit changes.
6. **Minute 12–13:** Citizen sees approved next step and changes reminder preference.
7. **Minute 13–15:** Demonstrate role restriction, conflict resolution and reset scenario.

## 15. Open decisions before implementation

1. Is the demo expected to run on real Android/iOS devices, or is a responsive mobile web simulation sufficient for the first stakeholder review?
2. Should all four apps share live demo state over LAN, or are isolated pre-seeded demonstrations acceptable?
3. Which languages are mandatory for the stakeholder demo, and who validates clinical translations?
4. Which screening data fields and clinical review criteria are formally approved by a qualified Rwanda clinical counterpart?
5. Which district/facility taxonomy is approved for pilot use? Until then use fictional names.
6. Who approves consent, correction, retention and audit UX wording?
7. Does the citizen wallet remain P1 in release planning even though it is represented in the prototype?
8. Is the next deliverable **prototype source code** or an **architecture review**? This file specifies implementation but does not itself constitute running source code.

## 16. Traceability matrix

| Capability | Source PRD/FRD | Implementation package | Test |
|---|---|---|---|
| Patient and screening | HW-02/03/04, CL-01/02 | domain, contracts, repositories | screening-e2e |
| Offline sync | HW-05/08 | mobile SQLite, demo-sync | offline-restart-e2e |
| Review and flag explanation | CL-03/04/05 | domain, clinical-web | clinician-review-e2e |
| Referral and follow-up | CL-06/07, HW-06/07 | domain, repositories | referral-loop-e2e |
| Aggregate reporting | PA-02/03/04/05 | analytics, programme-admin | metric-reconciliation |
| Quality, export, audit | PA-06/07/08 | analytics, audit | privacy-and-export |
| Citizen steps and reminders | CW-02/03/04/05 | citizen-wallet | citizen-readonly-e2e |
| Citizen privacy | CW-06/07/08 | citizen-wallet, auth-demo | citizen-privacy-e2e |

---

**Delivery statement:** This Markdown file is a technical and implementation blueprint for building a working frontend-based prototype. It is **not** itself a compiled or deployed application. Production architecture, clinical integration, clinical safety and legal compliance require separate approval and validation.
