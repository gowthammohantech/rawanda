/**
 * @laif/mock-data — deterministic synthetic seed, demo ruleset configuration and the 12 named
 * demo scenarios (FND-05). SYNTHETIC DEMONSTRATION DATA — NOT FOR CLINICAL USE.
 */
export const PACKAGE = "@laif/mock-data" as const;

export * from "./prng.ts";
export * from "./ids.ts";
export * from "./names.ts";
export * from "./reference/districts.ts";
export * from "./reference/facilities.ts";
export * from "./reference/personas.ts";
export * from "./config/demo-ruleset.ts";
export * from "./config/plausibility.ts";
export * from "./config/privacy.ts";
export * from "./seed/types.ts";
export { SEED_IDS, PATIENT_INDEX, PATIENT_RANGES, PATIENT_COUNT, patientId } from "./seed/ids.ts";
export { createSeed } from "./seed/generate.ts";
export { SEED_DATASET_HASH } from "./seed/seed.snapshot.ts";
export * from "./anchors.ts";
export * from "./scenarios/registry.ts";
export * from "./slices.ts";
export * from "./hash.ts";
