/**
 * Find tab (HWM-04): search patients CACHED ON THIS DEVICE for the signed-in facility.
 *
 * States: initial → Recent (last 10 touched on this device) + "Register new patient";
 * typing → 250 ms debounce, minimum 2 characters; loading → row skeletons; results (≤ 25);
 * empty → "No patient matches '{query}' on this device" + Register CTA prefilled with the name;
 * offline → fully functional, note "Search covers patients saved on this device"; read
 * failure → ErrorState with Retry.
 */
import {
  AppText,
  Button,
  EmptyState,
  ErrorState,
  InfoCallout,
  LoadingState,
  Screen,
  Section,
  spacing,
  useTx,
} from "@laif/ui-native";
import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { AppHeader } from "../../components/AppHeader.tsx";
import { PATIENT_SEARCH_MIN_CHARS } from "../../data/patients.ts";
import { useNetwork } from "../../network/NetworkProvider.tsx";
import { useRequiredScope } from "../../session/useScope.ts";
import { facilityName } from "../auth/labels.ts";
import { PatientRow } from "./PatientRow.tsx";
import { PatientSearchBar } from "./PatientSearchBar.tsx";
import { RecentPatients } from "./RecentPatients.tsx";
import { useDemoNow, usePatientSearch, useRecentPatients } from "./usePatients.ts";

export function FindPatientScreen() {
  const t = useTx();
  const router = useRouter();
  const scope = useRequiredScope();
  const { offline } = useNetwork();
  const now = useDemoNow();
  const [text, setText] = useState("");
  const search = usePatientSearch(text);
  const recent = useRecentPatients();

  const open = (patientId: string) =>
    router.push({ pathname: "/patients/[patientId]", params: { patientId } });
  const registerNew = (name?: string) =>
    router.push(
      name === undefined || name === ""
        ? "/patients/register"
        : { pathname: "/patients/register", params: { name } },
    );

  const typed = text.trim();
  const showRecent = typed.length < PATIENT_SEARCH_MIN_CHARS;

  return (
    <Screen testID="find-screen" header={<AppHeader title={t("worker:patients.title")} />}>
      <AppText variant="caption" color="muted" testID="find-scope-note">
        {t("worker:patients.scopeNote", { facility: facilityName(scope.facilityId, t) })}
      </AppText>
      {offline ? (
        <InfoCallout icon="wifi-off" testID="find-offline-note">
          {t("worker:patients.offlineNote")}
        </InfoCallout>
      ) : null}
      <PatientSearchBar value={text} onChange={setText} />
      {search.tooShort ? (
        <AppText variant="caption" color="muted" testID="search-min-chars">
          {t("worker:patients.minChars", { min: PATIENT_SEARCH_MIN_CHARS })}
        </AppText>
      ) : null}
      <Button
        variant="secondary"
        icon="plus"
        testID="register-new-patient"
        onPress={() => registerNew()}
      >
        {t("worker:patients.register")}
      </Button>

      {showRecent ? (
        <Section title={t("worker:patients.recent")} testID="section-recent">
          {recent.isError ? (
            <ErrorState title={t("worker:patients.error")} onRetry={() => recent.refetch()} />
          ) : (
            <RecentPatients patients={recent.data} now={now} onOpen={open} />
          )}
        </Section>
      ) : (
        <View style={styles.results} testID="search-results">
          {search.status === "error" ? (
            <ErrorState title={t("worker:patients.error")} onRetry={() => search.refetch()} />
          ) : search.status !== "ready" || search.pending ? (
            <LoadingState variant="skeleton" rows={3} label={t("worker:patients.searching")} />
          ) : search.items.length === 0 ? (
            <View testID="search-empty">
              <EmptyState
                icon="search"
                title={t("worker:patients.empty", { query: typed })}
                description={t("worker:patients.emptyHint")}
                action={
                  <Button
                    icon="plus"
                    testID="register-prefilled"
                    onPress={() => registerNew(typed)}
                  >
                    {t("worker:patients.registerNamed", { name: typed })}
                  </Button>
                }
              />
            </View>
          ) : (
            <>
              <AppText
                variant="caption"
                color="muted"
                accessibilityLiveRegion="polite"
                testID="search-count"
              >
                {t("worker:patients.results", { count: search.total })}
              </AppText>
              {search.items.map((patient) => (
                <PatientRow key={patient.id} patient={patient} now={now} onPress={open} />
              ))}
            </>
          )}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  results: { gap: spacing.sm },
});
