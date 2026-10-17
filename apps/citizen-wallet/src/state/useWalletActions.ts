/**
 * Persona selection / switching (CTZ-02 tasks 3, 11). DEMO PERSONA — not real sign-in.
 * - `selectPersona`: FND-06 `switchTo`, then `startSession({ personaSelected: true })`
 *   (`session.started` + `citizen.persona.selected`), stores the wallet context and returns
 *   where the persona lands (verify / recover / consent / consent-withdrawn / tabs).
 * - `endSession`: `session.ended` (while the actor is still set), then clears the persona, the
 *   wallet context and every cached query.
 */
import type { ConsentState } from "@laif/domain";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { useCitizenRepo } from "../data/repo.tsx";
import { useSession, useWalletStore } from "../providers.tsx";
import { accountGate, landingHref, type GateHref } from "./access.ts";

/**
 * The in-flight `endSession` (header "Switch persona" navigates first, then ends the session). A
 * persona chosen before it finishes must wait for it, or its `signOut()` would sign the NEW
 * persona out ("This persona could not be opened").
 */
let pendingEnd: Promise<void> | null = null;

export function useWalletActions() {
  const repo = useCitizenRepo();
  const session = useSession();
  const wallet = useWalletStore();
  const queryClient = useQueryClient();

  const selectPersona = useCallback(
    async (personaId: string): Promise<GateHref> => {
      if (pendingEnd !== null) await pendingEnd.catch(() => undefined);
      const previous = session.current()?.id ?? null;
      if (previous !== null && previous !== personaId) {
        await repo.endSession().catch(() => null);
      }
      queryClient.removeQueries({ predicate: (q) => q.queryKey[1] !== "personas" });
      const switched = session.switchTo(personaId);
      if (!switched.ok) throw new Error(`Unknown persona ${personaId}`);
      const started = await repo.startSession({ personaSelected: true });
      wallet.getState().setContext({
        accountId: started.account?.id ?? null,
        activePatientId: started.activePatientId,
      });
      wallet.getState().markStarted(personaId);
      let consent: ConsentState | null = null;
      if (accountGate(started) === null && started.activePatientId !== null) {
        consent =
          started.patients.find((p) => p.patientId === started.activePatientId)?.consentState ??
          null;
      }
      return landingHref(started, consent, "health");
    },
    [repo, session, wallet, queryClient],
  );

  const endSession = useCallback(async () => {
    const run = (async () => {
      await repo.endSession().catch(() => null);
      session.signOut();
      wallet.getState().clear();
      queryClient.removeQueries({ predicate: (q) => q.queryKey[1] !== "personas" });
      await queryClient.invalidateQueries({ queryKey: ["ctz", "personas"] });
    })();
    pendingEnd = run;
    try {
      await run;
    } finally {
      if (pendingEnd === run) pendingEnd = null;
    }
  }, [repo, session, wallet, queryClient]);

  return { selectPersona, endSession };
}
