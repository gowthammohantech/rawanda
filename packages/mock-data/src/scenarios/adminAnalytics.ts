/**
 * Admin analytics seed overlay (ADM-01 task 9). SYNTHETIC DEMONSTRATION DATA — NOT FOR CLINICAL USE.
 *
 * `buildAdminAnalyticsOverlay(base, nowIso)` adds 12 Kigali ISO weeks of history on top of the
 * FND-05 base seed so every Programme Admin metric (ADM-02…08) has data. It is registered in
 * `SLICE_OVERLAYS.admin`, so `sliceForApp(seed, 'admin')` — and therefore FND-07 `ensureSeeded` /
 * `resetDemo` in the admin app — includes it. It never changes base records (base counts stay as
 * asserted in seed/counts.test.ts); every record has an `admin-overlay:` ID namespace.
 *
 * Deterministic: the FND seeded PRNG (`deriveSeed(seed, 'admin-overlay')`) and offsets from the
 * pinned demo clock (`2026-10-14T06:00:00.000Z`) only. Every status is reached by replaying legal
 * FND-02 transitions through `SeedBuilder`, which also writes the audit trail.
 *
 * What it guarantees (asserted in adminAnalytics.test.ts):
 * - 36 extra patients (12 per facility; District Alpha has 2 facilities, Beta 1) and ≥150
 *   submitted screenings in total (BP-only, glucose-only and both), in each of the 12 ISO weeks
 *   before the demo week;
 * - ≥5 `dismissed_with_reason` reviews in District Alpha, exactly 1 in District Beta (base);
 * - the designated small cell: Beta-1 has 1–4 completed follow-ups in the default 90-day window;
 * - ≥5 overdue referrals and follow-ups (person-set `dueAt` passed), every completed referral has
 *   `completionEvidence`, ≥2 `unable_to_reach`;
 * - ≥2 submitted screenings with a missing glucose unit, one duplicate synthetic identifier pair
 *   (identity mismatch), one collapsed duplicate submission (one record, one
 *   `sync.duplicate_suppressed` event), one manual escalation of a `no_review_required`
 *   screening, one consent-withdrawn patient (base);
 * - the retired ruleset `demo-ruleset-2026.07-v0` next to the active v1, each with screenings;
 * - 5 workers with a `workerCode` (4 FND-05 CHWs + one overlay CHW) with self-reported
 *   `TimeEntry` rows, and one `AccessGrant` per admin persona;
 * - ≥30 baseline audit events, including one prior export and one prior denied access.
 */
import { ALL_IN_DISTRICTS, type AccessGrant, type TimeEntry } from "@laif/contracts";
import {
  asId,
  DEMO_CLOCK_DEFAULT_ISO,
  type CorrelationId,
  type DemoPersona,
  type DemoRuleset,
  type DismissReasonCode,
  type FacilityId,
  type FollowUp,
  type Patient,
  type PatientId,
  type PersonaId,
  type Referral,
  type Review,
  type ReviewDecisionKind,
  type ReviewId,
  type Screening,
  type ScreeningSource,
  type Sex,
} from "@laif/domain";

import { DEMO_RULESET_V0, DEMO_RULESET_V1 } from "../config/demo-ruleset.ts";
import { ID_NAMESPACES } from "../ids.ts";
import { inventUniqueNames } from "../names.ts";
import { createPrng, deriveSeed, type Prng } from "../prng.ts";
import { DISTRICT_IDS } from "../reference/districts.ts";
import { FACILITY_IDS, FACILITY_TO_DISTRICT } from "../reference/facilities.ts";
import { DEMO_PERSONAS, PERSONA_IDS } from "../reference/personas.ts";
import { SeedBuilder, type Readings } from "../seed/builder.ts";
import type { SeedDataset } from "../seed/types.ts";
import type { OverlayRecords } from "../slices.ts";

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const KIGALI_OFFSET_MS = 2 * HOUR_MS;

/** ID namespace prefix of every overlay record. */
export const ADMIN_OVERLAY_ID_PREFIX = "admin-overlay:" as const;
/** Kigali ISO weeks of history before the demo week. */
export const ADMIN_HISTORY_WEEKS = 12;
/** Overlay timestamps stay within −90 … +14 days of the demo clock. */
export const ADMIN_OVERLAY_WINDOW_DAYS = { min: -90, max: 14 } as const;
/** Patients the overlay adds per facility. */
export const ADMIN_OVERLAY_PATIENTS_PER_FACILITY = 12;

