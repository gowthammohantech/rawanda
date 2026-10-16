/** Health Worker Mobile constants (FND-11). */
import type { AppId } from "@laif/domain";
import { PERSONA_IDS } from "@laif/mock-data";

export const APP_ID = "worker" as const satisfies AppId;

/** Signed-in persona until HWM-01 adds the demo device sign-in. */
export const DEFAULT_PERSONA_ID: string = PERSONA_IDS.chwAlpha1A;

/**
 * E2E/test builds (`EXPO_PUBLIC_LAIF_E2E=1 expo export …`): sync sends skip the simulated
 * latency. Inlined by Metro at build time.
 */
export const IS_E2E = process.env.EXPO_PUBLIC_LAIF_E2E === "1";
