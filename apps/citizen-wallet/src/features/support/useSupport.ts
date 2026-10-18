/**
 * Support hooks (CTZ-08): view logs (`citizen.support.viewed` / `citizen.help.viewed`, once per
 * focus, only with a signed-in persona), whether a callback may be sent, and the callback "send"
 * state machine.
 *
 * Send: ONE idempotency key per form mount, kept across retries — a double tap is ignored while
 * in flight and Retry after a server error / timeout replays with the SAME key, so exactly one
 * `callback_request` task + one `citizen.support.callback_requested` is written (T-04 / T-09).
 */
import type { CitizenCareTask } from "@laif/contracts";
import type { CallbackRequestCall } from "@laif/repositories/citizen";
import { useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";

import { newIdempotencyKey } from "../../data/keys.ts";
import { useCitizenSession, useConsent, useCreateCallbackRequest } from "../../data/queries.ts";
import { useCitizenRepo } from "../../data/repo.tsx";
import { usePersona } from "../../providers.tsx";

export function useSupportViewLog(kind: "support" | "help"): void {
  const repo = useCitizenRepo();
  const signedIn = usePersona() !== null;
  useFocusEffect(
    useCallback(() => {
      if (!signedIn) return;
      const write = kind === "support" ? repo.recordSupportViewed() : repo.recordHelpViewed();
      void write.catch(() => undefined);
    }, [repo, signedIn, kind]),
  );
}

export type CallbackAccess =
  | { status: "loading" }
  | { status: "noPersona" }
  | { status: "noConsent" }
  | { status: "allowed"; patientId: string };

/** A callback needs a signed-in persona, a linked patient and consent `granted` (task 11). */
export function useCallbackAccess(): CallbackAccess {
  const persona = usePersona();
  const session = useCitizenSession();
  const patientId = persona === null ? null : (session.data?.activePatientId ?? null);
  const consent = useConsent(patientId);
  if (persona === null) return { status: "noPersona" };
  if (session.data === undefined && !session.isError) return { status: "loading" };
  if (patientId === null) return { status: "noConsent" };
  if (consent.data === undefined && !consent.isError) return { status: "loading" };
  return consent.data?.state === "granted"
    ? { status: "allowed", patientId }
    : { status: "noConsent" };
}

export type CallbackSendStatus = "idle" | "pending" | "success" | "error";

export function useCallbackSend() {
  const mutation = useCreateCallbackRequest();
  const [key] = useState(newIdempotencyKey);
  const inFlight = useRef(false);
  const [status, setStatus] = useState<CallbackSendStatus>("idle");
  const [task, setTask] = useState<CitizenCareTask | null>(null);

  const send = useCallback(
    async (input: Omit<CallbackRequestCall, "idempotencyKey">) => {
      if (inFlight.current || task !== null) return;
      inFlight.current = true;
      setStatus("pending");
      try {
        const result = await mutation.mutateAsync({ input, key });
        setTask(result.data);
        setStatus("success");
      } catch {
        // Keep the key: Retry replays the same request (T-09).
        setStatus("error");
      } finally {
        inFlight.current = false;
      }
    },
    [key, mutation, task],
  );

  return { status, task, send };
}
