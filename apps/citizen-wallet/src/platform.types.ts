import type { KeyValueStorage } from "@laif/auth-demo";
import type { IdGenerator } from "@laif/domain";
import type { LanguageStorage } from "@laif/i18n";
import type { StoreAdapter } from "@laif/repositories";

import type { NotificationAdapter } from "./features/reminders/notificationAdapter.ts";

/** Storage + ids that differ between the device build and the Expo web target. */
export type AppPlatform = {
  /** Opens (creating if needed) this app's local database. */
  openStore(): Promise<StoreAdapter>;
  createIds(): IdGenerator;
  /** `laif.citizen.language` preference. */
  languageStorage(): LanguageStorage;
  /** Synchronous key/value storage for the demo persona session (`laif.citizen.persona`). */
  personaStorage(): KeyValueStorage;
  /**
   * CTZ-05 notification adapter (one per app run): the in-app simulation on web, the
   * `expo-notifications` preview adapter on a device.
   */
  notifications(): NotificationAdapter;
};
