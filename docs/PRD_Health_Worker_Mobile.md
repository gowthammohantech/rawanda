# Product Requirements Document — Health Worker Mobile App

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
- Target users: Community health workers, screening workers and approved field supervisors.
- Product outcome: Capture accurate screening data in low-connectivity environments and verify completion of assigned follow-ups.
- Business linkage: `BRD_LAIF_CareConnect.md` BO-01–BO-06.
- **[DESIGN]** Product experience and implementation specifics below are recommendations, not requirements explicitly endorsed by the Ministry.

## 2. User problems and jobs-to-be-done
- Users need to see the right information for their assigned role, with minimal steps and clear status.
- Users must distinguish pending work from verified completed care.
- Users must trust data provenance and be able to correct errors without losing history.

## 3. Functional feature backlog
| ID | Feature | Expected behavior | Priority |
|---|---|---|---|
| HW-01 | Secure device login | Worker authentication, device session and facility assignment. | P0 |
| HW-02 | Patient lookup/register | Use approved local identifier; flag uncertain matches for review. | P0 |
| HW-03 | Screening form | Capture BP/glucose, units, reading context, timestamp and notes. | P0 |
| HW-04 | Local validation | Check mandatory fields, plausible data-entry formats; do not diagnose. | P0 |
| HW-05 | Offline drafts | Encrypt locally, mark pending, synced or conflict. | P0 |
| HW-06 | Follow-up task list | View authorized tasks, contact attempts and due dates. | P0 |
| HW-07 | Outcome capture | Record visit/contact/referral completion with evidence and timestamp. | P0 |
| HW-08 | Sync and recovery | Idempotent retries, conflict resolution and device revocation. | P0 |

## 4. Key journeys
1. Open app → authenticate → select patient → capture reading → save offline/online → receive sync confirmation → clinician review queue.
2. Open assigned follow-up → record contact attempt → capture outcome → sync evidence → clinician/programme status updates.

## 5. Navigation and primary screens
**[DESIGN]** Suggested screens: sign-in and access context; home/worklist; patient or cohort detail; record/action form; history and status; alerts/notifications; settings/help. Screen visibility must be capability- and role-based, not merely hidden menus.

## 6. UX requirements
- Clear status badges and timestamps; accessible form labels, keyboard/screen-reader behavior where applicable.
- Avoid presenting clinical flags as diagnoses; show review status and responsible professional.
- Explicit loading, error, empty, stale and unauthorized states.
- Localized content and readability to be tested with Rwanda pilot participants.

## 7. Data and integration requirements
Core domain objects: Worker, Device, Facility, Patient, LocalIdentifier, Observation, ScreeningDraft, SyncEnvelope, FollowUpTask, ContactAttempt, FollowUpOutcome.
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
- Major edge cases: No connectivity, app termination during capture, device clock drift, duplicate submit, patient mismatch, lost phone, reassignment during offline period.
- **[DECISION]** Final roles, consent/notice, languages, offline retention, report granularity, service levels, evaluation targets and clinical escalation.

## 11. Success metrics
Measure completion, time to review, data quality, user task time, safety exceptions and comprehension where relevant. Do not claim medical outcome improvements from workflow completion alone.
