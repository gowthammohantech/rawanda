/**
 * Platform entry. Import it WITHOUT an extension (`./platform`): Metro then resolves
 * `platform.native.ts` (iOS / Android) or `platform.web.ts` (Expo web), and Vitest prefers
 * `.web.ts` — so expo-sqlite never reaches the web bundle and Dexie never reaches the device
 * bundle. This file is only what TypeScript resolves; both platform files satisfy the same type.
 */
export type { AppPlatform } from "./platform.types.ts";
export { platform } from "./platform.native.ts";
