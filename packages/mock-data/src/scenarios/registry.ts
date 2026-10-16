/**
 * The 12 named demo scenarios (FND-05 task 7). Each scenario anchors existing seed records
 * (`SEED_ANCHORS`) and may add records through `setup` (sync-queue scenarios). FND-07
 * `loadScenario(id)` = reset + `applyScenario` + set the scenario clock.
 *
 * i18n: `titleKey` / `descriptionKey` use the short code (`demo:scenario.SCN-01.title`), the
 * convention FND-04 created; `id` is the long, stable identifier used by code and tests.
 */
import {
  evaluateScreening,
  type AppId,
  type CorrelationId,
  type DistrictId,
  type FacilityId,
  type FollowUpId,
  type JsonValue,
  type PatientId,
  type PersonaId,
  type ReferralId,
  type ReviewId,
  type Screening,
  type ScreeningId,
  type SyncOperation,
  type SyncOperationId,
} from "@laif/domain";

import { SEED_ANCHORS } from "../anchors.ts";
import { DEMO_RULESET_V1 } from "../config/demo-ruleset.ts";
import { deterministicUuid, ID_NAMESPACES, seedId } from "../ids.ts";
import { DISTRICT_IDS } from "../reference/districts.ts";
import { FACILITY_IDS } from "../reference/facilities.ts";
import { PERSONA_IDS } from "../reference/personas.ts";
import { patientId } from "../seed/ids.ts";
import type { SeedDataset } from "../seed/types.ts";

export const SCENARIO_IDS = [
  "SCN-01-normal-screening",
  "SCN-02-flagged-screening",
  "SCN-03-clinician-dismissal",
  "SCN-04-overdue-referral",
  "SCN-05-completed-follow-up",
  "SCN-06-missing-unit",
  "SCN-07-duplicate-submission",
  "SCN-08-offline-sync",
  "SCN-09-version-conflict",
  "SCN-10-consent-withdrawn",
  "SCN-11-unauthorized-district-access",
  "SCN-12-suppressed-small-aggregate",
] as const;
export type ScenarioId = (typeof SCENARIO_IDS)[number];

/** `SCN-01-normal-screening` → `SCN-01` (the i18n key segment). */
export const scenarioCode = (id: ScenarioId): string => id.slice(0, 6);

export type ScenarioAnchors = {
  patientId?: PatientId;
  screeningId?: ScreeningId;
  reviewId?: ReviewId;
  referralId?: ReferralId;
  followUpId?: FollowUpId;
  personaId?: PersonaId;
  // ext: scope anchors for SCN-11 / SCN-12 and queued ops for SCN-07…09.
  facilityId?: FacilityId;
  districtId?: DistrictId;
  syncOperationIds?: SyncOperationId[];
  /** Analytics cell anchored by SCN-12 (FND-06 metric name). */
  metricKey?: string;
};

export type ScenarioDefinition = {
  id: ScenarioId;
  titleKey: string;
  descriptionKey: string;
  apps: AppId[];
  anchors: ScenarioAnchors;
  clockIso?: string;
  setup?: (seed: SeedDataset) => SeedDataset;
};

// ── Sync-queue helpers ──────────────────────────────────────────────────────
const MINUTE_MS = 60_000;
const offsetIso = (seed: SeedDataset, minutes: number): string =>
  new Date(Date.parse(seed.meta.demoClockIso) + minutes * MINUTE_MS).toISOString();

function queuedOp(
  seed: SeedDataset,
  input: {
    n: number;
    idempotencyNo: number;
    localSeq: number;
    entityType: SyncOperation["entityType"];
    entityId: string;
    opType: SyncOperation["opType"];
    payload: JsonValue;
    baseVersion: number | null;
    minutesAgo: number;
  },
): SyncOperation {
  const at = offsetIso(seed, -input.minutesAgo);
  return {
    id: seedId<SyncOperationId>(ID_NAMESPACES.syncOperation, input.n),
    clientMutationId: deterministicUuid(ID_NAMESPACES.clientMutation, input.idempotencyNo),
    idempotencyKey: deterministicUuid(ID_NAMESPACES.idempotency, input.idempotencyNo),
    localSeq: input.localSeq,
    entityType: input.entityType,
    entityId: input.entityId,
    opType: input.opType,
    payload: input.payload,
    baseVersion: input.baseVersion,
    dependsOnOpId: null,
    resolvesOpId: null,
    status: "queued",
    attempts: 0,
    nextAttemptAt: null,
    lastError: null,
    deviceTimestamp: at,
    serverSnapshot: null,
    correlationId: seedId<CorrelationId>(ID_NAMESPACES.correlation, 9000 + input.n),
    version: 1,
    createdAt: at,
    updatedAt: at,
    synthetic: true,
  };
}

