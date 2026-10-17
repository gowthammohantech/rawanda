/**
 * Demo device sign-in (HWM-01 task 3). DEMO SIGN-IN — NOT AUTHENTICATION.
 *
 * - `signIn(personaId, facilityId)`: the repository checks the scope with `@laif/auth-demo`
 *   `checkAccess` (facility must be one of the persona's assignments) and, on failure, records
 *   `access.denied` attributed to the attempted persona and answers `FORBIDDEN` (`SCOPE`).
 *   Success writes the `deviceSessions` record + `session.started`, then the local session.
 * - `signOut()`: ends the device session (`session.ended`) and clears the local session only;
 *   screenings, drafts and queued sync operations stay on the device.
 * - `restore()`: boot / restart — a stored session is kept only while its device session record
 *   is active (`revoked` → status `revoked`, HWM-10; ended / missing after a reset → signed out).
 */
import type { ErrorCode, ErrorReason } from "@laif/contracts";
import { RepositoryError, type CareRepository } from "@laif/repositories";

import { getOrCreateDeviceId } from "./device.ts";
import type { SessionStore, SignedInSession } from "./store.ts";

export type SessionStatus = "loading" | "signed_out" | "signed_in" | "revoked";

export type SignInResult =
  { ok: true; session: SignedInSession } | { ok: false; code: ErrorCode; reason?: ErrorReason };

export type SessionRepo = {
  restore: () => Promise<Exclude<SessionStatus, "loading">>;
  signIn: (personaId: string, facilityId: string) => Promise<SignInResult>;
  signOut: () => Promise<void>;
};

export function createSessionRepo(deps: {
  repo: Pick<CareRepository, "device">;
  store: SessionStore;
}): SessionRepo {
  const { repo, store } = deps;
  return {
    async restore() {
      const session = store.current();
      if (session === null) {
        store.clear();
        return "signed_out";
      }
      const record = await repo.device.getSession(session.deviceSessionId);
      if (record?.status === "revoked") return "revoked";
      if (
        record === null ||
        record.status !== "active" ||
        record.personaId !== session.persona.id ||
        record.facilityId !== session.facilityId
      ) {
        store.clear();
        return "signed_out";
      }
      return "signed_in";
    },

    async signIn(personaId, facilityId) {
      try {
        const deviceId = await getOrCreateDeviceId(repo);
        const record = await repo.device.startSession({ personaId, facilityId, deviceId });
        store.save(personaId, {
          facilityId: record.facilityId,
          deviceSessionId: record.id,
          deviceId: record.deviceId,
        });
        const session = store.current();
        if (session === null) return { ok: false, code: "FORBIDDEN", reason: "ROLE" };
        return { ok: true, session };
      } catch (error) {
        if (error instanceof RepositoryError) {
          return error.reason === undefined
            ? { ok: false, code: error.code }
            : { ok: false, code: error.code, reason: error.reason };
        }
        throw error;
      }
    },

    async signOut() {
      const session = store.current();
      try {
        if (session !== null) await repo.device.endSession(session.deviceSessionId);
      } finally {
        store.clear();
      }
    },
  };
}
