/**
 * Seed SEED_IDS: stable reference IDs used by every app and test (FND-05 task 2), plus the
 * fixed indices of the anchored patients so personas, anchors and the generator agree.
 */
import type { PatientId } from "@laif/domain";

import { seedId, ID_NAMESPACES } from "../ids.ts";
import { DISTRICT_IDS } from "../reference/districts.ts";
import { FACILITY_IDS } from "../reference/facilities.ts";

export const SEED_IDS = {
  districts: DISTRICT_IDS,
  facilities: FACILITY_IDS,
} as const;

/** Patient index ranges per facility (1-based): Alpha-1 18, Alpha-2 14, Beta-1 16. */
export const PATIENT_RANGES = {
  [FACILITY_IDS.alpha1]: { first: 1, last: 18 },
  [FACILITY_IDS.alpha2]: { first: 19, last: 32 },
  [FACILITY_IDS.beta1]: { first: 33, last: 48 },
} as const;

export const PATIENT_COUNT = 48;

/** Named patient indices (see seed/plan.ts for what each one carries). */
export const PATIENT_INDEX = {
  ctzP1: 1,
  ctzP3Withdrawn: 2,
  wf01Flagged: 3,
  wf03Dismissable: 4,
  scn03Dismissed: 5,
  overdueReferral: 6,
  workerCompleted: 7,
  scn01Normal: 8,
  ctzP2: 19,
  ctzP4Represented: 20,
  missingUnit: 21,
  createdReferralAlpha2: 22,
  unableToReach: 23,
  amended: 24,
  wf04OtherFacility: 33,
  dismissedBeta: 34,
  acceptedReferralBeta: 35,
  completedReferralBeta: 36,
  duplicateA: 37,
  duplicateB: 38,
} as const;

export const patientId = (index: number): PatientId =>
  seedId<PatientId>(ID_NAMESPACES.patient, index);
