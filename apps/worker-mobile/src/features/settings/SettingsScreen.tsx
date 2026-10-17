/**
 * Settings (HWM-01 task 10): LANGUAGE (EN/RW switcher), SIGNED IN AS (persona, role, facility,
 * district, short device id — demo sign-in only), DEMO (FND demo tools; Network simulation and
 * Reset demo screens arrive in HWM-02 / HWM-10), ABOUT, and Sign out behind a ConfirmSheet
 * ("Unsynced items stay on this device"). HWM-10 finalises this screen.
 */
import { roleLabelKey } from "@laif/auth-demo";
import {
  Button,
  ConfirmSheet,
  DemoToolsSheet,
  InfoCallout,
  KeyValueList,
  LanguageSwitcher,
  ListRow,
  RoleBanner,
  Screen,
  Section,
  useToast,
  useTx,
} from "@laif/ui-native";
import { useState } from "react";

import { AppHeader } from "../../components/AppHeader.tsx";
import { useDemoTools } from "../../demo-tools.tsx";
import { shortDeviceId } from "../../session/device.ts";
import { useSession } from "../../session/useSession.ts";
import { districtName, districtOf, facilityName } from "../auth/labels.ts";

export type SettingsScreenProps = {
  onBack?: () => void;
  /** Called after sign-out completes (navigate to sign-in). */
  onSignedOut: () => void;
};

export function SettingsScreen({ onBack, onSignedOut }: SettingsScreenProps) {
  const t = useTx();
  const { toast } = useToast();
  const { session, signOut } = useSession();
  const { faults, setFault, reset, loadScenario, scenarios } = useDemoTools();
  const [toolsOpen, setToolsOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const district = session === null ? null : districtOf(session.facilityId);
  const role = session === null ? "" : t(roleLabelKey(session.persona.role));
  const facility = session === null ? "" : facilityName(session.facilityId, t);

  return (
    <Screen
      testID="settings-screen"
      offline={faults.offline}
      header={
        <AppHeader
          title={t("worker:settings.title")}
          showAvatar={false}
          {...(onBack === undefined ? {} : { onBack })}
        />
      }
    >
      <Section title={t("worker:settings.language")}>
        <LanguageSwitcher testID="settings-language-switcher" />
      </Section>
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
      <Section title={t("worker:settings.demo")}>
        <ListRow
          icon="wifi-off"
          title={t("worker:settings.networkSimulation")}
          subtitle={t("worker:settings.comingIn", { phase: "HWM-02" })}
          disabled
        />
        <ListRow
          icon="refresh"
          title={t("worker:settings.resetDemo")}
          subtitle={t("worker:settings.comingIn", { phase: "HWM-10" })}
          disabled
        />
        <Button variant="secondary" icon="settings" onPress={() => setToolsOpen(true)}>
          {t("demo:tools.open")}
        </Button>
      </Section>
      <Section title={t("worker:settings.about")}>
        <InfoCallout icon="info">{t("worker:settings.aboutText")}</InfoCallout>
      </Section>
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
      <DemoToolsSheet
        visible={toolsOpen}
        onClose={() => setToolsOpen(false)}
        onReset={reset}
        faults={faults}
        onFaultChange={setFault}
        scenarios={scenarios}
        onLoadScenario={(id) => void loadScenario(id)}
      />
    </Screen>
  );
}
