/**
 * Simulated device revocation / lost-device response (HWM-10 task 3, FRD §7, PRD §10).
 *
 * - `revoke()`: FND-07 `repo.sync.revokeDevice()` — the simulated server marks the device session
 *   `revoked` (local + `remote_deviceSessions`), every waiting op becomes `blocked_revoked` (never
 *   deleted, never sent; a later send answers `FORBIDDEN` reason `DEVICE_REVOKED`) and
 *   `device.revoked` is audited. The session is then re-read, so the `(app)` guard sends the
 *   worker to `/revoked` (no patient data rendered; every scoped read now answers
 *   `FORBIDDEN` `SESSION_REVOKED` anyway).
 * - `restore()` ("Restore device (demo only)"): `repo.sync.restoreDevice()` clears the flag,
 *   `blocked_revoked` → `queued`, audits `device.restored`; the session is re-read (signed in
 *   again) and one sync run sends the kept items — exactly once (same idempotency keys).
 * - `useRevocationWatcher()`: a sync run that met `DEVICE_REVOKED` (the server-side decision,
 *   e.g. the `deviceRevoked` fault) records the revocation on the device and re-reads the
 *   session so the guard can react.
 * Production policy (remote wipe vs upload first) is a PO decision (INDEX open question 7): the
 * demo keeps everything on the device.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect } from "react";

import { invalidateAfterWrite, workerKeys } from "../../data/queryKeys.ts";
import { useRepository } from "../../providers.tsx";
import { useSession } from "../../session/useSession.ts";
import { useSyncTriggers } from "../../sync/SyncTriggersProvider.tsx";

export const revocationKeys = {
  kept: ["sync", "revocation", "kept"] as const,
};

export type RevocationApi = {
  /** Items kept on the device and not sent (waiting + blocked + needs decision). */
  kept: number | undefined;
  revoke: () => Promise<void>;
  restore: () => Promise<void>;
};

export function useRevocation(): RevocationApi {
  const repo = useRepository();
  const queryClient = useQueryClient();
  const { refresh } = useSession();
  const triggers = useSyncTriggers();
  const kept = useQuery({
    queryKey: revocationKeys.kept,
    queryFn: async () => {
      const status = await repo.sync.getStatus();
      return status.pending + status.needsDecision;
    },
  });

  const revoke = useCallback(async () => {
    await repo.sync.revokeDevice();
    await refresh();
    queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== "sync" });
    await invalidateAfterWrite(queryClient);
  }, [repo, refresh, queryClient]);

  const restore = useCallback(async () => {
    await repo.sync.restoreDevice();
    await refresh();
    await invalidateAfterWrite(queryClient);
    // Kept items go out now (single-flight; the repository dedupes by idempotency key).
    await triggers.runNow("manual").catch(() => undefined);
  }, [repo, refresh, queryClient, triggers]);

  return { kept: kept.data, revoke, restore };
}

/**
 * Mounted in the `(app)` layout: when the simulated server answered `DEVICE_REVOKED` (status
 * `deviceRevoked`) while the device still holds an active session, the device records the
 * revocation (session `revoked`, waiting ops `blocked_revoked`, `device.revoked`) and re-reads
 * the session, so the guard moves to `/revoked`.
 */
export function useRevocationWatcher(): void {
  const repo = useRepository();
  const { status, session, refresh } = useSession();
  const sync = useQuery({ queryKey: workerKeys.status, queryFn: () => repo.sync.getStatus() });
  const revoked = sync.data?.deviceRevoked === true;
  const sessionId = session?.deviceSessionId ?? null;
  useEffect(() => {
    if (!revoked || status !== "signed_in" || sessionId === null) return;
    void (async () => {
      // Re-check the server state: the cached status can still say `deviceRevoked` right after
      // "Restore device", which must not revoke the freshly restored session again.
      const fresh = await repo.sync.getStatus();
      if (!fresh.deviceRevoked) return;
      const record = await repo.device.getSession(sessionId);
      if (record !== null && record.status !== "revoked") await repo.sync.revokeDevice();
      await refresh();
    })().catch(() => undefined);
  }, [revoked, status, sessionId, repo, refresh]);
}
