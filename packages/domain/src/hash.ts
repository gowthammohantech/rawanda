/**
 * Canonical hashing for audit `beforeHash` / `afterHash` and seed snapshot hashing.
 *
 * NOT tamper-proof (spec §11): FNV-1a is a fast non-cryptographic hash used only to detect
 * accidental change in a demo. Do not rely on it for integrity or security.
 */

/**
 * Deterministic JSON: object keys sorted recursively, `undefined` object members dropped
 * (as JSON.stringify does), arrays keep their order. Throws on non-finite numbers, bigint,
 * functions and symbols so hashes can never silently depend on lossy serialisation.
 */
export function canonicalJson(value: unknown): string {
  return serialise(value);
}

function serialise(value: unknown): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "string":
    case "boolean":
      return JSON.stringify(value);
    case "number":
      if (!Number.isFinite(value)) throw new TypeError("canonicalJson: non-finite number");
      return JSON.stringify(value);
    case "object": {
      if (Array.isArray(value)) {
        return `[${value.map((item) => (item === undefined ? "null" : serialise(item))).join(",")}]`;
      }
      if (value instanceof Date) return JSON.stringify(value.toISOString());
      const record = value as Record<string, unknown>;
      const members = Object.keys(record)
        .filter((key) => record[key] !== undefined)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${serialise(record[key])}`);
      return `{${members.join(",")}}`;
    }
    default:
      throw new TypeError(`canonicalJson: unsupported type ${typeof value}`);
  }
}

const FNV64_OFFSET = 0xcbf29ce484222325n;
const FNV64_PRIME = 0x100000001b3n;
const MASK64 = 0xffffffffffffffffn;

/** FNV-1a 64-bit over the UTF-8 bytes of `input`, as 16 lowercase hex chars. */
export function fnv1a64Hex(input: string): string {
  let hash = FNV64_OFFSET;
  for (const byte of new TextEncoder().encode(input)) {
    hash ^= BigInt(byte);
    hash = (hash * FNV64_PRIME) & MASK64;
  }
  return hash.toString(16).padStart(16, "0");
}

/** Convenience: `fnv1a64Hex(canonicalJson(value))`. */
export function hashCanonical(value: unknown): string {
  return fnv1a64Hex(canonicalJson(value));
}
