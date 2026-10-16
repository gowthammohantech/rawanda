/**
 * `/denied` (HWM-01; reused by HWM-04/07/10): ACCESS DENIED micro-label + PermissionDenied. Never
 * renders requested data. Signed out (refused sign-in) → "Back to sign-in"; signed in → "Back".
 */
import { Button, MicroLabel, PermissionDenied, Screen, useTx } from "@laif/ui-native";

import { AppHeader } from "../../components/AppHeader.tsx";
import { useSession } from "../../session/useSession.ts";

export function DeniedScreen({ onBack }: { onBack: () => void }) {
  const t = useTx();
  const { session } = useSession();
  return (
    <Screen testID="denied-screen" header={<AppHeader title={t("worker:auth.denied.label")} />}>
      <MicroLabel tone="danger" heading testID="access-denied-label">
        {t("worker:auth.denied.label")}
      </MicroLabel>
      <PermissionDenied
        title={t("worker:auth.denied.title")}
        message={t("worker:auth.denied.message")}
        action={
          <Button variant="secondary" icon="chevron-left" onPress={onBack}>
            {session === null ? t("worker:auth.denied.back") : t("common:actions.back")}
          </Button>
        }
      />
    </Screen>
  );
}
