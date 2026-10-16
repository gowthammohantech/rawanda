/**
 * `createSeed()` — the deterministic synthetic dataset every app builds (FND-05).
 *
 * Pure: uses only the seeded PRNG (`prng.ts`) and offsets from `nowIso` (−60 … +14 days). The
 * record plan (which record ends in which state) is fixed in `plan.ts`; the PRNG only varies
 * names, readings and minor timing. Every status is reached by replaying legal FND-02
 * transitions through `SeedBuilder`.
 */
import {
  DEMO_CLOCK_DEFAULT_ISO,
  type CareInstruction,
  type CareTask,
  type CareTaskId,
  type CorrelationId,
  type DistrictId,
  type FacilityId,
  type FollowUp,
  type Language,
  type Patient,
  type PersonaId,
  type Referral,
  type Reminder,
  type ReminderPreference,
  type ReminderPreferenceId,
  type Review,
  type Screening,
  type ScreeningSource,
  type Sex,
} from "@laif/domain";

import { DEMO_RULESET_V1 } from "../config/demo-ruleset.ts";
import { deterministicUuid, ID_NAMESPACES, seedId } from "../ids.ts";
import { inventUniqueNames } from "../names.ts";
import { createPrng, deriveSeed, type Prng } from "../prng.ts";
import { buildDistricts } from "../reference/districts.ts";
import { buildFacilities, FACILITY_IDS, FACILITY_TO_DISTRICT } from "../reference/facilities.ts";
import {
  CITIZEN_PATIENT_NAMES,
  DEMO_PERSONAS,
  PERSONA_IDS,
  toDemoPersona,
} from "../reference/personas.ts";
import { SeedBuilder, type Readings } from "./builder.ts";
import { PATIENT_COUNT, PATIENT_INDEX, PATIENT_RANGES, patientId } from "./ids.ts";
import {
  CARE_INSTRUCTION_NO,
  CARE_TASK_NO,
  FOLLOW_UP_NO,
  PATHWAY,
  REFERRAL_NO,
  SCREENING_NO,
} from "./plan.ts";
import {
  SEED_DEFAULT,
  SEED_VERSION,
  SYNTHETIC_DATA_NOTICE,
  type CreateSeedOptions,
  type SeedDataset,
} from "./types.ts";

const P = PERSONA_IDS;
const F = FACILITY_IDS;
const DUPLICATE_NAMES = ["Quavox Zelqoxe", "Quavox Zelqoxa"] as const;

function facilityOfPatient(index: number): FacilityId {
  for (const [facilityId, range] of Object.entries(PATIENT_RANGES)) {
    if (index >= range.first && index <= range.last) return facilityId as FacilityId;
  }
  throw new RangeError(`patient index out of range: ${index}`);
}

const CLINICIAN_FOR: Readonly<Record<string, PersonaId>> = {
  [F.alpha1]: P.clinAlpha1,
  [F.alpha2]: P.nurseAlpha2,
  [F.beta1]: P.clinBeta1,
};
const WORKER_FOR: Readonly<Record<string, PersonaId>> = {
  [F.alpha1]: P.chwAlpha1A,
  [F.alpha2]: P.chwAlpha2A,
  [F.beta1]: P.chwBeta1A,
};

