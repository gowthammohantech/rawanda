/** Health Worker Mobile constants (FND-11). */
import type { AppId } from "@laif/domain";

export const APP_ID = "worker" as const satisfies AppId;

/**
 * E2E/test builds (`EXPO_PUBLIC_LAIF_E2E=1 expo export …`): sync sends skip the simulated
 * latency. Inlined by Metro at build time.
 */
export const IS_E2E = process.env.EXPO_PUBLIC_LAIF_E2E === "1";

/**
 * Developer / E2E-only test hooks (HWM-01 "force a facility outside the assignment"). Never
 * shown in a production-like build.
 */
export const SHOW_TEST_HOOKS = IS_E2E || (typeof __DEV__ !== "undefined" && __DEV__);
