/** Citizen Health Wallet constants (FND-11). */
import type { AppId } from "@laif/domain";
import { PERSONA_IDS } from "@laif/mock-data";

export const APP_ID = "citizen" as const satisfies AppId;

/** Signed-in persona until CTZ-02 adds the welcome / persona choice (CTZ-P1). */
export const DEFAULT_PERSONA_ID: string = PERSONA_IDS.citizen1;

/**
 * E2E/test builds (`EXPO_PUBLIC_LAIF_E2E=1 expo export …`): repository calls skip the
 * simulated latency. Inlined by Metro at build time.
 */
export const IS_E2E = process.env.EXPO_PUBLIC_LAIF_E2E === "1";
