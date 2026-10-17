/** Programme Admin Dashboard constants (FND-11, ADM-01). */
import type { AppId } from "@laif/domain";

export const APP_ID = "admin" as const satisfies AppId;

/** Every route lives under `/admin/*` (tech spec §2.3). */
export const BASE_PATH = "/admin";
export const START_PATH = `${BASE_PATH}/overview`;
/** Public demo sign-in (ADM-01). */
export const LOGIN_PATH = `${BASE_PATH}/login`;

/** E2E/test builds (`VITE_LAIF_E2E=1`): repository calls skip the simulated 150–450 ms latency. */
export const IS_E2E = import.meta.env.VITE_LAIF_E2E === "1";
