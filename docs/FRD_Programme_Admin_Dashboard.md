# Functional Requirements Document — Programme Admin Dashboard

## Document control
- Product: LAIF CareConnect
- Status: Proposed MVP specification; **not approved by Rwanda Ministry of Health**
- Basis: `LAIF_MOH.pdf` (22-page proposal), particularly pp. 5–6, 10–15, 17, 20–21.
- Classification: **[SOURCE]** reflects proposal; **[DESIGN]** is recommended MVP implementation; **[DECISION]** needs Ministry/clinical/security approval.
- Pilot assumption: one or two participating facilities; blood-pressure and blood-glucose follow-up; synthetic data for demo, approved real data only after governance clearance.
- Out of scope for MVP: autonomous diagnosis/prescribing, national-scale prediction, financial/insurance wellness scoring, automatic NIDA/biometric access, national EHR replacement.

## Shared non-negotiables
1. A qualified clinician retains responsibility for clinical decisions; prompts are reviewable, explainable and dismissible with a reason.
2. Clinical thresholds, urgency and follow-up intervals are **not specified in the proposal** and must be supplied and approved by Rwanda clinical counterparts; never hardcode speculative thresholds.
3. Least-privilege access, patient confidentiality, encryption in transit and at rest, audit of sensitive access and changes, retention policy and Rwanda-resident deployment subject to legal verification.
4. No real patient data in a development demo. Real-data pilots require data protection assessment, approvals, clinical protocol, hosting and incident-response sign-off.
5. FHIR-compatible canonical mapping is a design direction; NIDA, EHR, lab and pharmacy connections require explicit access agreements and are not MVP dependencies.
6. Accessibility, low-bandwidth usability, Kinyarwanda/English language planning and offline safety require validation with local users; translation and offline capabilities are design proposals, not confirmed Ministry requirements.

## Shared lifecycle
`DRAFT_SCREENING -> RECORDED -> REVIEW_REQUIRED | NO_REVIEW_REQUIRED -> REVIEWED -> REFERRAL_OPEN | FOLLOW_UP_PLANNED | CLOSED_WITH_REASON -> FOLLOW_UP_COMPLETED | OVERDUE -> CLOSED`
- A screening may be corrected only with provenance and audit, not silently overwritten.
- A clinician may dismiss a flag with a required reason.
- Completed means an evidenced, timestamped care step, not merely a notification delivered.
- Duplicate events and concurrent updates must not create duplicate referrals or lose decisions.

## Traceability to source
- pp. 5–6: three audiences and six-step care journey.
- pp. 7–9: citizen, hospital and national leadership journeys.
- pp. 10–12: FHIR, identity, sovereignty and privacy architecture.
- pp. 13–15: clinician oversight, NCD follow-up pilot and medicines pilot.
- p. 17: six pilot evaluation metrics.
- p. 20: 3-stage, 12-month national proposal rollout (not an 8-week clinical production commitment).

## 1. Purpose, scope and actors
- Application: **Programme Admin Dashboard**.
- Release: **MVP / P0**.
- Actors: Ministry programme leads, authorized district analysts, facility managers and auditors.
- Functional objective: Provide privacy-protected operational evidence of screening-to-care completion and identify gaps without exposing unnecessary personal data.
- Reference: `PRD_Programme_Admin_Dashboard.md` and `BRD_LAIF_CareConnect.md`.

## 2. Functional requirements
### PA-01 — Scoped sign-in
**Actor:** authorized ministry programme leads.

**Trigger:** user opens the corresponding workflow or an authorized event arrives.

**Preconditions:** authenticated session; permitted scope; valid linked record; necessary policy approvals.

**System behavior:** Programme, district and facility authorization. Validate inputs, enforce server-side permissions, persist event and provenance, and return explicit state.

**Exceptions:** invalid/missing fields → actionable error; forbidden scope → deny and audit; concurrent change → version conflict and reload; transport failure → retry without duplicate mutation.

**Acceptance criteria:**
- Given an authorized actor and valid data, when the action is submitted, then exactly one versioned result is persisted and shown.
- Given an unauthorized actor, when the same action is attempted, then no protected data or mutation is exposed.
- Given a retry of the same idempotency key, when processed, then the original result is returned without duplication.

### PA-02 — Screening overview
**Actor:** authorized ministry programme leads.

**Trigger:** user opens the corresponding workflow or an authorized event arrives.

**Preconditions:** authenticated session; permitted scope; valid linked record; necessary policy approvals.

**System behavior:** Counts by period, facility, district and approved screening type. Validate inputs, enforce server-side permissions, persist event and provenance, and return explicit state.

**Exceptions:** invalid/missing fields → actionable error; forbidden scope → deny and audit; concurrent change → version conflict and reload; transport failure → retry without duplicate mutation.

