/**
 * Citizen wallet overlay (CTZ-01, decision D3): `buildCitizenOverlay(seed)` adds the wallet's own
 * records on top of the FND-05 citizen slice — accounts, patient links, simulated identity
 * verifications, append-only consent records, next-step acknowledgements, settings and a
 * citizen-visible access history — plus the citizen-scenario clinical additions (CTZ-P1 amended
 * observation, resolved correction requests with an outcome `resolutionKey` — CTZ-07).
 * Registered as `SLICE_OVERLAYS.citizen`.
 *
 * Deterministic: IDs are `deterministicUuid('<namespace>', n)`, times are offsets from the pinned
 * demo clock (`seed.meta.demoClockIso`, `2026-10-14T06:00:00.000Z`) and the access history uses
 * the FND PRNG with a derived sub-seed. Records store vocabulary values / i18n keys only.
 *
 * | Persona (code)                       | State                                                     |
 * |--------------------------------------|-----------------------------------------------------------|
 * | persona-citizen-1 (CTZ-P1)           | active, self link, consent granted, amended observation   |
 * | persona-citizen-2 (CTZ-P2)           | active, self link, consent granted                        |
 * | persona-citizen-withdrawn (CTZ-P3)   | active, self link, consent granted → withdrawn            |
 * | persona-citizen-rep (CTZ-P4)         | active, legal_representative link to one patient only     |
 * | persona-citizen-pending (CTZ-P5)     | pending_verification, `pending` self link to a new        |
 * |                                      | overlay patient (no results yet), demo code `246810`      |
 */
import type {
  CitizenAccessEvent,
  CitizenAccount,
  CitizenSettings,
  ConsentRecord,
  IdentityVerification,
  NextStepAcknowledgement,
  PatientLink,
} from "@laif/contracts";
import {
  asId,
  type CareTask,
  type CareTaskId,
  type CorrelationId,
  type DemoPersona,
  type Patient,
  type PatientId,
  type PersonaId,
  type Role,
  type Screening,
  type ScreeningAmendmentId,
  type ScreeningId,
} from "@laif/domain";

import { SEED_ANCHORS } from "../anchors.ts";
import { deterministicUuid } from "../ids.ts";
import { createPrng, deriveSeed } from "../prng.ts";
import { PERSONA_IDS } from "../reference/personas.ts";
import type { SeedDataset } from "../seed/types.ts";
import type { OverlayRecords } from "../slices.ts";

/** The simulated verification code shown on the demo hint card (CTZ-02). Synthetic. */
export const CITIZEN_DEMO_VERIFICATION_CODE = "246810" as const;

/** Privacy notice version recorded with the seeded consents. */
export const CITIZEN_SEED_NOTICE_VERSION = "demo-notice-v0.1" as const;

/** Link number of CTZ-P5's pending link (after the active links 1…n; stable). */
const PENDING_LINK_NO = 100;

const DAY = 86_400_000;
const MIN = 60_000;

/** Overlay namespaces (`deterministicUuid(namespace, n)`). */
export const CITIZEN_ID_NAMESPACES = {
  account: "ctz-account",
  link: "ctz-patient-link",
  verification: "ctz-identity-verification",
  consent: "ctz-consent-record",
  ack: "ctz-next-step-ack",
  settings: "ctz-settings",
  access: "ctz-access-event",
  accessCorrelation: "ctz-access-correlation",
  screening: "ctz-screening",
  amendment: "ctz-screening-amendment",
  task: "ctz-care-task",
  patient: "ctz-patient",
} as const;

/** Citizen personas in CTZ-P1…P5 order (overlay numbering 1…5). */
export const CITIZEN_PERSONA_ORDER = [
  PERSONA_IDS.citizen1,
  PERSONA_IDS.citizen2,
  PERSONA_IDS.citizenWithdrawn,
  PERSONA_IDS.citizenRep,
  PERSONA_IDS.citizenPending,
] as const;

const id = (namespace: string, n: number): string => deterministicUuid(namespace, n);