/** The overlay community health worker (Beta-1), so the workload view has 5 workers. */
export const ADMIN_OVERLAY_WORKER_ID = asId<PersonaId>("persona-adm-chw-beta1-b");
const OVERLAY_WORKER_CODE = "HW-032";

/** One AccessGrant per admin persona (`grant-<personaId>`). */
export const ADMIN_GRANT_IDS = {
  leadProgramme: `grant-${PERSONA_IDS.leadProgramme}`,
  analystAlpha: `grant-${PERSONA_IDS.analystAlpha}`,
  fmgrAlpha1: `grant-${PERSONA_IDS.fmgrAlpha1}`,
  auditorProgramme: `grant-${PERSONA_IDS.auditorProgramme}`,
} as const;

/** Shared synthetic identifier of the identity-mismatch pair. */
export const ADMIN_DUPLICATE_IDENTIFIER = "DEMO-A-0023" as const;

const { alpha1, alpha2, beta1 } = FACILITY_IDS;
const P = PERSONA_IDS;

const FACILITY_ORDER: readonly FacilityId[] = [alpha1, alpha2, beta1];
/** Screenings per facility per week (10 a week → 120 + the specials). */
const WEEKLY_SCREENINGS: Readonly<Record<string, number>> = {
  [alpha1]: 4,
  [alpha2]: 3,
  [beta1]: 3,
};
const WORKERS: Readonly<Record<string, readonly PersonaId[]>> = {
  [alpha1]: [P.chwAlpha1A, P.chwAlpha1B],
  [alpha2]: [P.chwAlpha2A],
  [beta1]: [P.chwBeta1A, ADMIN_OVERLAY_WORKER_ID],
};
const CLINICIAN: Readonly<Record<string, PersonaId>> = {
  [alpha1]: P.clinAlpha1,
  [alpha2]: P.nurseAlpha2,
  [beta1]: P.clinBeta1,
};
/** Flags younger than this stay pending (the current review backlog). */
const PENDING_IF_YOUNGER_THAN_DAYS = 7;
/** Extra completed follow-ups allowed in Beta-1 (base has 1): keeps the SCN-12 cell small. */
const BETA_EXTRA_COMPLETED_FOLLOW_UPS = 1;

/** Kigali Monday 00:00 of the week containing `nowMs`, as a UTC epoch. */
export function kigaliWeekStartMs(nowMs: number): number {
  const kigali = nowMs + KIGALI_OFFSET_MS;
  const midnight = Math.floor(kigali / DAY_MS) * DAY_MS;
  const dayOfWeek = (new Date(midnight).getUTCDay() + 6) % 7; // Monday = 0
  return midnight - dayOfWeek * DAY_MS - KIGALI_OFFSET_MS;
}

/** Kigali calendar date (`YYYY-MM-DD`) of a UTC instant. */
export function kigaliDate(ms: number): string {
  return new Date(ms + KIGALI_OFFSET_MS).toISOString().slice(0, 10);
}

/** The demo AccessGrants (one per admin persona, version 1). */
export function buildAdminAccessGrants(createdAt: string): AccessGrant[] {
  const grant = (
    id: string,
    personaId: PersonaId,
    role: AccessGrant["role"],
    districtIds: AccessGrant["districtIds"],
    facilityIds: AccessGrant["facilityIds"],
  ): AccessGrant => ({
    id,
    personaId,
    role,
    districtIds,
    facilityIds,
    validFrom: createdAt,
    version: 1,
    updatedBy: P.leadProgramme,
    createdAt,
    updatedAt: createdAt,
    synthetic: true,
  });
  const all = [DISTRICT_IDS.alpha, DISTRICT_IDS.beta];
  return [
    grant(ADMIN_GRANT_IDS.leadProgramme, P.leadProgramme, "programme_lead", all, ALL_IN_DISTRICTS),
    grant(
      ADMIN_GRANT_IDS.analystAlpha,
      P.analystAlpha,
      "district_analyst",
      [DISTRICT_IDS.alpha],
      ALL_IN_DISTRICTS,
    ),
    grant(
      ADMIN_GRANT_IDS.fmgrAlpha1,
      P.fmgrAlpha1,
      "facility_manager",
      [DISTRICT_IDS.alpha],
      [alpha1],
    ),
    grant(ADMIN_GRANT_IDS.auditorProgramme, P.auditorProgramme, "auditor", all, ALL_IN_DISTRICTS),
  ];
}

