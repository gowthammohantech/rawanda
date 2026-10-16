/**
 * Data-entry plausibility limits (FND-05). These are typing-error sanity ranges for forms, NOT
 * clinical thresholds. Consumed by the FND-03 `createScreeningInputSchema({ limits, now })`
 * factory (back-dating limit: `SCREENING_MAX_AGE_DAYS` = 30 in @laif/contracts).
 * Product-owner decision pending (phases/00-foundation/INDEX.md open item 1).
 */
import type { PlausibilityLimits } from "@laif/domain";

export const DEMO_PLAUSIBILITY_LIMITS: PlausibilityLimits = {
  systolic: { min: 60, max: 260 },
  diastolic: { min: 30, max: 160 },
  glucoseMmol: { min: 1.0, max: 35.0 },
  glucoseMgDl: { min: 18, max: 630 },
};
