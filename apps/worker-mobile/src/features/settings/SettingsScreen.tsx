/**
 * Settings — the demonstrator's control room (HWM-01 task 10, finalised in HWM-10 task 1).
 * Sections (mono micro-labels): LANGUAGE (EN/RW + "Saved on this device"), CONNECTION (simulated
 * offline switch + clock-drift warning + Network simulation), DEMO CONTROLS (Simulate device
 * revocation, Activity log, Reset demo, FND demo tools), SIGNED IN AS (persona, role, facility,
 * district, short device id — demo sign-in only), ABOUT (synthetic data, rule set, versions,
 * "not encrypted in this demo"), and Sign out behind a ConfirmSheet ("Unsynced items stay on
 * this device"). Fully usable offline.
 */
import { roleLabelKey } from "@laif/auth-demo";
import {
  Button,
  ConfirmSheet,
  KeyValueList,
  RoleBanner,
  Screen,
  Section,
  useToast,
  useTx,
} from "@laif/ui-native";
import { useState } from "react";

import { AppHeader } from "../../components/AppHeader.tsx";
import { useNetwork } from "../../network/NetworkProvider.tsx";
import { shortDeviceId } from "../../session/device.ts";
import { useSession } from "../../session/useSession.ts";
import { districtName, districtOf, facilityName } from "../auth/labels.ts";
import { AboutDemoSection } from "./AboutDemoSection.tsx";
import { LanguageSection } from "./LanguageSection.tsx";
import { SimulationSection } from "./SimulationSection.tsx";

export type SettingsScreenProps = {
  onBack?: () => void;
  /** Called after sign-out completes (navigate to sign-in). */
  onSignedOut: () => void;
  /** Opens Settings → Network simulation (HWM-02). */
  onOpenNetwork: () => void;
  /** HWM-10: Settings → Activity log / Reset demo; after a simulated revocation. */
  onOpenActivity?: () => void;
  onOpenReset?: () => void;
  onRevoked?: () => void;
};

const noop = () => undefined;

export function SettingsScreen({
  onBack,
  onSignedOut,
  onOpenNetwork,
  onOpenActivity = noop,
  onOpenReset = noop,
  onRevoked = noop,
}: SettingsScreenProps) {
  const t = useTx();
  const { toast } = useToast();
  const { session, signOut } = useSession();
  const { offline } = useNetwork();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const district = session === null ? null : districtOf(session.facilityId);
  const role = session === null ? "" : t(roleLabelKey(session.persona.role));
  const facility = session === null ? "" : facilityName(session.facilityId, t);

  return (
    <Screen
      testID="settings-screen"
      offline={offline}
      header={
        <AppHeader
          title={t("worker:settings.title")}
          showAvatar={false}
          {...(onBack === undefined ? {} : { onBack })}
        />
      }
    >
      <LanguageSection />
      <SimulationSection
        onOpenNetwork={onOpenNetwork}
        onOpenActivity={onOpenActivity}
        onOpenReset={onOpenReset}
        onRevoked={onRevoked}
      />
      {session === null ? null : (
        <Section title={t("worker:settings.signedInAs")}>
          <RoleBanner
            personaName={session.persona.displayName}
            roleLabel={role}
            scopeLabel={facility}
          />
          <KeyValueList
            testID="signed-in-details"
            items={[
              {
                id: "profile",
                label: t("worker:settings.profile"),
                value: session.persona.displayName,
              },
              { id: "role", label: t("worker:settings.role"), value: role },
              { id: "facility", label: t("worker:settings.facility"), value: facility },
              {
                id: "district",
                label: t("worker:settings.district"),
                value: district === null ? "—" : districtName(district, t),
              },
              {
                id: "device",
                label: t("worker:settings.deviceId"),
                value: shortDeviceId(session.deviceId),
              },
            ]}
          />
        </Section>
      )}
      <AboutDemoSection />
      <Button
        testID="sign-out"
        variant="danger"
        icon="external"
        onPress={() => setConfirmOpen(true)}
      >
        {t("worker:settings.signOut")}
      </Button>
      <ConfirmSheet
        testID="sign-out-sheet"
        visible={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={t("worker:settings.signOutTitle")}
        description={t("worker:settings.signOutKeepsData")}
        confirmLabel={t("worker:settings.signOut")}
        loading={signingOut}
        onConfirm={async () => {
          setSigningOut(true);
          try {
            await signOut();
          } finally {
            setSigningOut(false);
            setConfirmOpen(false);
          }
          toast({ title: t("worker:settings.signedOut") });
          onSignedOut();
        }}
      />
    </Screen>
  );
}
