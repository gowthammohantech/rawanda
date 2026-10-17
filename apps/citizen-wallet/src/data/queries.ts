/**
 * TanStack Query hooks over the `CitizenRepository` (CTZ-01). Keys: `['ctz', personaId, …]`, so
 * a persona switch never shows another persona's cache. Health reads are disabled until a
 * patient is chosen; typed errors (`FORBIDDEN` / `CONSENT_REQUIRED`, `NOT_FOUND`, `CONFLICT`,
 * `DEPENDENCY_UNAVAILABLE`) are never retried except the retryable transport codes.
 *
 * Mutations take `{ input, key }`: the caller keeps the idempotency key across retries of the
 * same user action (T-09), so a retry after a timeout replays instead of writing twice.
 */
import { RepositoryError } from "@laif/repositories";
import type {
  AcknowledgeInstructionCall,
  CallbackRequestCall,
  CitizenCorrectionCall,
  RecordConsentCall,
  UpdateCitizenSettingsCall,
  UpdateNotificationPrefsCall,
  VerifyIdentityCall,
} from "@laif/repositories/citizen";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { usePersona } from "../providers.tsx";
import { useCitizenRepo } from "./repo.tsx";

/** Query-key builders (`['ctz', personaId, …]`). */
export const ctzKeys = {
  all: (personaId: string | null) => ["ctz", personaId ?? "signed-out"] as const,
  personas: () => ["ctz", "personas"] as const,
  session: (personaId: string | null) => [...ctzKeys.all(personaId), "session"] as const,
  settings: (personaId: string | null) => [...ctzKeys.all(personaId), "settings"] as const,
  patient: (personaId: string | null, patientId: string | null, area: string) =>
    [...ctzKeys.all(personaId), "patient", patientId ?? "none", area] as const,
  observation: (personaId: string | null, patientId: string | null, id: string) =>
    [...ctzKeys.all(personaId), "patient", patientId ?? "none", "observation", id] as const,
};

/** Retry only transport failures (timeout / offline / 500 / 503), at most once. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  return error instanceof RepositoryError && error.retryable && failureCount < 1;
}

function usePersonaId(): string | null {
  return usePersona()?.id ?? null;
}

export function useCitizenPersonas() {
  const repo = useCitizenRepo();
  return useQuery({
    queryKey: ctzKeys.personas(),
    queryFn: () => repo.listPersonas(),
    retry: shouldRetry,
  });
}

export function useCitizenSession() {
  const repo = useCitizenRepo();
  const personaId = usePersonaId();
  return useQuery({
    queryKey: ctzKeys.session(personaId),
    queryFn: () => repo.getSession(),
    retry: shouldRetry,
  });
}

export function useCitizenSettings() {
  const repo = useCitizenRepo();
  const personaId = usePersonaId();
  return useQuery({
    queryKey: ctzKeys.settings(personaId),
    queryFn: () => repo.getSettings(),
    enabled: personaId !== null,
    retry: shouldRetry,
  });
}

function usePatientQuery<T>(
  patientId: string | null,
  area: string,
  read: (patientId: string) => Promise<T>,
) {
  const personaId = usePersonaId();
  return useQuery({
    queryKey: ctzKeys.patient(personaId, patientId, area),
    queryFn: () => read(patientId as string),
    enabled: personaId !== null && patientId !== null,
    retry: shouldRetry,
  });
}

export function useConsent(patientId: string | null) {
  const repo = useCitizenRepo();
  return usePatientQuery(patientId, "consent", (id) => repo.getConsent(id));
}

export function useReleasedObservations(patientId: string | null) {
  const repo = useCitizenRepo();
  return usePatientQuery(patientId, "observations", (id) => repo.listReleasedObservations(id));
}

export function useObservation(patientId: string | null, observationId: string) {
  const repo = useCitizenRepo();
  const personaId = usePersonaId();
  return useQuery({
    queryKey: ctzKeys.observation(personaId, patientId, observationId),
    queryFn: () => repo.getObservation(observationId, patientId as string),
    enabled: personaId !== null && patientId !== null,
    retry: shouldRetry,
  });
}

export function useApprovedInstructions(patientId: string | null) {
  const repo = useCitizenRepo();
  return usePatientQuery(patientId, "instructions", (id) => repo.listApprovedInstructions(id));
}

export function useNotificationPrefs(patientId: string | null) {
  const repo = useCitizenRepo();
  return usePatientQuery(patientId, "prefs", (id) => repo.getNotificationPrefs(id));
}

export function useReminders(patientId: string | null) {
  const repo = useCitizenRepo();
  return usePatientQuery(patientId, "reminders", (id) => repo.listReminders(id));
}

export function useTimeline(patientId: string | null) {
  const repo = useCitizenRepo();
  return usePatientQuery(patientId, "timeline", (id) => repo.listTimeline(id));
}

export function useAccessEvents(patientId: string | null) {
  const repo = useCitizenRepo();
  return usePatientQuery(patientId, "access", (id) => repo.listAccessEvents(id));
}

export function useCorrectionRequests(patientId: string | null) {
  const repo = useCitizenRepo();
  return usePatientQuery(patientId, "corrections", (id) => repo.listCorrectionRequests(id));
}

type Vars<I> = { input: I; key: string };

/** A write that invalidates everything of the signed-in persona on success. */
function useCitizenMutation<I, R>(write: (input: I, key: string) => Promise<R>) {
  const queryClient = useQueryClient();
  const personaId = usePersonaId();
  return useMutation({
    mutationFn: ({ input, key }: Vars<I>) => write(input, key),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ctzKeys.all(personaId) });
      // The persona picker shows account / consent chips too.
      await queryClient.invalidateQueries({ queryKey: ctzKeys.personas() });
    },
    onError: (error) => {
      // A conflict carries `latest`: refetch so the screen shows the current version.
      if (error instanceof RepositoryError && error.code === "CONFLICT") {
        void queryClient.invalidateQueries({ queryKey: ctzKeys.all(personaId) });
      }
    },
  });
}

export function useRecordConsent() {
  const repo = useCitizenRepo();
  return useCitizenMutation((i: RecordConsentCall, k) => repo.recordConsent(i, k));
}

/** CTZ-02 simulated verification (the caller keeps the key across retries, T-09). */
export function useVerifyIdentity() {
  const repo = useCitizenRepo();
  return useCitizenMutation((i: VerifyIdentityCall, k) => repo.verifyIdentity(i, k));
}

export function useAcknowledgeInstruction() {
  const repo = useCitizenRepo();
  return useCitizenMutation((i: AcknowledgeInstructionCall, k) =>
    repo.acknowledgeInstruction(i, k),
  );
}

export function useUpdateNotificationPrefs() {
  const repo = useCitizenRepo();
  return useCitizenMutation((i: UpdateNotificationPrefsCall, k) =>
    repo.updateNotificationPrefs(i, k),
  );
}

export function useCreateCorrectionRequest() {
  const repo = useCitizenRepo();
  return useCitizenMutation((i: CitizenCorrectionCall, k) => repo.createCorrectionRequest(i, k));
}

export function useCreateCallbackRequest() {
  const repo = useCitizenRepo();
  return useCitizenMutation((i: CallbackRequestCall, k) => repo.createCallbackRequest(i, k));
}

export function useUpdateCitizenSettings() {
  const repo = useCitizenRepo();
  return useCitizenMutation((i: UpdateCitizenSettingsCall, k) => repo.updateSettings(i, k));
}
