/** Citizen Health Wallet constants (FND-11). */
import type { AppId } from "@laif/domain";

export const APP_ID = "citizen" as const satisfies AppId;

/**
 * Deep-link schemes (app.json `scheme`): `laifwallet` (FND-11) and `citizen-wallet` (CTZ-02
 * phase prose) both open the app, e.g. `citizen-wallet://health` → `/health` (route guard).
 */
export const DEEP_LINK_SCHEMES = ["laifwallet", "citizen-wallet"] as const;

/**
 * E2E/test builds (`EXPO_PUBLIC_LAIF_E2E=1 expo export …`): repository calls skip the
 * simulated latency. Inlined by Metro at build time.
 */
export const IS_E2E = process.env.EXPO_PUBLIC_LAIF_E2E === "1";
