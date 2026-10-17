/** Idempotency keys for user actions (platform UUIDs). Keep one per action across retries (T-09). */
import { platform } from "../platform";

const ids = platform.createIds();

export function newIdempotencyKey(): string {
  return ids();
}
