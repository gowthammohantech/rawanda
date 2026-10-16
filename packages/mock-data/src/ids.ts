/**
 * Stable, UUID-shaped seed IDs (FND-05). IDs depend only on `(namespace, n)` — never on the PRNG
 * seed — so `SEED_ANCHORS` constants, scenario anchors and REL-01 bundles stay valid.
 */
import { asId, fnv1a64Hex, type Brand } from "@laif/domain";

const VARIANT = ["8", "9", "a", "b"] as const;

/** `deterministicUuid('patient', 1)` → e.g. `3f2a…-…-5…-a…-…` (version nibble 5, RFC variant). */
export function deterministicUuid(namespace: string, n: number): string {
  const hex =
    fnv1a64Hex(`laif-seed:${namespace}:${n}:hi`) + fnv1a64Hex(`laif-seed:${namespace}:${n}:lo`);
  const variant = VARIANT[Number.parseInt(hex.charAt(16), 16) % 4] ?? "8";
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `5${hex.slice(13, 16)}`,
    `${variant}${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join("-");
}

/** Typed variant of `deterministicUuid`. */
export function seedId<T extends Brand<string, string>>(namespace: string, n: number): T {
  return asId<T>(deterministicUuid(namespace, n));
}

/** Namespaces used by the base seed (one per entity collection). */
export const ID_NAMESPACES = {
  patient: "patient",
  screening: "screening",
  amendment: "screening-amendment",
  review: "review",
  referral: "referral",
  followUp: "follow-up",
  attempt: "contact-attempt",
  careTask: "care-task",
  careInstruction: "care-instruction",
  reminder: "reminder",
  reminderPreference: "reminder-preference",
  auditEvent: "audit-event",
  correlation: "correlation",
  clientMutation: "client-mutation",
  syncOperation: "sync-operation",
  idempotency: "idempotency-key",
} as const;
