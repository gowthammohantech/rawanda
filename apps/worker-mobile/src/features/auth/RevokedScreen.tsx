/** `/revoked` (minimal in HWM-01; HWM-10 completes revocation / restore). */
import { Button, MicroLabel, PermissionDenied, Screen, useTx } from "@laif/ui-native";

import { AppHeader } from "../../components/AppHeader.tsx";

export function RevokedScreen({ onSignIn }: { onSignIn: () => void }) {
  const t = useTx();
  return (
    <Screen testID="revoked-screen" header={<AppHeader title={t("worker:auth.revoked.label")} />}>
      <MicroLabel tone="danger" heading>
        {t("worker:auth.revoked.label")}
      </MicroLabel>
      <PermissionDenied
        title={t("worker:auth.revoked.title")}
        message={t("worker:auth.revoked.message")}
        action={
          <Button variant="secondary" onPress={onSignIn}>
            {t("worker:auth.revoked.back")}
          </Button>
        }
      />
    </Screen>
  );
}