/** A screening the worker saved on the device (evaluated locally, not yet synced). */
function offlineScreening(
  seed: SeedDataset,
  n: number,
  patientIndex: number,
  minutesAgo: number,
  readings: { systolic: number; diastolic: number },
): Screening {
  const patient = seed.patients.find((p) => p.id === patientId(patientIndex));
  if (!patient) throw new Error(`scenario: unknown patient ${patientIndex}`);
  const at = offsetIso(seed, -minutesAgo);
  const inputs = { ...readings, glucoseValue: null, glucoseUnit: null, glucoseContext: null };
  const flag = evaluateScreening(inputs, DEMO_RULESET_V1);
  return {
    id: seedId<ScreeningId>(ID_NAMESPACES.screening, n),
    patientId: patient.id,
    workerId: PERSONA_IDS.chwAlpha1A,
    facilityId: patient.facilityId,
    districtId: patient.districtId,
    measuredAt: at,
    ...inputs,
    observations: [],
    source: "worker_mobile",
    rulesetVersion: DEMO_RULESET_V1.version,
    // draft → submitted → evaluated on the device (version 3).
    status: flag.requiresReview ? "review_required" : "no_review_required",
    flag,
    clientMutationId: deterministicUuid(ID_NAMESPACES.clientMutation, n),
    captureDurationSeconds: 140,
    notes: "Saved on this device while offline (demo).",
    amendments: [],
    version: 3,
    createdAt: at,
    updatedAt: at,
    synthetic: true,
  };
}

function screeningPayload(s: Screening, idempotencyNo: number): JsonValue {
  return {
    idempotencyKey: deterministicUuid(ID_NAMESPACES.idempotency, idempotencyNo),
    patientId: s.patientId,
    measuredAt: s.measuredAt,
    systolic: s.systolic,
    diastolic: s.diastolic,
    glucoseValue: s.glucoseValue,
    glucoseUnit: s.glucoseUnit,
    glucoseContext: s.glucoseContext,
    notes: s.notes,
  };
}

const SCN07_SCREENING = seedId<ScreeningId>(ID_NAMESPACES.screening, 7001);
const SCN08_SCREENINGS = [
  seedId<ScreeningId>(ID_NAMESPACES.screening, 8001),
  seedId<ScreeningId>(ID_NAMESPACES.screening, 8002),
] as const;
const opId = (n: number) => seedId<SyncOperationId>(ID_NAMESPACES.syncOperation, n);

const def = (
  id: ScenarioId,
  apps: AppId[],
  anchors: ScenarioAnchors,
  setup?: (seed: SeedDataset) => SeedDataset,
): ScenarioDefinition => {
  const code = scenarioCode(id);
  return {
    id,
    titleKey: `demo:scenario.${code}.title`,
    descriptionKey: `demo:scenario.${code}.description`,
    apps,
    anchors,
    ...(setup ? { setup } : {}),
  };
};

const A = SEED_ANCHORS;

