/**
 * `/revoked` (HWM-10, outside the `(app)` group): the lost-device response. No patient data is
 * rendered (nothing here reads patients, tasks or screenings); the only facts shown are how many
 * items are kept on the device and were not sent. Actions: "Restore device (demo only)" and the
 * language switch (EN ⇄ RW works here too). Always under the DemoBanner (`Screen`).
 */
import {
  announce,
  Button,
  InfoCallout,
  LanguageSwitcher,
  MicroLabel,
  PermissionDenied,
  Screen,
  Section,
  StatusChip,
  useToast,
  useTx,
} from "@laif/ui-native";
import { useState } from "react";

import { AppHeader } from "../../components/AppHeader.tsx";
import { useRevocation } from "./useRevocation.ts";

export type RevokedDeviceScreenProps = {
  /** After a successful restore (navigate to the tabs). */
  onRestored: () => void;
};

export function RevokedDeviceScreen({ onRestored }: RevokedDeviceScreenProps) {
  const t = useTx();
  const { toast } = useToast();
  const { kept, restore } = useRevocation();
  const [restoring, setRestoring] = useState(false);

  const onRestore = async () => {
    setRestoring(true);
    try {
      await restore();
      const message = t("worker:revocation.restored");
      toast({ title: message, tone: "positive" });
      announce(message);
      onRestored();
    } catch {
      toast({ title: t("worker:revocation.restoreFailed"), tone: "danger" });
    } finally {
      setRestoring(false);
    }
  };

  return (
    <Screen
      testID="revoked-screen"
      header={<AppHeader title={t("worker:revocation.label")} showAvatar={false} />}
    >
      <MicroLabel tone="danger" heading>
        {t("worker:revocation.label")}
      </MicroLabel>
      <PermissionDenied
        title={t("worker:revocation.title")}
        message={t("worker:revocation.message")}
        action={
          <Button
            testID="restore-device"
            variant="primary"
            icon="refresh"
            loading={restoring}
            accessibilityHint={t("worker:revocation.restoreHint")}
            onPress={() => void onRestore()}
          >
            {t("worker:revocation.restore")}
          </Button>
        }
      />
      {kept === undefined ? null : (
        <StatusChip tone={kept > 0 ? "warning" : "neutral"} icon="lock" testID="revoked-kept">
          {kept > 0
            ? t("worker:revocation.kept", { count: kept })
            : t("worker:revocation.keptNone")}
        </StatusChip>
      )}
      <InfoCallout icon="info">{t("worker:revocation.policy")}</InfoCallout>
      <Section title={t("worker:revocation.language")}>
        <LanguageSwitcher testID="revoked-language-switcher" />
      </Section>
    </Screen>
  );
}
