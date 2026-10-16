/** Clinical Web Portal constants (FND-11). */
import type { AppId } from "@laif/domain";
import { PERSONA_IDS } from "@laif/mock-data";

export const APP_ID = "clinical" as const satisfies AppId;

/** Signed-in persona until CLN-01 adds the demo-access picker. */
export const DEFAULT_PERSONA_ID: string = PERSONA_IDS.clinAlpha1;

/** Every route lives under `/clinical/*` (tech spec §2.1). */
export const BASE_PATH = "/clinical";
export const START_PATH = `${BASE_PATH}/login`;

/** E2E/test builds (`VITE_LAIF_E2E=1`): repository calls skip the simulated 150–450 ms latency. */
export const IS_E2E = import.meta.env.VITE_LAIF_E2E === "1";