export const SCENARIOS: readonly ScenarioDefinition[] = [
  def("SCN-01-normal-screening", ["worker", "clinical"], {
    patientId: A.SCN01_NORMAL_SCREENING.patientId,
    screeningId: A.SCN01_NORMAL_SCREENING.screeningId,
    personaId: PERSONA_IDS.chwAlpha1A,
    facilityId: FACILITY_IDS.alpha1,
  }),
  def("SCN-02-flagged-screening", ["clinical", "worker"], {
    patientId: A.WF01_FLAGGED_REVIEW.patientId,
    screeningId: A.WF01_FLAGGED_REVIEW.screeningId,
    reviewId: A.WF01_FLAGGED_REVIEW.reviewId,
    personaId: PERSONA_IDS.clinAlpha1,
    facilityId: FACILITY_IDS.alpha1,
  }),
  def("SCN-03-clinician-dismissal", ["clinical", "admin"], {
    patientId: A.SCN03_DISMISSED_REVIEW.patientId,
    screeningId: A.SCN03_DISMISSED_REVIEW.screeningId,
    reviewId: A.SCN03_DISMISSED_REVIEW.reviewId,
    personaId: PERSONA_IDS.clinAlpha1,
  }),
  def("SCN-04-overdue-referral", ["clinical", "admin", "worker"], {
    patientId: A.OVERDUE_REFERRAL.patientId,
    reviewId: A.OVERDUE_REFERRAL.reviewId,
    referralId: A.OVERDUE_REFERRAL.referralId,
    personaId: PERSONA_IDS.clinAlpha1,
  }),
  def("SCN-05-completed-follow-up", ["clinical", "worker", "citizen"], {
    patientId: A.COMPLETED_FOLLOWUP_WITH_INSTRUCTION.patientId,
    referralId: A.COMPLETED_FOLLOWUP_WITH_INSTRUCTION.referralId,
    followUpId: A.COMPLETED_FOLLOWUP_WITH_INSTRUCTION.followUpId,
    personaId: PERSONA_IDS.citizen1,
  }),
  def("SCN-06-missing-unit", ["clinical", "worker", "admin"], {
    patientId: A.MISSING_UNIT_SCREENING.patientId,
    screeningId: A.MISSING_UNIT_SCREENING.screeningId,
    reviewId: A.MISSING_UNIT_SCREENING.reviewId,
    personaId: PERSONA_IDS.nurseAlpha2,
  }),
  def(
    "SCN-07-duplicate-submission",
    ["worker"],
    {
      patientId: patientId(10),
      screeningId: SCN07_SCREENING,
      personaId: PERSONA_IDS.chwAlpha1A,
      syncOperationIds: [opId(7001), opId(7002)],
    },
    (seed) => {
      const s = offlineScreening(seed, 7001, 10, 12, { systolic: 126, diastolic: 80 });
      seed.screenings.push(s);
      // The same mutation sent twice (double tap / retry after a dropped ack): one idempotency key.
      for (const [i, n] of [7001, 7002].entries()) {
        seed.syncOperations.push(
          queuedOp(seed, {
            n,
            idempotencyNo: 7001,
            localSeq: i + 1,
            entityType: "screening",
            entityId: s.id,
            opType: "create",
            payload: screeningPayload(s, 7001),
            baseVersion: null,
            minutesAgo: 11 - i,
          }),
        );
      }
      return seed;
    },
  ),
  def(
    "SCN-08-offline-sync",
    ["worker"],
    {
      patientId: patientId(11),
      screeningId: SCN08_SCREENINGS[0],
      personaId: PERSONA_IDS.chwAlpha1A,
      syncOperationIds: [opId(8001), opId(8002)],
    },
    (seed) => {
      const rows = [
        offlineScreening(seed, 8001, 11, 50, { systolic: 118, diastolic: 76 }),
        offlineScreening(seed, 8002, 12, 35, { systolic: 132, diastolic: 84 }),
      ];
      rows.forEach((s, i) => {
        seed.screenings.push(s);
        seed.syncOperations.push(
          queuedOp(seed, {
            n: 8001 + i,
            idempotencyNo: 8001 + i,
            localSeq: i + 1,
            entityType: "screening",
            entityId: s.id,
            opType: "create",
            payload: screeningPayload(s, 8001 + i),
            baseVersion: null,
            minutesAgo: 49 - i * 15,
          }),
        );
      });
      return seed;
    },
  ),
  def(
    "SCN-09-version-conflict",
    ["worker"],
    {
      patientId: A.WF02_FOLLOWUP_CONFLICT.patientId,
      followUpId: A.WF02_FOLLOWUP_CONFLICT.followUpId,
      personaId: PERSONA_IDS.chwAlpha1A,
      syncOperationIds: [opId(9001)],
    },
    (seed) => {
      const fu = seed.followUps.find((f) => f.id === A.WF02_FOLLOWUP_CONFLICT.followUpId);
      if (!fu) throw new Error("SCN-09: anchor follow-up missing");
      const at = offsetIso(seed, -20);
      seed.syncOperations.push(
        queuedOp(seed, {
          n: 9001,
          idempotencyNo: 9001,
          localSeq: 1,
          entityType: "follow_up",
          entityId: fu.id,
          opType: "update",
          payload: {
            idempotencyKey: deterministicUuid(ID_NAMESPACES.idempotency, 9001),
            followUpId: fu.id,
            expectedVersion: fu.version - 1,
            action: "record_attempt",
            at,
            method: "home_visit",
            result: "reached",
            note: "Visited; patient will attend (demo, edited offline).",
            durationMinutes: 20,
          },
          // One behind the stored version: the remote answers 409 CONFLICT (WF-02.3).
          baseVersion: fu.version - 1,
          minutesAgo: 20,
        }),
      );
      return seed;
    },
  ),
  def("SCN-10-consent-withdrawn", ["citizen", "clinical", "admin"], {
    patientId: A.CTZ_P3_WITHDRAWN_PATIENT.patientId,
    personaId: PERSONA_IDS.citizenWithdrawn,
  }),
  def("SCN-11-unauthorized-district-access", ["admin"], {
    personaId: PERSONA_IDS.analystAlpha,
    districtId: DISTRICT_IDS.beta,
    facilityId: FACILITY_IDS.beta1,
  }),
  def("SCN-12-suppressed-small-aggregate", ["admin"], {
    personaId: PERSONA_IDS.leadProgramme,
    districtId: DISTRICT_IDS.beta,
    facilityId: FACILITY_IDS.beta1,
    metricKey: "follow_ups_completed",
  }),
];

export function getScenario(id: string): ScenarioDefinition {
  const scenario = SCENARIOS.find((s) => s.id === id);
  if (!scenario) throw new RangeError(`unknown scenario ${id}`);
  return scenario;
}

/** `setup?.(structuredClone(seed)) ?? seed` — never mutates the given seed. */
export function applyScenario(seed: SeedDataset, id: string): SeedDataset {
  return getScenario(id).setup?.(structuredClone(seed)) ?? seed;
}

export const isScenarioId = (value: string): value is ScenarioId =>
  (SCENARIO_IDS as readonly string[]).includes(value);
