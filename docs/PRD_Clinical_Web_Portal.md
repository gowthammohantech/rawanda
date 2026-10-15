# Product Requirements Document — Clinical Web Portal

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

## 1. Product definition
- Release: **MVP / P0**
- Target users: Clinicians, nurses with authorized review privileges, facility coordinators.
- Product outcome: Convert screening flags into accountable clinician decisions, referrals and completed follow-up.
- Business linkage: `BRD_LAIF_CareConnect.md` BO-01–BO-06.
- **[DESIGN]** Product experience and implementation specifics below are recommendations, not requirements explicitly endorsed by the Ministry.

## 2. User problems and jobs-to-be-done
- Users need to see the right information for their assigned role, with minimal steps and clear status.
- Users must distinguish pending work from verified completed care.
- Users must trust data provenance and be able to correct errors without losing history.

## 3. Functional feature backlog
| ID | Feature | Expected behavior | Priority |
|---|---|---|---|
| CL-01 | Patient search and record | Search within permitted facilities, inspect identity provenance and duplicate warnings. | P0 |
| CL-02 | Screening timeline | Display BP/glucose values, units, dates, source and correction history. | P0 |
| CL-03 | Review work queue | Filter pending, urgent per approved protocol, overdue, assigned and facility. | P0 |
| CL-04 | Explainable flag | Show approved rule version, triggering observations and data completeness. | P0 |
| CL-05 | Clinical decision | Record assessment, referral, planned review, or dismiss with required reason. | P0 |
| CL-06 | Referral tracking | Assign destination, due date and status; record verified completion evidence. | P0 |
| CL-07 | Care team tasks | Assign authorized follow-up worker and track completion. | P0 |
| CL-08 | Audit and access | Record sensitive reads, edits, decisions and exports. | P0 |

## 4. Key journeys
1. Sign in with role/facility context → open work queue → select patient → review evidence → document decision → assign follow-up → close with evidence.
2. A clinician challenges a rule: review source values → choose dismiss → enter rationale → save audited decision.

## 5. Navigation and primary screens
**[DESIGN]** Suggested screens: sign-in and access context; home/worklist; patient or cohort detail; record/action form; history and status; alerts/notifications; settings/help. Screen visibility must be capability- and role-based, not merely hidden menus.

## 6. UX requirements
- Clear status badges and timestamps; accessible form labels, keyboard/screen-reader behavior where applicable.
- Avoid presenting clinical flags as diagnoses; show review status and responsible professional.
- Explicit loading, error, empty, stale and unauthorized states.
- Localized content and readability to be tested with Rwanda pilot participants.

## 7. Data and integration requirements
Core domain objects: Patient, Identifier, Encounter, Observation, Screening, RuleVersion, ReviewFlag, ClinicalReview, Referral, FollowUpTask, AuditEvent.
- Every observation/action has unique ID, author/source, time, facility, version and audit provenance.
- API contract is authenticated, versioned and idempotent for writes.
- Clinical terminology and FHIR mappings need clinical and interoperability review.
- External identity, national EHR and messaging are behind approved adapters; mock adapters in demo.

## 8. Quality and nonfunctional requirements
- Security: scoped RBAC, MFA where required by policy, encryption, secret management, least privilege, full access audit.
- Reliability: no silent data loss; retriable requests; operational metrics and incident runbooks.
- Performance **[DESIGN target]**: p95 normal screen API response under 1 second in pilot test conditions; tune after representative measurements.
- Availability and recovery objectives: **[DECISION]** agree RTO/RPO and downtime workflow with facility owners.
- Data location: Rwanda-resident hosting and approved backup locations before live-data pilot.

## 9. Acceptance and release criteria
- Each feature in the backlog has passing happy-path, permission-denied and error-state tests.
- At least one synthetic screening traverses screening → review → referral/follow-up → evidenced completion → aggregate report.
- Every clinically significant change and sensitive read is auditable.
- Clinical thresholds, clinical content and escalation are signed off before real-data use.
- Security/privacy approval, data protection impact review and user training completed before pilot go-live.

## 10. Dependencies, risks and open questions
- Dependencies: Ministry protocol owner, facility representatives, authorized hosting, identity/messaging approvals.
- Major edge cases: Missing units, repeated screening, duplicate identity, concurrent reviews, canceled referral, unavailable clinical reviewer, corrected measurement.
- **[DECISION]** Final roles, consent/notice, languages, offline retention, report granularity, service levels, evaluation targets and clinical escalation.

## 11. Success metrics
Measure completion, time to review, data quality, user task time, safety exceptions and comprehension where relevant. Do not claim medical outcome improvements from workflow completion alone.
