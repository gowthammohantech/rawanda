/**
 * `makeIdempotencyKey(parts)` — a stable, UUID-shaped key derived from its parts (FNV-1a 64 ×2,
 * version nibble 5, RFC variant), so it passes the FND-03 `IdempotencyKey` schema. The same parts
 * always give the same key (StrictMode double effects, back/forward, retries).
 */
import { fnv1a64Hex } from "@laif/domain";

const VARIANT = ["8", "9", "a", "b"] as const;

export function makeIdempotencyKey(parts: readonly string[]): string {
  const input = JSON.stringify(parts);
  const hex = fnv1a64Hex(`laif-admin:hi:${input}`) + fnv1a64Hex(`laif-admin:lo:${input}`);
  const variant = VARIANT[Number.parseInt(hex.charAt(16), 16) % 4] ?? "8";
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `5${hex.slice(13, 16)}`,
    `${variant}${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join("-");
}

/** Remembers keys already used, so a side effect runs once per key (bounded memory). */
export type OnceRegistry = {
  /** True the first time a key is claimed, false afterwards. */
  claim(key: string): boolean;
};

export function createOnceRegistry(limit = 500): OnceRegistry {
  const seen = new Set<string>();
  return {
    claim(key) {
      if (seen.has(key)) return false;
      seen.add(key);
      if (seen.size > limit) {
        const oldest = seen.values().next().value;
        if (oldest !== undefined) seen.delete(oldest);
      }
      return true;
    },
  };
}
