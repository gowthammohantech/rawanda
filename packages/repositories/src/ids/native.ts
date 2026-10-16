/**
 * Runtime id generator for the Expo native apps (FND-08 task 7): `expo-crypto` `randomUUID`
 * (optional peer dependency). Import from `@laif/repositories/ids/native` only.
 */
import type { IdGenerator } from "@laif/domain";
import { randomUUID } from "expo-crypto";

export function createNativeIdGenerator(): IdGenerator {
  return () => randomUUID();
}