/** Stable overlay record IDs referenced by later CTZ phases and tests. */
export const CITIZEN_OVERLAY_IDS = {
  accountOf: (personaIndex: number) => id(CITIZEN_ID_NAMESPACES.account, personaIndex),
  /**
   * CTZ-P5's own record (CTZ-02): newly enrolled, no screenings yet. Citizen slice only; its
   * `pending` self link becomes `active` when the simulated verification succeeds.
   */
  pendingPatient: asId<PatientId>(id(CITIZEN_ID_NAMESPACES.patient, 1)),
  /** CTZ-P1 amended observation (glucose context `not_recorded → fasting`, version 2). */
  amendedScreening: asId<ScreeningId>(id(CITIZEN_ID_NAMESPACES.screening, 1)),
  /** CTZ-P1 correction request resolved by an amendment. */
  resolvedAmendedCorrection: asId<CareTaskId>(id(CITIZEN_ID_NAMESPACES.task, 1)),
  /** CTZ-P2 correction request resolved without a change. */
  resolvedNoChangeCorrection: asId<CareTaskId>(id(CITIZEN_ID_NAMESPACES.task, 2)),
} as const;

type AccessActor = { personaId: PersonaId; role: Role };

/** Staff who plausibly read each facility's records (clinician/nurse + workers). */
function staffOf(seed: Readonly<SeedDataset>, facilityId: string): AccessActor[] {
  const reviewers = new Set<Role>(["clinician", "nurse_reviewer", "facility_coordinator"]);
  const workers = new Set<Role>(["community_health_worker"]);
  return seed.personas
    .filter(
      (p: DemoPersona) =>
        (p.facilityIds as readonly string[]).includes(facilityId) &&
        (reviewers.has(p.role) || workers.has(p.role)),
    )
    .map((p) => ({ personaId: p.id, role: p.role }))
    .sort((a, b) => (a.personaId < b.personaId ? -1 : a.personaId > b.personaId ? 1 : 0));
}