export function createSeed(options: CreateSeedOptions = {}): SeedDataset {
  const seed = options.seed ?? SEED_DEFAULT;
  const nowIso = new Date(Date.parse(options.nowIso ?? DEMO_CLOCK_DEFAULT_ISO)).toISOString();
  const b = new SeedBuilder(nowIso, DEMO_RULESET_V1);
  const namesRng = createPrng(deriveSeed(seed, "names"));
  const patientRng = createPrng(deriveSeed(seed, "patients"));
  const readingsRng = createPrng(deriveSeed(seed, "readings"));
  const timingRng = createPrng(deriveSeed(seed, "timing"));

  const referenceAt = b.at(-60);
  const corr = (() => {
    let n = 0;
    return (): CorrelationId => {
      n += 1;
      return seedId<CorrelationId>(ID_NAMESPACES.correlation, n);
    };
  })();

  // ── Reference data ───────────────────────────────────────────────────────
  const districts = buildDistricts(referenceAt);
  const facilities = buildFacilities(referenceAt);
  const personas = DEMO_PERSONAS.map((spec) => toDemoPersona(spec, referenceAt));

  // ── Patients ─────────────────────────────────────────────────────────────
  const fixedNames = new Map<number, string>(
    Object.entries(CITIZEN_PATIENT_NAMES).map(([k, v]) => [Number(k), v] as const),
  );
  fixedNames.set(PATIENT_INDEX.duplicateA, DUPLICATE_NAMES[0]);
  fixedNames.set(PATIENT_INDEX.duplicateB, DUPLICATE_NAMES[1]);
  const taken = new Set<string>([
    ...fixedNames.values(),
    ...DEMO_PERSONAS.map((p) => p.displayName),
  ]);
  const invented = inventUniqueNames(namesRng, PATIENT_COUNT - fixedNames.size, taken);
  const patients: Patient[] = [];
  const patientByIndex = new Map<number, Patient>();
  let inventedNo = 0;
  for (let index = 1; index <= PATIENT_COUNT; index += 1) {
    const facilityId = facilityOfPatient(index);
    const name = fixedNames.get(index) ?? invented[inventedNo++];
    if (name === undefined) throw new Error("seed: ran out of invented names");
    const patient = makePatient(index, facilityId, name, patientRng, b.at(-60 + index * 0.02));
    patients.push(patient);
    patientByIndex.set(index, patient);
    b.registerPatient(patient, WORKER_FOR[facilityId] ?? P.chwAlpha1A, corr());
  }
  const pat = (index: number): Patient => {
    const p = patientByIndex.get(index);
    if (!p) throw new Error(`seed: unknown patient ${index}`);
    return p;
  };
  // Duplicate identity pair (HWM-04): same DOB, near-identical names, referencing each other.
  const dupA = pat(PATIENT_INDEX.duplicateA);
  const dupB = pat(PATIENT_INDEX.duplicateB);
  for (const [self, other] of [
    [dupA, dupB],
    [dupB, dupA],
  ] as const) {
    self.identityStatus = "possible_duplicate";
    self.duplicateCandidateIds = [other.id];
  }
  dupB.dateOfBirth = dupA.dateOfBirth;
  dupB.sexOptional = dupA.sexOptional;
  if (dupA.estimatedAgeYears === undefined) delete dupB.estimatedAgeYears;
  else dupB.estimatedAgeYears = dupA.estimatedAgeYears;

  const screenings: Screening[] = [];
  const reviews: Review[] = [];
  const referrals: Referral[] = [];
  const followUps: FollowUp[] = [];
  const careInstructions: CareInstruction[] = [];
  const reminders: Reminder[] = [];

  // ── Reading generators (PRNG; checked against the plan by the builder) ───
  const normalReadings = (): Readings => {
    const systolic = readingsRng.int(104, 138);
    const diastolic = readingsRng.int(62, Math.min(88, systolic - 30));
    if (!readingsRng.chance(0.7)) {
      return { systolic, diastolic, glucoseValue: null, glucoseUnit: null, glucoseContext: null };
    }
    const glucoseContext = readingsRng.pick([
      "fasting",
      "fasting",
      "non_fasting",
      "non_fasting",
      "not_recorded",
    ] as const);
    const mmol =
      glucoseContext === "fasting" ? readingsRng.float(4.2, 6.9) : readingsRng.float(4.6, 9.8);
    return readingsRng.chance(0.2)
      ? {
          systolic,
          diastolic,
          glucoseValue: Math.round(mmol * 18),
          glucoseUnit: "mg/dL",
          glucoseContext,
        }
      : { systolic, diastolic, glucoseValue: mmol, glucoseUnit: "mmol/L", glucoseContext };
  };
  const flaggedReadings = (): Readings => {
    const systolic = readingsRng.int(146, 174);
    const diastolic = readingsRng.int(84, 104);
    if (!readingsRng.chance(0.5)) {
      return { systolic, diastolic, glucoseValue: null, glucoseUnit: null, glucoseContext: null };
    }
    return {
      systolic,
      diastolic,
      glucoseValue: readingsRng.float(5.0, 13.5),
      glucoseUnit: "mmol/L",
      glucoseContext: "non_fasting",
    };
  };
  const capture = (source: ScreeningSource): number | null =>
    source === "worker_mobile" ? readingsRng.int(95, 290) : null;
  const minutes = (): number => timingRng.int(8, 45);

  const record = (input: {
    n: number;
    patientIndex: number;
    day: number;
    readings: Readings;
    expect: Screening["status"];
    correlationId: CorrelationId;
    workerId?: PersonaId;
    source?: ScreeningSource;
    observations?: Screening["observations"];
    notes?: string;
  }): Screening => {
    const patient = pat(input.patientIndex);
    const source = input.source ?? "worker_mobile";
    const s = b.screening({
      n: input.n,
      patient,
      workerId: input.workerId ?? WORKER_FOR[patient.facilityId] ?? P.chwAlpha1A,
      measuredAt: b.at(input.day),
      readings: input.readings,
      source,
      expect: input.expect,
      correlationId: input.correlationId,
      captureDurationSeconds: capture(source),
      ...(input.observations ? { observations: input.observations } : {}),
      ...(input.notes ? { notes: input.notes } : {}),
    });
    screenings.push(s);
    return s;
  };

  type Flagged = { screening: Screening; review: Review; correlationId: CorrelationId };
  const flagged = (input: {
    pathway: number;
    patientIndex: number;
    day: number;
    readings?: Readings;
    priority?: Review["priority"];
    source?: ScreeningSource;
    observations?: Screening["observations"];
    notes?: string;
  }): Flagged => {
    const correlationId = corr();
    const screening = record({
      n: input.pathway,
      patientIndex: input.patientIndex,
      day: input.day,
      readings: input.readings ?? flaggedReadings(),
      expect: "review_required",
      correlationId,
      ...(input.source ? { source: input.source } : {}),
      ...(input.observations ? { observations: input.observations } : {}),
      ...(input.notes ? { notes: input.notes } : {}),
    });
    const review = b.review({
      n: input.pathway,
      screening,
      assignedClinicianId: CLINICIAN_FOR[screening.facilityId] ?? P.clinAlpha1,
      correlationId,
      ...(input.priority ? { priority: input.priority } : {}),
    });
    reviews.push(review);
    return { screening, review, correlationId };
  };

  const clinicianOf = (f: Flagged): PersonaId => f.review.assignedClinicianId ?? P.clinAlpha1;
  // Every demo referral goes to the district hospital (Beta-1 refers to its own outpatient clinic).
  const destinationOf = (): FacilityId => F.beta1;

  const refer = (
    f: Flagged,
    input: {
      referralNo: number;
      day: number;
      dueDay: number;
      workerId?: PersonaId;
      reason?: string;
    },
  ): Referral => {
    const by = clinicianOf(f);
    const at = b.at(input.day);
    if (f.review.status !== "action_recorded") {
      b.decide(
        f.review,
        "refer",
        "Refer for facility assessment (demo pathway).",
        at,
        by,
        f.correlationId,
      );
    }
    const ref = b.referral({
      n: input.referralNo,
      review: f.review,
      destinationFacilityId: destinationOf(),
      at,
      dueAt: b.at(input.dueDay),
      assignedWorkerId: input.workerId ?? WORKER_FOR[f.review.facilityId] ?? P.chwAlpha1A,
      referralReason:
        input.reason ?? "Readings above the demo review rule; facility assessment requested.",
      by,
      correlationId: f.correlationId,
    });
    referrals.push(ref);
    return ref;
  };

  const followUp = (input: {
    n: number;
    f: Flagged;
    referral: Referral | null;
    purpose: FollowUp["purpose"];
    day: number;
    dueDay: number;
    workerId?: PersonaId;
  }): FollowUp => {
    const fu = b.followUp({
      n: input.n,
      patientId: input.f.review.patientId,
      facilityId: input.f.review.facilityId,
      referralId: input.referral?.id ?? null,
      reviewId: input.f.review.id,
      purpose: input.purpose,
      workerId: input.workerId ?? WORKER_FOR[input.f.review.facilityId] ?? P.chwAlpha1A,
      at: b.at(input.day),
      dueAt: b.at(input.dueDay),
      by: clinicianOf(input.f),
      correlationId: input.f.correlationId,
    });
    followUps.push(fu);
    return fu;
  };

  const contact = (
    fu: FollowUp,
    f: Flagged,
    day: number,
    result: "reached" | "not_reached",
    method: "home_visit" | "phone" = "home_visit",
  ): void => {
    b.attempt(
      fu,
      {
        at: b.at(day),
        method,
        result,
        minutes: minutes(),
        note:
          result === "reached"
            ? "Spoke with the patient (demo)."
            : "No answer at the home visit (demo).",
        by: fu.assignedWorkerId ?? P.chwAlpha1A,
      },
      f.correlationId,
    );
  };

  const completeVisit = (
    fu: FollowUp,
    f: Flagged,
    day: number,
    confirmation: "confirm" | "pending",
    confirmDay?: number,
  ): void => {
    b.completeFollowUp(
      fu,
      {
        at: b.at(day),
        kind: "attended",
        evidenceType: "appointment_card_seen",
        note: "Patient attended; appointment card seen (demo).",
        by: fu.assignedWorkerId ?? P.chwAlpha1A,
        confirmation: "pending",
      },
      f.correlationId,
    );
    if (confirmation === "confirm") {
      b.confirmCompletion(fu, b.at(confirmDay ?? day + 1), clinicianOf(f), f.correlationId);
    }
  };

  const completeRef = (
    ref: Referral,
    f: Flagged,
    day: number,
    type: "facility_attendance_record" | "clinician_confirmation" | "return_slip_reference",
    reference: string,
  ): void => {
    b.completeReferral(
      ref,
      {
        at: b.at(day),
        type,
        reference,
        outcome: "attended_seen",
        note: "Seen at the receiving facility (demo).",
        by: clinicianOf(f),
      },
      f.correlationId,
    );
  };

  const release = (input: {
    n: number;
    f: Flagged;
    kind: CareInstruction["kind"];
    source: { type: "review" | "referral" | "follow_up"; id: string };
    appointmentAt: string | null;
    day: number;
  }): CareInstruction => {
    const ci = b.releaseInstruction({
      n: input.n,
      patientId: input.f.review.patientId,
      facilityId: input.f.review.facilityId,
      kind: input.kind,
      source: input.source,
      appointmentAt: input.appointmentAt,
      at: b.at(input.day),
      by: clinicianOf(input.f),
      correlationId: input.f.correlationId,
    });
    careInstructions.push(ci);
    return ci;
  };

  let reminderNo = 0;
  const remind = (
    ci: CareInstruction,
    fu: FollowUp | null,
    createdDay: number,
    scheduledAt: string,
    f: Flagged,
  ): Reminder => {
    reminderNo += 1;
    const r = b.reminder({
      n: reminderNo,
      instruction: ci,
      followUpId: fu?.id ?? null,
      createdAt: b.at(createdDay),
      scheduledAt,
      correlationId: f.correlationId,
    });
    reminders.push(r);
    return r;
  };

  // ════ Flagged pathways (plan.ts table) ═══════════════════════════════════
  // 1 · CTZ-P1: completed referral + completed follow-up with released instruction (SCN-05).
  const p1a = flagged({
    pathway: PATHWAY.ctzP1Completed,
    patientIndex: PATIENT_INDEX.ctzP1,
    day: -45.9,
    readings: {
      systolic: 158,
      diastolic: 96,
      glucoseValue: 12.4,
      glucoseUnit: "mmol/L",
      glucoseContext: "non_fasting",
    },
  });
  const r9 = refer(p1a, { referralNo: REFERRAL_NO.R9, day: -44.9, dueDay: -30 });
  const fa9 = followUp({
    n: FOLLOW_UP_NO.FA9,
    f: p1a,
    referral: r9,
    purpose: "referral_attendance",
    day: -44.9,
    dueDay: -36,
  });
  const ci1 = release({
    n: CARE_INSTRUCTION_NO.CI1,
    f: p1a,
    kind: "follow_up",
    source: { type: "follow_up", id: fa9.id },
    appointmentAt: null,
    day: -44.8,
  });
  b.accept(r9, b.at(-43.9), clinicianOf(p1a), p1a.correlationId);
  b.schedule(r9, b.at(-42.9), b.at(-37.9), clinicianOf(p1a), p1a.correlationId);
  const rem1 = remind(ci1, fa9, -42.8, b.at(-38.9), p1a);
  const rem2 = remind(ci1, fa9, -42.8, b.at(-38.1), p1a);
  contact(fa9, p1a, -40.9, "reached");
  b.deliverReminder(rem1, b.at(-38.9), p1a.correlationId, F.alpha1);
  b.deliverReminder(rem2, b.at(-38.1), p1a.correlationId, F.alpha1);
  b.acknowledgeReminder(rem2, b.at(-38.05), p1a.correlationId, F.alpha1);
  completeRef(r9, p1a, -37.8, "facility_attendance_record", "DEMO-ATT-0009");
  completeVisit(fa9, p1a, -37.6, "confirm", -36.9);
  const pc2 = followUp({
    n: FOLLOW_UP_NO.PC2,
    f: p1a,
    referral: r9,
    purpose: "post_referral_check",
    day: -37.5,
    dueDay: -30,
  });
  contact(pc2, p1a, -31.9, "reached", "phone");
  completeVisit(pc2, p1a, -31.8, "confirm", -30.9);

  // 2 · CTZ-P1: scheduled referral with appointment 19 Oct 10:30 Kigali; WF-02 conflict follow-up.
  const p1b = flagged({
    pathway: PATHWAY.ctzP1Scheduled,
    patientIndex: PATIENT_INDEX.ctzP1,
    day: -12.9,
  });
  const r6 = refer(p1b, { referralNo: REFERRAL_NO.R6, day: -11.9, dueDay: 10 });
  const fa6 = followUp({
    n: FOLLOW_UP_NO.FA6,
    f: p1b,
    referral: r6,
    purpose: "referral_attendance",
    day: -11.9,
    dueDay: 6,
  });
  b.accept(r6, b.at(-10.9), clinicianOf(p1b), p1b.correlationId);
  // 19 Oct 2026 10:30 Kigali with the default clock (5 days 2.5 h after it).
  const appointment19Oct = b.at(5 + 2.5 / 24);
  b.schedule(r6, b.at(-9.9), appointment19Oct, clinicianOf(p1b), p1b.correlationId);
  const ci2 = release({
    n: CARE_INSTRUCTION_NO.CI2,
    f: p1b,
    kind: "appointment",
    source: { type: "referral", id: r6.id },
    appointmentAt: appointment19Oct,
    day: -9.8,
  });
  const pc6 = followUp({
    n: FOLLOW_UP_NO.PC6,
    f: p1b,
    referral: r6,
    purpose: "post_referral_check",
    day: -9.7,
    dueDay: 12,
  });
  contact(pc6, p1b, -7.9, "not_reached");
  b.unableToReach(pc6, "not_at_home_repeatedly", b.at(-6.9), P.chwAlpha1A, p1b.correlationId);
  b.reassign(
    pc6,
    P.chwAlpha1B,
    "Original worker unavailable this week (demo).",
    b.at(-5.9),
    P.clinAlpha1,
    p1b.correlationId,
  );
  contact(fa6, p1b, -5.8, "reached");
  b.addNote(
    fa6,
    "Patient confirmed the appointment date (demo).",
    b.at(-4.9),
    P.chwAlpha1A,
    p1b.correlationId,
  );
  remind(ci2, fa6, -9.7, new Date(Date.parse(appointment19Oct) - 86_400_000).toISOString(), p1b);

  // 3 · CTZ-P1: referral created but NOT released to the wallet.
  const p1c = flagged({
    pathway: PATHWAY.ctzP1Unreleased,
    patientIndex: PATIENT_INDEX.ctzP1,
    day: -2.9,
  });
  const r1 = refer(p1c, { referralNo: REFERRAL_NO.R1, day: -1.9, dueDay: 12 });
  const fa1 = followUp({
    n: FOLLOW_UP_NO.FA1,
    f: p1c,
    referral: r1,
    purpose: "referral_attendance",
    day: -1.9,
    dueDay: 7,
  });

  // 4 · CTZ-P3: accepted referral, follow-up past due, then consent withdrawn (SCN-10).
  const p3 = flagged({
    pathway: PATHWAY.ctzP3Withdrawn,
    patientIndex: PATIENT_INDEX.ctzP3Withdrawn,
    day: -20.9,
  });
  const r3 = refer(p3, { referralNo: REFERRAL_NO.R3, day: -19.9, dueDay: 4 });
  const fa3 = followUp({
    n: FOLLOW_UP_NO.FA3,
    f: p3,
    referral: r3,
    purpose: "referral_attendance",
    day: -19.9,
    dueDay: -2,
  });
  b.accept(r3, b.at(-18.9), clinicianOf(p3), p3.correlationId);
  const ci4 = release({
    n: CARE_INSTRUCTION_NO.CI4,
    f: p3,
    kind: "referral",
    source: { type: "referral", id: r3.id },
    appointmentAt: null,
    day: -18.8,
  });
  const rem3a = remind(ci4, fa3, -18.7, b.at(-3), p3);
  const rem3b = remind(ci4, fa3, -18.7, b.at(-2.2), p3);
  const p3Patient = pat(PATIENT_INDEX.ctzP3Withdrawn);
  b.withdrawConsent(p3Patient, b.at(-5), P.citizenWithdrawn, p3.correlationId);
  b.cancelReminder(rem3a, "consent_withdrawn", b.at(-5), p3.correlationId, F.alpha1);
  b.cancelReminder(rem3b, "consent_withdrawn", b.at(-5), p3.correlationId, F.alpha1);

  // 5 · WF-01 / SCN-02: pending, BP + glucose with units, full explainable flag.
  flagged({
    pathway: PATHWAY.wf01Flagged,
    patientIndex: PATIENT_INDEX.wf01Flagged,
    day: -0.9,
    priority: "urgent_demo",
    readings: {
      systolic: 162,
      diastolic: 98,
      glucoseValue: 13.4,
      glucoseUnit: "mmol/L",
      glucoseContext: "non_fasting",
    },
  });

  // 6 · WF-03: pending review whose evidence includes a repeat reading.
  flagged({
    pathway: PATHWAY.wf03Dismissable,
    patientIndex: PATIENT_INDEX.wf03Dismissable,
    day: -2.8,
    readings: {
      systolic: 148,
      diastolic: 88,
      glucoseValue: 5.6,
      glucoseUnit: "mmol/L",
      glucoseContext: "fasting",
    },
    observations: [
      { code: "SYSTOLIC_REPEAT", value: 134, unit: "mmHg" },
      { code: "DIASTOLIC_REPEAT", value: 84, unit: "mmHg" },
      { code: "REPEAT_MINUTES_AFTER_FIRST", value: 10, unit: "min" },
    ],
    notes: "Repeat reading taken after 10 minutes of rest (demo).",
  });

  // 7 · SCN-03: clinician dismissal with reason.
  const scn03 = flagged({
    pathway: PATHWAY.scn03Dismissed,
    patientIndex: PATIENT_INDEX.scn03Dismissed,
    day: -15.9,
  });
  b.dismiss(
    scn03.review,
    "repeat_reading_acceptable",
    "Repeat reading at the facility was within the demo range; flag not actionable.",
    b.at(-14.9),
    P.clinAlpha1,
    scn03.correlationId,
  );

  // 8 · SCN-04: scheduled referral past its due date; attendance follow-up past due.
  const od = flagged({
    pathway: PATHWAY.overdueReferral,
    patientIndex: PATIENT_INDEX.overdueReferral,
    day: -30.9,
  });
  const r5 = refer(od, { referralNo: REFERRAL_NO.R5, day: -29.9, dueDay: -3 });
  followUp({
    n: FOLLOW_UP_NO.FA5,
    f: od,
    referral: r5,
    purpose: "referral_attendance",
    day: -29.9,
    dueDay: -5,
  });
  b.accept(r5, b.at(-28.9), clinicianOf(od), od.correlationId);
  b.schedule(r5, b.at(-27.9), b.at(-4), clinicianOf(od), od.correlationId);
  const pc5 = followUp({
    n: FOLLOW_UP_NO.PC5,
    f: od,
    referral: r5,
    purpose: "post_referral_check",
    day: -27.8,
    dueDay: 3,
  });
  contact(pc5, od, -6.9, "reached", "phone");

  // 9 · WF-01 step 7: completed referral; worker-completed follow-up awaiting clinician confirmation.
  const wc = flagged({
    pathway: PATHWAY.workerCompleted,
    patientIndex: PATIENT_INDEX.workerCompleted,
    day: -35.9,
  });
  const r8 = refer(wc, {
    referralNo: REFERRAL_NO.R8,
    day: -34.9,
    dueDay: -20,
    workerId: P.chwAlpha1B,
  });
  const fa8 = followUp({
    n: FOLLOW_UP_NO.FA8,
    f: wc,
    referral: r8,
    purpose: "referral_attendance",
    day: -34.9,
    dueDay: -26,
    workerId: P.chwAlpha1B,
  });
  b.accept(r8, b.at(-33.9), clinicianOf(wc), wc.correlationId);
  b.schedule(r8, b.at(-32.9), b.at(-27.9), clinicianOf(wc), wc.correlationId);
  release({
    n: CARE_INSTRUCTION_NO.CI6,
    f: wc,
    kind: "referral",
    source: { type: "referral", id: r8.id },
    appointmentAt: r8.appointmentAt,
    day: -32.8,
  });
  contact(fa8, wc, -30.9, "reached");
  completeRef(r8, wc, -27.8, "return_slip_reference", "DEMO-SLIP-0008");
  completeVisit(fa8, wc, -27.6, "pending");
  const pc1 = followUp({
    n: FOLLOW_UP_NO.PC1,
    f: wc,
    referral: r8,
    purpose: "post_referral_check",
    day: -27.5,
    dueDay: -20,
    workerId: P.chwAlpha1B,
  });
  contact(pc1, wc, -22.9, "reached");
  completeVisit(pc1, wc, -21.8, "confirm", -20.9);

  // 10 · CTZ-P2: dismissed screening.
  const p2a = flagged({
    pathway: PATHWAY.ctzP2Dismissed,
    patientIndex: PATIENT_INDEX.ctzP2,
    day: -40.9,
  });
  b.dismiss(
    p2a.review,
    "measurement_error_suspected",
    "Cuff size was wrong for the first reading; repeat at the visit was normal.",
    b.at(-39.9),
    P.nurseAlpha2,
    p2a.correlationId,
  );

  // 11 · CTZ-P2: referral cancelled with reason, replaced on the same review; instruction withdrawn.
  const p2b = flagged({
    pathway: PATHWAY.ctzP2Cancelled,
    patientIndex: PATIENT_INDEX.ctzP2,
    day: -25.9,
  });
  const r12 = refer(p2b, { referralNo: REFERRAL_NO.R12, day: -24.9, dueDay: -10 });
  b.accept(r12, b.at(-23.9), clinicianOf(p2b), p2b.correlationId);
  const ci7 = release({
    n: CARE_INSTRUCTION_NO.CI7,
    f: p2b,
    kind: "referral",
    source: { type: "referral", id: r12.id },
    appointmentAt: null,
    day: -23.8,
  });
  b.cancelReferral(
    r12,
    "destination_unavailable",
    "Destination clinic closed for the demo week; patient re-referred.",
    b.at(-20.9),
    P.nurseAlpha2,
    p2b.correlationId,
  );
  b.withdrawInstruction(ci7, b.at(-20.85), P.nurseAlpha2, p2b.correlationId);
  const r7 = refer(p2b, {
    referralNo: REFERRAL_NO.R7,
    day: -20.8,
    dueDay: 10,
    reason: "Replacement referral after the destination became unavailable.",
  });
  const fa7 = followUp({
    n: FOLLOW_UP_NO.FA7,
    f: p2b,
    referral: r7,
    purpose: "referral_attendance",
    day: -20.8,
    dueDay: 6,
  });
  b.accept(r7, b.at(-19.9), clinicianOf(p2b), p2b.correlationId);
  const appointmentR7 = b.at(5.25);
  b.schedule(r7, b.at(-18.9), appointmentR7, clinicianOf(p2b), p2b.correlationId);
  const ci3 = release({
    n: CARE_INSTRUCTION_NO.CI3,
    f: p2b,
    kind: "appointment",
    source: { type: "referral", id: r7.id },
    appointmentAt: appointmentR7,
    day: -18.8,
  });
  const rem4 = remind(
    ci3,
    fa7,
    -18.7,
    new Date(Date.parse(appointmentR7) - 86_400_000).toISOString(),
    p2b,
  );
  b.cancelReminder(rem4, "opted_out", b.at(-15), p2b.correlationId, F.alpha2);
  contact(fa7, p2b, -12.9, "not_reached");
  b.unableToReach(fa7, "phone_unreachable", b.at(-10.9), P.chwAlpha2A, p2b.correlationId);
  b.reassign(
    fa7,
    P.supAlpha,
    "Supervisor to visit in person (demo).",
    b.at(-9.9),
    P.nurseAlpha2,
    p2b.correlationId,
  );

  // 12 · CTZ-P2: newer screening awaiting review.
  flagged({ pathway: PATHWAY.ctzP2Awaiting, patientIndex: PATIENT_INDEX.ctzP2, day: -1.9 });

  // 13 · CTZ-P4 represented patient: plan_follow_up decision → planned review follow-up.
  const p4 = flagged({
    pathway: PATHWAY.ctzP4PlanFollowUp,
    patientIndex: PATIENT_INDEX.ctzP4Represented,
    day: -18.9,
  });
  b.decide(
    p4.review,
    "plan_follow_up",
    "Plan a follow-up review visit in two weeks (demo).",
    b.at(-17.9),
    P.nurseAlpha2,
    p4.correlationId,
  );
  const pr1 = followUp({
    n: FOLLOW_UP_NO.PR1,
    f: p4,
    referral: null,
    purpose: "planned_review",
    day: -17.9,
    dueDay: 4,
  });
  const ci5 = release({
    n: CARE_INSTRUCTION_NO.CI5,
    f: p4,
    kind: "follow_up",
    source: { type: "follow_up", id: pr1.id },
    appointmentAt: pr1.dueAt,
    day: -16.9,
  });
  const rem5 = remind(ci5, pr1, -16.8, b.at(-10), p4);
  b.deliverReminder(rem5, b.at(-10), p4.correlationId, F.alpha2);
  remind(ci5, pr1, -16.8, b.at(3), p4);

  // 14 · SCN-06: imported screening with glucose unit missing, review in progress.
  const mu = flagged({
    pathway: PATHWAY.missingUnit,
    patientIndex: PATIENT_INDEX.missingUnit,
    day: -3.9,
    source: "imported",
    readings: {
      systolic: 136,
      diastolic: 84,
      glucoseValue: 9.2,
      glucoseUnit: null,
      glucoseContext: "non_fasting",
    },
    notes: "Imported from a paper register; glucose unit not recorded (demo).",
  });
  b.startReview(mu.review, b.at(-2.9), P.nurseAlpha2, mu.correlationId);

  // 15 · Alpha-2: referral created.
  const ca2 = flagged({
    pathway: PATHWAY.createdAlpha2,
    patientIndex: PATIENT_INDEX.createdReferralAlpha2,
    day: -3.2,
  });
  const r2 = refer(ca2, { referralNo: REFERRAL_NO.R2, day: -2.5, dueDay: 11 });
  const fa2 = followUp({
    n: FOLLOW_UP_NO.FA2,
    f: ca2,
    referral: r2,
    purpose: "referral_attendance",
    day: -2.5,
    dueDay: 6,
  });

  // 16 · Alpha-2: completed referral; post-referral check unable to reach.
  const utr = flagged({
    pathway: PATHWAY.unableToReach,
    patientIndex: PATIENT_INDEX.unableToReach,
    day: -50.9,
  });
  const r11 = refer(utr, { referralNo: REFERRAL_NO.R11, day: -49.9, dueDay: -36 });
  const fa11 = followUp({
    n: FOLLOW_UP_NO.FA11,
    f: utr,
    referral: r11,
    purpose: "referral_attendance",
    day: -49.9,
    dueDay: -40,
  });
  b.accept(r11, b.at(-48.9), clinicianOf(utr), utr.correlationId);
  b.schedule(r11, b.at(-47.9), b.at(-42.9), clinicianOf(utr), utr.correlationId);
  contact(fa11, utr, -45.9, "reached", "phone");
  completeRef(r11, utr, -42.8, "clinician_confirmation", "DEMO-CONF-0011");
  completeVisit(fa11, utr, -42.6, "confirm", -41.9);
  const pc4 = followUp({
    n: FOLLOW_UP_NO.PC4,
    f: utr,
    referral: r11,
    purpose: "post_referral_check",
    day: -42.5,
    dueDay: -30,
  });
  contact(pc4, utr, -38.9, "not_reached");
  contact(pc4, utr, -35.9, "not_reached", "phone");
  b.unableToReach(pc4, "moved_away", b.at(-34.9), P.chwAlpha2A, utr.correlationId);

  // 17 · WF-04: Beta-1 patient + pending review (other-facility counterpart).
  flagged({
    pathway: PATHWAY.wf04OtherFacility,
    patientIndex: PATIENT_INDEX.wf04OtherFacility,
    day: -1.8,
  });

  // 18 · Beta-1: dismissed.
  const db = flagged({
    pathway: PATHWAY.dismissedBeta,
    patientIndex: PATIENT_INDEX.dismissedBeta,
    day: -22.9,
  });
  b.dismiss(
    db.review,
    "known_managed_condition",
    "Known condition already managed at the district hospital clinic (demo).",
    b.at(-21.9),
    P.clinBeta1,
    db.correlationId,
  );

  // 19 · Beta-1: accepted referral; follow-up contacted.
  const ab = flagged({
    pathway: PATHWAY.acceptedBeta,
    patientIndex: PATIENT_INDEX.acceptedReferralBeta,
    day: -8.9,
  });
  const r4 = refer(ab, { referralNo: REFERRAL_NO.R4, day: -7.9, dueDay: 7 });
  const fa4 = followUp({
    n: FOLLOW_UP_NO.FA4,
    f: ab,
    referral: r4,
    purpose: "referral_attendance",
    day: -7.9,
    dueDay: 5,
  });
  b.accept(r4, b.at(-6.9), clinicianOf(ab), ab.correlationId);
  contact(fa4, ab, -3.9, "reached");

  // 20 · Beta-1: completed referral with evidence; the single Beta-1 completed follow-up (SCN-12).
  const cb = flagged({
    pathway: PATHWAY.completedBeta,
    patientIndex: PATIENT_INDEX.completedReferralBeta,
    day: -55.9,
  });
  const r10 = refer(cb, { referralNo: REFERRAL_NO.R10, day: -54.9, dueDay: -40 });
  const fa10 = followUp({
    n: FOLLOW_UP_NO.FA10,
    f: cb,
    referral: r10,
    purpose: "referral_attendance",
    day: -54.9,
    dueDay: -46,
  });
  b.accept(r10, b.at(-53.9), clinicianOf(cb), cb.correlationId);
  b.schedule(r10, b.at(-52.9), b.at(-47.9), clinicianOf(cb), cb.correlationId);
  contact(fa10, cb, -50.9, "reached");
  completeRef(r10, cb, -47.8, "facility_attendance_record", "DEMO-ATT-0010");
  completeVisit(fa10, cb, -47.6, "confirm", -46.9);
  const pc3 = followUp({
    n: FOLLOW_UP_NO.PC3,
    f: cb,
    referral: r10,
    purpose: "post_referral_check",
    day: -47.5,
    dueDay: -38,
  });
  contact(pc3, cb, -42.9, "not_reached");
  contact(pc3, cb, -41.9, "not_reached", "phone");
  b.unableToReach(pc3, "not_at_home_repeatedly", b.at(-40.9), P.chwBeta1A, cb.correlationId);

  // ════ No-review screenings (37) ═══════════════════════════════════════════
  // SCN-01: worker Alpha-1 normal screening (newest no-review record of Alpha-1).
  record({
    n: SCREENING_NO.scn01Normal,
    patientIndex: PATIENT_INDEX.scn01Normal,
    day: -1.2,
    workerId: P.chwAlpha1A,
    readings: {
      systolic: 122,
      diastolic: 78,
      glucoseValue: 5.4,
      glucoseUnit: "mmol/L",
      glucoseContext: "fasting",
    },
    expect: "no_review_required",
    correlationId: corr(),
  });
  // Amended screening (original fields retained; amendment does not change the outcome).
  const amendCorrelation = corr();
  const amended = record({
    n: SCREENING_NO.amended,
    patientIndex: PATIENT_INDEX.amended,
    day: -9.9,
    readings: {
      systolic: 128,
      diastolic: 82,
      glucoseValue: null,
      glucoseUnit: null,
      glucoseContext: null,
    },
    expect: "no_review_required",
    correlationId: amendCorrelation,
  });
  b.amend(
    amended,
    "systolic",
    126,
    "Transcription error: device display showed 126 on re-check.",
    P.nurseAlpha2,
    b.at(-8.9),
    amendCorrelation,
  );
  // CTZ-P4 represented patient: released no-action result.
  record({
    n: SCREENING_NO.ctzP4NoAction,
    patientIndex: PATIENT_INDEX.ctzP4Represented,
    day: -50.2,
    readings: {
      systolic: 118,
      diastolic: 76,
      glucoseValue: 5.1,
      glucoseUnit: "mmol/L",
      glucoseContext: "fasting",
    },
    expect: "no_review_required",
    correlationId: corr(),
  });

  const flaggedPatients = new Set(reviews.map((r) => r.patientId));
  const needNoReview: number[] = [];
  for (let index = 1; index <= PATIENT_COUNT; index += 1) {
    const id = patientId(index);
    if (flaggedPatients.has(id)) continue;
    if (index === PATIENT_INDEX.scn01Normal || index === PATIENT_INDEX.amended) continue;
    needNoReview.push(index);
  }
  // Extra second screenings (A1 ×2, A2 ×1, B1 ×1) bring the no-review total to 37.
  needNoReview.push(9, 10, 25, 39);
  let nrNo = SCREENING_NO.firstOtherNoReview;
  for (const index of needNoReview) {
    const facilityId = facilityOfPatient(index);
    const clinicalWeb = index === 17 || index === 18;
    const alpha1Worker = index % 2 === 0 ? P.chwAlpha1A : P.chwAlpha1B;
    record({
      n: nrNo,
      patientIndex: index,
      // Daytime in Kigali: 09:00–17:30 on a day 3–58 days before the demo clock.
      day: -timingRng.int(3, 58) + timingRng.float(0.05, 0.4, 3),
      workerId: clinicalWeb
        ? P.clinAlpha1
        : facilityId === F.alpha1
          ? alpha1Worker
          : (WORKER_FOR[facilityId] ?? P.chwAlpha1A),
      source: clinicalWeb ? "clinical_web" : "worker_mobile",
      readings: normalReadings(),
      expect: "no_review_required",
      correlationId: corr(),
    });
    nrNo += 1;
  }
  if (nrNo - 1 !== SCREENING_NO.lastNoReview) {
    throw new Error(
      `seed: expected no-review screenings to end at ${SCREENING_NO.lastNoReview}, got ${nrNo - 1}`,
    );
  }

  // ════ Drafts (3) ════════════════════════════════════════════════════════
  record({
    n: SCREENING_NO.draftMissingUnit,
    patientIndex: 9,
    day: -0.6,
    workerId: P.chwAlpha1A,
    expect: "draft",
    correlationId: corr(),
    readings: {
      systolic: 131,
      diastolic: 83,
      glucoseValue: 8.1,
      glucoseUnit: null,
      glucoseContext: "fasting",
    },
    notes: "Draft: glucose unit not yet selected (demo).",
  });
  record({
    n: SCREENING_NO.draftAlpha2,
    patientIndex: 26,
    day: -0.65,
    expect: "draft",
    correlationId: corr(),
    readings: {
      systolic: 124,
      diastolic: 80,
      glucoseValue: null,
      glucoseUnit: null,
      glucoseContext: null,
    },
  });
  record({
    n: SCREENING_NO.draftBeta1,
    patientIndex: 40,
    day: -0.7,
    expect: "draft",
    correlationId: corr(),
    readings: {
      systolic: 119,
      diastolic: null,
      glucoseValue: null,
      glucoseUnit: null,
      glucoseContext: null,
    },
  });

  // ════ Care tasks (6) ════════════════════════════════════════════════════
  const careTasks: CareTask[] = [];
  const taskBase = (n: number, day: number) => {
    const at = b.at(day);
    return {
      id: seedId<CareTaskId>(ID_NAMESPACES.careTask, n),
      status: "open" as const,
      completedAt: null,
      cancelled: null,
      version: 1,
      createdAt: at,
      updatedAt: at,
      synthetic: true as const,
    };
  };
  const p1Patient = pat(PATIENT_INDEX.ctzP1);
  const citizenCorrection = b.careTask(
    {
      ...taskBase(CARE_TASK_NO.citizenCorrection, -7.9),
      kind: "correction_request",
      patientId: p1Patient.id,
      facilityId: p1Patient.facilityId,
      assignedToId: P.coordAlpha,
      createdBy: P.citizen1,
      dueAt: b.at(3),
      payload: {
        targetType: "screening",
        targetId: p1a.screening.id,
        description: "The time shown for my screening looks wrong; it was in the morning.",
        suggestedValue: null,
      },
    },
    corr(),
    "correction.requested",
  );
  const staffCorrectionCorrelation = corr();
  const staffCorrection = b.careTask(
    {
      ...taskBase(CARE_TASK_NO.staffCorrection, -5.9),
      kind: "correction_request",
      patientId: patientId(25),
      facilityId: F.alpha2,
      assignedToId: P.chwAlpha2A,
      createdBy: P.nurseAlpha2,
      dueAt: b.at(2),
      payload: {
        targetType: "patient",
        targetId: patientId(25),
        description: "Date of birth may have been entered with day and month swapped.",
        suggestedValue: null,
      },
    },
    staffCorrectionCorrelation,
    "correction.requested",
  );
  b.careTaskStatus(
    staffCorrection,
    "in_progress",
    b.at(-4.9),
    P.chwAlpha2A,
    staffCorrectionCorrelation,
  );
  const assign1 = b.careTask(
    {
      ...taskBase(CARE_TASK_NO.assignmentFA1, -1.9),
      kind: "follow_up_assignment",
      patientId: fa1.patientId,
      facilityId: fa1.facilityId,
      assignedToId: P.chwAlpha1A,
      createdBy: P.clinAlpha1,
      dueAt: fa1.dueAt,
      payload: { followUpId: fa1.id, referralId: r1.id },
    },
    p1c.correlationId,
  );
  const assign2 = b.careTask(
    {
      ...taskBase(CARE_TASK_NO.assignmentFA2, -2.5),
      kind: "follow_up_assignment",
      patientId: fa2.patientId,
      facilityId: fa2.facilityId,
      assignedToId: P.chwAlpha2A,
      createdBy: P.nurseAlpha2,
      dueAt: fa2.dueAt,
      payload: { followUpId: fa2.id, referralId: r2.id },
    },
    ca2.correlationId,
  );
  b.careTaskStatus(assign2, "in_progress", b.at(-1.5), P.chwAlpha2A, ca2.correlationId);
  const programmeCorrelation = corr();
  const programmeAction = b.careTask(
    {
      ...taskBase(CARE_TASK_NO.programmeAction, -10.9),
      kind: "programme_action",
      patientId: null,
      facilityId: F.alpha1,
      assignedToId: P.fmgrAlpha1,
      createdBy: P.leadProgramme,
      dueAt: b.at(-6),
      payload: {
        actionKey: "review_follow_up_backlog",
        note: "Review the follow-up backlog with the facility team (demo).",
      },
    },
    programmeCorrelation,
  );
  b.careTaskStatus(programmeAction, "in_progress", b.at(-9.9), P.fmgrAlpha1, programmeCorrelation);
  b.careTaskStatus(programmeAction, "done", b.at(-7.9), P.fmgrAlpha1, programmeCorrelation);
  const dataQuality = b.careTask(
    {
      ...taskBase(CARE_TASK_NO.dataQuality, -2.9),
      kind: "data_quality",
      patientId: mu.screening.patientId,
      facilityId: mu.screening.facilityId,
      assignedToId: P.nurseAlpha2,
      createdBy: P.analystAlpha,
      dueAt: b.at(4),
      payload: {
        issueCode: "GLUCOSE_UNIT_MISSING",
        targetType: "screening",
        targetId: mu.screening.id,
        note: "Imported record without a glucose unit (demo).",
      },
    },
    mu.correlationId,
  );
  careTasks.push(
    citizenCorrection,
    staffCorrection,
    assign1,
    assign2,
    programmeAction,
    dataQuality,
  );

  // ════ Reminder preferences (every patient with a citizen persona) ═══════
  const prefSpecs: ReadonlyArray<readonly [number, boolean, ReminderPreference["timing"]]> = [
    [PATIENT_INDEX.ctzP1, true, "day_before"],
    [PATIENT_INDEX.ctzP2, false, "morning_of"],
    [PATIENT_INDEX.ctzP3Withdrawn, false, "day_before"],
    [PATIENT_INDEX.ctzP4Represented, true, "morning_of"],
  ];
  const reminderPreferences: ReminderPreference[] = prefSpecs.map(([index, optedIn, timing], i) => {
    const at = b.at(-59);
    const pref: ReminderPreference = {
      id: seedId<ReminderPreferenceId>(ID_NAMESPACES.reminderPreference, i + 1),
      patientId: patientId(index),
      optedIn,
      timing,
      channel: "in_app",
      version: 1,
      createdAt: at,
      updatedAt: at,
      synthetic: true,
    };
    b.audit({
      action: "reminder_preference.set",
      entityType: "reminder_preference",
      entityId: pref.id,
      actorId: null,
      at,
      correlationId: corr(),
      scope: {
        facilityId: facilityOfPatient(index),
        districtId: FACILITY_TO_DISTRICT[facilityOfPatient(index)] ?? null,
        patientId: pref.patientId,
      },
      summary: { optedIn, timing },
    });
    return pref;
  });

  const byNumber = <T extends { id: string }>(items: T[], ns: string, count: number): T[] => {
    const order = new Map<string, number>(
      Array.from({ length: count }, (_, i) => [deterministicUuid(ns, i + 1), i] as const),
    );
    return [...items].sort((a, c) => (order.get(a.id) ?? 0) - (order.get(c.id) ?? 0));
  };

  return {
    meta: {
      seedVersion: SEED_VERSION,
      seed,
      demoClockIso: nowIso,
      generatedFor: SYNTHETIC_DATA_NOTICE,
    },
    districts,
    facilities,
    personas,
    patients,
    screenings: byNumber(screenings, ID_NAMESPACES.screening, screenings.length),
    reviews: byNumber(reviews, ID_NAMESPACES.review, reviews.length),
    referrals: byNumber(referrals, ID_NAMESPACES.referral, referrals.length),
    followUps: byNumber(followUps, ID_NAMESPACES.followUp, followUps.length),
    careTasks,
    reminders,
    reminderPreferences,
    careInstructions: byNumber(
      careInstructions,
      ID_NAMESPACES.careInstruction,
      careInstructions.length,
    ),
    auditEvents: b.auditEvents(),
    rulesets: [structuredClone(DEMO_RULESET_V1)],
    syncOperations: [],
  };
}