**Acceptance criteria:**
- Given an authorized actor and valid data, when the action is submitted, then exactly one versioned result is persisted and shown.
- Given an unauthorized actor, when the same action is attempted, then no protected data or mutation is exposed.
- Given a retry of the same idempotency key, when processed, then the original result is returned without duplication.

### PA-03 — Follow-up funnel
**Actor:** authorized ministry programme leads.

**Trigger:** user opens the corresponding workflow or an authorized event arrives.

**Preconditions:** authenticated session; permitted scope; valid linked record; necessary policy approvals.

**System behavior:** Recorded → flagged → reviewed → referred → completed. Validate inputs, enforce server-side permissions, persist event and provenance, and return explicit state.

**Exceptions:** invalid/missing fields → actionable error; forbidden scope → deny and audit; concurrent change → version conflict and reload; transport failure → retry without duplicate mutation.

**Acceptance criteria:**
- Given an authorized actor and valid data, when the action is submitted, then exactly one versioned result is persisted and shown.
- Given an unauthorized actor, when the same action is attempted, then no protected data or mutation is exposed.
- Given a retry of the same idempotency key, when processed, then the original result is returned without duplication.

### PA-04 — Timeliness
**Actor:** authorized ministry programme leads.

**Trigger:** user opens the corresponding workflow or an authorized event arrives.

**Preconditions:** authenticated session; permitted scope; valid linked record; necessary policy approvals.

**System behavior:** Median days to clinical review and overdue queues as aggregate counts. Validate inputs, enforce server-side permissions, persist event and provenance, and return explicit state.

**Exceptions:** invalid/missing fields → actionable error; forbidden scope → deny and audit; concurrent change → version conflict and reload; transport failure → retry without duplicate mutation.

**Acceptance criteria:**
- Given an authorized actor and valid data, when the action is submitted, then exactly one versioned result is persisted and shown.
- Given an unauthorized actor, when the same action is attempted, then no protected data or mutation is exposed.
- Given a retry of the same idempotency key, when processed, then the original result is returned without duplication.

### PA-05 — Worker burden
**Actor:** authorized ministry programme leads.

**Trigger:** user opens the corresponding workflow or an authorized event arrives.

**Preconditions:** authenticated session; permitted scope; valid linked record; necessary policy approvals.

**System behavior:** Capture staff-time proxies or approved workload measurements. Validate inputs, enforce server-side permissions, persist event and provenance, and return explicit state.

**Exceptions:** invalid/missing fields → actionable error; forbidden scope → deny and audit; concurrent change → version conflict and reload; transport failure → retry without duplicate mutation.

**Acceptance criteria:**
- Given an authorized actor and valid data, when the action is submitted, then exactly one versioned result is persisted and shown.
- Given an unauthorized actor, when the same action is attempted, then no protected data or mutation is exposed.
- Given a retry of the same idempotency key, when processed, then the original result is returned without duplication.

### PA-06 — Quality and safety
**Actor:** authorized ministry programme leads.

**Trigger:** user opens the corresponding workflow or an authorized event arrives.

**Preconditions:** authenticated session; permitted scope; valid linked record; necessary policy approvals.

**System behavior:** Monitor missing data, false/missed flags after review and identity mismatches. Validate inputs, enforce server-side permissions, persist event and provenance, and return explicit state.

**Exceptions:** invalid/missing fields → actionable error; forbidden scope → deny and audit; concurrent change → version conflict and reload; transport failure → retry without duplicate mutation.

**Acceptance criteria:**
- Given an authorized actor and valid data, when the action is submitted, then exactly one versioned result is persisted and shown.
- Given an unauthorized actor, when the same action is attempted, then no protected data or mutation is exposed.
- Given a retry of the same idempotency key, when processed, then the original result is returned without duplication.

### PA-07 — Exports
**Actor:** authorized ministry programme leads.

**Trigger:** user opens the corresponding workflow or an authorized event arrives.

**Preconditions:** authenticated session; permitted scope; valid linked record; necessary policy approvals.

**System behavior:** Approved de-identified CSV and aggregate report exports. Validate inputs, enforce server-side permissions, persist event and provenance, and return explicit state.

**Exceptions:** invalid/missing fields → actionable error; forbidden scope → deny and audit; concurrent change → version conflict and reload; transport failure → retry without duplicate mutation.

**Acceptance criteria:**
- Given an authorized actor and valid data, when the action is submitted, then exactly one versioned result is persisted and shown.
- Given an unauthorized actor, when the same action is attempted, then no protected data or mutation is exposed.
- Given a retry of the same idempotency key, when processed, then the original result is returned without duplication.

### PA-08 — Governance logs
**Actor:** authorized ministry programme leads.

