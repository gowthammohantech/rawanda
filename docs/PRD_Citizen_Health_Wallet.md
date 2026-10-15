# Product Requirements Document — Citizen Health Wallet

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
- Release: **Phase 2 / P1 (not a dependency for the first clinical pilot)**
- Target users: Patients/citizens and legally authorized representatives.
- Product outcome: Help citizens understand recorded screening results and clinician-agreed next steps.
- Business linkage: `BRD_LAIF_CareConnect.md` BO-01–BO-06.
- **[DESIGN]** Product experience and implementation specifics below are recommendations, not requirements explicitly endorsed by the Ministry.

## 2. User problems and jobs-to-be-done
- Users need to see the right information for their assigned role, with minimal steps and clear status.
- Users must distinguish pending work from verified completed care.
- Users must trust data provenance and be able to correct errors without losing history.

## 3. Functional feature backlog
| ID | Feature | Expected behavior | Priority |
|---|---|---|---|
| CW-01 | Account access | Approved identity and enrollment, with safe recovery. | P1 |
| CW-02 | Results view | Display clinician-released screening results in plain language. | P1 |
| CW-03 | Next steps | Show clinician-agreed appointment, referral and follow-up instructions. | P1 |
| CW-04 | Reminders | Opt-in reminders with preferences and safe content. | P1 |
| CW-05 | Progress timeline | Show completed screenings and follow-up status. | P1 |
| CW-06 | Corrections and privacy | Request correction, view access information and relevant privacy notices. | P1 |
| CW-07 | Languages and access | Locally validated language, accessibility and low-bandwidth UX. | P1 |
| CW-08 | Support escalation | Direct users to care team; no autonomous treatment advice. | P1 |

## 4. Key journeys
1. Enroll through approved verification → view released screening → read next step → acknowledge reminder → attend review → see updated status.
2. Patient spots incorrect result → request correction → authorized staff reviews → change is audited.

## 5. Navigation and primary screens
**[DESIGN]** Suggested screens: sign-in and access context; home/worklist; patient or cohort detail; record/action form; history and status; alerts/notifications; settings/help. Screen visibility must be capability- and role-based, not merely hidden menus.

## 6. UX requirements
- Clear status badges and timestamps; accessible form labels, keyboard/screen-reader behavior where applicable.
- Avoid presenting clinical flags as diagnoses; show review status and responsible professional.
- Explicit loading, error, empty, stale and unauthorized states.
- Localized content and readability to be tested with Rwanda pilot participants.

## 7. Data and integration requirements
Core domain objects: CitizenAccount, PatientLink, IdentityVerification, ReleasedObservation, CareInstruction, NotificationPreference, Reminder, CorrectionRequest.
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
- Major edge cases: Shared devices, wrong account linking, sensitive notifications, low literacy, missing translations, results not yet clinician-released.
- **[DECISION]** Final roles, consent/notice, languages, offline retention, report granularity, service levels, evaluation targets and clinical escalation.

## 11. Success metrics
Measure completion, time to review, data quality, user task time, safety exceptions and comprehension where relevant. Do not claim medical outcome improvements from workflow completion alone.