type Flagged = { screening: Screening; facilityId: FacilityId; days: number };

export function buildAdminAnalyticsOverlay(
  base: Readonly<SeedDataset>,
  nowIso: string = base.meta.demoClockIso || DEMO_CLOCK_DEFAULT_ISO,
): OverlayRecords {
  const b = new SeedBuilder(nowIso, DEMO_RULESET_V1, {
    windowDays: ADMIN_OVERLAY_WINDOW_DAYS,
    idPrefix: ADMIN_OVERLAY_ID_PREFIX,
  });
  const nowMs = b.nowMs;
  const rng = createPrng(deriveSeed(base.meta.seed, "admin-overlay"));
  const daysOf = (ms: number): number => (ms - nowMs) / DAY_MS;
  const v0Until = Date.parse(DEMO_RULESET_V1.effectiveFrom);

  let corrNo = 0;
  const corr = (): CorrelationId => {
    corrNo += 1;
    return b.sid<CorrelationId>(ID_NAMESPACES.correlation, corrNo);
  };

  const referenceDays = ADMIN_OVERLAY_WINDOW_DAYS.min + 1;
  const referenceAt = b.at(referenceDays);

  // ── Overlay worker + grants ──────────────────────────────────────────────
  const overlayWorker: DemoPersona = {
    id: ADMIN_OVERLAY_WORKER_ID,
    displayName: "Vorqa Ixazumbra",
    role: "community_health_worker",
    appIds: ["worker"],
    facilityIds: [beta1],
    districtIds: [],
    programmeWide: false,
    workerCode: OVERLAY_WORKER_CODE,
    linkedPatientIds: [],
    preferredLanguage: "rw",
    version: 1,
    createdAt: referenceAt,
    updatedAt: referenceAt,
    synthetic: true,
  };
  const accessGrants = buildAdminAccessGrants(referenceAt);

  // ── Patients (12 per facility) ───────────────────────────────────────────
  const taken = new Set<string>([
    ...base.patients.map((p) => p.displayName),
    ...base.personas.map((p) => p.displayName),
    overlayWorker.displayName,
  ]);
  const total = ADMIN_OVERLAY_PATIENTS_PER_FACILITY * FACILITY_ORDER.length;
  const names = inventUniqueNames(rng, total, taken);
  const patients: Patient[] = [];
  const pool = new Map<FacilityId, Patient[]>();
  FACILITY_ORDER.forEach((facilityId, f) => {
    const list: Patient[] = [];
    for (let k = 0; k < ADMIN_OVERLAY_PATIENTS_PER_FACILITY; k += 1) {
      const n = f * ADMIN_OVERLAY_PATIENTS_PER_FACILITY + k + 1;
      const patient = makePatient(
        b.sid<PatientId>(ID_NAMESPACES.patient, n),
        n,
        facilityId,
        names[n - 1] ?? `Overlay Patient ${n}`,
        rng,
        b.at(referenceDays + n * 0.01),
      );
      list.push(patient);
      patients.push(patient);
      b.registerPatient(patient, WORKERS[facilityId]?.[0] ?? P.chwAlpha1A, corr());
    }
    pool.set(facilityId, list);
  });

  // Identity mismatch (ADM-06): two Alpha-2 records share one synthetic identifier.
  const alpha2Pool = pool.get(alpha2) ?? [];
  const [mismatchA, mismatchB] = [alpha2Pool[10], alpha2Pool[11]];
  if (!mismatchA || !mismatchB) throw new Error("admin overlay: missing mismatch patients");
  const flaggedAt = b.at(referenceDays + 0.6);
  for (const [self, other] of [
    [mismatchA, mismatchB],
    [mismatchB, mismatchA],
  ] as const) {
    self.syntheticIdentifier = ADMIN_DUPLICATE_IDENTIFIER;
    self.identityStatus = "needs_match_review";
    self.duplicateCandidateIds = [other.id];
    self.version += 1;
    self.updatedAt = flaggedAt;
    b.audit({
      action: "patient.match_flagged",
      entityType: "patient",
      entityId: self.id,
      actorId: WORKERS[alpha2]?.[0] ?? null,
      at: flaggedAt,
      correlationId: corr(),
      scope: { facilityId: alpha2, districtId: DISTRICT_IDS.alpha, patientId: self.id },
      summary: { identityStatus: "needs_match_review", candidates: 1 },
    });
  }

  // ── Readings ─────────────────────────────────────────────────────────────
  const glucose = (): Pick<Readings, "glucoseValue" | "glucoseUnit" | "glucoseContext"> => {
    const glucoseContext = rng.pick(["fasting", "non_fasting", "non_fasting"] as const);
    const mmol = glucoseContext === "fasting" ? rng.float(4.2, 6.8) : rng.float(4.6, 9.8);
    return rng.chance(0.2)
      ? { glucoseValue: Math.round(mmol * 18), glucoseUnit: "mg/dL", glucoseContext }
      : { glucoseValue: mmol, glucoseUnit: "mmol/L", glucoseContext };
  };
  const normalBp = () => {
    const systolic = rng.int(104, 136);
    return { systolic, diastolic: rng.int(62, Math.min(86, systolic - 30)) };
  };
  const NO_GLUCOSE = { glucoseValue: null, glucoseUnit: null, glucoseContext: null } as const;
  const NO_BP = { systolic: null, diastolic: null } as const;

  const screenings: Screening[] = [];
  const flagged: Flagged[] = [];
  let screeningNo = 0;
  const workerTurn = new Map<FacilityId, number>();
  const patientTurn = new Map<FacilityId, number>();
  const nextWorker = (facilityId: FacilityId): PersonaId => {
    const list = WORKERS[facilityId] ?? [];
    const turn = workerTurn.get(facilityId) ?? 0;
    workerTurn.set(facilityId, turn + 1);
    return list[turn % list.length] ?? P.chwAlpha1A;
  };
  const nextPatient = (facilityId: FacilityId): Patient => {
    const list = pool.get(facilityId) ?? [];
    const turn = patientTurn.get(facilityId) ?? 0;
    patientTurn.set(facilityId, turn + 1);
    const patient = list[turn % list.length];
    if (!patient) throw new Error("admin overlay: empty patient pool");
    return patient;
  };

  const record = (input: {
    facilityId: FacilityId;
    days: number;
    readings: Readings;
    source?: ScreeningSource;
    expectFlag: boolean;
    notes?: string;
  }): Screening => {
    screeningNo += 1;
    const measuredAt = b.at(input.days);
    const ruleset: DemoRuleset =
      Date.parse(measuredAt) < v0Until ? DEMO_RULESET_V0 : DEMO_RULESET_V1;
    const source = input.source ?? "worker_mobile";
    const s = b.screening({
      n: screeningNo,
      patient: nextPatient(input.facilityId),
      workerId: nextWorker(input.facilityId),
      measuredAt,
      readings: input.readings,
      source,
      expect: input.expectFlag ? "review_required" : "no_review_required",
      correlationId: corr(),
      captureDurationSeconds: source === "worker_mobile" ? rng.int(95, 290) : null,
      ...(input.notes === undefined ? {} : { notes: input.notes }),
      ruleset,
    });
    screenings.push(s);
    if (input.expectFlag)
      flagged.push({ screening: s, facilityId: input.facilityId, days: input.days });
    return s;
  };

  // ── 12 weeks of routine screenings ───────────────────────────────────────
  const weekStartDays = daysOf(kigaliWeekStartMs(nowMs));
  let routineNo = 0;
  for (let week = 0; week < ADMIN_HISTORY_WEEKS; week += 1) {
    const start = weekStartDays - (ADMIN_HISTORY_WEEKS - week) * 7;
    for (const facilityId of FACILITY_ORDER) {
      const count = WEEKLY_SCREENINGS[facilityId] ?? 0;
      for (let k = 0; k < count; k += 1) {
        routineNo += 1;
        // Monday–Friday, 08:00–15:59 Kigali.
        const days = start + rng.int(0, 4) + (8 + rng.int(0, 7)) / 24 + rng.int(0, 59) / 1440;
        const glucoseOnly = routineNo % 9 === 4;
        const highBp = !glucoseOnly && routineNo % 6 === 1;
        const both = !glucoseOnly && routineNo % 2 === 0;
        const bp = highBp
          ? { systolic: rng.int(146, 174), diastolic: rng.int(84, 104) }
          : normalBp();
        const readings: Readings = glucoseOnly
          ? { ...NO_BP, ...glucose() }
          : { ...bp, ...(both ? glucose() : NO_GLUCOSE) };
        // Glucose-only screenings lack the required BP inputs: not evaluable → human review.
        record({ facilityId, days, readings, expectFlag: highBp || glucoseOnly });
      }
    }
  }

  // ── Specials ─────────────────────────────────────────────────────────────
  const weekDay = (week: number, day: number, hour: number): number =>
    weekStartDays - (ADMIN_HISTORY_WEEKS - week) * 7 + day + hour / 24;
  // Imported screenings with a glucose value but no unit (SCN-06 pattern, ADM-06).
  for (const [facilityId, week] of [
    [alpha1, 6],
    [beta1, 9],
  ] as const) {
    record({
      facilityId,
      days: weekDay(week, 2, 10),
      readings: { ...normalBp(), glucoseValue: 9.2, glucoseUnit: null, glucoseContext: "fasting" },
      source: "imported",
      expectFlag: true,
      notes: "Imported register row: glucose unit not recorded.",
    });
  }
  // Collapsed duplicate submission: one record; the replay is suppressed (FND-07 semantics).
  const collapsed = record({
    facilityId: alpha2,
    days: weekDay(8, 1, 9),
    readings: { ...normalBp(), ...NO_GLUCOSE },
    expectFlag: false,
  });
  b.audit({
    action: "sync.duplicate_suppressed",
    entityType: "screening",
    entityId: collapsed.id,
    actorId: collapsed.workerId,
    at: b.at(weekDay(8, 1, 9.5)),
    correlationId: corr(),
    scope: { facilityId: alpha2, districtId: DISTRICT_IDS.alpha, patientId: collapsed.patientId },
    summary: { clientMutationId: collapsed.clientMutationId, duplicateSubmissions: 1 },
    category: "security",
  });
  // Manual escalation of a screening the rule did not flag (ADM-06 proxy).
  const escalated = record({
    facilityId: alpha2,
    days: weekDay(7, 3, 11),
    readings: { ...normalBp(), ...glucose() },
    expectFlag: false,
  });

  // ── Reviews and downstream pathway ───────────────────────────────────────
  const reviews: Review[] = [];
  const referrals: Referral[] = [];
  const followUps: FollowUp[] = [];
  let reviewNo = 0;
  let referralNo = 0;
  let followUpNo = 0;
  const reviewTurn = new Map<FacilityId, number>();
  const referralTurn = new Map<FacilityId, number>();
  const planTurn = new Map<FacilityId, number>();
  let betaFollowUpBudget = BETA_EXTRA_COMPLETED_FOLLOW_UPS;
  const isBeta = (facilityId: FacilityId): boolean =>
    FACILITY_TO_DISTRICT[facilityId] === DISTRICT_IDS.beta;
  const past = (days: number): boolean => days < -0.05;

  const newFollowUp = (input: {
    patientId: PatientId;
    facilityId: FacilityId;
    referralId: Referral["id"] | null;
    reviewId: ReviewId;
    purpose: FollowUp["purpose"];
    days: number;
    dueDays: number;
    by: PersonaId;
    correlationId: CorrelationId;
  }): FollowUp => {
    followUpNo += 1;
    const fu = b.followUp({
      n: followUpNo,
      patientId: input.patientId,
      facilityId: input.facilityId,
      referralId: input.referralId,
      reviewId: input.reviewId,
      purpose: input.purpose,
      workerId: nextWorker(input.facilityId),
      at: b.at(input.days),
      dueAt: b.at(input.dueDays),
      by: input.by,
      correlationId: input.correlationId,
    });
    followUps.push(fu);
    return fu;
  };

  const completeFollowUp = (fu: FollowUp, days: number, correlationId: CorrelationId): boolean => {
    if (!past(days + 1)) return false;
    if (isBeta(fu.facilityId)) {
      if (betaFollowUpBudget <= 0) return false;
      betaFollowUpBudget -= 1;
    }
    const worker = fu.assignedWorkerId ?? P.chwAlpha1A;
    b.attempt(
      fu,
      {
        at: b.at(days),
        method: "home_visit",
        result: "reached",
        minutes: rng.int(10, 40),
        note: "Visited at home; attendance discussed.",
        by: worker,
      },
      correlationId,
    );
    b.completeFollowUp(
      fu,
      {
        at: b.at(days + 1),
        kind: "attended",
        evidenceType: "facility_attendance_record",
        note: "Attendance confirmed in the facility register (demo).",
        by: worker,
        confirmation: "not_required",
      },
      correlationId,
    );
    return true;
  };

  const refer = (
    r: Review,
    facilityId: FacilityId,
    days: number,
    by: PersonaId,
    c: CorrelationId,
  ) => {
    referralNo += 1;
    const turn = referralTurn.get(facilityId) ?? 0;
    referralTurn.set(facilityId, turn + 1);
    const ref = b.referral({
      n: referralNo,
      review: r,
      destinationFacilityId: beta1,
      at: b.at(days),
      dueAt: b.at(days + 14),
      assignedWorkerId: nextWorker(facilityId),
      referralReason: "Repeat raised readings; demo referral for assessment.",
      by,
      correlationId: c,
    });
    referrals.push(ref);
    const fu = newFollowUp({
      patientId: r.patientId,
      facilityId,
      referralId: ref.id,
      reviewId: r.id,
      purpose: "referral_attendance",
      days: days + 0.02,
      dueDays: days + 16,
      by,
      correlationId: c,
    });
    if (!past(days + 1)) return;
    b.accept(ref, b.at(days + 1), by, c);
    // Alpha-1: 1 in 3 referrals stays accepted (overdue once due); Alpha-2 completes when due;
    // Beta: only the first completes (the others stay scheduled past due).
    const stays = isBeta(facilityId) ? turn > 0 : facilityId === alpha1 && turn % 3 === 0;
    if (stays && !isBeta(facilityId)) return;
    if (!past(days + 2)) return;
    const appointment = days + (stays ? 16 : turn % 3 === 1 ? 6 : 9);
    b.schedule(ref, b.at(days + 2), b.at(appointment), by, c);
    if (stays || !past(appointment + 0.3)) return;
    b.completeReferral(
      ref,
      {
        at: b.at(appointment + 0.3),
        type: "facility_attendance_record",
        reference: `DEMO-ATT-${String(referralNo).padStart(4, "0")}`,
        outcome: "attended_seen",
        note: "Seen at the receiving facility (demo record).",
        by: CLINICIAN[beta1] ?? by,
      },
      c,
    );
    completeFollowUp(fu, appointment + 0.6, c);
  };

  const planFollowUp = (
    r: Review,
    facilityId: FacilityId,
    days: number,
    by: PersonaId,
    c: CorrelationId,
  ) => {
    const turn = planTurn.get(facilityId) ?? 0;
    planTurn.set(facilityId, turn + 1);
    const fu = newFollowUp({
      patientId: r.patientId,
      facilityId,
      referralId: null,
      reviewId: r.id,
      purpose: "planned_review",
      days: days + 0.02,
      dueDays: days + 14,
      by,
      correlationId: c,
    });
    if (facilityId === alpha2 && turn === 0 && past(days + 5)) {
      const worker = fu.assignedWorkerId ?? P.chwAlpha2A;
      for (const offset of [2, 4]) {
        b.attempt(
          fu,
          {
            at: b.at(days + offset),
            method: "home_visit",
            result: "not_reached",
            minutes: rng.int(15, 45),
            note: "Not at home; neighbour asked to pass a message.",
            by: worker,
          },
          c,
        );
      }
      b.unableToReach(fu, "not_at_home_repeatedly", b.at(days + 5), worker, c);
      return;
    }
    completeFollowUp(fu, days + 9, c);
  };

  const dismissReasons: ReadonlyArray<[DismissReasonCode, string]> = [
    ["repeat_reading_acceptable", "Repeat reading at the visit was within the demo range."],
    ["measurement_error_suspected", "Cuff size was wrong for the first reading; repeat normal."],
    ["known_managed_condition", "Known condition already managed at the facility (demo)."],
  ];

  for (const item of flagged) {
    const { screening, facilityId, days } = item;
    reviewNo += 1;
    const c = corr();
    const clinician = CLINICIAN[facilityId] ?? P.clinAlpha1;
    const r = b.review({
      n: reviewNo,
      screening,
      assignedClinicianId: clinician,
      correlationId: c,
    });
    reviews.push(r);
    if (-days < PENDING_IF_YOUNGER_THAN_DAYS) continue;
    const turn = reviewTurn.get(facilityId) ?? 0;
    reviewTurn.set(facilityId, turn + 1);
    const decidedDays = days + 1 + (turn % 3) + 0.2;
    const kind: ReviewDecisionKind | "dismiss" = isBeta(facilityId)
      ? (["refer", "no_further_action", "plan_follow_up"] as const)[turn % 3]!
      : (["refer", "dismiss", "refer", "plan_follow_up", "no_further_action"] as const)[turn % 5]!;
    if (turn % 4 === 1) b.startReview(r, b.at(decidedDays - 0.1), clinician, c);
    if (kind === "dismiss") {
      const [code, reason] = dismissReasons[turn % dismissReasons.length]!;
      b.dismiss(r, code, reason, b.at(decidedDays), clinician, c);
      continue;
    }
    const notes: Record<ReviewDecisionKind, string> = {
      refer: "Raised readings on review; refer for assessment (demo).",
      plan_follow_up: "Plan a follow-up visit with a repeat reading (demo).",
      no_further_action: "Reviewed; no further action at this time (demo).",
      request_repeat_screening: "Repeat the screening at the next visit (demo).",
    };
    b.decide(r, kind, notes[kind], b.at(decidedDays), clinician, c);
    if (kind === "refer") refer(r, facilityId, decidedDays + 0.05, clinician, c);
    if (kind === "plan_follow_up") planFollowUp(r, facilityId, decidedDays + 0.05, clinician, c);
  }

  // Manual escalation: a clinician asks for review although the rule did not flag.
  {
    reviewNo += 1;
    const c = corr();
    const at = b.at(weekDay(7, 4, 9));
    if (escalated.flag === null)
      throw new Error("admin overlay: escalated screening not evaluated");
    const r: Review = {
      id: b.sid<ReviewId>(ID_NAMESPACES.review, reviewNo),
      screeningId: escalated.id,
      patientId: escalated.patientId,
      facilityId: escalated.facilityId,
      assignedClinicianId: CLINICIAN[alpha2] ?? null,
      status: "pending",
      flagReasons: [],
      evidenceSnapshot: {
        flag: structuredClone(escalated.flag),
        inputs: {
          systolic: escalated.systolic,
          diastolic: escalated.diastolic,
          glucoseValue: escalated.glucoseValue,
          glucoseUnit: escalated.glucoseUnit,
          glucoseContext: escalated.glucoseContext,
        },
        capturedAt: at,
        capturedBy: escalated.workerId,
      },
      decision: null,
      decisionReason: null,
      reviewedAt: null,
      startedBy: null,
      reviewedBy: null,
      priority: "routine",
      reviewDueAt: null,
      origin: "manual_escalation",
      version: 1,
      createdAt: at,
      updatedAt: at,
      synthetic: true,
    };
    b.audit({
      action: "review.created",
      entityType: "review",
      entityId: r.id,
      actorId: CLINICIAN[alpha2] ?? null,
      at,
      correlationId: c,
      scope: { facilityId: alpha2, districtId: DISTRICT_IDS.alpha, patientId: r.patientId },
      summary: { fromStatus: null, toStatus: "pending", origin: "manual_escalation" },
    });
    b.decide(
      r,
      "no_further_action",
      "Escalated by the worker's note; reviewed, no further action (demo).",
      b.at(weekDay(7, 4, 14)),
      CLINICIAN[alpha2] ?? P.nurseAlpha2,
      c,
    );
    reviews.push(r);
  }

  // ── Governance history: sign-ins, one prior export, one prior denied access ──
  const adminPersonas = [P.leadProgramme, P.analystAlpha, P.fmgrAlpha1, P.auditorProgramme];
  const roleOf = (id: PersonaId) => DEMO_PERSONAS.find((p) => p.id === id)?.role ?? null;
  [-40, -20, -12, -5].forEach((day, i) => {
    adminPersonas.forEach((personaId, j) => {
      b.audit({
        action: "session.started",
        entityType: "persona",
        entityId: personaId,
        actorId: personaId,
        actorRole: roleOf(personaId),
        at: b.at(day + 0.05 + j * 0.01 + i * 0.001),
        correlationId: corr(),
        scope: { facilityId: null, districtId: null, patientId: null },
        summary: { grantId: `grant-${personaId}`, grantVersion: 1, origin: "client" },
        category: "access",
      });
    });
  });
  b.audit({
    action: "export.generated",
    entityType: "audit_event",
    entityId: b.sid(ID_NAMESPACES.idempotency, 1),
    actorId: P.analystAlpha,
    at: b.at(-20 + 0.2),
    correlationId: corr(),
    scope: { facilityId: null, districtId: DISTRICT_IDS.alpha, patientId: null },
    summary: {
      template: "programme-overview",
      granularity: "district",
      reasonCode: "programme_review",
      districtIds: [DISTRICT_IDS.alpha],
      facilityIds: [],
      filters: { from: kigaliDate(nowMs - 90 * DAY_MS), to: kigaliDate(nowMs - 20 * DAY_MS) },
      rowCount: 6,
      suppressedCells: 1,
      sha256: "ad".repeat(32),
    },
    category: "export",
  });
  b.audit({
    action: "access.denied",
    entityType: "district",
    entityId: DISTRICT_IDS.beta,
    actorId: P.analystAlpha,
    at: b.at(-12 + 0.2),
    correlationId: corr(),
    scope: { facilityId: null, districtId: DISTRICT_IDS.beta, patientId: null },
    summary: {
      route: "/admin/overview",
      requested: { district: DISTRICT_IDS.beta, facility: null },
      grant: ADMIN_GRANT_IDS.analystAlpha,
      reason: "SCOPE",
      origin: "client",
    },
    category: "access",
    outcome: "denied",
  });

  // ── Self-reported demo time entries (ADM-05) ─────────────────────────────
  const timeEntries: TimeEntry[] = [];
  let timeNo = 0;
  const secondary = ["follow_up", "travel", "admin"] as const;
  for (const facilityId of FACILITY_ORDER) {
    for (const workerId of WORKERS[facilityId] ?? []) {
      for (let week = 0; week < ADMIN_HISTORY_WEEKS; week += 1) {
        for (let day = 0; day < 5; day += 1) {
          const dayStartMs =
            nowMs + (weekStartDays - (ADMIN_HISTORY_WEEKS - week) * 7 + day) * DAY_MS;
          const at = b.at(daysOf(dayStartMs + 15 * HOUR_MS));
          const date = kigaliDate(dayStartMs);
          const rows: Array<[TimeEntry["activity"], number]> = [
            ["screening", rng.int(60, 180)],
            [secondary[(week + day) % secondary.length] ?? "admin", rng.int(20, 90)],
          ];
          for (const [activity, minutes] of rows) {
            timeNo += 1;
            timeEntries.push({
              id: b.sid("time-entry", timeNo),
              workerId,
              facilityId,
              date,
              minutes,
              activity,
              source: "self_reported_demo",
              version: 1,
              createdAt: at,
              updatedAt: at,
              synthetic: true,
            });
          }
        }
      }
    }
  }

  return {
    personas: [overlayWorker],
    patients,
    screenings,
    reviews,
    referrals,
    followUps,
    auditEvents: b.auditEvents(),
    rulesets: [structuredClone(DEMO_RULESET_V0)],
    accessGrants,
    timeEntries,
  };
}

function makePatient(
  id: PatientId,
  n: number,
  facilityId: FacilityId,
  displayName: string,
  rng: Prng,
  at: string,
): Patient {
  const age = rng.int(30, 78);
  const knownDob = rng.chance(0.8);
  const month = String(rng.int(1, 12)).padStart(2, "0");
  const day = String(rng.int(1, 28)).padStart(2, "0");
  const sex: Sex = rng.pick(["female", "female", "male", "male", "not_recorded"] as const);
  const districtId = FACILITY_TO_DISTRICT[facilityId];
  if (districtId === undefined) throw new RangeError(`unknown facility ${facilityId}`);
  const patient: Patient = {
    id,
    syntheticIdentifier: `DEMO-A-${String(n).padStart(4, "0")}`,
    displayName,
    dateOfBirth: knownDob ? `${2026 - age}-${month}-${day}` : null,
    sexOptional: sex,
    facilityId,
    districtId,
    consentState: "granted",
    identityStatus: "verified_local",
    duplicateCandidateIds: [],
    preferredLanguage: rng.chance(0.75) ? "rw" : "en",
    version: 1,
    createdAt: at,
    updatedAt: at,
    synthetic: true,
  };
  if (!knownDob) patient.estimatedAgeYears = age;
  return patient;
}
