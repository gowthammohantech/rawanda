/** Programme Admin Dashboard constants (FND-11). */
import type { AppId } from "@laif/domain";
import { PERSONA_IDS } from "@laif/mock-data";

export const APP_ID = "admin" as const satisfies AppId;

/** Signed-in persona until ADM-01 adds the demo sign-in (District Alpha analyst, WF-04 actor). */
export const DEFAULT_PERSONA_ID: string = PERSONA_IDS.analystAlpha;

/** Every route lives under `/admin/*` (tech spec §2.3). */
export const BASE_PATH = "/admin";
export const START_PATH = `${BASE_PATH}/overview`;

/** E2E/test builds (`VITE_LAIF_E2E=1`): repository calls skip the simulated 150–450 ms latency. */
export const IS_E2E = import.meta.env.VITE_LAIF_E2E === "1";
