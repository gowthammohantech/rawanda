/**
 * Fixed record numbers of the base seed. IDs are `deterministicUuid(namespace, n)` with these
 * numbers, so `SEED_ANCHORS` and the generator always agree (and never depend on the PRNG seed).
 *
 * Flagged pathways (one review_required screening + review each, 20 in total):
 * | # | facility | review outcome | downstream |
 * |---|---|---|---|
 * | 1 | Alpha-1 CTZ-P1 | refer | R9 completed; FA9 + PC2 completed; CI1 released (SCN-05) |
 * | 2 | Alpha-1 CTZ-P1 | refer | R6 scheduled 19 Oct; FA6 contacted v3 (WF-02); PC6 reassigned; CI2 |
 * | 3 | Alpha-1 CTZ-P1 | refer | R1 created, NO instruction (CTZ_P1_UNRELEASED_REFERRAL); FA1 |
 * | 4 | Alpha-1 CTZ-P3 | refer | R3 accepted; FA3 assigned past due; CI4; reminders cancelled |
 * | 5 | Alpha-1 | pending (WF-01 / SCN-02) | — |
 * | 6 | Alpha-1 | pending, repeat reading (WF-03) | — |
 * | 7 | Alpha-1 | dismissed (SCN-03) | — |
 * | 8 | Alpha-1 | refer | R5 scheduled past due (SCN-04); FA5 assigned past due; PC5 contacted |
 * | 9 | Alpha-1 | refer | R8 completed; FA8 completed, confirmation pending; PC1 completed; CI6 |
 * | 10 | Alpha-2 CTZ-P2 | dismissed | — |
 * | 11 | Alpha-2 CTZ-P2 | refer | R12 cancelled → R7 replacement scheduled; FA7 reassigned; CI7 withdrawn, CI3 |
 * | 12 | Alpha-2 CTZ-P2 | pending (awaiting review) | — |
 * | 13 | Alpha-2 CTZ-P4 patient | plan_follow_up | PR1 assigned; CI5 |
 * | 14 | Alpha-2 | in_review, imported, glucose unit missing (SCN-06) | — |
 * | 15 | Alpha-2 | refer | R2 created; FA2 |
 * | 16 | Alpha-2 | refer | R11 completed; FA11 completed; PC4 unable_to_reach |
 * | 17 | Beta-1 | pending (WF-04) | — |
 * | 18 | Beta-1 | dismissed | — |
 * | 19 | Beta-1 | refer | R4 accepted; FA4 contacted |
 * | 20 | Beta-1 | refer | R10 completed; FA10 completed (SCN-12 cell); PC3 unable_to_reach |
 */
export const PATHWAY = {
  ctzP1Completed: 1,
  ctzP1Scheduled: 2,
  ctzP1Unreleased: 3,
  ctzP3Withdrawn: 4,
  wf01Flagged: 5,
  wf03Dismissable: 6,
  scn03Dismissed: 7,
  overdueReferral: 8,
  workerCompleted: 9,
  ctzP2Dismissed: 10,
  ctzP2Cancelled: 11,
  ctzP2Awaiting: 12,
  ctzP4PlanFollowUp: 13,
  missingUnit: 14,
  createdAlpha2: 15,
  unableToReach: 16,
  wf04OtherFacility: 17,
  dismissedBeta: 18,
  acceptedBeta: 19,
  completedBeta: 20,
} as const;

/** Screening numbers: pathways 1–20, then no-review screenings 21–57, then drafts 58–60. */
export const SCREENING_NO = {
  scn01Normal: 21,
  amended: 22,
  ctzP4NoAction: 23,
  firstOtherNoReview: 24,
  lastNoReview: 57,
  draftMissingUnit: 58,
  draftAlpha2: 59,
  draftBeta1: 60,
} as const;

export const REFERRAL_NO = {
  R1: 1,
  R2: 2,
  R3: 3,
  R4: 4,
  R5: 5,
  R6: 6,
  R7: 7,
  R8: 8,
  R9: 9,
  R10: 10,
  R11: 11,
  R12: 12,
} as const;

export const FOLLOW_UP_NO = {
  FA1: 1,
  FA2: 2,
  FA3: 3,
  FA4: 4,
  FA5: 5,
  FA6: 6,
  FA7: 7,
  FA8: 8,
  FA9: 9,
  FA10: 10,
  FA11: 11,
  PR1: 12,
  PC1: 13,
  PC2: 14,
  PC3: 15,
  PC4: 16,
  PC5: 17,
  PC6: 18,
} as const;

export const CARE_INSTRUCTION_NO = {
  CI1: 1,
  CI2: 2,
  CI3: 3,
  CI4: 4,
  CI5: 5,
  CI6: 6,
  CI7: 7,
} as const;

export const CARE_TASK_NO = {
  citizenCorrection: 1,
  staffCorrection: 2,
  assignmentFA1: 3,
  assignmentFA2: 4,
  programmeAction: 5,
  dataQuality: 6,
} as const;
