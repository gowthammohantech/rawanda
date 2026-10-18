/**
 * Reset demo (HWM-10 task 2, tech spec §10). Wraps FND-07 `repo.demo.resetDemo()`, which in ONE
 * transaction clears the store and reseeds the device slice + the FULL seed into `remote_*`,
 * resets the sync queue, idempotency records, counters, faults and the pinned demo clock and
 * writes exactly one `demo.reset` audit event (the fresh audit baseline). On top of that:
 * - signs out (decision: Reset demo signs out — the device sessions are part of the reset
 *   data, so the demonstrator starts again from the sign-in screen);
 * - regenerates the device id (meta `device_id` is cleared by the reset; a new platform UUID is
 *   created at once so the next sign-in uses it);
 * - clears the simulated device-clock offset and the clock-drift warning;
 * - keeps the language preference (stored by `@laif/i18n` outside the database).
 * It is the ONLY path that discards pending work; the screen asks for an explicit confirmation
 * listing the counts first (`countDiscardable`).
 */
import type { CareRepository, DemoState } from "@laif/repositories";

import type { SessionStore } from "../session/store.ts";
import type { DeviceClockStore } from "./clockDrift.ts";

export const RESET_CONFIRM_WORD = "RESET" as const;

/** The typed confirmation must be exactly `RESET` (surrounding spaces ignored). */
export function isResetConfirmed(text: string): boolean {
  return text.trim() === RESET_CONFIRM_WORD;
}

export type DiscardableCounts = {
  /** Not yet acknowledged and still to be sent (queued, sending, retrying, blocked by revocation). */
  waiting: number;
  /** Conflicts that need the worker's decision. */
  needsDecision: number;
  /** Device-local screening drafts of the signed-in worker (never synced). */
  drafts: number;
  /** waiting + needsDecision + drafts. */
  total: number;
};

export async function countDiscardable(
  repo: Pick<CareRepository, "sync" | "listScreenings">,
): Promise<DiscardableCounts> {
  const [status, drafts] = await Promise.all([
    repo.sync.getStatus(),
    repo.listScreenings({ statuses: ["draft"], pageSize: 200 }).catch(() => null),
  ]);
  const draftCount = drafts === null ? 0 : drafts.total;
  return {
    waiting: status.pending,
    needsDecision: status.needsDecision,
    drafts: draftCount,
    total: status.pending + status.needsDecision + draftCount,
  };
}

export type ResetDeps = {
  repo: Pick<CareRepository, "demo" | "device">;
  session: Pick<SessionStore, "clear">;
  deviceClock?: Pick<DeviceClockStore, "reset">;
};

export type ResetResult = { state: DemoState; deviceId: string };

export async function resetDemoBaseline({
  repo,
  session,
  deviceClock,
}: ResetDeps): Promise<ResetResult> {
  // Attributed to the signed-in worker (demo tooling is open to every role, even when revoked).
  const state = await repo.demo.resetDemo();
  session.clear();
  deviceClock?.reset();
  const deviceId = await repo.device.getOrCreateDeviceId();
  return { state, deviceId };
}
