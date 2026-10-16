/**
 * Device session revocation / restore helpers (HW-08 demo, HWM-10). Pure: returns the revoked record; the
 * FND-07 repository persists it, blocks the sync queue and audits `device.revoked`.
 */
import type { DeviceSession } from "@laif/domain";

export type RevokeDeviceSessionOptions = {
  /** Demo-clock instant of the revocation. */
  now: Date;
};

/** Idempotent: an already revoked session is returned unchanged. */
export function revokeDeviceSession<S extends DeviceSession>(
  session: S,
  options: RevokeDeviceSessionOptions,
): S {
  if (session.status === "revoked") return session;
  return {
    ...session,
    status: "revoked",
    version: session.version + 1,
    updatedAt: options.now.toISOString(),
  };
}

export function isDeviceSessionActive(
  session: Pick<DeviceSession, "status"> | null | undefined,
): boolean {
  return session?.status === "active";
}

/** Demo undo of a revocation (HWM-10 "restore device"). Idempotent for an active session. */
export function restoreDeviceSession<S extends DeviceSession>(
  session: S,
  options: RevokeDeviceSessionOptions,
): S {
  if (session.status === "active") return session;
  return {
    ...session,
    status: "active",
    version: session.version + 1,
    updatedAt: options.now.toISOString(),
  };
}
