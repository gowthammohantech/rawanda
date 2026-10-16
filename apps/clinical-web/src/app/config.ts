/** Clinical Web Portal constants (FND-11, CLN-01). */
import type { AppId } from "@laif/domain";

export const APP_ID = "clinical" as const satisfies AppId;

/** Every route lives under `/clinical/*` (tech spec §2.1). */
export const BASE_PATH = "/clinical";

/** E2E/test builds (`VITE_LAIF_E2E=1`): repository calls skip the simulated 150–450 ms latency. */
export const IS_E2E = import.meta.env.VITE_LAIF_E2E === "1";