function districtOf(facilityId: FacilityId): DistrictId {
  const districtId = FACILITY_TO_DISTRICT[facilityId];
  if (districtId === undefined) throw new RangeError(`unknown facility ${facilityId}`);
  return districtId;
}

function makePatient(
  index: number,
  facilityId: FacilityId,
  displayName: string,
  rng: Prng,
  at: string,
): Patient {
  const age = rng.int(28, 76);
  const knownDob = rng.chance(0.8);
  const birthYear = 2026 - age;
  const month = String(rng.int(1, 12)).padStart(2, "0");
  const day = String(rng.int(1, 28)).padStart(2, "0");
  const sex: Sex = rng.pick(["female", "female", "male", "male", "not_recorded"] as const);
  const language: Language = rng.chance(0.75) ? "rw" : "en";
  const patient: Patient = {
    id: patientId(index),
    syntheticIdentifier: `DEMO-P-${String(index).padStart(4, "0")}`,
    displayName,
    dateOfBirth: knownDob ? `${birthYear}-${month}-${day}` : null,
    sexOptional: sex,
    facilityId,
    districtId: districtOf(facilityId),
    consentState: "granted",
    identityStatus: index === 45 || index === 46 ? "unverified" : "verified_local",
    duplicateCandidateIds: [],
    preferredLanguage: language,
    version: 1,
    createdAt: at,
    updatedAt: at,
    synthetic: true,
  };
  if (!knownDob) patient.estimatedAgeYears = age;
  return patient;
}
