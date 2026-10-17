/**
 * Privacy hooks (CTZ-07): view logs (`citizen.access_history.viewed` once per focus of the
 * list, `citizen.privacy_notice.viewed` once per focus of the notice) and the correction "send"
 * state machine.
 *
 * Send: ONE idempotency key per review-step mount (the caller creates the hook there), kept
 * across retries — a double tap is ignored while in flight (T-04) and Retry after a server
 * error / timeout replays with the SAME key, so the request is created once (T-09). A
 * `CONFLICT` (item changed / demo toggle) and a duplicate block write nothing.
 */
import { CITIZEN_NOTICE_VERSION, type CitizenCareTask } from "@laif/contracts";
import { RepositoryError } from "@laif/repositories";
import type { CitizenCorrectionCall } from "@laif/repositories/citizen";
import { useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";

import { newIdempotencyKey } from "../../data/keys.ts";
import { useCreateCorrectionRequest } from "../../data/queries.ts";
import { useCitizenRepo } from "../../data/repo.tsx";

export function useAccessHistoryViewLog(patientId: string | null): void {
  const repo = useCitizenRepo();
  useFocusEffect(
    useCallback(() => {
      if (patientId === null) return;
      void repo.recordAccessHistoryViewed(patientId).catch(() => undefined);
    }, [repo, patientId]),
  );
}

export function usePrivacyNoticeViewLog(): void {
  const repo = useCitizenRepo();
  useFocusEffect(
    useCallback(() => {
      void repo.recordPrivacyNoticeViewed(CITIZEN_NOTICE_VERSION).catch(() => undefined);
    }, [repo]),
  );
}

export type SendStatus = "idle" | "pending" | "success" | "error" | "conflict" | "duplicate";

export type SendState = {
  status: SendStatus;
  task: CitizenCareTask | null;
  /** Existing open request when blocked as a duplicate. */
  duplicate: { id: string; createdAt: string } | null;
  send: (input: Omit<CitizenCorrectionCall, "idempotencyKey">) => Promise<void>;
};

export function useCorrectionSend(): SendState {
  const mutation = useCreateCorrectionRequest();
  const [key] = useState(newIdempotencyKey);
  const inFlight = useRef(false);
  const [status, setStatus] = useState<SendStatus>("idle");
  const [task, setTask] = useState<CitizenCareTask | null>(null);
  const [duplicate, setDuplicate] = useState<SendState["duplicate"]>(null);

  const send = useCallback(
    async (input: Omit<CitizenCorrectionCall, "idempotencyKey">) => {
      if (inFlight.current || task !== null) return;
      inFlight.current = true;
      setStatus("pending");
      try {
        const result = await mutation.mutateAsync({ input, key });
        setTask(result.data);
        setStatus("success");
      } catch (error) {
        if (error instanceof RepositoryError && error.code === "CONFLICT") {
          setStatus("conflict");
        } else if (
          error instanceof RepositoryError &&
          error.code === "VALIDATION_ERROR" &&
          error.reason === "DUPLICATE_OPEN_REQUEST"
        ) {
          const id = error.details["existingId"];
          const createdAt = error.details["existingCreatedAt"];
          setDuplicate(
            typeof id === "string" && typeof createdAt === "string" ? { id, createdAt } : null,
          );
          setStatus("duplicate");
        } else {
          // Keep the key: Retry replays the same request (T-09).
          setStatus("error");
        }
      } finally {
        inFlight.current = false;
      }
    },
    [key, mutation, task],
  );

  return { status, task, duplicate, send };
}
