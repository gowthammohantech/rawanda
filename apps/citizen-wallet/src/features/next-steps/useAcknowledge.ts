/**
 * "I have read this" (CTZ-04 task 4). One idempotency key per user action on this step, made
 * once and kept in component state until the write succeeds — a retry after a server error /
 * timeout replays with the SAME key (T-09) and a double tap is ignored while in flight (T-04).
 *
 * A `CONFLICT` (the step changed since it was shown, or the demo `conflict-next-write` toggle)
 * writes nothing; the hook drops the key, the queries reload the latest version and the citizen
 * has to read it and tap again — an acknowledgement is never silently applied to a new version
 * (T-05). Acknowledging never changes the step's status.
 */
import type { NextStepAcknowledgement } from "@laif/contracts";
import type { ApprovedInstruction } from "@laif/domain";
import { RepositoryError } from "@laif/repositories";
import { useCallback, useRef, useState } from "react";

import { newIdempotencyKey } from "../../data/keys.ts";
import { useAcknowledgeInstruction } from "../../data/queries.ts";

export type AcknowledgeStatus = "idle" | "pending" | "success" | "error" | "conflict";

export type AcknowledgeState = {
  status: AcknowledgeStatus;
  /** When the step was read (stored ack, or the one just saved). */
  acknowledgedAt: string | null;
  /** The transport error code of a failed attempt (for the inline error). */
  errorCode: string | null;
  acknowledge: () => Promise<void>;
  /** Clears the conflict notice (after the latest version was shown). */
  dismissConflict: () => void;
};

export function useAcknowledge(
  step: Pick<ApprovedInstruction, "id" | "patientId" | "version" | "acknowledgement">,
): AcknowledgeState {
  const mutation = useAcknowledgeInstruction();
  const [key, setKey] = useState<string | null>(null);
  const inFlight = useRef(false);
  const [status, setStatus] = useState<AcknowledgeStatus>("idle");
  const [saved, setSaved] = useState<NextStepAcknowledgement | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  const acknowledge = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    const actionKey = key ?? newIdempotencyKey();
    if (key === null) setKey(actionKey);
    setStatus("pending");
    setErrorCode(null);
    try {
      const result = await mutation.mutateAsync({
        input: { patientId: step.patientId, instructionId: step.id, expectedVersion: step.version },
        key: actionKey,
      });
      setSaved(result.data);
      setKey(null);
      setStatus("success");
    } catch (error) {
      if (error instanceof RepositoryError && error.code === "CONFLICT") {
        // Nothing was written; the next tap is a new action on the reloaded version.
        setKey(null);
        setStatus("conflict");
      } else {
        // Keep the key: Retry replays the same action (T-09).
        setErrorCode(error instanceof RepositoryError ? error.code : null);
        setStatus("error");
      }
    } finally {
      inFlight.current = false;
    }
  }, [key, mutation, step.id, step.patientId, step.version]);

  const dismissConflict = useCallback(() => setStatus("idle"), []);

  return {
    status,
    acknowledgedAt: step.acknowledgement?.acknowledgedAt ?? saved?.acknowledgedAt ?? null,
    errorCode,
    acknowledge,
    dismissConflict,
  };
}
