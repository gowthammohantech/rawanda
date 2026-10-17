/**
 * CTZ demo-tool fault names → the shared FND-07 `FaultConfig` (no app-specific transport):
 * `error500` → `serverErrorRate`, `unavailable` → `dependencyUnavailableRate`,
 * `conflict-next-write` → `conflictOnce` (needs the target entity).
 */
import type { FaultConfigPatch } from "../transport/faults.ts";

export const CITIZEN_FAULT_TOGGLES = ["error500", "unavailable", "conflict-next-write"] as const;
export type CitizenFaultToggle = (typeof CITIZEN_FAULT_TOGGLES)[number];

export function citizenFaultPatch(
  toggle: CitizenFaultToggle,
  enabled: boolean,
  target?: { entityType: string; entityId: string },
): FaultConfigPatch {
  switch (toggle) {
    case "error500":
      return { serverErrorRate: enabled ? 1 : 0 };
    case "unavailable":
      return { dependencyUnavailableRate: enabled ? 1 : 0 };
    case "conflict-next-write":
      return { conflictOnce: enabled && target ? [target] : [] };
  }
}
