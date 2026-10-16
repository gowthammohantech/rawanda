import type { KeyValueStorage } from "@laif/auth-demo";
import type { IdGenerator } from "@laif/domain";
import type { LanguageStorage } from "@laif/i18n";
import type { StoreAdapter } from "@laif/repositories";

/** Storage + ids that differ between the device build and the Expo web target. */
export type AppPlatform = {
  /** Opens (creating if needed) this app's local database. */
  openStore(): Promise<StoreAdapter>;
  createIds(): IdGenerator;
  /** `laif.worker.language` preference. */
  languageStorage(): LanguageStorage;
  /** Synchronous key/value storage for the demo persona session (`laif.worker.persona`). */
  personaStorage(): KeyValueStorage;
};