**Trigger:** user opens the corresponding workflow or an authorized event arrives.

**Preconditions:** authenticated session; permitted scope; valid linked record; necessary policy approvals.

**System behavior:** Report access and export audits; role configuration by authorized admin. Validate inputs, enforce server-side permissions, persist event and provenance, and return explicit state.

**Exceptions:** invalid/missing fields → actionable error; forbidden scope → deny and audit; concurrent change → version conflict and reload; transport failure → retry without duplicate mutation.

**Acceptance criteria:**
- Given an authorized actor and valid data, when the action is submitted, then exactly one versioned result is persisted and shown.
- Given an unauthorized actor, when the same action is attempted, then no protected data or mutation is exposed.
- Given a retry of the same idempotency key, when processed, then the original result is returned without duplication.


## 3. End-to-end functional scenarios
- **Scenario 1:** Sign in → choose authorized reporting scope → view completion funnel → drill into aggregated facility metrics → assign programme follow-up outside clinical decision workflow.
- **Scenario 2:** Select date range → generate privacy-safe report → export with reason and audit event.

## 4. Validation and business rules
- **[DECISION]** Ministry-approved clinical threshold set and version; never infer thresholds from application defaults.
- Patient, facility, author, event time, measurement units and source are mandatory where clinically relevant.
- Require a reason when overriding or dismissing clinical flags and when correcting recorded observations.
- Disallow a task/referral being marked completed without timestamp, outcome and approved evidence type.
- Do not overwrite original screening or clinical decisions; use correction/version events.
- Permission enforcement occurs in the backend and on every export, not just the UI.

## 5. State transitions and audit events
- Shared pathway: `RECORDED → REVIEW_REQUIRED → REVIEWED → FOLLOW_UP_PLANNED/REFERRAL_OPEN → FOLLOW_UP_COMPLETED/CLOSED_WITH_REASON`.
- States `OVERDUE`, `SYNC_PENDING`, `SYNC_CONFLICT` are derived or workflow-specific; do not falsely label a patient as clinically overdue without approved timing rules.
- Audit event fields: event ID, actor, role, patient/resource reference, action, before/after or change summary, timestamp, facility, correlation ID and justification where required.

## 6. Data contracts and interfaces
- Domain objects: Programme, District, Facility, ReportingPeriod, MetricDefinition, AggregationSnapshot, DataQualityIssue, ExportAudit, AccessGrant.
- Suggested endpoint pattern **[DESIGN]**: `/v1/patients`, `/v1/screenings`, `/v1/reviews`, `/v1/referrals`, `/v1/follow-ups`, `/v1/reports` with app-specific authorization.
- Every mutation accepts `Idempotency-Key`; versioned updates use `If-Match` or equivalent optimistic concurrency.
- Timestamps use timezone-aware ISO 8601; units and coding systems must be explicit.
- API responses distinguish `VALIDATION_ERROR`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `DEPENDENCY_UNAVAILABLE`.
- **[DECISION]** FHIR resource profiles, codes, clinical terminology and identity adapter contract require interoperability approval.

## 7. Permissions and privacy
- Only approved role + facility/programme scope can access data.
- Log record access, change, export and privilege updates; prevent cross-facility disclosure.
- Aggregate reports require disclosure controls, including small-cell suppression policy approved by data governance.
- Session/device revocation and lost-device response must be tested.

## 8. Test cases
| Test ID | Test | Expected result |
|---|---|---|
| T-01 | Authorized happy path | Saved and audit event generated |
| T-02 | Cross-facility access | Denied, no data leakage |
| T-03 | Missing required clinical data | Rejected with field-level error |
| T-04 | Duplicate submission | Exactly one resulting action |
| T-05 | Concurrent update | Conflict surfaced, no silent overwrite |
| T-06 | Correction/override | Original retained; reason and author logged |
| T-07 | Unavailable integration | Graceful failure; no fabricated patient identity |
| T-08 | Aggregated report/export | Authorized, privacy-filtered, export audited |
| T-09 | Interrupted network or session | Recoverable state; no duplicate care action |
| T-10 | Clinical flag explanation | Rule version and inputs visible to reviewer |

## 9. Definition of done
- All P0 requirements (or P1 for wallet) implemented with unit, integration, authorization and workflow tests.
- Synthetic cohort demonstration passes full pathway and audit checks.
- Clinical sign-off for protocol and patient-facing text; security/privacy sign-off before live data.
- Documentation includes runbook, permissions matrix, data dictionary and known limitations.

## 10. Application-specific unresolved cases
Small-cell privacy risk, incomplete sync, changing district boundaries, data corrections, misleading denominators, cross-facility access.
These require product owner, clinical lead and data-governance decisions before release.