export function buildCitizenOverlay(seed: Readonly<SeedDataset>): OverlayRecords {
  const clock = Date.parse(seed.meta.demoClockIso);
  const at = (days: number, minutes = 0): string =>
    new Date(clock + days * DAY + minutes * MIN).toISOString();
  const base = (createdAt: string, version = 1) => ({
    version,
    createdAt,
    updatedAt: createdAt,
    synthetic: true as const,
  });

  const personas = CITIZEN_PERSONA_ORDER.map((pid) => {
    const persona = seed.personas.find((p) => p.id === pid);
    if (!persona) throw new RangeError(`buildCitizenOverlay: persona ${pid} missing`);
    return persona;
  });

  // Verified / linked days before the demo clock per persona (P5 never verified).
  const verifiedDaysAgo = [-58, -55, -57, -45, null] as const;

  const accounts: CitizenAccount[] = [];
  const links: PatientLink[] = [];
  const verifications: IdentityVerification[] = [];
  const consents: ConsentRecord[] = [];
  const settings: CitizenSettings[] = [];
  const pendingPatients: Patient[] = [];
  let linkNo = 0;
  let consentNo = 0;

  personas.forEach((persona, index) => {
    const n = index + 1;
    const days = verifiedDaysAgo[index] ?? null;
    const createdAt = at((days ?? -3) - 1);
    const verifiedAt = days === null ? null : at(days);
    const accountId = id(CITIZEN_ID_NAMESPACES.account, n);
    accounts.push({
      ...base(createdAt, verifiedAt ? 2 : 1),
      ...(verifiedAt ? { updatedAt: verifiedAt } : {}),
      id: accountId,
      personaId: persona.id,
      status: verifiedAt ? "active" : "pending_verification",
      verifiedAt,
      lockedAt: null,
    });
    verifications.push({
      ...base(createdAt, verifiedAt ? 2 : 1),
      ...(verifiedAt ? { updatedAt: verifiedAt } : {}),
      id: id(CITIZEN_ID_NAMESPACES.verification, n),
      accountId,
      personaId: persona.id,
      method: "demo_code",
      status: verifiedAt ? "verified" : "pending",
      demoCode: CITIZEN_DEMO_VERIFICATION_CODE,
      attempts: verifiedAt ? 1 : 0,
      lastAttemptAt: verifiedAt,
      verifiedAt,
    });
    settings.push({
      ...base(createdAt),
      id: id(CITIZEN_ID_NAMESPACES.settings, n),
      personaId: persona.id,
      language: persona.preferredLanguage,
      textScale: 1,
      highContrast: false,
    });
    if (verifiedAt === null) {
      // CTZ-P5: the enrolment record exists but stays hidden (`pending`) until verification.
      const anchor = seed.patients.find(
        (p) => p.id === SEED_ANCHORS.COMPLETED_FOLLOWUP_WITH_INSTRUCTION.patientId,
      );
      if (!anchor) return;
      pendingPatients.push({
        ...base(createdAt),
        id: CITIZEN_OVERLAY_IDS.pendingPatient,
        syntheticIdentifier: "DEMO-C-0005",
        displayName: persona.displayName,
        dateOfBirth: "1994-06-12",
        sexOptional: "female",
        facilityId: anchor.facilityId,
        districtId: anchor.districtId,
        consentState: "not_recorded",
        identityStatus: "unverified",
        duplicateCandidateIds: [],
        preferredLanguage: persona.preferredLanguage,
      });
      links.push({
        ...base(createdAt),
        id: id(CITIZEN_ID_NAMESPACES.link, PENDING_LINK_NO),
        accountId,
        personaId: persona.id,
        patientId: CITIZEN_OVERLAY_IDS.pendingPatient,
        relationship: "self",
        status: "pending",
        linkedAt: createdAt,
      });
      return;
    }
    const relationship = persona.id === PERSONA_IDS.citizenRep ? "legal_representative" : "self";
    for (const patientId of persona.linkedPatientIds) {
      links.push({
        ...base(verifiedAt),
        id: id(CITIZEN_ID_NAMESPACES.link, ++linkNo),
        accountId,
        personaId: persona.id,
        patientId,
        relationship,
        status: "active",
        linkedAt: verifiedAt,
      });
      const grantedAt = at(days ?? 0, 15);
      consents.push({
        ...base(grantedAt),
        id: id(CITIZEN_ID_NAMESPACES.consent, ++consentNo),
        patientId,
        personaId: persona.id,
        action: "granted",
        noticeVersion: CITIZEN_SEED_NOTICE_VERSION,
        recordedAt: grantedAt,
      });
      const patient = seed.patients.find((p) => p.id === patientId);
      if (patient?.consentState === "withdrawn") {
        const withdrawal = seed.auditEvents.find(
          (e) => e.action === "patient.consent_withdrawn" && e.entityId === patientId,
        );
        const withdrawnAt = withdrawal?.occurredAt ?? at(-5);
        consents.push({
          ...base(withdrawnAt),
          id: id(CITIZEN_ID_NAMESPACES.consent, ++consentNo),
          patientId,
          personaId: persona.id,
          action: "withdrawn",
          noticeVersion: CITIZEN_SEED_NOTICE_VERSION,
          recordedAt: withdrawnAt,
        });
      }
    }
  });

  // ── Next-step acknowledgements: CTZ-P1 read the completed follow-up step ──
  const acks: NextStepAcknowledgement[] = [];
  const completedFuInstruction = seed.careInstructions.find(
    (c) => c.id === SEED_ANCHORS.COMPLETED_FOLLOWUP_WITH_INSTRUCTION.careInstructionId,
  );
  if (completedFuInstruction) {
    const ackAt = new Date(
      Date.parse(completedFuInstruction.releasedAt) + 3 * 60 * MIN,
    ).toISOString();
    acks.push({
      ...base(ackAt),
      id: id(CITIZEN_ID_NAMESPACES.ack, 1),
      patientId: completedFuInstruction.patientId,
      instructionId: completedFuInstruction.id,
      personaId: PERSONA_IDS.citizen1,
      acknowledgedAt: ackAt,
    });
  }

  // ── CTZ-P1 amended observation (CTZ-06) ───────────────────────────────────
  const p1 = SEED_ANCHORS.COMPLETED_FOLLOWUP_WITH_INSTRUCTION.patientId;
  const p1Patient = seed.patients.find((p) => p.id === p1);
  const template = seed.screenings.find(
    (s) => s.id === SEED_ANCHORS.CTZ_P4_REPRESENTED_PATIENT.screeningId,
  );
  const screenings: Screening[] = [];
  if (p1Patient && template) {
    const measuredAt = at(-55, 70);
    const amendedAt = at(-50, 120);
    screenings.push({
      ...structuredClone(template),
      ...base(measuredAt, 2),
      updatedAt: amendedAt,
      id: CITIZEN_OVERLAY_IDS.amendedScreening,
      patientId: p1Patient.id,
      workerId: PERSONA_IDS.chwAlpha1A,
      facilityId: p1Patient.facilityId,
      districtId: p1Patient.districtId,
      measuredAt,
      systolic: 122,
      diastolic: 78,
      glucoseValue: 5.6,
      glucoseUnit: "mmol/L",
      glucoseContext: "not_recorded",
      clientMutationId: id("ctz-client-mutation", 1),
      captureDurationSeconds: 140,
      notes: "",
      amendments: [
        {
          id: asId<ScreeningAmendmentId>(id(CITIZEN_ID_NAMESPACES.amendment, 1)),
          field: "glucoseContext",
          before: "not_recorded",
          after: "fasting",
          reason: "glucose_context_corrected",
          amendedBy: PERSONA_IDS.clinAlpha1,
          amendedAt,
        },
      ],
    });
  }

  // ── Resolved correction requests (later states of the request lifecycle) ──
  const careTasks: CareTask[] = [];
  if (p1Patient && screenings[0]) {
    const createdAt = at(-52, 30);
    careTasks.push({
      ...base(createdAt, 3),
      updatedAt: at(-50, 125),
      id: CITIZEN_OVERLAY_IDS.resolvedAmendedCorrection,
      kind: "correction_request",
      payload: {
        targetType: "screening",
        targetId: screenings[0].id,
        description: "I had not eaten before this check, but it does not say fasting.",
        suggestedValue: { glucoseContext: "fasting" },
        requestStatus: "resolved_amended",
        assignedRole: "clinician",
        resolutionKey: "glucose_context_corrected",
      },
      status: "done",
      patientId: p1Patient.id,
      facilityId: p1Patient.facilityId,
      assignedToId: PERSONA_IDS.clinAlpha1,
      createdBy: PERSONA_IDS.citizen1,
      dueAt: null,
      completedAt: at(-50, 125),
      cancelled: null,
    });
  }
  const p2 = SEED_ANCHORS.CTZ_P2_DISMISSED_SCREENING;
  const p2Patient = seed.patients.find((p) => p.id === p2.patientId);
  if (p2Patient) {
    const createdAt = at(-30, 200);
    careTasks.push({
      ...base(createdAt, 3),
      updatedAt: at(-27, 60),
      id: CITIZEN_OVERLAY_IDS.resolvedNoChangeCorrection,
      kind: "correction_request",
      payload: {
        targetType: "screening",
        targetId: p2.screeningId,
        description: "I think the reading time on this check is one hour off.",
        suggestedValue: null,
        requestStatus: "resolved_no_change",
        assignedRole: "clinician",
        resolutionKey: "reading_time_confirmed",
      },
      status: "done",
      patientId: p2Patient.id,
      facilityId: p2Patient.facilityId,
      assignedToId: PERSONA_IDS.nurseAlpha2,
      createdBy: PERSONA_IDS.citizen2,
      dueAt: null,
      completedAt: at(-27, 60),
      cancelled: null,
    });
  }

  // ── Citizen-visible access history (6–10 staff reads + own views per patient) ──
  const prng = createPrng(deriveSeed(seed.meta.seed, "citizen-access-history"));
  const accessEvents: CitizenAccessEvent[] = [];
  let accessNo = 0;
  const linkedPatients = links
    .filter((l) => l.status === "active")
    .map((l) => ({ patientId: l.patientId, link: l }));
  for (const { patientId, link } of linkedPatients) {
    const patient = seed.patients.find((p) => p.id === patientId);
    if (!patient) continue;
    const staff = staffOf(seed, patient.facilityId);
    const screeningIds = [
      ...seed.screenings.filter((s) => s.patientId === patientId && s.status !== "draft"),
      ...screenings.filter((s) => s.patientId === patientId),
    ].map((s) => s.id);
    const instructionIds = seed.careInstructions
      .filter((c) => c.patientId === patientId)
      .map((c) => c.id);
    const consentEnd = consents.find(
      (c) => c.patientId === patientId && c.action === "withdrawn",
    )?.recordedAt;
    const firstDay = Math.max(-56, Math.ceil((Date.parse(link.linkedAt) - clock) / DAY));
    const lastDay = consentEnd ? Math.floor((Date.parse(consentEnd) - clock) / DAY) - 1 : -1;
    const push = (
      actor: AccessActor,
      action: CitizenAccessEvent["action"],
      purpose: CitizenAccessEvent["purpose"],
      resource: { type: CitizenAccessEvent["resourceType"]; id: string },
      occurredAt: string,
    ) => {
      const n = ++accessNo;
      accessEvents.push({
        ...base(occurredAt),
        id: id(CITIZEN_ID_NAMESPACES.access, n),
        patientId: asId<PatientId>(patientId),
        actorId: actor.personaId,
        actorRole: actor.role,
        action,
        purpose,
        resourceType: resource.type,
        resourceId: resource.id,
        occurredAt,
        facilityId: patient.facilityId,
        correlationId: asId<CorrelationId>(id(CITIZEN_ID_NAMESPACES.accessCorrelation, n)),
        changeSummary: {},
        justification: null,
      });
    };
    const staffReads = prng.int(6, 10);
    for (let i = 0; i < staffReads; i += 1) {
      const actor = prng.pick(staff);
      const occurredAt = at(prng.int(firstDay, lastDay), prng.int(6 * 60, 15 * 60));
      if (actor.role === "community_health_worker") {
        if (instructionIds.length > 0 && prng.chance(0.5)) {
          push(
            actor,
            "next_steps_viewed",
            "follow_up_visit",
            {
              type: "care_instruction",
              id: prng.pick(instructionIds),
            },
            occurredAt,
          );
        } else {
          push(
            actor,
            "record_viewed",
            "follow_up_visit",
            { type: "patient", id: patientId },
            occurredAt,
          );
        }
      } else if (screeningIds.length > 0 && prng.chance(0.6)) {
        push(
          actor,
          "result_viewed",
          "care_review",
          {
            type: "screening",
            id: prng.pick(screeningIds),
          },
          occurredAt,
        );
      } else {
        push(actor, "record_viewed", "care_review", { type: "patient", id: patientId }, occurredAt);
      }
    }
    const self: AccessActor = { personaId: link.personaId, role: "citizen" };
    const ownPurpose = link.relationship === "self" ? "self_access" : "representative_access";
    const ownViews = prng.int(1, 2);
    for (let i = 0; i < ownViews && screeningIds.length > 0; i += 1) {
      push(
        self,
        "result_viewed",
        ownPurpose,
        { type: "screening", id: prng.pick(screeningIds) },
        at(prng.int(firstDay, lastDay), prng.int(16 * 60, 19 * 60)),
      );
    }
  }
  accessEvents.sort((a, b) =>
    a.occurredAt < b.occurredAt ? -1 : a.occurredAt > b.occurredAt ? 1 : a.id < b.id ? -1 : 1,
  );

  return {
    patients: pendingPatients,
    screenings,
    careTasks,
    citizenAccounts: accounts,
    patientLinks: links,
    identityVerifications: verifications,
    consentRecords: consents,
    nextStepAcks: acks,
    citizenSettings: settings,
    accessEvents,
  };
}
