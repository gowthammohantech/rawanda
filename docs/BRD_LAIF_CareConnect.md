# Business Requirements Document — LAIF CareConnect

## 1. Executive summary
**[SOURCE]** LAIF proposes a Rwanda-led, modular intelligence framework to convert recorded health risks into completed care actions. The first proposed pilot focuses on elevated blood pressure and blood sugar screening follow-up (p. 14). **[DESIGN]** CareConnect is the narrow MVP for demonstrating this closed-loop pathway before predictive AI or nationwide rollout.

## 2. Business problem and opportunity
- Fragmented clinical/lab/pharmacy records impede continuity (p. 4).
- Unreliable identity mapping causes re-registration and access challenges (p. 4).
- Reactive reporting fails to connect screening, review, referral and action (pp. 4, 14).
- A credible pilot must improve care completion **without increasing worker burden** (pp. 14, 17).

## 3. Objectives and outcomes
| ID | Business objective | Evidence / measure |
|---|---|---|
| BO-01 | Convert flagged screening into clinician-reviewed care | Completed follow-up proportion |
| BO-02 | Reduce delay between screening and clinical review | Median days to review |
| BO-03 | Give health workers a manageable work queue | Minutes per patient-day |
| BO-04 | Enable accountable programme oversight | Aggregated district/facility reports |
| BO-05 | Protect trust, safety and data sovereignty | Audited access, false/missed prompts, identity mismatches |
| BO-06 | Help citizens understand next steps | Patient comprehension evaluation |

**[DECISION]** Agree baselines, numerical targets, evaluation method and sample sizes before pilot, as required on p. 17.

## 4. Stakeholders and authority
| Stakeholder | Role |
|---|---|
| Ministry of Health and programme leadership | Sponsor, policy, pilot authorization and evaluation |
| Clinical protocol owner | Approves thresholds, referral logic, safety escalation |
| Facilities and clinicians | Deliver reviews, decide treatment, assess usability |
| Community/health workers | Record screening and follow-up evidence |
| Data protection/security authorities | Review privacy, identity and hosting controls |
| Patients/citizens | Consent/notice as applicable, receive care and understandable communication |
| Product and engineering team | Build prototype, support rollout and reporting |

## 5. Product boundaries and applications
| App | Users | Release | Business purpose |
|---|---|---|---|
| Clinical Web Portal | Clinicians, facility coordinators | MVP P0 | Review flagged screenings and close clinical actions |
| Health Worker Mobile | Field/community health workers | MVP P0 | Capture screenings and complete assigned follow-ups |
| Programme Admin Dashboard | Approved facility/district/programme analysts | MVP P0 | Monitor aggregated outcomes and bottlenecks |
| Citizen Health Wallet | Citizens/patients | Phase 2 P1 | Explain screening results and agreed next steps |

**[DESIGN]** In MVP, citizen communications may be delivered via staff-assisted handouts or approved SMS, avoiding a mandatory citizen app.

## 6. Business capabilities and priority
| ID | Capability | Priority | Business rule |
|---|---|---|---|
| BR-01 | Register and locate patient | P0 | Facility-scoped identifier initially; no assumption of NIDA integration |
| BR-02 | Record BP/glucose screening | P0 | Preserve measurement, units, timestamp, operator and provenance |
| BR-03 | Evaluate approved screening criteria | P0 | Versioned rules; no autonomous diagnosis |
| BR-04 | Clinical review worklist | P0 | Clinician can review, act, dismiss with reason |
| BR-05 | Referral and follow-up tracking | P0 | Completion requires evidence and date |
| BR-06 | Task assignment and overdue management | P0 | Authorized assignment and documented status |
| BR-07 | Aggregate programme reporting | P0 | Suppress small cells where needed to protect privacy |
| BR-08 | Full audit and access controls | P0 | Append-only event trail and least privilege |
| BR-09 | Offline mobile capture and safe sync | P0 design proposal | Explicit pending/synced/conflict states |
| BR-10 | Patient-facing wallet | P1 | Consent/identity design requires approval |
| BR-11 | FHIR/EHR/NIDA connectors | Later | Only with agreements, test environments and governance |
| BR-12 | Predictive models and medicine safety | Later | Clinical validation and safety case required |

## 7. Primary end-to-end business process
1. Worker verifies patient with locally approved identifier and records screening.
2. Approved rule version classifies whether a **review is required**; no diagnosis is made.
3. Authorized clinician sees evidence, measurement and rule explanation.
4. Clinician records assessment and referral/follow-up or dismisses with reason.
5. Assigned worker tracks and records whether the care step happened.
6. Programme dashboard measures completion, delays, workload and safety.

## 8. Scope exclusions and dependencies
- No national patient master index, biometric verification or guaranteed integration with NIDA in MVP.
- No direct medical instructions or medication changes from automated systems.
- No AI-generated clinical risk score as a decision gate.
- No insurance, credit, microfinance or commercial wellness scoring.
- Dependencies: clinical protocol, participating facilities, lawful data basis, in-country hosting, approved messaging, training and evaluation plan.

## 9. Business risks and mitigations
| Risk | Impact | Mitigation |
|---|---|---|
| False or missed flag | Patient harm | Clinician-reviewed rules, testing, override audit and monitoring |
| Identity mismatch | Wrong patient care | Local verification, merge restrictions, reconciliation workflow |
| Low connectivity | Missing records | Offline draft queue, visible sync status, retry and deduplication |
| Worker burden | Low adoption | Short forms, workload measurement, usability tests |
| Unauthorized disclosure | Privacy harm | RBAC, encryption, logging, minimum necessary reports |
| Unapproved integration | Legal/operational blocker | Synthetic-data adapter and formal integration gate |

## 10. Pilot evaluation and gates
**[SOURCE]** Six KPIs on p. 17: follow-up completion, time to clinical review, medicine-history completeness, worker workload, patient understanding, and prompt/ID safety. For this NCD-first MVP, medicine-history completeness is measured only if that field is included and clinically approved; otherwise mark it deferred rather than fabricate results.

**Gate 0 — Demo:** synthetic records, validated workflows, security tests. **Gate 1 — Authorized pilot:** protocol, DPIA/privacy and hosting approvals, clinical sign-off, baseline agreed. **Gate 2 — Expansion:** Ministry evaluation and explicit authorization (p. 20).

## 11. Delivery assumptions
**[DESIGN]** An 8-week synthetic-data demonstration is a planning target, not the national proposal's approved schedule. The source proposes months 1–3 for a sovereign sandbox, months 4–8 for a clinical pilot, and months 9–12 for scaling (p. 20).

## 12. Open decisions
- Exact clinical rules, units, repeat-reading protocol, urgency, escalation and referral windows.
- Legal basis for processing, consent/notice, retention and patient rights.
- Authorized identity method, matching and duplicate resolution.
- Facilities, districts, programme hierarchy and report access.
- Messaging channels, languages, patient accessibility and consent.
- Offline device policy, MDM, loss/revocation and retention.
- Hosting provider/location, security incident obligations and approvals.
- Pilot cohort size, control/baseline, numerical KPI targets and governance owners.
