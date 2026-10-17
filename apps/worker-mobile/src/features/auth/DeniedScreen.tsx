/**
 * `/denied` (HWM-01; reused by HWM-04/07/10): ACCESS DENIED micro-label + PermissionDenied. Never
 * renders requested data. Signed out (refused sign-in) → "Back to sign-in"; signed in → "Back".
 * `reason: 'patient'` (HWM-04 deep link to a patient outside the facility / not on the device)
 * swaps in the patient copy — still without any name or identifier.
 */
import { Button, MicroLabel, PermissionDenied, Screen, useTx } from "@laif/ui-native";

import { AppHeader } from "../../components/AppHeader.tsx";
import { useSession } from "../../session/useSession.ts";

export type DeniedReason = "facility" | "patient";

export function DeniedScreen({
  onBack,
  reason = "facility",
}: {
  onBack: () => void;
  reason?: DeniedReason;
}) {
  const t = useTx();
  const { session } = useSession();
  const patient = reason === "patient";
  return (
    <Screen testID="denied-screen" header={<AppHeader title={t("worker:auth.denied.label")} />}>
      <MicroLabel tone="danger" heading testID="access-denied-label">
        {t("worker:auth.denied.label")}
      </MicroLabel>
      <PermissionDenied
        title={patient ? t("worker:patients.denied.title") : t("worker:auth.denied.title")}
        message={patient ? t("worker:patients.denied.message") : t("worker:auth.denied.message")}
        action={
          <Button variant="secondary" icon="chevron-left" onPress={onBack}>
            {session === null ? t("worker:auth.denied.back") : t("common:actions.back")}
          </Button>
        }
      />
    </Screen>
  );
}
