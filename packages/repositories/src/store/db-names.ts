/**
 * One database per app (FND-08 / FND-11): IndexedDB `laif-<appId>` (web apps and the Expo web
 * target) and SQLite file `laif-<appId>.db` (Expo native). `laif-clinical-web` in older phase text
 * means `laif-clinical`.
 */
import type { AppId } from "@laif/domain";

export const dexieDbName = (appId: AppId): `laif-${AppId}` => `laif-${appId}`;

export const sqliteDbFileName = (appId: AppId): `laif-${AppId}.db` => `laif-${appId}.db`;
