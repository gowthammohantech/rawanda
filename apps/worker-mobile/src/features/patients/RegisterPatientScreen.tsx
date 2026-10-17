/**
 * `/patients/register` (HWM-04): the synthetic registration form under the worker header. Works
 * fully offline (local write; the `patient.register` op syncs later). Waits for the demo clock
 * (DOB checks use it, never the device clock).
 */
import { LoadingState, Screen, useTx } from "@laif/ui-native";
import { useRouter } from "expo-router";

import { AppHeader } from "../../components/AppHeader.tsx";
import { RegisterPatientForm } from "./RegisterPatientForm.tsx";
import { useDemoNow } from "./usePatients.ts";

export function RegisterPatientScreen({ initialName }: { initialName?: string }) {
  const t = useTx();
  const router = useRouter();
  const now = useDemoNow();
  const toPatient = (patientId: string) =>
    router.replace({ pathname: "/patients/[patientId]", params: { patientId } });
  return (
    <Screen
      testID="register-screen"
      keyboardAvoiding
      header={
        <AppHeader
          title={t("worker:patients.form.title")}
          onBack={() => (router.canGoBack() ? router.back() : router.replace("/patients"))}
        />
      }
    >
      {now === null ? (
        <LoadingState variant="skeleton" rows={4} label={t("common:state.loading")} />
      ) : (
        <RegisterPatientForm
          now={now}
          {...(initialName === undefined ? {} : { initialName })}
          onRegistered={toPatient}
          onUseExisting={toPatient}
        />
      )}
    </Screen>
  );
}
