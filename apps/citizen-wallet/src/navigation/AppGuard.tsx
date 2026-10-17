/**
 * `(app)` route guard (CTZ-02 task 7). No persona → `/welcome`; account not verified / locked →
 * `/verify` / `/recover`; no linked record or consent not recorded → `/consent`; consent
 * withdrawn → `/consent-withdrawn` (+ one `access.denied` per blocked route). A
 * `CONSENT_REQUIRED` error from ANY query re-checks consent, so the guard redirects at once.
 * Health screens only mount once consent is `granted` — no health query runs before that.
 */
import { RepositoryError } from "@laif/repositories";
import { ErrorState, LoadingState, Screen } from "@laif/ui-native";
import { useQueryClient } from "@tanstack/react-query";
import { Redirect, Stack, useSegments } from "expo-router";
import { useEffect, useRef } from "react";

import { ctzKeys, useCitizenSession, useConsent } from "../data/queries.ts";
import { useCitizenRepo } from "../data/repo.tsx";
import { usePersona, useWalletStore } from "../providers.tsx";
import { accountGate, appGuardHref, HREFS } from "../state/access.ts";

export function isConsentRequired(error: unknown): boolean {
  return (
    error instanceof RepositoryError &&
    error.code === "FORBIDDEN" &&
    error.reason === "CONSENT_REQUIRED"
  );
}

/** Re-checks consent whenever any wallet query fails with `CONSENT_REQUIRED`. */
function useConsentRequiredWatcher(personaId: string | null) {
  const queryClient = useQueryClient();
  useEffect(() => {
    return queryClient.getQueryCache().subscribe((event) => {
      if (event.type !== "updated" || event.action.type !== "error") return;
      if (!isConsentRequired(event.action.error)) return;
      void queryClient.invalidateQueries({
        predicate: (q) => q.queryKey[0] === "ctz" && q.queryKey.includes("consent"),
      });
      void queryClient.invalidateQueries({ queryKey: ctzKeys.session(personaId) });
    });
  }, [queryClient, personaId]);
}

export function AppGuard() {
  const persona = usePersona();
  const personaId = persona?.id ?? null;
  const repo = useCitizenRepo();
  const wallet = useWalletStore();
  const segments = useSegments() as readonly string[];
  const session = useCitizenSession();
  const gate = session.data === undefined ? null : accountGate(session.data);
  const patientId = gate === null ? (session.data?.activePatientId ?? null) : null;
  const consent = useConsent(patientId);
  const onWithdrawnScreen = segments.includes("consent-withdrawn");
  useConsentRequiredWatcher(personaId);

  // Relaunch restore: `session.started` once per persona per app run; keep the wallet context.
  useEffect(() => {
    if (personaId === null || session.data == null) return;
    const state = wallet.getState();
    state.setContext({
      accountId: session.data.account?.id ?? null,
      activePatientId: session.data.activePatientId,
    });
    if (state.startedFor === personaId) return;
    state.markStarted(personaId);
    void repo.startSession().catch(() => undefined);
  }, [personaId, session.data, wallet, repo]);

  const ready = session.data !== undefined && (patientId === null || consent.data !== undefined);
  const href = ready
    ? appGuardHref(session.data ?? null, consent.data?.state ?? null, onWithdrawnScreen)
    : null;

  // Guard hit on a health route → one `access.denied` (CONSENT_REQUIRED) per route.
  const route = segments.join("/");
  const audited = useRef<string | null>(null);
  useEffect(() => {
    if (href !== HREFS.withdrawn || patientId === null || onWithdrawnScreen) return;
    const marker = `${personaId}:${route}`;
    if (audited.current === marker) return;
    audited.current = marker;
    void repo.recordGuardDenial({ patientId, route: `/${route}` }).catch(() => undefined);
  }, [href, patientId, personaId, route, onWithdrawnScreen, repo]);

  if (persona === null) return <Redirect href="/welcome" />;
  if (session.isError || consent.isError) {
    return (
      <Screen testID="guard-error">
        <ErrorState onRetry={() => (session.isError ? session.refetch() : consent.refetch())} />
      </Screen>
    );
  }
  if (!ready) {
    return (
      <Screen testID="guard-loading">
        <LoadingState />
      </Screen>
    );
  }
  if (href !== null) return <Redirect href={href} />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
