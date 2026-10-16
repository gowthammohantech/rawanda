/**
 * Runtime id generator for the web apps and the Expo web target (FND-08 task 7). Seeds keep
 * their deterministic ids; only records created at runtime use this. Import from
 * `@laif/repositories/ids/web`.
 */
import type { IdGenerator } from "@laif/domain";

import { RepositoryError } from "../errors.ts";

type CryptoLike = { randomUUID?: () => string };

export function createWebIdGenerator(
  crypto: CryptoLike | undefined = (globalThis as { crypto?: CryptoLike }).crypto,
): IdGenerator {
  const randomUUID = crypto?.randomUUID?.bind(crypto);
  if (!randomUUID) {
    throw new RepositoryError("DEPENDENCY_UNAVAILABLE", {
      message: "crypto.randomUUID is not available",
      details: { dependency: "crypto.randomUUID" },
    });
  }
  return () => randomUUID();
}
